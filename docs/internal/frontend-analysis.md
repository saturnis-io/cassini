# Frontend Analysis - OpenSPC

> Comprehensive analysis of the React/TypeScript frontend at `frontend/src/`.
> Generated from source code review, not speculation.

---

## 1. Technology Stack

| Layer | Technology | Version/Notes |
|---|---|---|
| Framework | React 18+ | Functional components, hooks only |
| Language | TypeScript | Strict types throughout |
| Build | Vite | Dev server + proxy to backend |
| Routing | React Router v6 | Nested routes, `<Outlet>` pattern |
| Server State | TanStack React Query | Query keys, polling, invalidation |
| Client State | Zustand | Persisted stores via `zustand/middleware/persist` |
| Charts | ECharts 6.0.0 | Canvas renderer, tree-shaken imports |
| Styling | Tailwind CSS | Dark/light via CSS variables, `cn()` utility |
| Icons | Lucide React | Tree-shakable icon set |
| Toasts | Sonner | Top-right position, auto-dismiss |
| Export | jsPDF + jspdf-autotable, xlsx, html2canvas | PDF, Excel, PNG report export |
| Utilities | clsx + tailwind-merge | `cn()` helper in `lib/utils.ts` |

---

## 2. Application Architecture

### Provider Hierarchy

```
ThemeProvider                    (theme + brand config)
  QueryClientProvider            (React Query with 10s stale time, 1 retry)
    AuthProvider                 (JWT auth, role derivation)
      BrowserRouter
        Routes
          /login                 (outside auth gate)
          RequireAuth
            PlantProvider        (plant list + selection)
              ChartHoverProvider (cross-chart hover sync)
                WebSocketProvider (real-time updates)
                  Layout         (sidebar + header + outlet)
                    Route pages...
```

**Key design decisions:**
- PlantProvider, ChartHoverProvider, and WebSocketProvider are inside `RequireAuth` to prevent 401 cascades on fresh sessions.
- `RouteErrorBoundary` wraps the Layout to catch render errors and show recovery UI.
- Display modes (Kiosk, Wall Dashboard) use `AuthenticatedDisplayMode` wrapper with `KioskLayout` instead of `Layout`.

### State Management Architecture

| Store | File | Persisted | Purpose |
|---|---|---|---|
| `useUIStore` | `stores/uiStore.ts` | Yes (`openspc-ui`) | Sidebar state (expanded/collapsed/hidden), selected plant ID |
| `useDashboardStore` | `stores/dashboardStore.ts` | Partial (`openspc-dashboard`) | Selected characteristic, time range, histogram position, chart type per char, x-axis mode, brush/range, annotation visibility, comparison mode, WS connection status, real-time sample cache, violation queue |
| `useConfigStore` | `stores/configStore.ts` | No | Configuration page: tree selection, expanded nodes, editing state, dirty flag |

**What is persisted vs transient:**
- Persisted: sidebar state, plant ID, selected characteristic, time range, histogram position, spec limits visibility, x-axis mode, brush toggle, annotation toggle
- Transient (rebuilt on load): Map/Set fields (latestSamples, selectedCharacteristicIds, chartTypes), WS connection state, pending violations

---

## 3. Routes and Pages

### Route Table

| Path | Component | Auth | Min Role | Layout | Key Features |
|---|---|---|---|---|---|
| `/login` | `LoginPage` | No | - | None | Username/password form, remember me, redirect after login |
| `/` | Redirect | Yes | - | Main | Redirects to `/dashboard` |
| `/dashboard` | `OperatorDashboard` | Yes | operator | Main | Hierarchy tree, control chart, dual charts, histogram, annotations, comparison mode, sample inspector |
| `/data-entry` | `DataEntryView` | Yes | operator | Main | Manual entry panel, sample history, scheduling (stub) |
| `/violations` | `ViolationsView` | Yes | operator | Main | Violation table with filters (pending/informational/acknowledged/all), stats cards, rule filter, acknowledge button |
| `/reports` | `ReportsView` | Yes | supervisor | Main | Report template selection, characteristic picker, time range, preview, PDF/Excel/PNG export |
| `/connectivity` | `ConnectivityPage` | Yes | engineer | Main | MQTT broker status cards, connection metrics, topic tree browser, tag mapping panel |
| `/configuration` | `ConfigurationView` | Yes | engineer | Main | Hierarchy tree with CRUD, characteristic form (tabbed: general/limits/sampling/rules), create wizard |
| `/settings` | `SettingsView` | Yes | admin | Main | Tabbed: Appearance, Branding, Sites, Data Collection (MQTT), API Keys, Notifications, Database |
| `/admin/users` | `UserManagementPage` | Yes | admin | Main | User table, create/edit dialog with plant role assignment, deactivate/delete |
| `/dev-tools` | `DevToolsPage` | Yes | admin | Main | Sandbox mode only - database reset and seed scripts |
| `/kiosk` | `KioskView` | Yes | operator | Kiosk | Full-screen auto-rotating chart display, URL params for chars/interval, keyboard nav |
| `/wall-dashboard` | `WallDashboard` | Yes | operator | Kiosk (no status bar) | Multi-chart grid (2x2 to 4x4), click-to-expand, save/load presets |

