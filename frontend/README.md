# OpenSPC Frontend

Single-page application for Statistical Process Control built with React 19, TypeScript 5.9, and Vite 7. Provides real-time control charts, equipment hierarchy management, industrial connectivity configuration (MQTT and OPC-UA), database administration, and reporting.

## Project Structure

```
src/
  main.tsx             # React entry point
  App.tsx              # Router, providers, layout
  index.css            # Tailwind CSS 4 entry + theme variables
  api/
    client.ts          # fetchApi wrapper (auth, 401 refresh, error parsing)
                       # 15 API namespaces: annotationApi, authApi, brokerApi,
                       # characteristicApi, configApi, databaseApi, dataEntryApi,
                       # devtoolsApi, hierarchyApi, opcuaApi, plantApi,
                       # providerApi, sampleApi, userApi, violationApi
    hooks.ts           # 60+ TanStack Query hooks (queries + mutations)
  components/          # ~90 components
    charts/            # Chart type selector, dual-chart panel, range chart
    characteristic-config/  # Tabbed config wizard (general, limits, rules, sampling)
    connectivity/      # 28 components — Connectivity Hub (Monitor, Servers, Browse, Mapping)
    users/             # User table, form dialog
    *.tsx              # Shared: Header, Sidebar, Layout, modals, selectors, etc.
  contexts/
    ChartHoverContext.tsx  # Cross-chart hover synchronization
  hooks/
    useECharts.ts      # ECharts 6 lifecycle hook (init, resize, dispose)
  lib/
    echarts.ts         # Tree-shaken ECharts 6 imports
    protocols.ts       # Extensible protocol registry (MQTT + OPC-UA definitions)
    chart-registry.ts  # Chart type definitions and option builders
    export-utils.ts    # PDF, Excel, PNG export helpers
    nelson-rules.ts    # Nelson rule descriptions and UI metadata
    report-templates.ts# Report template definitions
    roles.ts           # Role hierarchy and permission helpers
    theme-presets.ts   # Built-in theme color schemes
    utils.ts           # Date formatting, number formatting, misc utilities
    help-content.ts    # Help tooltip content
  pages/               # 13 route pages
    OperatorDashboard  # Main SPC dashboard with control charts
    ConfigurationView  # Hierarchy and characteristic management
    ConnectivityPage   # MQTT + OPC-UA connectivity hub (4 tabs)
    DataEntryView      # Manual and automated data entry
    SettingsView       # App settings (appearance, database, plant, notifications)
    UserManagementPage # User CRUD, role assignment
    ViolationsView     # Violation list with filtering
    ReportsView        # Report generation and export
    KioskView          # Full-screen kiosk display
    WallDashboard      # Multi-chart wall display
    LoginPage          # Authentication
    ChangePasswordPage # Password change (forced or voluntary)
    DevToolsPage       # Sandbox development tools
  providers/
    AuthProvider.tsx    # JWT auth context (login, logout, token refresh)
    PlantProvider.tsx   # Active plant selection context
    ThemeProvider.tsx   # Theme switching (light/dark/custom presets)
    WebSocketProvider.tsx  # WebSocket connection + reconnection
  stores/
    uiStore.ts         # UI state (sidebar, modals) — persisted to localStorage
    dashboardStore.ts  # Dashboard layout preferences — persisted
    configStore.ts     # Configuration page state
  types/
    index.ts           # Shared TypeScript interfaces
    charts.ts          # Chart-specific type definitions
```

## Key Patterns

**API Client** -- All API calls go through `fetchApi` in `client.ts`, which handles JWT access tokens, automatic 401 refresh via a shared promise queue (prevents race conditions with concurrent requests), and standardized error parsing.

**Server State** -- TanStack Query v5 manages all server data with query key factories in `hooks.ts`. Stale-while-revalidate for chart data, optimistic updates for mutations, and configurable polling intervals.

**Client State** -- Zustand v5 stores persisted to localStorage (`openspc-ui`, `openspc-dashboard`) for UI preferences that survive page reloads.

**Charts** -- ECharts 6 on HTML5 canvas, tree-shaken to reduce bundle size. The `useECharts` hook manages the full chart lifecycle (init, option updates, resize observation, dispose). Container divs must always be in the DOM (use `visibility: hidden`, not conditional rendering).

**Auth Flow** -- JWT access token (15 min) stored in memory, refresh token (7 day) in an httpOnly cookie scoped to `/api/v1/auth`. The `AuthProvider` wraps the app and `RequireAuth` gates protected routes.

**Connectivity Hub** -- Unified 4-tab interface for both MQTT and OPC-UA protocols. Uses the protocol registry (`lib/protocols.ts`) to render protocol-specific forms and status indicators. 28 components handle server management, node/topic browsing, tag mapping, and real-time monitoring.

## Installation

```bash
cd frontend
npm install
npm run dev        # Development server at http://localhost:5173
```

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Type-check with `tsc` then build for production |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

## Dependencies

- **React 19** + React Router 7 for routing
- **TypeScript 5.9** with strict mode
- **Vite 7** for bundling and dev server
- **Tailwind CSS 4** for styling
- **TanStack Query 5** for server state management
- **Zustand 5** for client state management
- **ECharts 6** for control chart rendering
- **Lucide React** for icons
- **Sonner** for toast notifications
- **jsPDF** + **xlsx** for report export
