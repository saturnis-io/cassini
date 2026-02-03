---
name: company-execute
description: Execute phase plans with parallel waves, atomic commits, and progress tracking.
context: fork
agent: general-purpose
argument-hint: [phase-number]
skills:
  - company-protocols
  - company-project-manager
  - company-git-flow
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - TaskCreate
  - TaskUpdate
  - TaskGet
  - TaskList
---

# Phase Execution

Execute plans for phase $ARGUMENTS with parallel waves and atomic commits.

## Context Loading

!`cat .planning/phase-$ARGUMENTS/CONTEXT.md 2>/dev/null | head -30`
!`ls .planning/phase-$ARGUMENTS/*-PLAN.md 2>/dev/null || echo "No plans found"`

---

## Target Phase
$ARGUMENTS

---

## Execution Protocol

### Step 1: Load Plans

Read all plans for this phase:
```bash
ls .planning/phase-$ARGUMENTS/*-PLAN.md
```

Parse frontmatter for:
- `wave` - Execution wave number
- `depends_on` - Prerequisite plans
- `autonomous` - Can run without checkpoints

### Step 2: Build Execution Graph

Group plans by wave:
```
Wave 1: [Plan 1, Plan 2]     # Independent, run parallel
Wave 2: [Plan 3]              # Depends on Wave 1
Wave 3: [Plan 4]              # Depends on Wave 2
```

### Step 3: Execute Waves

For each wave:

#### Parallel Execution (Wave N)

```
# Spawn parallel executors for independent plans
Task(
  subagent_type: "company-developer",
  prompt: "Execute plan: .planning/phase-$ARGUMENTS/1-PLAN.md",
  run_in_background: true
)

Task(
  subagent_type: "company-developer",
  prompt: "Execute plan: .planning/phase-$ARGUMENTS/2-PLAN.md",
  run_in_background: true
)
```

#### Wait for Wave Completion

Check all background tasks complete before next wave.

#### Sequential Execution (if needed)

For checkpoint tasks or dependencies:
```
Task(
  subagent_type: "company-developer",
  prompt: "Execute plan: .planning/phase-$ARGUMENTS/3-PLAN.md",
  run_in_background: false
)
```

### Step 4: Task Execution Protocol

Each executor follows:

1. **Read Plan** - Parse XML tasks
2. **For Each Task:**
   - Create formal task: `TaskCreate(subject, description, owner)`
   - Update status: `TaskUpdate(taskId, status: "in_progress")`
   - Execute action steps
   - Run verify commands
   - Validate done criteria
   - Create atomic commit
   - Update status: `TaskUpdate(taskId, status: "completed")`
3. **Write Summary** - Create task SUMMARY.md entry

### Step 5: Atomic Commits

Each task produces one commit:

```bash
# Stage specific files only
git add path/to/file1.ts
git add path/to/file2.ts

# Semantic commit message
git commit -m "feat($ARGUMENTS-1): {task description}

- {What was done}
- {Key implementation detail}

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Commit Format:** `{type}({phase}-{plan}): {description}`

### Step 6: Progress Tracking

Create SUMMARY.md entry for each completed plan:

```markdown
---
plan: 1
completed: {ISO timestamp}
commit: {git hash}
tasks_completed: 2
verification: passed
---

# Plan 1 Summary: {Name}

## Tasks Completed
- [x] Task 1: {name}
- [x] Task 2: {name}

## Artifacts Created
- path/to/file1.ts
- path/to/file2.ts

## Verification Results
```
{output of verify commands}
```

## Commit
`{commit hash}` - {commit message}
```

Write to `.planning/phase-$ARGUMENTS/1-SUMMARY.md`

---

## Checkpoint Handling

### Human Verification Checkpoint

When task has `type="checkpoint:human-verify"`:

```
AskUserQuestion({
  questions: [{
    header: "Verify",
    question: "Task '{name}' is complete. Please verify: {verification criteria}",
    options: [
      { label: "Verified", description: "Behavior matches requirements" },
      { label: "Issues Found", description: "Needs fixes" },
      { label: "Skip", description: "Defer verification" }
    ]
  }]
})
```

### Decision Checkpoint

When task has `type="checkpoint:decision"`:

Present options from task and wait for user choice before proceeding.

---

## Error Handling

### Task Failure

If verify commands fail:
1. Log failure details
2. Attempt recovery if obvious
3. If unrecoverable, pause and escalate:

```
AskUserQuestion({
  questions: [{
    header: "Task Failed",
    question: "Task '{name}' failed verification: {error}. How to proceed?",
    options: [
      { label: "Retry", description: "Attempt task again" },
      { label: "Skip", description: "Mark as blocked, continue" },
      { label: "Debug", description: "Investigate the issue" },
      { label: "Abort", description: "Stop phase execution" }
    ]
  }]
})
```

### Dependency Failure

If prerequisite plan fails:
1. Skip dependent plans
2. Mark as blocked
3. Report to orchestrator

---

## Update State

```bash
cat >> .planning/STATE.md << EOF

## Session Update: $(date -Iseconds)
- Executed Phase $ARGUMENTS
- Plans completed: {list}
- Tasks completed: {count}
- Commits: {list of hashes}
EOF
```

---

## Context Maintenance

After completing a phase, check if context decay is needed:

```bash
# Check STATE.md line count
if [ -f ".planning/STATE.md" ]; then
  LINE_COUNT=$(wc -l < .planning/STATE.md)
  MAX_LINES=500

  if [ "$LINE_COUNT" -gt "$MAX_LINES" ]; then
    echo "STATE.md has $LINE_COUNT lines, archiving old session entries..."

    # Archive old session log entries (keep last 10)
    mkdir -p .planning/archive/sessions

    # Use Node.js for reliable cross-platform archival
    node -e "require('./src/platform').summarizeSessionLog('.planning/STATE.md', 10, '.planning/archive/sessions')"

    echo "Old session entries archived to .planning/archive/sessions/"
  fi
fi
```

This keeps STATE.md lean by:
1. Archiving session log entries older than the 10 most recent
2. Preserving all other sections (Current Phase, Active Decisions, Blockers)
3. Creating timestamped archives for audit trail

---

## Output

```markdown
# Phase $ARGUMENTS Execution Complete

## Plans Executed
| Plan | Status | Tasks | Commit |
|------|--------|-------|--------|
| 1 | complete | 2/2 | abc123 |
| 2 | complete | 2/2 | def456 |
| 3 | complete | 3/3 | ghi789 |

## Files Modified
- path/to/file1.ts
- path/to/file2.ts
- path/to/file3.ts

## Commits
- `abc123` - feat($ARGUMENTS-1): {description}
- `def456` - feat($ARGUMENTS-2): {description}
- `ghi789` - feat($ARGUMENTS-3): {description}

## Artifacts Created
- `.planning/phase-$ARGUMENTS/1-SUMMARY.md`
- `.planning/phase-$ARGUMENTS/2-SUMMARY.md`
- `.planning/phase-$ARGUMENTS/3-SUMMARY.md`

## ▶ Next Up

**Verify Phase $ARGUMENTS** — Run verification and UAT

`/company-verify $ARGUMENTS`
```
