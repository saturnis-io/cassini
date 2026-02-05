---
name: company-milestone
description: Complete current milestone, archive work, and prepare for next version.
context: fork
agent: general-purpose
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
  - AskUserQuestion
---

# Complete Milestone

Archive completed milestone and prepare for next version.

## Context Loading

Before proceeding, load the following context:

1. **Current Milestone**: Read `.planning/ROADMAP.md`
2. **Phase Verification Status**: For each directory matching `.planning/phase-*/`, read the `VERIFICATION.md` file (first 10 lines) if it exists

---

## Milestone Completion Protocol

### Step 1: Verify All Phases Complete

Check each phase in roadmap:

```bash
# All phases should have:
# - CONTEXT.md (discussed)
# - *-PLAN.md (planned)
# - *-SUMMARY.md (executed)
# - VERIFICATION.md (verified)
# - UAT.md (accepted)
```

If any phase incomplete, stop and report.

### Step 2: Run Final Verification

```bash
# All tests pass
npm test

# Build succeeds
npm run build

# No uncommitted changes
git status
```

### Step 3: Create Milestone Summary

```markdown
# Milestone Complete: v{version}

## Completed: {date}

## Requirements Delivered
| Requirement | Phase | Status |
|-------------|-------|--------|
| FR-1 | Phase 1 | ✓ |
| FR-2 | Phase 2 | ✓ |
| FR-3 | Phase 3 | ✓ |

## Phases Completed
| Phase | Name | Plans | Tasks | Duration |
|-------|------|-------|-------|----------|
| 1 | Foundation | 2 | 5 | — |
| 2 | Core | 3 | 8 | — |
| 3 | Integration | 2 | 4 | — |
| 4 | Polish | 1 | 2 | — |

## Code Changes
- Files created: {count}
- Files modified: {count}
- Lines added: {count}
- Lines removed: {count}

## Test Coverage
- Overall: {percentage}%
- Unit tests: {count} passing
- Integration tests: {count} passing
- E2E tests: {count} passing

## Commits
{List of commits in milestone}

## Contributors
- CEO: Vision and decisions
- CTO: Architecture
- Architect: Design
- Tech Lead: Planning
- Developer(s): Implementation
- QA: Verification
- Claude: All of the above
```

Write to `.planning/MILESTONE-v{version}.md`

### Step 4: Git Tag and Merge

```bash
# Ensure on feature branch
git checkout {feature-branch}

# Merge to develop
git checkout develop
git merge --no-ff {feature-branch} -m "Merge milestone v{version}"

# Tag release
git tag -a v{version} -m "Milestone v{version} complete

{summary of what's included}"

# Optionally merge to main
git checkout main
git merge --no-ff develop -m "Release v{version}"
```

### Step 5: Archive Phase Artifacts

```bash
# Get version from PROJECT.md or default
VERSION=$(grep -oP 'version:\s*\K[0-9.]+' .planning/PROJECT.md 2>/dev/null || echo "1.0")

# Create archive directory
mkdir -p ".planning/archive/v$VERSION"

# Move phase directories
for phase_dir in .planning/phase-*; do
  [ -d "$phase_dir" ] || continue
  phase_name=$(basename "$phase_dir")
  mv "$phase_dir" ".planning/archive/v$VERSION/"
  echo "Archived $phase_name"
done

# Move research
if [ -d ".planning/research" ]; then
  mv .planning/research ".planning/archive/v$VERSION/"
fi

# Archive old quick tasks (> 7 days)
if [ -d ".planning/quick" ]; then
  mkdir -p .planning/archive/quick
  find .planning/quick -maxdepth 1 -type d -mtime +7 -exec mv {} .planning/archive/quick/ \; 2>/dev/null
fi

# Archive old proposals (> 30 days)
if [ -d ".company/proposals/approved" ]; then
  mkdir -p .company/proposals/archive
  find .company/proposals/approved -name "*.json" -mtime +30 -exec mv {} .company/proposals/archive/ \; 2>/dev/null
fi
if [ -d ".company/proposals/rejected" ]; then
  find .company/proposals/rejected -name "*.json" -mtime +30 -exec mv {} .company/proposals/archive/ \; 2>/dev/null
fi

# Summarize STATE.md for fresh start (using Node.js for cross-platform)
node -e "require('./src/platform').archiveAndResetState('.planning/STATE.md', '.planning/archive/v$VERSION/')"

echo "Milestone v$VERSION archived successfully"
```

This cleanup:
1. Archives all phase directories with their artifacts
2. Moves old quick tasks to archive (keeping recent 7 days)
3. Archives old proposals (>30 days)
4. Resets STATE.md to minimal fresh state for next milestone

### Step 6: Update ROADMAP.md

Mark milestone complete:

```markdown
# ROADMAP.md

## Completed Milestones
- [x] v1.0 - {name} (completed {date})

## Current Milestone: v1.1
{Ready for new phases}
```

### Step 7: Update STATE.md

```markdown
# Project State

## Current Milestone
v1.1 (planning)

## Previous Milestone
v1.0 completed {date}

## Session Log
| Timestamp | Action | Details |
|-----------|--------|---------|
| {now} | milestone-complete | v1.0 archived, v1.1 ready |
```

---

## CEO Approval

Before final merge:

```
AskUserQuestion({
  questions: [{
    header: "Milestone Complete",
    question: "Milestone v{version} ready. All phases verified. Approve completion?",
    options: [
      { label: "Approve & Merge", description: "Complete milestone, merge to main" },
      { label: "Merge to Develop Only", description: "Complete but don't merge to main yet" },
      { label: "Review Details", description: "Show full milestone summary" },
      { label: "Hold", description: "Not ready yet" }
    ]
  }]
})
```

---

## Output

```markdown
# Milestone v{version} Complete

## Summary
- Phases completed: {count}
- Requirements delivered: {count}
- Total commits: {count}

## Git Status
- Branch merged: {feature-branch} → develop
- Tag created: v{version}
- Main updated: {yes/no}

## Archived To
`.planning/archive/v{version}/`

## ▶ Next Up

**Start Milestone v{next}** — Define next version scope

`/company-new-milestone`

Or continue with:
`/company-progress`
```