### Page Details

#### OperatorDashboard (`pages/OperatorDashboard.tsx`)
The main workhorse page. Two-column layout:
- **Left panel (w-80)**: `HierarchyTodoList` - tree-based characteristic selector showing control status
- **Right panel**: Chart visualization area
  - `ChartToolbar` - chart type selector, histogram toggle, spec limits, x-axis mode, comparison, annotations, range slider
  - `ChartRangeSlider` - sparkline-based viewport windowing (visible when brush enabled and >10 points)
  - Chart rendering: switches between `BoxWhiskerChart`, `DualChartPanel` (for xbar-r, xbar-s, i-mr), or `ChartPanel` (single chart + optional histogram)
  - Comparison mode: secondary `ChartPanel` with `ComparisonSelector` modal
  - `AnnotationListPanel` - filterable list of annotations for visible range
  - `InputModal` - quick sample entry
  - `AnnotationDialog` - create period/point annotations
  - `SampleInspectorModal` - detailed sample view on point click

**Real-time behavior**: Subscribes to WebSocket for all loaded characteristics. When WS connected, polling is disabled (WS pushes invalidation). Chart data refetch interval: 30s (polling fallback).

#### DataEntryView (`pages/DataEntryView.tsx`)
Three tabs:
1. **Manual Entry** (`ManualEntryPanel`): Characteristic selector, measurement input fields, submit
2. **Sample History** (`SampleHistoryPanel`): Paginated sample table with edit/exclude/delete
3. **Scheduling**: Stub with "Coming Soon" placeholder

#### ViolationsView (`pages/ViolationsView.tsx`)
- Stats cards: Total, Pending (required), Informational, Critical, Warning
- Filter bar: Status (pending/informational/acknowledged/all), Rule dropdown
- Table: Time, Characteristic (with hierarchy path), Rule (number badge + name), Severity badge, Status, Acknowledge button
- Client-side filtering for `requires_acknowledgement` (TODO: move to backend)

#### ReportsView (`pages/ReportsView.tsx`)
Three-column layout:
- Left (col-span-3): Template list, time range selector, hierarchy characteristic selector
- Right (col-span-9): Report preview with export dropdown
- Templates: Characteristic Summary, Capability Analysis, Violation Summary, Trend Analysis
- Export: PDF (jsPDF), Excel (xlsx), PNG (html2canvas)

#### ConfigurationView (`pages/ConfigurationView.tsx`)
- Left panel: Hierarchy tree with add node modal (UNS-compatible types: Folder, Enterprise, Site, Area, Line, Cell, Equipment, Tag)
- Right panel: `CharacteristicForm` (tabbed via `CharacteristicConfigTabs`)
- `CreateCharacteristicWizard` modal for new characteristics
- Plant-scoped hierarchy (no global fallback)

#### ConnectivityPage (`pages/ConnectivityPage.tsx`)
Four sections:
1. `ConnectionMetrics` - summary metrics for all broker states
2. `BrokerStatusCards` - individual broker cards with connect/disconnect
3. `TopicTreeBrowser` - tree/flat view of discovered MQTT topics, search
4. `TagMappingPanel` - map topics to characteristics with live value preview

#### SettingsView (`pages/SettingsView.tsx`)
Tabbed interface with role-based tab visibility:
| Tab | Component | Min Role |
|---|---|---|
| Appearance | `AppearanceSettings` | All |
| Branding | `ThemeCustomizer` | admin |
| Sites | `PlantSettings` | admin |
| Data Collection | `MQTTConfigPanel` | engineer |
| API Keys | `ApiKeysSettings` | engineer |
| Notifications | `NotificationsSettings` | All |
| Database | `DatabaseSettings` | engineer |

#### UserManagementPage (`pages/UserManagementPage.tsx`)
- `UserTable` with search
- `UserFormDialog` for create/edit with plant role assignment matrix
- Deactivate and permanent delete with confirmation dialogs
- Role sync: adds/removes/updates plant roles on edit

#### KioskView (`pages/KioskView.tsx`)
Full-screen display mode:
- Auto-rotation with configurable interval (default 15s, via `?interval=` URL param)
- URL params: `?chars=1,2,3` for specific IDs, `?interval=15`
- Keyboard: Arrow keys (navigate), Space (pause/resume)
- Status indicator: green (ok), yellow (warning - near limits), red (violation - pulsing)
- Stats bar: Current value, UCL, LCL, unit

#### WallDashboard (`pages/WallDashboard.tsx`)
Multi-chart grid display:
- Grid sizes: 2x2, 3x3, 4x4, 2x3, 3x2
- URL params: `?grid=3x3&chars=1,2,3,4`
- Click any chart to expand to full-screen modal
- Save/load presets to localStorage
- Brand badge overlay

