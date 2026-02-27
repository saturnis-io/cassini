# Feature: Display Modes (Kiosk & Wall Dashboard)

## Category: DISP
## Config Reference: `{ prefix: "DISP", name: "Display Modes", kb: "17-display-modes.md" }`

---

## What It Does

Display modes provide alternative views optimized for shop floor use, replacing the standard sidebar-and-header layout with purpose-built interfaces for monitoring and visual management.

**Kiosk Mode** (`/kiosk`) shows a single control chart fullscreen with auto-rotation through multiple characteristics. It is designed for touch-screen terminals at operator workstations -- the operator sees the current process state at a glance without needing to interact with the full application UI.

**Wall Dashboard** (`/wall-dashboard`) shows multiple charts simultaneously in a configurable grid layout. It is designed for large TV/monitor displays mounted in production areas -- supervisors and managers can see the health of multiple processes at once. Charts can be clicked to expand into a fullscreen modal for closer inspection.

Both modes use the `KioskLayout` component, which strips away the sidebar and header, forces dark mode for contrast on factory floor lighting, and uses a larger base font size for distance viewing.

From a visual management perspective:

- **Lean Manufacturing / 5S**: Visual controls are a core lean principle. Information should be visible at the point of use, eliminating the need to search for data. Kiosk mode serves as a digital andon board.
- **Andon Systems**: Traditional andon boards use red/yellow/green lights to signal process status. Kiosk mode's `StatusIndicator` replicates this with color-coded dots: green (in control), yellow (approaching limits), red/pulsing (violation detected).
- **Gemba Walks**: Managers performing gemba walks can glance at wall dashboards to assess process health without interrupting operators.
- **Real-Time SPC**: Both display modes use live data feeds via React Query, refreshing automatically. When combined with WebSocket connectivity, charts update in near real-time as new measurements arrive from the shop floor.

---

## Where To Find It

| Function | Location | Min Role | Description |
|---|---|---|---|
| Kiosk mode | `/kiosk` | Operator | Fullscreen single-chart display with auto-rotation |
| Wall dashboard | `/wall-dashboard` | Operator | Multi-chart grid display for TV monitors |
| Kiosk (direct URL) | `/kiosk?chars=1,2,3&interval=20` | Operator | Direct URL with characteristic IDs and rotation interval |
| Wall dashboard (direct URL) | `/wall-dashboard?chars=1,2,3&grid=3x3` | Operator | Direct URL with characteristic IDs and grid size |

Both display modes are outside the main application layout (no sidebar, no header). They require authentication -- unauthenticated access redirects to `/login`.

---

## Key Concepts (Six Sigma Context)

### Visual Management

Visual management is a lean manufacturing technique that makes the current state of a process visible to everyone. Key principles:

| Principle | Implementation |
|---|---|
| **At the point of use** | Kiosk terminals placed at workstations; wall displays mounted in production areas |
| **Real-time** | Charts refresh automatically via React Query; WebSocket pushes violations |
| **Color-coded** | Green/yellow/red status indicators match andon board conventions |
| **No interaction required** | Wall dashboard is read-only by default; kiosk auto-rotates |
| **Glanceable** | Large fonts, high contrast (forced dark mode), minimal chrome |

### Kiosk Mode Features

| Feature | Description |
|---|---|
| **Fullscreen chart** | Single `ControlChart` component fills the viewport (height: `calc(100vh - 220px)`) |
| **Auto-rotation** | Cycles through characteristics at configurable intervals (default 15 seconds) |
| **Status indicator** | Color-coded dot: green (ok), yellow (approaching limits within 10%), red/pulsing (violation detected on latest point) |
| **Keyboard navigation** | Left/Right arrows for manual navigation, Space to pause/resume, readable by barcode scanner inputs |
| **Pagination dots** | Visual indicator of current position in the rotation sequence |
| **Stats bar** | Bottom bar shows: current value, UCL, LCL, and unit of measurement |
| **Pause/Resume** | Toggle button to stop auto-rotation for closer inspection |
| **URL configuration** | `?chars=1,2,3` to specify which characteristics; `?interval=20` for rotation seconds |

### Wall Dashboard Features

