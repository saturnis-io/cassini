---
name: company-resume
description: Resume work from previous session with full context restoration.
context: fork
agent: general-purpose
skills:
  - company-protocols
  - company-project-manager
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - TaskList
  - AskUserQuestion
---

# Resume Work

Resume from previous session with full context restoration.

## Context Loading

Before proceeding, load the following context:

1. **Resume Point**: Read `.planning/STATE.md` and look for the "Resume Point" section
2. **Project Context**: Read `.planning/PROJECT.md` (first 30 lines for overview)
3. **Current Roadmap**: Read `.planning/ROADMAP.md` if it exists
4. **Git Status**: Run `git status` and `git log --oneline -5`

Use the Read tool to load these files and Bash to check git status.

---

## Resume Protocol

### Step 1: Load Pause Context

Read the Resume Point section from STATE.md:
- What phase were we in?
- What plan/task was in progress?
- What was the next action?

### Step 2: Verify State

Check that files are as expected:
```bash
# Check for uncommitted changes
git status

# Verify phase artifacts exist
ls .planning/phase-{N}/
```

### Step 3: Confirm with User

```
AskUserQuestion({
  questions: [{
    header: "Resume",
    question: "Resume from: {pause point description}. Continue with: {next action}?",
    options: [
      { label: "Continue", description: "Resume from pause point" },
      { label: "Review First", description: "Show me the full context" },
      { label: "Different Action", description: "I want to do something else" },
      { label: "Start Fresh", description: "Reset and begin new work" }
    ]
  }]
})
```

### Step 4: Restore Context

If continuing:
1. Read relevant phase CONTEXT.md
2. Read current PLAN.md if mid-execution
3. Check TaskList() for in-progress tasks
4. Load any WIP commit details

### Step 5: Execute Next Action

Route to appropriate command based on pause state:
- Mid-discussion → Continue discussion
- Mid-planning → Continue planning
- Mid-execution → Resume execution
- Mid-verification → Continue verification

---

## Context Review (if requested)

Provide full context summary:

```markdown
# Session Context

## Project
{From PROJECT.md}

## Current Milestone
{From ROADMAP.md}

## Phase {N}: {name}
**Status:** {from pause point}

### Decisions Made
{From phase CONTEXT.md}

### Plans Created
{List plans and status}

### Work Completed
{From SUMMARY.md files}

### In Progress
{From pause handoff}

## Open Tasks
{From TaskList()}

## Git State
- Branch: {current branch}
- Last commit: {hash} - {message}
- Uncommitted: {yes/no}
```

---

## Update State

Clear pause handoff and log resume:

```bash
cat >> .planning/STATE.md << EOF

## Session Update: $(date -Iseconds)
- Resumed from pause point
- Continuing: {action}
- Previous pause: {timestamp}
EOF
```

---

## Output

```markdown
# Work Resumed

## Context Restored
- Project: {name}
- Phase: {N} - {name}
- Last action: {from pause}

## Continuing With
{Next action description}

## Quick Status
- Plans complete: {X/Y}
- Tasks in progress: {count}
- Git: {status}

## ▶ Next Up

**{Action}** — {description}

`{command}`
```
