# Project State

## Status
Phase user-management COMPLETE - 6 plans executed, UAT passed with 5 fixes applied.

## Current Milestone
OpenSPC v0.3.0

## Current Phase
phase-user-management (complete)

## Milestone v0.1.0 Summary
- Tag: `v0.1.0`
- Commit: `549a173`
- Completed: 2026-02-05

### Phases Completed
| Phase | Plans | Key Features |
|-------|-------|--------------|
| phase-3.5-reporting | 7 | Nelson acknowledgement, hierarchy view, exports |
| phase-4-polymorphic-config | 3 | Config persistence, schedule types, triggers |
| phase-enterprise-ui-overhaul | 7 | Sidebar, roles, kiosk, wall dashboard, theming |

### Key Deliverables
1. Real-time control chart visualization
2. Nelson rules detection and acknowledgement workflow
3. Hierarchy-based characteristic selection
4. PDF/Excel/CSV report export
5. Polymorphic configuration persistence
6. Collapsible sidebar with role-based navigation
7. Kiosk display mode with auto-rotation
8. Wall dashboard with multi-chart grid
9. Enterprise brand theming

## Milestone v0.2.0 Summary
- Tag: `v0.2.0`
- Commit: `157bf3f`
- Completed: 2026-02-06

### Phases Completed
| Phase | Plans | Key Features | Commit |
|-------|-------|--------------|--------|
| phase-plant-scoped-config | 6 | Plant model, CRUD API, plant-scoped hierarchies, UI integration | 9e90712 |

### Key Deliverables
1. Plant/Site model with database migration
2. Plant CRUD API endpoints
3. Plant-scoped hierarchy and broker endpoints
4. PlantProvider with API integration
5. PlantSelector dropdown with keyboard navigation
6. PlantSettings admin panel (create, edit, deactivate)
7. Plant-scoped Dashboard and Configuration views
8. Data isolation between plants
9. Box plot rendering fix (callback ref for dimension tracking)
10. Styled terminal banners for start scripts

## Milestone v0.3.0 Roadmap

### Pending Proposals (to become phases)
1. **User & Role Management** (`phase-user-management`)
   - User CRUD, role assignment, plant assignment
   - Granular permissions (dashboard, config, connectivity, data entry, reporting, admin)
   - AD/LDAP integration option
   - JWT authentication backend

2. **Industrial Connectivity Phase 1** (`phase-industrial-connectivity-1`)
   - OPC-UA server model and connection management
   - MQTT topic browser
   - OPC-UA tag browser
   - Unified tag/topic browser UI

3. **Industrial Connectivity Phase 2** (`phase-industrial-connectivity-2`)
   - Tag-first characteristic creation workflow
   - Bulk characteristic creation from tags
   - Coexistence with existing define-first workflow

4. **Industrial Connectivity Phase 3** (`phase-industrial-connectivity-3`)
   - Outbound MQTT SPC data publishing (JSON)
   - SparkplugB publisher
   - OPC-UA server with SPC UDTs

### Other Backlog
- Characteristic config page redesign (UI polish)

## Session Log
| Timestamp | Action | Details |
|-----------|--------|---------|
| 2026-02-06 | Phase Complete | user-management - UAT passed, 5 fixes applied |
| 2026-02-06 | Phase Planned | user-management - 6 plans, 4 waves, 17 tasks |
| 2026-02-06 | Phase Discussed | user-management - 9 decisions resolved |
| 2026-02-06 | Milestone Complete | v0.2.0 tagged at 157bf3f, CEO approved |
| 2026-02-06 | Bug Fix | Box plot rendering on initial selection - callback ref |
| 2026-02-06 | Proposals Filed | Industrial connectivity platform + user management update |
| 2026-02-05 | Phase Complete | plant-scoped-config - UAT passed, commit 9e90712 |
| 2026-02-05 | Milestone Complete | v0.1.0 tagged and released |

## Open Blockers
None.

## ▶ Next Up

**Begin phase-industrial-connectivity-1** — OPC-UA/MQTT tag browsing and connection management.

Run `/company-discuss phase-industrial-connectivity-1` to begin.
