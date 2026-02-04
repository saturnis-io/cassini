# Project State

## Status
Variable Subgroup Handling phase COMPLETE. Mode migration and Sepasoft styling added.

## Current Milestone
Variable Subgroup Size Handling Feature

## Current Phase
variable-subgroup-handling (COMPLETE + ENHANCEMENTS)

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

## Active Decisions
- Use NOMINAL_TOLERANCE as default mode for backward compatibility
- Store sigma and center_line on Characteristic for Mode A/B
- Mode A/B require recalculate-limits to be run first
- Mode changes with samples trigger migration dialog (recalculates historical samples)
- Sepasoft brand colors: Blue #004A98 (primary), Green #4C9C2E (success), Orange #D48232 (warning)

## Open Blockers
None.

## Plans Completed
- Plan 1: Database & Schema Foundation (Wave 1) ✅
- Plan 2: SPC Engine Logic (Wave 2) ✅
- Plan 3: Backend Unit Tests (Wave 2) ✅
- Plan 4: Frontend Implementation (Wave 3) ✅
- Mode Migration Feature ✅
- Sepasoft Brand Styling ✅

## Next Up

**Integration Testing** - Test the full feature end-to-end:
1. Run database migration
2. Create a characteristic with Mode A/B/C
3. Submit samples with variable sizes
4. Verify chart rendering
5. Test mode change migration

**Remaining tasks:**
- Run `alembic upgrade head` to apply migration
- Integration testing
- UAT with user

---

## ▶ Resume Point

**Paused:** 2026-02-03T19:30:00Z

**Last completed:** All 4 plans + UI enhancements + Mode change endpoint + Capability chart

**In progress:** Awaiting CEO UAT and style decision

**Next action:** CEO to test application, then approve/modify Sepasoft style proposal

**Pending proposal:** `.company/proposals/pending/1738620000-style-enhancements.md`

**Command to resume:**
```
/company-resume
```

**Context files to review:**
- `.company/PAUSE-HANDOFF.md` - Full handoff context
- `.company/proposals/pending/1738620000-style-enhancements.md` - Style proposal
- `.planning/phase-variable-subgroup-handling/SUMMARY.md` - Phase summary

---
