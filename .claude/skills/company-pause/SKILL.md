---
name: company-pause
description: Create context handoff for pausing work mid-session.
skills:
  - company-project-manager
---

# Pause Work

Create context handoff document for resuming later.

## Current State

!`cat .planning/STATE.md 2>/dev/null`

## Active Tasks

!`TaskList()`

---

## Pause Protocol

### Step 1: Capture Current Context

Document exactly where we are:

```markdown
## Pause Handoff

### Session Info
- Paused: {ISO timestamp}
- Duration: {session length}

### Current Position
- Phase: {current phase number and name}
- Plan: {current plan if mid-execution}
- Task: {current task if mid-task}

### Work In Progress
{Description of incomplete work}

### Files Modified (Uncommitted)
```bash
git status --short
```

### Next Steps When Resuming
1. {Exact first step}
2. {Second step}
3. {Third step}

### Context Required
- {Key file 1}
- {Key file 2}
- {Key decision made}
```

### Step 2: Commit WIP if Safe

If there are uncommitted changes that are stable:

```bash
# Only if changes are in a good state
git add -A
git commit -m "wip(phase-{N}): Pause point - {description}

Resumption context:
- {what's done}
- {what's next}

Co-Authored-By: Claude <noreply@anthropic.com>"
```

If changes are unstable, document without committing.

### Step 3: Update STATE.md

Append pause handoff:

```bash
cat >> .planning/STATE.md << 'EOF'

---

## ▶ Resume Point

**Paused:** {timestamp}

**Last completed:** {plan/task}

**In progress:** {current work}

**Next action:** {specific next step}

**Command to resume:**
```
/company-resume
```

**Context files to review:**
- .planning/phase-{N}/CONTEXT.md
- .planning/phase-{N}/{plan}-PLAN.md
- {other relevant files}

---
EOF
```

---

## Output

```markdown
# Work Paused

## Pause Summary
- Phase: {N} - {name}
- Progress: {what's done}
- WIP Committed: {yes/no}

## Resume Instructions
When returning, run:
```
/company-resume
```

This will:
1. Load the pause context
2. Show current state
3. Continue from: {exact point}

## Handoff Document
Updated in `.planning/STATE.md`

## Files to Review on Resume
- `.planning/STATE.md` - Full context
- `.planning/phase-{N}/CONTEXT.md` - Phase decisions
- `.planning/phase-{N}/{plan}-PLAN.md` - Current plan
```