| Feature | Description |
|---|---|
| **Grid layout** | Configurable: 2x2, 3x3, 4x4, 2x3, 3x2 (rows x columns) |
| **Multiple charts** | Each grid cell contains a `WallChartCard` with a miniature control chart |
| **Click to expand** | Clicking a chart opens a fullscreen modal (`ExpandedChartModal`) with detailed stats |
| **No status bar** | Wall dashboard uses `KioskLayout` with `showStatusBar={false}` for maximum chart area |
| **Brand badge** | Small brand logo/name in the top-right corner (low opacity) |
| **Save/Load presets** | Save named configurations to localStorage; reload them later |
| **URL configuration** | `?chars=1,2,3` for characteristics; `?grid=3x3` for grid size |
| **Empty slots** | Grid cells without assigned characteristics show "No data" placeholder |

### KioskLayout (Shared Chrome)

Both display modes are wrapped in `KioskLayout`, which provides:

- **Full viewport**: `min-h-screen` with `overflow-hidden`
- **No sidebar or header**: No `Layout` component, no navigation
- **Forced dark mode**: Injects CSS custom properties for dark colors regardless of user theme preference. This ensures readability on factory floor monitors with varying ambient lighting.
- **Large base font**: `text-lg` on the content area for distance viewing
- **Optional status bar**: Kiosk mode shows a connection status bar at the bottom (WebSocket connected/disconnected indicator + brand logo). Wall dashboard hides the status bar for maximum chart real estate.

### Authentication Requirement

Both display modes are wrapped in `AuthenticatedDisplayMode`, which combines:
1. `RequireAuth` -- Redirects to `/login` if not authenticated
2. `AuthenticatedProviders` -- Provides `PlantProvider`, `ChartHoverProvider`, `WebSocketProvider`

This means:
- A browser displaying `/kiosk` on a factory terminal must have an active session
- If the session expires, the display will redirect to the login page
- The display shows data scoped to the authenticated user's active plant
- URL can be bookmarked for quick access after login

---

## How To Configure (Step-by-Step)

### Setting Up a Kiosk Display

1. On the target terminal/display, open a browser and navigate to the application URL.
2. Log in with an operator (or higher) account.
3. Navigate to `/kiosk` (or `/kiosk?chars=1,2,3&interval=20` for specific characteristics).
4. The kiosk view loads fullscreen with auto-rotation.
5. **To specify characteristics**: Add `?chars=` parameter with comma-separated characteristic IDs.
6. **To change rotation speed**: Add `?interval=` parameter with seconds (default 15).
7. **To pause rotation**: Press Space or click the Pause button.
8. Bookmark the URL for quick access on next login.

### Setting Up a Wall Dashboard

1. On the target TV/monitor, open a browser and navigate to the application URL.
2. Log in with an operator (or higher) account.
3. Navigate to `/wall-dashboard` (or `/wall-dashboard?chars=1,2,3,4&grid=2x2`).
4. The wall dashboard loads with the specified grid layout.
5. **To change grid size**: Use the grid size selector dropdown in the toolbar.
6. **To specify characteristics**: Add `?chars=` parameter with comma-separated IDs.
7. **To save a preset**: Click the Save button, enter a name. The configuration is stored in localStorage.
8. **To load a preset**: Click the Load button, select from saved presets.
9. **To expand a chart**: Click on any chart card to open the fullscreen modal. Press Escape or click outside to close.

### Finding Characteristic IDs

Characteristic IDs are needed for the `?chars=` URL parameter. To find them:
1. Navigate to `/configuration` in the main application.
2. Select a characteristic from the hierarchy tree.
3. The characteristic ID is visible in the URL or in the detail panel.
4. Alternatively, use the API: `GET /characteristics` returns all characteristics with their IDs.

---

## How To Use (Typical Workflow)

### Factory Floor Kiosk Terminal

1. Mount a touch-screen terminal at the operator workstation.
2. Configure the browser to open `/kiosk?chars=5,6,7&interval=30` on startup.
3. The operator logs in once at shift start.
4. The kiosk automatically rotates through the three assigned characteristics every 30 seconds.
5. The status indicator shows green (normal), yellow (approaching limits), or red pulsing (violation).
6. If a violation is detected, the operator pauses rotation (Space or Pause button) to inspect the chart.
7. The operator takes corrective action based on the chart data.

### Production Area Wall Display

