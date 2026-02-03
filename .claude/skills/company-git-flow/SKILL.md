---
name: company-git-flow
description: Git workflow expertise - branching strategies, commit conventions, PR workflows, and merge protocols. Preloaded into all development roles.
user-invocable: false
---

# Git Flow Expertise

This skill provides git workflow knowledge to all development roles.

## Current Git Configuration
!`cat .company/config.json 2>/dev/null | grep -A30 '"git_flow"' || echo "Using default git flow"`

---

## Branch Strategy: GitFlow

```
main ──────────────────────────────────────────────────────────▶
  │                                                            ▲
  │  hotfix/critical-bug ─────────────────────────────────────┤
  │        │                                                   │
  └── develop ─────────────────────────────────────────────────┤
        │         │              │                             │
        │   release/v1.0 ────────┼─────────────────────────────┘
        │         │              │
        └── feature/auth    feature/dashboard
              │                  │
              └──────────────────┘ (merge to develop)
```

### Branch Types

| Branch | Purpose | Base | Merges To |
|--------|---------|------|-----------|
| `main` | Production code | - | - |
| `develop` | Integration branch | main | main (via release) |
| `feature/*` | New features | develop | develop |
| `bugfix/*` | Bug fixes | develop | develop |
| `release/*` | Release prep | develop | main + develop |
| `hotfix/*` | Production fixes | main | main + develop |

---

## Branch Naming Convention

### Format
```
[type]/[ticket-id]-[short-description]
```

### Examples
```
feature/AUTH-123-user-login
bugfix/BUG-456-fix-session-timeout
hotfix/HOT-789-security-patch
release/v1.2.0
```

### Rules
- Use lowercase letters
- Use hyphens to separate words
- Keep description under 30 characters
- Include ticket ID when available

---

## Commit Message Convention

### Format
```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types
| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation changes |
| `style` | Code style (formatting, semicolons) |
| `refactor` | Code change that neither fixes nor adds |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Build system or dependencies |
| `ci` | CI/CD configuration |
| `chore` | Maintenance tasks |
| `revert` | Revert previous commit |

### Examples

```
feat(auth): add password reset functionality

Implements password reset flow with email verification.
Includes rate limiting to prevent abuse.

Closes #123
```

```
fix(api): handle null response from user service

The user service can return null when user is deleted.
Added null check to prevent TypeError.

Fixes #456
```

```
refactor(components): extract common button styles

- Created shared Button component
- Updated all existing buttons to use shared component
- Added Storybook stories for Button variants
```

---

## Branch Operations

### Create Feature Branch
```bash
# Ensure develop is up to date
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/[ticket]-[description]
```

### Keep Branch Updated
```bash
# Fetch latest changes
git fetch origin

# Rebase on develop
git rebase origin/develop

# If conflicts, resolve and continue
git add .
git rebase --continue
```

### Prepare for PR
```bash
# Ensure tests pass
npm test

# Ensure lint passes
npm run lint

# Interactive rebase to clean commits (if needed)
git rebase -i origin/develop
```

---

## Pull Request Workflow

### PR Title Format
```
[TICKET-ID] type: description
```

### PR Template

```markdown
## Summary
Brief description of changes (1-2 sentences).

## Changes
- Change 1
- Change 2
- Change 3

## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Screenshots (if applicable)
[Add before/after screenshots for UI changes]

## Checklist
- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or my feature works
- [ ] New and existing unit tests pass locally with my changes
```

### PR Size Guidelines
- **Ideal**: < 400 lines changed
- **Acceptable**: < 800 lines changed
- **Large** (needs justification): > 800 lines changed
- **Too Large** (split required): > 1500 lines changed

---

## Code Review Guidelines

### As PR Author
1. Self-review before requesting review
2. Respond to feedback promptly and professionally
3. Explain your reasoning when disagreeing
4. Request re-review after addressing feedback
5. Keep the PR focused on one concern

### As Reviewer
1. Be constructive and specific
2. Distinguish between blocking and non-blocking feedback
3. Use conventional comment prefixes:
   - `nit:` - Minor style suggestion
   - `question:` - Seeking clarification
   - `suggestion:` - Non-blocking improvement
   - `issue:` - Should be addressed
   - `blocker:` - Must fix before approval
4. Approve when "good enough", not "perfect"
5. Acknowledge good work

### Review Focus Areas
1. **Correctness**: Does the code do what it's supposed to?
2. **Security**: Are there any vulnerabilities?
3. **Performance**: Any obvious inefficiencies?
4. **Maintainability**: Is the code readable and maintainable?
5. **Testing**: Are there adequate tests?

---

## Merge Protocol

### Pre-Merge Checklist
- [ ] All CI checks pass
- [ ] Required approvals obtained
- [ ] No unresolved conversations
- [ ] Branch is up to date with target
- [ ] Commit history is clean

### Merge Strategy

**Squash Merge (Default)**
```bash
git checkout develop
git merge --squash feature/branch
git commit -m "feat(scope): description (#PR)"
git push origin develop
```

**Merge Commit (For release branches)**
```bash
git checkout main
git merge release/v1.0.0 --no-ff
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin main --tags
```

### Post-Merge Cleanup
```bash
# Delete local branch
git branch -d feature/branch

# Delete remote branch
git push origin --delete feature/branch

# Update develop
git checkout develop
git pull origin develop
```

---

## Conflict Resolution

### During Rebase
```bash
# When conflicts occur
git status  # See conflicted files

# Edit files to resolve conflicts
# Remove conflict markers: <<<<<<<, =======, >>>>>>>

# Stage resolved files
git add [file]

# Continue rebase
git rebase --continue

# Or abort if needed
git rebase --abort
```

### Resolution Principles
1. Understand both changes before resolving
2. Preserve the intent of both changes when possible
3. Run tests after resolution
4. When in doubt, discuss with the other author

---

## Release Process

### Create Release Branch
```bash
git checkout develop
git pull origin develop
git checkout -b release/v1.0.0
```

### Prepare Release
1. Update version numbers
2. Update CHANGELOG.md
3. Run full test suite
4. Fix any release-blocking issues

### Finalize Release
```bash
# Merge to main
git checkout main
git merge release/v1.0.0 --no-ff
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin main --tags

# Merge back to develop
git checkout develop
git merge release/v1.0.0
git push origin develop

# Delete release branch
git branch -d release/v1.0.0
git push origin --delete release/v1.0.0
```

---

## Hotfix Process

### Create Hotfix
```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-fix
```

### Apply Fix
1. Make minimal fix
2. Add tests
3. Update version (patch bump)

### Merge Hotfix
```bash
# Merge to main
git checkout main
git merge hotfix/critical-fix --no-ff
git tag -a v1.0.1 -m "Hotfix v1.0.1"
git push origin main --tags

# Merge to develop
git checkout develop
git merge hotfix/critical-fix
git push origin develop

# Cleanup
git branch -d hotfix/critical-fix
git push origin --delete hotfix/critical-fix
```
