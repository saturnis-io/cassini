---
name: company-status
description: Check current virtual company status, workflow state, and progress.
disable-model-invocation: true
---

# Company Status

Display the current status of the virtual company and workflow.

## Current State
!`cat .company/state.json 2>/dev/null || echo '{"phase":"not_initialized","message":"Run /company to initialize"}'`

## Company Configuration
!`cat .company/config.json 2>/dev/null | jq '{name: .company.name, initialized: .company.initialized}' || echo "Not configured"`

---

## Workflow Status

### Current Phase
!`cat .company/state.json 2>/dev/null | jq -r '.phase // "idle"'`

### Current Goal
!`cat .company/state.json 2>/dev/null | jq -r '.goal // "None"'`

### Active Branch
!`git branch --show-current 2>/dev/null || echo "Not in git repo"`

---

## Task Summary

```
TaskList()
```

### Task Statistics
!`echo "Run TaskList() to see current tasks"`

---

## Recent Activity

### Pending Proposals
!`ls -la .company/proposals/pending/ 2>/dev/null | tail -10 || echo "No pending proposals"`

### Recent Completions
!`ls -lt .company/proposals/approved/ 2>/dev/null | head -5 || echo "No completed proposals"`

---

## Role Inboxes

### Orchestrator
!`find .company/inboxes/orchestrator -name "*.json" 2>/dev/null | wc -l || echo "0"` messages

### CTO
!`find .company/inboxes/cto -name "*.json" 2>/dev/null | wc -l || echo "0"` messages

### Architect
!`find .company/inboxes/architect -name "*.json" 2>/dev/null | wc -l || echo "0"` messages

### Tech Lead
!`find .company/inboxes/tech-lead -name "*.json" 2>/dev/null | wc -l || echo "0"` messages

### Developer
!`find .company/inboxes/developer -name "*.json" 2>/dev/null | wc -l || echo "0"` messages

### QA
!`find .company/inboxes/qa -name "*.json" 2>/dev/null | wc -l || echo "0"` messages

---

## Artifacts Summary

### CTO Artifacts
!`ls .company/artifacts/cto/ 2>/dev/null || echo "None"`

### Architect Artifacts
!`ls .company/artifacts/architect/ 2>/dev/null || echo "None"`

### Tech Lead Artifacts
!`ls .company/artifacts/tech-lead/ 2>/dev/null || echo "None"`

### Developer Artifacts
!`ls .company/artifacts/developer/ 2>/dev/null || echo "None"`

### QA Artifacts
!`ls .company/artifacts/qa/ 2>/dev/null || echo "None"`

---

## Git Status

### Branch
!`git branch --show-current 2>/dev/null || echo "N/A"`

### Uncommitted Changes
!`git status --short 2>/dev/null | head -10 || echo "N/A"`

### Recent Commits
!`git log --oneline -5 2>/dev/null || echo "N/A"`

---

## Quality Metrics

### Test Coverage
!`npm run coverage --silent 2>/dev/null | grep -E "All files|Statements" | head -2 || echo "Run tests to see coverage"`

### Lint Status
!`npm run lint --silent 2>/dev/null && echo "Lint: PASS" || echo "Lint: Check needed"`

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