#### LoginPage (`pages/LoginPage.tsx`)
- Theme-aware logo (dark/light variants)
- Remember me checkbox
- Redirect to previously attempted URL after login
- Version display (v0.3.0)

#### DevToolsPage (`pages/DevToolsPage.tsx`)
- Only visible in sandbox mode
- Seed script cards with run button and confirmation dialog
- Output panel for script results
- Auto-logout and redirect after database reset

---

## 4. Component Architecture

### Layout Components

| Component | File | Description |
|---|---|---|
| `Layout` | `components/Layout.tsx` | Main app shell: Header + Sidebar + Outlet + Footer status bar (WS status, violation counts) |
| `Header` | `components/Header.tsx` | Logo/app name (from brand config), PlantSelector slot, theme cycle (light/dark/system), user dropdown (username, role, logout) |
| `Sidebar` | `components/Sidebar.tsx` | Collapsible (240px expanded / 60px collapsed), role-filtered nav items, violation badge, dev tools section (sandbox only) |
| `KioskLayout` | `components/KioskLayout.tsx` | Chrome-free display wrapper, forces dark mode, larger fonts, optional status bar |
| `ProtectedRoute` | `components/ProtectedRoute.tsx` | Role gate: checks `hasAccess(role, requiredRole)`, redirects with toast on denial |
| `PlantSelector` | `components/PlantSelector.tsx` | Plant/site dropdown in header, drives PlantProvider context |

### Chart Components

| Component | File | Description |
|---|---|---|
| `ControlChart` | `components/ControlChart.tsx` | Core ECharts-based control chart. Handles: line series with gradient, custom renderItem for data points (diamonds for violations, triangles for undersized, circles for normal), zone shading via markArea, control/spec limit lines via markLine, annotation markers, cross-chart hover sync, x-axis mode (index/timestamp), range window slicing, variable limits (Mode A z-score, Mode B per-point limits) |
| `ChartPanel` | `components/ChartPanel.tsx` | ControlChart + optional DistributionHistogram. Resizable histogram panels (drag handles). Bidirectional hover: chart hover highlights histogram bar, histogram hover highlights chart points. Shared Y-axis domain calculation. |
| `DualChartPanel` | `components/charts/DualChartPanel.tsx` | Stacked primary (X-bar) + secondary (R or S) charts for dual chart types |
| `RangeChart` | `components/charts/RangeChart.tsx` | Secondary chart for range/std dev values in dual layouts |
| `BoxWhiskerChart` | `components/charts/BoxWhiskerChart.tsx` | Box-and-whisker plot for measurement distribution per sample |
| `DistributionHistogram` | `components/DistributionHistogram.tsx` | ECharts-based histogram, vertical or horizontal orientation, normal curve overlay, spec limit lines |
| `ChartTypeSelector` | `components/charts/ChartTypeSelector.tsx` | Dropdown to select chart type, grouped by category (Variable/Attribute/Analysis), compatibility filtering |
| `ChartToolbar` | `components/ChartToolbar.tsx` | Toolbar above chart: chart type, histogram position, spec limits toggle, x-axis mode, comparison mode, annotation toggle, range slider toggle, add annotation button |
| `ChartRangeSlider` | `components/ChartRangeSlider.tsx` | Sparkline with draggable handles for viewport windowing |
| `ViolationLegend` | `components/ViolationLegend.tsx` | Compact legend showing which Nelson rules were violated with color-coded badges |
| `WallChartCard` | `components/WallChartCard.tsx` | Compact chart card for wall dashboard grid |

### Sample Inspector (`components/SampleInspectorModal.tsx`)
Full-featured modal with four sections:
1. **Measurements**: Individual measurement values, mean, range, std dev, zone badge, edit/exclude actions
2. **Violations**: Nelson rule violations with severity badges, sparkline patterns, detailed descriptions (cause + action), acknowledge button
3. **Annotations**: List of annotations for this sample, create/edit/delete inline
4. **History**: Edit history timeline with before/after values, diff highlighting

### Characteristic Configuration Components

| Component | File | Description |
|---|---|---|
| `CharacteristicConfigTabs` | `characteristic-config/CharacteristicConfigTabs.tsx` | Tab container (General/Limits/Sampling/Rules) with dirty-state warning |
| `GeneralTab` | `characteristic-config/GeneralTab.tsx` | Name, description, provider type, subgroup size, decimal precision |
| `LimitsTab` | `characteristic-config/LimitsTab.tsx` | UCL/LCL/CL display, recalculate options (exclude OOC, date range, last N), manual limit setting |
| `SamplingTab` | `characteristic-config/SamplingTab.tsx` | Subgroup mode (Standardized/Variable Limits/Nominal Tolerance), min measurements, schedule config |
| `RulesTab` | `characteristic-config/RulesTab.tsx` | Nelson rules 1-8 toggle with per-rule acknowledgement requirement |
| `NelsonSparklines` | `characteristic-config/NelsonSparklines.tsx` | SVG sparkline illustrations for each Nelson rule pattern |
| `CreateCharacteristicWizard` | `characteristic-config/CreateCharacteristicWizard.tsx` | Multi-step wizard for creating new characteristics |
| `CharacteristicForm` | `components/CharacteristicForm.tsx` | Full characteristic editor wrapping the config tabs |

