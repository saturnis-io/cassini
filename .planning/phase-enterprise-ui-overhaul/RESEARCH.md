# Phase: Enterprise UI Overhaul - Research

## Current Architecture Analysis

### Layout & Navigation
- **Current**: Horizontal navbar in `Layout.tsx` with 6 navigation items
- **Tech Stack**: React 18 + React Router v7 + Tailwind CSS 4
- **State**: Zustand stores with persistence (`dashboardStore`, `configStore`)
- **Theme**: CSS variables with light/dark/system mode via `ThemeProvider`

### Existing Files to Modify
| File | Current Purpose | Required Changes |
|------|----------------|------------------|
| `frontend/src/components/Layout.tsx` | Horizontal navbar layout | Replace with sidebar layout |
| `frontend/src/App.tsx` | Route definitions | Add kiosk/wall routes, auth provider |
| `frontend/src/providers/ThemeProvider.tsx` | Theme toggle | Extend for brand colors |
| `frontend/src/stores/dashboardStore.ts` | Dashboard state | Add sidebar state |

### New Files Required
| File | Purpose |
|------|---------|
| `frontend/src/components/Sidebar.tsx` | Collapsible vertical sidebar |
| `frontend/src/components/Header.tsx` | Minimal header with plant selector |
| `frontend/src/components/PlantSelector.tsx` | Plant context dropdown |
| `frontend/src/pages/KioskView.tsx` | Full-screen auto-rotating display |
| `frontend/src/pages/WallDashboard.tsx` | Multi-chart grid layout |
| `frontend/src/components/KioskLayout.tsx` | Chrome-free layout wrapper |
| `frontend/src/providers/AuthProvider.tsx` | Role context (mock for now) |
| `frontend/src/providers/PlantProvider.tsx` | Plant context |
| `frontend/src/lib/roles.ts` | Role definitions and permissions |
| `frontend/src/stores/uiStore.ts` | Sidebar state, UI preferences |

## Implementation Considerations

### 1. Sidebar Navigation
- shadcn components not present - need custom implementation
- Use lucide-react icons (already installed)
- States: Expanded | Collapsed | Hidden
- Persist state in localStorage
- Mobile: slide-out drawer pattern

### 2. Plant Context
- Static mock list initially: ["Demo Plant", "Plant A", "Plant B"]
- Store selection in Zustand + localStorage
- API calls should include plant_id parameter (prepare for backend)
- Global context via PlantProvider

### 3. Role-Based Access
- Mock roles in localStorage for now
- Role hierarchy: Operator < Supervisor < Engineer < Admin
- Route-level protection via wrapper component
- Navigation items conditionally rendered

### 4. Kiosk Mode
- New route: `/kiosk`
- No sidebar/header chrome
- Query params: `?plant=1&chars=1,2,3&interval=30`
- Large fonts (1.5-2x base size)
- Auto-rotate through characteristics
- WebSocket-only data refresh

### 5. Wall Dashboard
- New route: `/wall-dashboard`
- CSS Grid for chart arrangement
- Click-to-expand functionality
- Drag-and-drop requires additional library (defer to future)
- Save/load layouts in localStorage

### 6. Brand Theming
- Extend CSS variable system
- Admin-only customization UI
- Properties: primary, accent, logo URL, app name
- Store in localStorage (backend persistence later)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Large refactor breaking features | High | Incremental migration, plan-by-plan |
| No shadcn base components | Medium | Custom implementation with Tailwind |
| Performance regression | Medium | React.memo, code splitting |
| Accessibility gaps | Medium | ARIA attributes, keyboard navigation |

## Dependency Order

```
Plan 1: Core Infrastructure (Wave 1)
  └── uiStore, roles.ts, PlantProvider, AuthProvider

Plan 2: Sidebar & Header (Wave 1, parallel)
  └── Sidebar.tsx, Header.tsx, PlantSelector.tsx

Plan 3: Layout Integration (Wave 2, depends 1,2)
  └── Modify Layout.tsx, integrate providers

Plan 4: Role-Based Routing (Wave 2, depends 1,3)
  └── ProtectedRoute, navigation gating

Plan 5: Kiosk Mode (Wave 3, depends 3)
  └── KioskView, KioskLayout

Plan 6: Wall Dashboard (Wave 3, depends 3)
  └── WallDashboard, grid layout

Plan 7: Brand Theming (Wave 4, depends 3)
  └── ThemeCustomizer, extended ThemeProvider
```

## Testing Strategy

1. **Manual testing** after each plan
2. **TypeScript compilation** validation
3. **Visual regression** via screenshots
4. **Accessibility audit** at phase end