1. Mount a large TV in the production area.
2. Connect a mini-PC or stick computer.
3. Configure the browser to open `/wall-dashboard?chars=1,2,3,4,5,6,7,8,9&grid=3x3` on startup.
4. The supervisor logs in once.
5. The 3x3 grid shows 9 key characteristics simultaneously.
6. During gemba walks, managers glance at the dashboard to assess overall process health.
7. If a chart shows a violation (red highlights), the manager clicks to expand for details.

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Verification |
|---|---|---|
| 1 | Kiosk mode loads fullscreen with chart rendered | Navigate to /kiosk, verify chart fills the viewport |
| 2 | Kiosk mode hides sidebar and header | Verify no sidebar navigation, no header toolbar |
| 3 | Kiosk auto-rotation cycles through characteristics | Configure multiple chars, verify rotation at interval |
| 4 | Kiosk status indicator shows correct color | Verify green for normal, yellow near limits, red for violation |
| 5 | Kiosk keyboard controls work | Press left/right arrows and space bar, verify navigation and pause |
| 6 | Wall dashboard loads with grid layout | Navigate to /wall-dashboard, verify grid of charts |
| 7 | Wall dashboard no status bar | Verify no connection status bar visible |
| 8 | Wall dashboard grid size selector works | Change grid size, verify layout updates |
| 9 | Wall dashboard click-to-expand works | Click a chart card, verify fullscreen modal opens |
| 10 | Both modes require authentication | Access /kiosk without login, verify redirect to /login |
| 11 | URL parameters configure characteristics | Use ?chars=1,2,3, verify only those chars displayed |
| 12 | URL parameters configure interval/grid | Use ?interval=10 or ?grid=3x3, verify applied |
| 13 | Kiosk forced dark mode active | Verify dark color scheme regardless of theme setting |
| 14 | Wall dashboard preset save/load works | Save a preset, reload page, load preset, verify restored |

---

## Edge Cases & Constraints

- **Authentication expiry**: If the user session expires while a kiosk or wall dashboard is displayed, the browser will redirect to `/login`. For unattended displays, consider using long session timeouts or refresh token rotation.
- **No interactive controls on wall dashboard**: The wall dashboard toolbar (grid size, save, load) is minimal. There is no sidebar navigation, no settings access, and no data entry capability from this view.
- **Mobile devices**: Kiosk and wall dashboard layouts are designed for large screens. On small mobile screens, charts may be too small to read. The wall dashboard grid may not display well on narrow viewports.
- **Empty characteristics**: If `?chars=` specifies IDs that do not exist or the user has no access to, the kiosk shows "No Characteristics" and the wall dashboard shows empty grid slots.
- **Single-characteristic kiosk**: If only one characteristic is configured, auto-rotation is disabled (no need to rotate) and pagination dots are hidden.
- **KioskLayout CSS overrides**: The forced dark mode is implemented via CSS custom property overrides in a `<style>` block. This overrides the user's theme preference. If the user navigates away from the display mode, their normal theme is restored.
- **localStorage presets**: Wall dashboard presets are stored in `localStorage` under the key `cassini-wall-dashboard-presets`. They are browser-specific and not synced across devices.
- **Chart rendering**: Charts use the `ControlChart` component with ECharts. The container must always be in the DOM (per ECharts requirement). The `ErrorBoundary` wrapper prevents chart errors from crashing the entire display.
- **WebSocket dependency**: Real-time updates depend on WebSocket connectivity. If WebSocket is disconnected, the kiosk status bar shows a red "Disconnected" indicator. Charts still refresh via React Query polling but may lag behind real-time.

---

## API Reference (for seeding)

Display modes do not have their own API endpoints. They consume existing chart data and characteristic APIs.

### Endpoints Used by Display Modes

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/characteristics` | User | List all characteristics (used to populate chart lists) |
| `GET` | `/characteristics/{id}/chart-data` | User | Get chart data for a specific characteristic. Query: `limit`, `start_date`, `end_date` |

### Seeding Example

Display modes require existing characteristics with sample data. Use the standard seeding flow:

```bash
# 1. Create a plant and hierarchy
# (See 02-plants-hierarchy.md seeding example)

# 2. Create characteristics
CHAR1=$(curl -s -X POST $API/characteristics \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hierarchy_id": '$HIER_ID', "name": "Dimension A", "subgroup_size": 5, "usl": 10.05, "lsl": 9.95}')
CHAR1_ID=$(echo $CHAR1 | jq '.id')

# 3. Submit sample data
for i in $(seq 1 30); do
  curl -X POST $API/samples \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"characteristic_id\": $CHAR1_ID, \"measurements\": [10.01, 9.99, 10.00, 9.98, 10.02]}"
done

# 4. Recalculate limits
curl -X POST $API/characteristics/$CHAR1_ID/recalculate-limits \
  -H "Authorization: Bearer $TOKEN"

# 5. Access kiosk mode
# Browser: http://localhost:5173/kiosk?chars=$CHAR1_ID&interval=15

# 6. Access wall dashboard
# Browser: http://localhost:5173/wall-dashboard?chars=$CHAR1_ID&grid=2x2
```