### Connectivity Components

| Component | File | Description |
|---|---|---|
| `BrokerStatusCards` | `connectivity/BrokerStatusCards.tsx` | Card per broker showing connection status, connect/disconnect buttons |
| `ConnectionMetrics` | `connectivity/ConnectionMetrics.tsx` | Summary metrics across all broker connections |
| `TopicTreeBrowser` | `connectivity/TopicTreeBrowser.tsx` | Tree/flat view of discovered MQTT topics with search, SparkplugB metric display |
| `TagMappingPanel` | `connectivity/TagMappingPanel.tsx` | Map MQTT topics to characteristics, trigger strategy selection |
| `LiveValuePreview` | `connectivity/LiveValuePreview.tsx` | Real-time preview of tag values from selected topic |

### User Management Components

| Component | File | Description |
|---|---|---|
| `UserTable` | `users/UserTable.tsx` | Sortable/filterable user list with role badges |
| `UserFormDialog` | `users/UserFormDialog.tsx` | Create/edit user dialog with plant role assignment matrix |

### Annotation Components

| Component | File | Description |
|---|---|---|
| `AnnotationDialog` | `components/AnnotationDialog.tsx` | Create point or period annotations with color picker |
| `AnnotationListPanel` | `components/AnnotationListPanel.tsx` | Filterable list of annotations for visible chart range |
| `AnnotationDetailPopover` | `components/AnnotationDetailPopover.tsx` | Popover on annotation marker click showing full text, edit/delete |

### Data Entry Components

| Component | File | Description |
|---|---|---|
| `ManualEntryPanel` | `components/ManualEntryPanel.tsx` | Characteristic selector + measurement input fields + submit |
| `SampleEditModal` | `components/SampleEditModal.tsx` | Edit sample measurements with reason field |
| `SampleHistoryPanel` | `components/SampleHistoryPanel.tsx` | Paginated sample table with edit/exclude/delete actions |
| `EditHistoryTooltip` | `components/EditHistoryTooltip.tsx` | Tooltip showing sample edit history |

### Other Components

| Component | File | Description |
|---|---|---|
| `HierarchyTree` | `components/HierarchyTree.tsx` | Recursive tree with expand/collapse, node type icons |
| `HierarchyTodoList` | `components/HierarchyTodoList.tsx` | Dashboard hierarchy with control status indicators |
| `HierarchyCharacteristicSelector` | `components/HierarchyCharacteristicSelector.tsx` | Tree-based characteristic picker for reports |
| `HierarchyMultiSelector` | `components/HierarchyMultiSelector.tsx` | Multi-select hierarchy picker |
| `ComparisonSelector` | `components/ComparisonSelector.tsx` | Modal for selecting secondary characteristic in comparison mode |
| `ThemeCustomizer` | `components/ThemeCustomizer.tsx` | Brand color pickers (primary/accent), logo upload, app name |
| `AppearanceSettings` | `components/AppearanceSettings.tsx` | Chart color presets and customization |
| `PlantSettings` | `components/PlantSettings.tsx` | CRUD for plants/sites |
| `MQTTConfigPanel` | `components/MQTTConfigPanel.tsx` | MQTT broker configuration form |
| `ApiKeysSettings` | `components/ApiKeysSettings.tsx` | API key management (create, revoke, delete) |
| `NotificationsSettings` | `components/NotificationsSettings.tsx` | Notification preferences |
| `DatabaseSettings` | `components/DatabaseSettings.tsx` | Database info and maintenance |
| `ReportPreview` | `components/ReportPreview.tsx` | Renders report content based on selected template |
| `ExportDropdown` | `components/ExportDropdown.tsx` | PDF/Excel/PNG export dropdown button |
| `InputModal` | `components/InputModal.tsx` | Quick sample entry modal |
| `DeleteConfirmDialog` | `components/DeleteConfirmDialog.tsx` | Reusable delete confirmation |
| `NumberInput` | `components/NumberInput.tsx` | Numeric input with validation |
| `DateTimePicker` | `components/DateTimePicker.tsx` | Date/time picker component |
| `TimePicker` | `components/TimePicker.tsx` | Time-only picker |
| `TimeRangeSelector` | `components/TimeRangeSelector.tsx` | Points/duration/custom time range dropdown |
| `LocalTimeRangeSelector` | `components/LocalTimeRangeSelector.tsx` | Local (non-store) time range picker |
| `SelectionToolbar` | `components/SelectionToolbar.tsx` | Multi-select actions toolbar |
| `HistogramPositionSelector` | `components/HistogramPositionSelector.tsx` | Below/right/hidden histogram toggle |
| `HelpTooltip` | `components/HelpTooltip.tsx` | Contextual help tooltips from help-content registry |
| `TodoList` | `components/TodoList.tsx` | Generic todo list component |
| `NelsonRulesConfigPanel` | `components/NelsonRulesConfigPanel.tsx` | Nelson rules enable/disable panel |
| `ScheduleConfigSection` | `components/ScheduleConfigSection.tsx` | Schedule configuration for data collection |

