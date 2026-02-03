---
name: company-merge
description: Merge completed work to main branch with full validation, testing, and approval workflow.
disable-model-invocation: true
argument-hint: "[branch-name]"
skills:
  - company-git-flow
  - company-protocols
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
---

# Merge to Main Workflow

You orchestrate the merge of completed work to the main branch, ensuring all quality gates pass.

## Current Git Configuration
!`cat .company/config.json 2>/dev/null | grep -A20 '"git_flow"' || echo "Using default git flow"`

## Current Branch
!`git branch --show-current`

## Git Status
!`git status --short`

## Target Branch
$ARGUMENTS (defaults to current branch if not specified)

---

## Pre-Merge Validation

### Step 1: Verify Clean State

```bash
# Check for uncommitted changes
git status --porcelain
```

If there are uncommitted changes, abort and report.

### Step 2: Verify Branch is Up to Date

```bash
# Fetch latest
git fetch origin

# Check if behind
git status -uno
```

If branch is behind, suggest rebasing first.

### Step 3: Run All Quality Gates

```bash
# 1. Linting
npm run lint

# 2. Type checking (if TypeScript)
npm run typecheck 2>/dev/null || true

# 3. Unit tests
npm test

# 4. Integration tests
npm run test:integration 2>/dev/null || true

# 5. E2E tests
npm run test:e2e 2>/dev/null || true

# 6. Check coverage
npm run coverage 2>/dev/null || true
```

### Step 4: Verify Code Review

Check that code review is complete:

```bash
# If using GitHub
gh pr status 2>/dev/null || echo "Not a GitHub repo or gh not configured"
```

---

## Quality Gate Summary

Before proceeding, verify:

| Gate | Status | Required |
|------|--------|----------|
| No uncommitted changes | ⬜ | Yes |
| Branch up to date | ⬜ | Yes |
| Lint passes | ⬜ | Yes |
| Type check passes | ⬜ | If TypeScript |
| Unit tests pass | ⬜ | Yes |
| Integration tests pass | ⬜ | Yes |
| E2E tests pass | ⬜ | If configured |
| Coverage threshold met | ⬜ | If configured |
| Code review approved | ⬜ | Yes |

---

## CEO Approval

If all gates pass, request approval:

```
AskUserQuestion({
  questions: [{
    header: "Merge Approval",
    question: "All quality gates passed. Ready to merge [branch] to [target]. Approve?",
    multiSelect: false,
    options: [
      {
        label: "Approve & Merge",
        description: "Merge changes to target branch"
      },
      {
        label: "Review Changes",
        description: "Show me what will be merged"
      },
      {
        label: "Run More Tests",
        description: "Execute additional verification"
      },
      {
        label: "Defer",
        description: "Not ready to merge yet"
      }
    ]
  }]
})
```

---

## If "Review Changes" Selected

Show the diff and commit history:

```bash
# Commit history
echo "=== Commits to merge ==="
git log origin/develop..HEAD --oneline

# Summary of changes
echo "\n=== Files changed ==="
git diff --stat origin/develop...HEAD

# Full diff (truncated for context)
echo "\n=== Diff preview (first 200 lines) ==="
git diff origin/develop...HEAD | head -200
```

Then re-prompt for approval.

---

## Execute Merge

### For Feature Branches → Develop

```bash
# Checkout develop
git checkout develop

# Pull latest
git pull origin develop

# Squash merge (if configured)
git merge --squash feature/branch-name

# Create merge commit
git commit -m "$(cat <<'EOF'
feat(scope): merge feature-name

- Summary of changes
- Key features added

PR #XXX
Co-Authored-By: Virtual Engineering Co.
EOF
)"

# Push
git push origin develop

# Delete feature branch
git branch -d feature/branch-name
git push origin --delete feature/branch-name 2>/dev/null || true
```

### For Release Branches → Main

```bash
# Checkout main
git checkout main

# Pull latest
git pull origin main

# Merge with merge commit (preserve history)
git merge release/v1.0.0 --no-ff -m "Release v1.0.0"

# Create tag
VERSION=$(echo "release/v1.0.0" | sed 's/release\///')
git tag -a "$VERSION" -m "Release $VERSION"

# Push with tags
git push origin main --tags

# Merge back to develop
git checkout develop
git merge main
git push origin develop

# Delete release branch
git branch -d release/v1.0.0
git push origin --delete release/v1.0.0 2>/dev/null || true
```

### For Hotfix Branches → Main + Develop

```bash
# Merge to main
git checkout main
git merge hotfix/fix-name --no-ff
git tag -a "vX.Y.Z" -m "Hotfix vX.Y.Z"
git push origin main --tags

# Merge to develop
git checkout develop
git merge hotfix/fix-name
git push origin develop

# Delete hotfix branch
git branch -d hotfix/fix-name
git push origin --delete hotfix/fix-name 2>/dev/null || true
```

---

## Post-Merge Actions

### Update Company State

```bash
cat > .company/state.json << EOF
{
  "phase": "complete",
  "goal": "$(cat .company/state.json | jq -r '.goal')",
  "merged": "$(date -Iseconds)",
  "branch": "$(git branch --show-current)",
  "commit": "$(git rev-parse HEAD)"
}
EOF
```

### Create Merge Record

```bash
cat >> .company/audit/merges.jsonl << EOF
{"timestamp":"$(date -Iseconds)","branch":"$BRANCH","target":"$TARGET","commit":"$(git rev-parse HEAD)","author":"orchestrator"}
EOF
```

### Notify Completion

```markdown
## Merge Complete

**Branch**: [branch-name]
**Target**: [target-branch]
**Commit**: [commit-hash]
**Time**: [timestamp]

### Summary
[What was merged]

### Next Steps
- Monitor for issues in production/staging
- Begin next feature/phase if planned
```

---

## Rollback Protocol

If issues are discovered after merge:

### Identify the Problem
```bash
# View recent commits
git log --oneline -10

# Identify the merge commit
git log --merges --oneline -5
```

### Revert
```bash
# Revert the merge commit
git revert -m 1 <merge-commit-hash>

# Push the revert
git push origin main
```

### Notify
```
AskUserQuestion({
  questions: [{
    header: "Rollback Complete",
    question: "Merge has been reverted. What's next?",
    options: [
      { label: "Investigate", description: "Determine root cause" },
      { label: "Fix & Retry", description: "Create fix and re-merge" },
      { label: "Cancel Feature", description: "Abandon this change" }
    ]
  }]
})
```

---

## Error Handling

### Merge Conflicts
```bash
# If conflicts occur during merge
git merge --abort
echo "ERROR: Merge conflicts detected. Manual resolution required."
```

Report to CEO with details about which files conflict.

### Test Failures
```
# If tests fail after merge (shouldn't happen if gates pass)
git revert HEAD
git push origin [target]
echo "ERROR: Post-merge tests failed. Change reverted."
```

### Push Failures
```bash
# If push is rejected
git pull origin [target] --rebase
# Resolve any issues
git push origin [target]
```
