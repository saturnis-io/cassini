---
name: company-status
description: Check current virtual company status, workflow state, and progress.
disable-model-invocation: true
---

# Company Status

Display the current status of the virtual company and workflow.

## Context Loading

To display status, load the following information:

1. **Current State**: Read `.company/state.json` (if missing, company not initialized)
2. **Company Configuration**: Read `.company/config.json` and extract company name and initialized status
3. **Current Phase and Goal**: From state.json, get the phase and goal values
4. **Active Branch**: Run `git branch --show-current`
5. **Task Summary**: Run `TaskList()` to see current tasks
6. **Pending Proposals**: List files in `.company/proposals/pending/`
7. **Recent Completions**: List files in `.company/proposals/approved/`
8. **Role Inboxes**: Count JSON files in each `.company/inboxes/[role]/` directory
9. **Artifacts**: List files in each `.company/artifacts/[role]/` directory
10. **Git Status**: Run `git status --short` and `git log --oneline -5`
11. **Quality Metrics**: Optionally run `npm run coverage` and `npm run lint` if available

---

## Workflow Status

### Current Phase
Read from `.company/state.json` field "phase" (default: "idle")

### Current Goal
Read from `.company/state.json` field "goal" (default: "None")

### Active Branch
Run: `git branch --show-current`

---

## Task Summary

Run `TaskList()` to see current tasks.

---

## Recent Activity

### Pending Proposals
List contents of `.company/proposals/pending/`

### Recent Completions
List contents of `.company/proposals/approved/`

---

## Role Inboxes

Count JSON files in each directory:
- `.company/inboxes/orchestrator/`
- `.company/inboxes/cto/`
- `.company/inboxes/architect/`
- `.company/inboxes/tech-lead/`
- `.company/inboxes/developer/`
- `.company/inboxes/qa/`

---

## Artifacts Summary

List files in each directory:
- `.company/artifacts/cto/`
- `.company/artifacts/architect/`
- `.company/artifacts/tech-lead/`
- `.company/artifacts/developer/`
- `.company/artifacts/qa/`

---

## Git Status

### Branch
Run: `git branch --show-current`

### Uncommitted Changes
Run: `git status --short`

### Recent Commits
Run: `git log --oneline -5`

---

## Quality Metrics

### Test Coverage
Run: `npm run coverage` (if available)

### Lint Status
Run: `npm run lint` (if available)

---

## Next Actions

Based on current state, recommended next actions:

### If Phase is "idle"
- Run `/company "Your project goal"` to start a new project

### If Phase is "architecture"
- CTO is working on technical strategy
- Wait for completion or check CTO artifacts

### If Phase is "design"
- Architect is creating system design
- Wait for completion or check Architect artifacts

### If Phase is "planning"
- Tech Lead is breaking down features
- Wait for completion or check task list

### If Phase is "implementation"
- Developers are working on tasks
- Check task progress with `TaskList()`

### If Phase is "verification"
- QA is testing the implementation
- Wait for QA report

### If Phase is "complete"
- Ready for merge
- Run `/company-merge` to merge changes

---

## Troubleshooting

### If Stuck
1. Check for pending proposals in `.company/proposals/pending/`
2. Check role inboxes for blocked messages
3. Use `/company-settings` to adjust configuration
4. Escalate to CEO (you) if critical decisions needed

### Reset State
```bash
echo '{"phase":"idle","goal":null}' > .company/state.json
```