---

## 5. API Client and Data Fetching

### API Client (`api/client.ts`)

Central `fetchApi<T>()` function handles:
- JWT Bearer token injection from in-memory storage (not localStorage)
- **Proactive token refresh**: Checks token expiry 2 minutes before it expires
- **401 retry**: On 401, refreshes token via shared promise (prevents concurrent refresh race condition), retries original request
- **Refresh cooldown**: 5-second cooldown between refreshes
- **Error parsing**: Handles both string and Pydantic validation error array formats
- **204 No Content**: Returns `undefined` for DELETE operations
- **Forced logout**: Dispatches `auth:logout` custom event when refresh fails

**API modules** (each a named export object):

| Module | Prefix | Operations |
|---|---|---|
| `authApi` | `/auth/` | login, refresh, logout, me |
| `plantApi` | `/plants/` | list, get, create, update, delete |
| `hierarchyApi` | `/hierarchy/`, `/plants/{id}/hierarchies/` | getTree, getNode, create, update, delete, getCharacteristics, plant-scoped variants |
| `characteristicApi` | `/characteristics/` | list (paginated), get, create, update, delete, getChartData, recalculateLimits, setManualLimits, getRules, updateRules, changeMode, getConfig, updateConfig |
| `sampleApi` | `/samples/` | list (paginated, page/per_page to offset/limit conversion), get, submit, exclude, batchImport, delete, update, getEditHistory |
| `violationApi` | `/violations/` | list (paginated), get, getStats, acknowledge, batchAcknowledge |
| `brokerApi` | `/brokers/` | list, get, create, update, delete, activate, getStatus, getCurrentStatus, connect, disconnect, test, getAllStatus, startDiscovery, stopDiscovery, getTopics |
| `providerApi` | `/providers/` | getStatus, restartTagProvider, refreshTagSubscriptions |
| `apiKeysApi` | `/api-keys/` | list, get, create, update, delete, revoke |
| `tagApi` | `/tags/` | getMappings, createMapping, deleteMapping, preview |
| `annotationApi` | `/characteristics/{id}/annotations` | list, create, update, delete |
| `userApi` | `/users/` | list, get, create, update, deactivate, deletePermanent, assignRole, removeRole |
| `devtoolsApi` | `/devtools/` | getStatus, runSeed |

### React Query Hooks (`api/hooks.ts`)

Organized by domain with structured query keys (`queryKeys` object):
- **Polling**: Chart data refetches every 30s, violation stats every 45s (staggered to avoid request bursts)
- **Invalidation**: Mutations invalidate related queries (e.g., submitting a sample invalidates chart data, samples, violations, and characteristic detail)
- **Toast notifications**: All mutations show success/error toasts via Sonner
- **Conditional fetching**: Queries use `enabled` flag (e.g., characteristic detail only when id > 0)

**Key hooks (42 total)**:
- Plants: `usePlants`, `usePlant`, `useCreatePlant`, `useUpdatePlant`, `useDeletePlant`
- Hierarchy: `useHierarchyTree`, `useHierarchyTreeByPlant`, `useHierarchyNode`, `useHierarchyCharacteristics`, `useCreateHierarchyNode`, `useCreateHierarchyNodeInPlant`, `useDeleteHierarchyNode`, `useHierarchyPath`
- Characteristics: `useCharacteristics`, `useCharacteristic`, `useCreateCharacteristic`, `useDeleteCharacteristic`, `useUpdateCharacteristic`, `useChartData`, `useRecalculateLimits`, `useSetManualLimits`, `useChangeMode`, `useNelsonRules`, `useUpdateNelsonRules`, `useCharacteristicConfig`, `useUpdateCharacteristicConfig`
- Samples: `useSample`, `useSamples`, `useSubmitSample`, `useExcludeSample`, `useDeleteSample`, `useUpdateSample`, `useSampleEditHistory`
- Violations: `useViolations`, `useViolationStats`, `useAcknowledgeViolation`
- Annotations: `useAnnotations`, `useCreateAnnotation`, `useUpdateAnnotation`, `useDeleteAnnotation`
- Users: `useUsers`, `useUser`, `useCreateUser`, `useUpdateUser`, `useDeactivateUser`, `useDeleteUserPermanent`, `useAssignRole`, `useRemoveRole`
- Dev Tools: `useDevToolsStatus`, `useRunSeed`

