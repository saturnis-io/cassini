---
name: company-progress
description: Check project progress and route to next recommended action.
skills:
  - company-project-manager
---

# Project Progress

Check current state and route to next action.

## Context Loading

Before analyzing progress, load the following:

1. **Current State**: Read the last 30 lines of `.planning/STATE.md`. If missing, PM needs to be initialized with `/company-init-pm`
2. **Roadmap Status**: Read `.planning/ROADMAP.md` if it exists
3. **Phase Artifacts**: List contents of `.planning/phase-*/` directories to see what phases exist and their contents
4. **Git Status**: Run `git status --short` (first 20 lines)
5. **Task List**: Run `TaskList()` to see current tasks

---

## Progress Analysis

Based on state and artifacts, determine:

1. **Current Phase**: What phase are we in?
2. **Phase Status**:
   - Not started (no CONTEXT.md)
   - Discussed (has CONTEXT.md, no PLAN.md)
   - Planned (has PLAN.md, no SUMMARY.md)
   - Executed (has SUMMARY.md, no VERIFICATION.md)
   - Verified (has VERIFICATION.md + UAT.md)
   - Complete (phase marked done in ROADMAP.md)

3. **Blockers**: Any open blockers in STATE.md?

4. **Next Action**: Route to appropriate command

---

## Routing Logic

```
If no .planning/ exists:
  → /company-init-pm

If no PROJECT.md:
  → /company-new-project

If current phase has no CONTEXT.md:
  → /company-discuss {phase}

If current phase has CONTEXT.md but no PLAN.md:
  → /company-plan-phase {phase}

If current phase has PLAN.md but no SUMMARY.md:
  → /company-execute {phase}

If current phase has SUMMARY.md but no VERIFICATION.md:
  → /company-verify {phase}

If current phase verified:
  → Mark complete, advance to next phase
  → If all phases complete: /company-milestone
```

---

## Output Format

```markdown
# Project Progress

## Project
{Project name from PROJECT.md}

## Milestone
{Current milestone from ROADMAP.md}

## Phase Status
| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 1 | Foundation | complete | ✓ |
| 2 | Core Features | executing | 2/3 plans |
| 3 | Integration | pending | — |
| 4 | Polish | pending | — |

## Current Phase
**Phase 2: Core Features**
- Status: Executing
- Plans: 2 of 3 complete
- Blockers: None

## Recent Activity
{Last 5 entries from STATE.md session log}

## Open Tasks
{From TaskList()}

## ▶ Next Up

**{Recommended action}** — {one-line description}

`{command to run}`
```
