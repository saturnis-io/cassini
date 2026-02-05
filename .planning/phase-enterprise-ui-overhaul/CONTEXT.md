# Phase: Enterprise UI Overhaul

## Goal
Transform OpenSPC from a single-user demo application into an enterprise-grade SPC platform suitable for manufacturing floor deployment.

## Scope
Complete frontend refactoring leveraging these skills:
- `frontend-design` - Distinctive, production-grade interfaces
- `vercel-react-best-practices` - React performance optimization (57 rules)
- `kpi-dashboard-design` - Enterprise KPI dashboard patterns
- `accessibility-compliance` - WCAG 2.1 AA compliance
- `shadcn-ui` - Component library expertise
- `ui-design-system` - Design system architecture

---

## Decisions

### 1. Multi-Tenant / Multi-Plant Architecture
**Decision: A. Plant Selector**

Add a plant/site dropdown in the header; user switches context manually; single view at a time.

**Implementation:**
- Add plant selector dropdown in header (replacing hardcoded "Demo Plant")
- Store selected plant in global state (Zustand)
- All API calls will include plant context
- Backend support for plant filtering (may require separate phase)

---

### 2. Role-Based UI Customization
**Decision: A. View-Level Gating**

Hide entire views/pages based on role (e.g., operators can't access Configuration).

**Implementation:**
- Define role hierarchy: Operator < Supervisor < Engineer < Admin
- Route-level protection with role requirements
- Navigation items hidden based on role
- Backend JWT/session with role claim (may require auth phase)

**Role-View Matrix (proposed):**
| View | Operator | Supervisor | Engineer | Admin |
|------|----------|------------|----------|-------|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Data Entry | ✓ | ✓ | ✓ | ✓ |
| Violations | ✓ (view) | ✓ (ack) | ✓ (ack) | ✓ |
| Reports | - | ✓ | ✓ | ✓ |
| Configuration | - | - | ✓ | ✓ |
| Settings | - | - | - | ✓ |

---

### 3. Factory Floor Display Mode
**Decision: A. Kiosk Mode + B. Wall Dashboard** (both)

**3A. Kiosk Mode:**
- Full-screen, auto-rotating multi-characteristic view
- Large fonts optimized for distance viewing
- No navigation UI - status and alerts focused
- Auto-refresh with configurable rotation interval
- Touch-friendly for floor terminals

**3B. Wall Dashboard:**
- Configurable grid layout showing multiple charts simultaneously
- Click-to-expand for detail view
- Drag-and-drop grid arrangement
- Save/load dashboard configurations
- Optimized for 4K/ultrawide displays

**Implementation:**
- New route: `/kiosk` and `/wall-dashboard`
- Separate simplified layouts without standard chrome
- Query params for configuration (plant, characteristics, rotation speed)
- CSS optimizations for large displays (increased base font, high-contrast colors)

---

### 4. Navigation Architecture
**Decision: B. Collapsible Sidebar**

Add a vertical sidebar that can collapse to icons; better for future view expansion.

**Implementation:**
- Replace horizontal navbar with collapsible vertical sidebar
- Sidebar states: Expanded (with labels) | Collapsed (icons only) | Hidden (full-screen)
- Persist sidebar state in localStorage
- Add hierarchy tree directly in sidebar for quick navigation
- Keep header minimal: Logo, plant selector, user menu, theme toggle

**Sidebar Structure:**
```
[Logo]
───────────
Dashboard
Data Entry
Violations (badge)
Reports
───────────
Configuration
Settings
───────────
[Collapse Toggle]
```

---

### 5. Dashboard Customization
**Decision: D. Per-Role Defaults**

Predefined layouts per role with limited personal customization.

**Implementation:**
- Define default dashboard layouts per role:
  - **Operator**: Single characteristic focus with large chart, data entry panel
  - **Supervisor**: Multi-characteristic grid with violation summary
  - **Engineer**: Detailed view with statistics, Nelson rules, configuration access
  - **Admin**: System health + all of Engineer
- Allow users to customize within role constraints
- Store personal preferences in backend (user settings)

---

### 6. Enterprise Theming
**Decision: B. Custom Brand Colors**

Allow enterprises to customize primary/accent colors to match their brand.

**Implementation:**
- Extend current CSS variable system for brand customization
- Add theme configuration in Settings (Admin only)
- Customizable properties:
  - Primary color
  - Accent color
  - Logo (upload or URL)
  - App name override
- Store theme config in backend, load on app init
- Preserve light/dark/system mode toggle

---

## Current State Analysis

### Existing Architecture
- **Framework**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS 4 with CSS variables
- **Components**: shadcn/ui base components
- **State**: Zustand stores (dashboardStore, configStore)
- **Data**: React Query + WebSocket for real-time
- **Routing**: React Router v6

### Files to Modify/Create

**Core Layout:**
- `frontend/src/components/Layout.tsx` - Replace with sidebar layout
- `frontend/src/components/Sidebar.tsx` - New collapsible sidebar
- `frontend/src/components/Header.tsx` - New minimal header

**Display Modes:**
- `frontend/src/pages/KioskView.tsx` - New kiosk mode
- `frontend/src/pages/WallDashboard.tsx` - New wall dashboard
- `frontend/src/components/KioskLayout.tsx` - Minimal chrome layout

**Role & Plant Context:**
- `frontend/src/providers/AuthProvider.tsx` - Role context (stub for now)
- `frontend/src/providers/PlantProvider.tsx` - Plant context
- `frontend/src/components/PlantSelector.tsx` - Plant dropdown
- `frontend/src/lib/roles.ts` - Role definitions and permissions

**Theming:**
- `frontend/src/providers/ThemeProvider.tsx` - Extend for brand colors
- `frontend/src/components/ThemeCustomizer.tsx` - Admin theme editor

---

## Dependencies

### Backend Requirements (may need separate phase)
- Plant/site model and API
- User authentication and roles
- Theme configuration persistence
- User preferences storage

### For This Phase (Frontend-Only)
- Mock plant selector (static list)
- Mock role context (localStorage)
- Theme customization (localStorage until backend ready)

---

## Success Criteria

1. **Layout**: Collapsible sidebar navigation replaces horizontal navbar
2. **Plant Context**: Plant selector in header with context propagation
3. **Role Gating**: Views hidden based on (mock) user role
4. **Kiosk Mode**: Full-screen auto-rotating display mode
5. **Wall Dashboard**: Multi-chart configurable grid layout
6. **Theming**: Brand color customization via Settings
7. **Accessibility**: WCAG 2.1 AA compliance audit passed
8. **Performance**: Vercel React best practices audit passed

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Backend not ready for plants/roles | Use localStorage mocks, design for easy backend swap |
| Large refactor breaks existing features | Incremental migration, comprehensive testing |
| Performance regression with new layout | Apply vercel-react-best-practices throughout |
| Accessibility gaps | Run accessibility-compliance audit before completion |

---

## Reference Skills

When implementing, reference these skills for guidance:

- **Layout & Design**: `~/.agents/skills/frontend-design/SKILL.md`
- **Dashboard Patterns**: `~/.agents/skills/kpi-dashboard-design/SKILL.md`
- **shadcn Components**: `~/.agents/skills/shadcn-ui/SKILL.md`
- **Design System**: `~/.agents/skills/ui-design-system/SKILL.md`
- **React Performance**: `~/.agents/skills/vercel-react-best-practices/AGENTS.md`
- **Accessibility**: `~/.agents/skills/accessibility-compliance/SKILL.md`