---

## 6. Providers and Contexts

### AuthProvider (`providers/AuthProvider.tsx`)
- Restores session on mount via refresh token cookie
- Derives user role from `plant_roles` array + selected plant ID
- Falls back to highest role across all plants when no plant selected
- Listens for `auth:logout` custom event for forced logout
- Exposes: `user`, `role`, `isAuthenticated`, `isLoading`, `login()`, `logout()`

### PlantProvider (`providers/PlantProvider.tsx`)
- Fetches active plants from API
- Auto-selects first plant if none selected
- On plant change: resets dashboard/config store state, invalidates hierarchy/characteristics/samples/violations queries
- Exposes: `plants`, `selectedPlant`, `setSelectedPlant()`, `isLoading`, `error`

### WebSocketProvider (`providers/WebSocketProvider.tsx`)
- Connects to `ws://{host}/ws/samples?token={jwt}` (proxied via Vite in dev)
- Requires JWT token (waits and retries if not available)
- Exponential backoff reconnection (1s base, 30s max)
- Message types handled:
  - `sample`: Updates latestSamples cache, invalidates chart data, adds pending violations
  - `violation`: Adds to pending queue, invalidates violations queries
  - `ack_update`: Invalidates violations queries
  - `limits_update`: Invalidates characteristic detail and chart data
- Subscription model: components call `subscribe(characteristicId)` / `unsubscribe(characteristicId)`
- Connection persists across page navigations (app-level)

### ThemeProvider (`providers/ThemeProvider.tsx`)
- Three modes: light, dark, system (follows `prefers-color-scheme`)
- Brand customization: primary color, accent color, logo URL, app name
- Applies brand colors as CSS custom properties (hex to HSL conversion)
- Switches favicon based on resolved theme
- Persisted to localStorage (`openspc-theme`, `openspc-brand`)

### ChartHoverContext (`contexts/ChartHoverContext.tsx`)
- Cross-chart hover synchronization using sample IDs (stable database identifiers, not array indices)
- Throttled to one update per animation frame (prevents 60fps cascading re-renders)
- `useChartHoverSync(characteristicId)` hook provides: `hoveredSampleIds`, `onHoverSample()`, `onLeaveSample()`, `isHighlighted(sampleId)`

---

## 7. Charting System

### ECharts Integration

**Tree-shaking** (`lib/echarts.ts`): Registers only LineChart, BarChart, CustomChart, Grid, Tooltip, MarkLine, MarkArea, MarkPoint, DataZoom, Dataset components with CanvasRenderer.

**Hook** (`hooks/useECharts.ts`): Manages ECharts lifecycle:
- Instance creation/disposal
- ResizeObserver for responsive sizing (debounced via requestAnimationFrame)
- Reactive option updates via `setOption()`
- Mouse event bridging: ECharts `mouseover`/`mouseout`/`click` on series to React callbacks
- Global mouseout via `getZr().on('globalout')`
- Manual `refresh()` for theme changes

### Chart Type Registry (`lib/chart-registry.ts`)

10 chart types across 3 categories:

| Category | Types |
|---|---|
| Variable | X-bar, X-bar R, X-bar S, I-MR |
| Attribute | p, np, c, u |
| Analysis | Pareto, Box-Whisker |

Auto-recommendation: n=1 -> I-MR, n=2-10 -> X-bar R, n>10 -> X-bar S

### ControlChart Rendering

The `ControlChart` component uses ECharts custom series `renderItem` for data point symbols:
- **Normal points**: Circles (radius 4)
- **Violation points**: Diamonds (radius 6) with red fill, shadow glow, numbered badge showing primary Nelson rule + count
- **Undersized points**: Triangles (radius 5) with dashed ring
- **Excluded points**: Gray-filled circles
- **Highlighted points**: Yellow fill (radius 7) with glow ring (from histogram hover or cross-chart hover)

Additional chart features:
- **Zone shading**: markArea for zones A/B/C and out-of-control regions
- **Control limit lines**: markLine for UCL/CL/LCL with formatted labels
- **Spec limit lines**: Red dashed lines for USL/LSL (toggleable)
- **Gradient line stroke**: `graphic.LinearGradient(0, 0, 1, 0, [...])` for left-to-right gradient
- **Annotation markers**: Amber `*` at chart top, dashed vertical lines for point annotations, shaded areas for period annotations
- **X-axis modes**: Category (sample index) or value (timestamp with adaptive formatting)
- **Subgroup modes**: Standardized (z-score axis, fixed -3/+3 limits), Variable Limits (per-point UCL/LCL), standard
- **Range window**: Slices visible data based on ChartRangeSlider

### Chart Color Presets (`lib/theme-presets.ts`)

