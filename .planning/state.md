# Project State

## Status
Phase 2 Starting - Data Integration, Notifications & UX Enhancements

## Current Milestone
Phase 2: Data Integration & UX

## Current Phase
discuss (CEO requirements captured, routing to Architect)

## Session Log
| Timestamp | Action | Details |
|-----------|--------|---------|
| 2026-02-03 | Phase Planning | Created plans 1-4 for variable subgroup handling |
| 2026-02-03 | Bug Fix Commit | Committed async/lazy-loading and input visibility fixes |
| 2026-02-03 | Plan 1 Executed | Database schema, models, migration, API schemas |
| 2026-02-03 | Plan 2 Executed | SPC engine mode-aware processing |
| 2026-02-03 | Plan 3 Executed | Backend unit tests (28 new tests, all pass) |
| 2026-02-03 | Plan 4 Executed | Frontend types, form, and chart rendering |
| 2026-02-03 | Enhancement | Added Sepasoft brand styling (colors from brand guidelines) |
| 2026-02-03 | Enhancement | Added mode change migration endpoint and confirmation dialog |
| 2026-02-03 | Enhancement | Created startup scripts (start.bat/start.sh) for frontend/backend |
| 2026-02-04 | **CEO Approval** | Variable subgroup handling + branding approved |
| 2026-02-04 | **Phase 2 Start** | New feature requirements captured from CEO |

## CEO Phase 2 Requirements (Captured 2026-02-04)

### Core Features
1. **Data Collection Configuration** - MQTT, SparkplugB, OPC-UA source configuration
2. **API Data Entry Endpoint** - REST endpoint for programmatic data submission
3. **Nelson Rules Configuration** - UI to select rules per characteristic + alarm/notification

### UX Enhancements
4. **Chart Styling** - More visually appealing X-bar charts (reduce monotone look)
5. **Dark Mode** - Theme toggle with Sepasoft-compatible dark palette
6. **Help Tooltip Framework** - "?" icons with rich tooltips for contextual help

## Active Decisions
- Use NOMINAL_TOLERANCE as default mode for backward compatibility
- Store sigma and center_line on Characteristic for Mode A/B
- Mode A/B require recalculate-limits to be run first
- Mode changes with samples trigger migration dialog (recalculates historical samples)
- Sepasoft brand colors: Blue #004A98 (primary), Green #4C9C2E (success), Orange #D48232 (warning)

## Open Blockers
None.

## Completed Milestones
- ✅ Initial Implementation
- ✅ Variable Subgroup Size Handling

---

## ▶ Resume Point

**Started:** 2026-02-04

**Current:** Discuss phase - awaiting Architect design for Phase 2 features

**Next action:** Route to Architect for system design of data collection, notifications, and UX components

---
