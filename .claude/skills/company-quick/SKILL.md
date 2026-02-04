---
name: company-quick
description: Quick mode for ad-hoc tasks. Skips research and plan verification but maintains atomic commits.
context: fork
agent: general-purpose
argument-hint: [task-description]
skills:
  - company-protocols
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
---

# Quick Mode

Execute ad-hoc task with minimal ceremony but full quality guarantees.

## Task
$ARGUMENTS

## Context Loading

Read the last 20 lines of `.planning/STATE.md` if it exists for current state context. If the file doesn't exist, proceed in standalone quick mode.

---

## Quick Mode Characteristics

**Skipped:**
- Research phase
- Plan verification
- Multi-plan breakdown
- UAT ceremony

**Maintained:**
- Atomic commits
- State tracking
- Quality checks (tests, lint)
- Semantic commit messages

---

## Quick Execution Protocol

### Step 1: Create Quick Task Directory

```bash
# Increment quick task counter
QUICK_NUM=$(ls .planning/quick/ 2>/dev/null | wc -l)
QUICK_NUM=$((QUICK_NUM + 1))
TASK_SLUG=$(echo "$ARGUMENTS" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | cut -c1-30)
QUICK_DIR=".planning/quick/${QUICK_NUM}-${TASK_SLUG}"
mkdir -p "$QUICK_DIR"
```

### Step 2: Create Minimal Plan

Write inline plan (no separate file needed for simple tasks):

```markdown
# Quick Task: $ARGUMENTS

## Objective
{One sentence}

## Approach
1. {Step 1}
2. {Step 2}
3. {Step 3}

## Files
- {file 1}
- {file 2}

## Verification
```bash
{test command}
```
```

### Step 3: Execute

Perform the task directly:
- Make code changes
- Write/update tests if applicable
- Run verification

### Step 4: Verify Quality

Even in quick mode, ensure:

```bash
# Lint passes
npm run lint --fix

# Types check
npx tsc --noEmit

# Tests pass
npm test -- --related {files}
```

### Step 5: Atomic Commit

```bash
# Stage specific files
git add {specific files only}

# Semantic commit
git commit -m "{type}(quick): $ARGUMENTS

- {What was done}
- {Why}

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Step 6: Log Quick Task

```bash
cat > "$QUICK_DIR/DONE.md" << EOF
# Quick Task Complete

## Task
$ARGUMENTS

## Completed
$(date -Iseconds)

## Changes
$(git show --stat HEAD)

## Commit
$(git rev-parse HEAD)
EOF
```

### Step 7: Update State

```bash
cat >> .planning/STATE.md << EOF

## Quick Task: $(date -Iseconds)
- Task: $ARGUMENTS
- Commit: $(git rev-parse --short HEAD)
- Status: complete
EOF
```

---

## When to Use Quick Mode

**Good for:**
- Bug fixes
- Small features (< 3 files)
- Config changes
- Documentation updates
- Dependency updates
- Code cleanup/refactoring
- One-off scripts

**Not for:**
- New features requiring design
- Architectural changes
- Multi-file refactors
- Anything requiring stakeholder input

---

## Error Handling

If verification fails:

```
AskUserQuestion({
  questions: [{
    header: "Quick Task Issue",
    question: "Verification failed: {error}. How to proceed?",
    options: [
      { label: "Fix & Retry", description: "Attempt to fix the issue" },
      { label: "Commit Anyway", description: "It's acceptable (e.g., known issue)" },
      { label: "Abort", description: "Discard changes" },
      { label: "Escalate", description: "Convert to full phase workflow" }
    ]
  }]
})
```

If escalating to full workflow:
```bash
# Move to proper phase
mkdir -p .planning/phase-{N}-quick-escalation
mv "$QUICK_DIR"/* .planning/phase-{N}-quick-escalation/
```

---

## Output

```markdown
# Quick Task Complete

## Task
$ARGUMENTS

## Changes
| File | Action |
|------|--------|
| {file} | {created/modified} |

## Verification
- Lint: ✓
- Types: ✓
- Tests: ✓

## Commit
`{hash}` - {type}(quick): {message}

## Logged To
`.planning/quick/{N}-{slug}/DONE.md`
```