Customizable chart colors including:
- Line gradient (start/end)
- Control lines (UCL, CL, LCL)
- Zone fills (A, B, C)
- Point markers (normal, violation, undersized, excluded)
- Secondary/comparison colors
- Persisted to localStorage, applied via custom event `chart-colors-changed`

---

## 8. Role-Based Access Control

### Role Definitions (`lib/roles.ts`)

4-tier hierarchy: `operator (1) < supervisor (2) < engineer (3) < admin (4)`

| Role | View Access | Action Access |
|---|---|---|
| operator | Dashboard, Data Entry, Violations, Kiosk, Wall Dashboard | - |
| supervisor | + Reports | Acknowledge/resolve violations, edit/delete/exclude samples |
| engineer | + Configuration, Connectivity | Create/edit/delete characteristics, API keys, database settings |
| admin | + Settings, Users, Dev Tools | Theme/branding, user CRUD, role assignment |

**Implementation**: `hasAccess(userRole, requiredRole)` compares numeric hierarchy values. `ProtectedRoute` component wraps routes, `canAccessView()` filters sidebar items, `canPerformAction()` gates individual actions.

**Role derivation**: AuthProvider derives role from user's `plant_roles` array for the currently selected plant. Falls back to highest role across all plants.

---

## 9. Real-Time Features

### WebSocket Protocol
- **Endpoint**: `/ws/samples?token={jwt}`
- **Client sends**: `{ type: 'subscribe', characteristic_ids: [1,2,3] }` and `{ type: 'unsubscribe', characteristic_ids: [1] }`
- **Server sends**: `sample`, `violation`, `ack_update`, `limits_update` messages
- **Effect**: Invalidates React Query caches, disables polling when connected

### Live Updates Flow
1. Backend processes sample -> sends `sample` message via WebSocket
2. WebSocketProvider receives message -> updates `latestSamples` cache in dashboardStore
3. Invalidates chart data and violation queries -> React Query refetches
4. New violations added to `pendingViolations` queue for toast display

---

## 10. Theming and UI/UX

### Theme System
- CSS variables-based with Tailwind (`--primary`, `--accent`, `--background`, etc.)
- Three modes: light, dark, system (media query listener)
- Brand customization: primary/accent colors applied as HSL CSS variables, custom logo (upload with data URI), custom app name
- Favicon switches between dark/light variants
- Chart color presets with live preview

### Responsive Behavior
- Sidebar: collapsible (expanded 240px -> collapsed 60px -> hidden for mobile overlay)
- Header: responsive user menu and theme toggle (labels hidden on small screens)
- Histogram panels: resizable via drag handles (width for right position, height for below position)
- Charts: ResizeObserver-based responsive sizing

### Kiosk Mode
- Full-screen dark theme with larger fonts
- No sidebar/header chrome
- Auto-rotation with configurable interval
- Keyboard navigation (arrows, space to pause)
- Status indicator with color-coded control status

### Accessibility Notes
- Keyboard navigation in kiosk mode
- ARIA labels on pagination dots and navigation buttons
- Focus rings on form inputs
- Color contrast via theming system
- Screen reader text for status indicators

---

## 11. Export and Reporting

### Report Templates (`lib/report-templates.ts`)
4 built-in templates:
1. **Characteristic Summary**: Control chart, statistics, violations, annotations, samples
2. **Capability Analysis**: Histogram, Cp/Cpk/Pp/Ppk metrics, interpretation
3. **Violation Summary**: Violation stats, trend chart, violation table
4. **Trend Analysis**: Trend chart with annotations

### Export Utilities (`lib/export-utils.ts`)
- **PDF**: jsPDF with autoTable for tabular data, html2canvas for chart screenshots
- **Excel**: xlsx library for structured data export
- **PNG**: html2canvas screenshot of report content
- **Color conversion**: Handles modern CSS color functions (oklch, oklab, color-mix) by rendering to canvas pixel and reading back RGB

---

## 12. Utility Libraries

| File | Purpose |
|---|---|
| `lib/utils.ts` | `cn()` - Tailwind class merger (clsx + twMerge) |
| `lib/roles.ts` | RBAC: role hierarchy, view/action permissions, access checkers |
| `lib/nelson-rules.ts` | Nelson rule metadata, descriptions, causes, actions |
| `lib/chart-registry.ts` | Chart type definitions, compatibility, recommendations |
| `lib/echarts.ts` | Tree-shaken ECharts registration |
| `lib/theme-presets.ts` | Chart color presets and storage |
| `lib/report-templates.ts` | Report template definitions |
| `lib/export-utils.ts` | PDF, Excel, PNG export |
| `lib/help-content.ts` | Contextual help registry for tooltips |

---

## 13. TypeScript Types (`types/`)

### Core Types (`types/index.ts`)
- **Auth**: `AuthUser`, `PlantRole`, `LoginResponse`, `RefreshResponse`
- **Plant**: `Plant`, `PlantCreate`, `PlantUpdate`
- **Hierarchy**: `HierarchyNode` (recursive with `children`, flexible `type` field)
- **Characteristic**: `Characteristic` with subgroup mode config (`STANDARDIZED | VARIABLE_LIMITS | NOMINAL_TOLERANCE`), provider type (`MANUAL | TAG`)
- **Sample**: `Sample`, `Measurement`, `SampleEditHistory`, `SampleProcessingResult`
- **Chart Data**: `ChartDataPoint` (with variable limit fields: `actual_n`, `is_undersized`, `effective_ucl/lcl`, `z_score`, `display_value`), `ChartData`
- **Violations**: `Violation`, `ViolationStats`, `Severity`
- **WebSocket**: `WSSampleMessage`, `WSViolationMessage`, `WSAckMessage`, `WSLimitsMessage`
- **MQTT**: `MQTTBroker`, `BrokerConnectionStatus`, `BrokerTestResult`, `DiscoveredTopic`, `TopicTreeNode`, `SparkplugMetricInfo`
- **Tags**: `TagMappingCreate`, `TagMappingResponse`, `TagPreviewValue`, `TagPreviewResponse`
- **Providers**: `ProviderStatus`, `TagProviderStatus`, `MQTTStatus`
- **Annotations**: `Annotation`, `AnnotationCreate`, `AnnotationUpdate`, `AnnotationType`
- **API**: `PaginatedResponse<T>`, `ApiError`

### Chart Types (`types/charts.ts`)
- `ChartTypeId`: 10 chart type identifiers
- `ChartTypeDefinition`: Full chart type config (category, subgroup requirements, dual chart layout, control limit method)
- `SecondaryChartData`, `DualChartData`: Types for dual-chart layouts
- `SPC_CONSTANTS`: Standard SPC statistical constants (d2, D3, D4, A2, c4, B3, B4, A3, E2) with table lookup

---

## 14. TODO / Gaps / Incomplete Features

### Stubbed Features
1. **Data Entry - Scheduling tab**: Shows "Coming Soon" placeholder. Schedule configuration UI exists (`ScheduleConfigSection.tsx`) but the scheduling tab in DataEntryView is disabled.

### Known TODOs (from source code)
1. **ViolationsView**: `requires_acknowledgement` filtering is done client-side. Comment: "TODO: Move requires_acknowledgement filtering to backend API once the endpoint supports a requires_acknowledgement query parameter."

### Potential Improvements
1. **Pagination**: ViolationsView uses simple page-based pagination (VIOLATIONS_PER_PAGE = 50) but does not implement pagination UI controls (next/prev buttons). ReportsView violations query fetches up to 100.
2. **Attribute chart rendering**: Chart type registry defines p, np, c, u chart types but the rendering in ControlChart appears to be focused on variable data (means, ranges). Attribute chart rendering may need dedicated components.
3. **Pareto chart**: Defined in registry but no dedicated rendering component exists.
4. **Accessibility**: While basic ARIA labels exist for kiosk navigation, broader accessibility features (skip navigation, ARIA roles for charts, screen reader descriptions for chart data) are limited. ECharts canvas-based rendering is inherently less accessible than SVG.
5. **Mobile responsiveness**: Sidebar has a "hidden" state for mobile, but no mobile breakpoint detection or hamburger menu is implemented. The app is primarily designed for desktop/tablet use.
6. **Offline support**: No service worker or offline caching. The app requires a persistent connection to the backend.
7. **Batch acknowledgement UI**: The API supports `batchAcknowledge` but the ViolationsView only has single-item acknowledge buttons. No checkbox selection for batch operations.
8. **i18n / Localization**: All strings are hardcoded in English. No internationalization framework.
9. **Error boundaries**: Only one `RouteErrorBoundary` wraps the main Layout. Individual page components do not have error boundaries.
10. **Wall Dashboard preset management**: Uses `prompt()` and `alert()` for save/load preset interactions rather than proper modal dialogs.

### Missing Test Coverage
- No test files detected in the frontend source directory (`frontend/src/`). Testing infrastructure (if any) would be at the `frontend/` level.

---

## 15. File Count Summary

| Directory | Count | Description |
|---|---|---|
| `pages/` | 12 | Page-level components |
| `components/` | 54 | UI components (flat + subdirectories) |
| `components/charts/` | 4 | Chart-specific components |
| `components/characteristic-config/` | 7 | Characteristic configuration tabs |
| `components/connectivity/` | 5 | MQTT connectivity components |
| `components/users/` | 2 | User management components |
| `stores/` | 3 | Zustand stores |
| `providers/` | 4 | React context providers |
| `contexts/` | 1 | ChartHoverContext |
| `hooks/` | 1 | Custom hooks (useECharts) |
| `api/` | 2 | API client + React Query hooks |
| `types/` | 2 | TypeScript type definitions |
| `lib/` | 9 | Utility libraries |
| **Total** | ~93 | Frontend source files |
