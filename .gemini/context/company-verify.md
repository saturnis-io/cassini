# Verify

> Claude Virtual Company role

**Provider**: Gemini CLI
**Original Format**: Claude Code SKILL.md
**Role Type**: Orchestrator

## Gemini CLI Adaptation Notes


## Context Loading

Before executing this role, load the following context:

### Required State Files
```
# Read: .company/state.json
# Read: .company/config.json
# Read: >>
# Read: .planning/STATE.md
```


## Role Instructions

---
name: company-verify
description: Verify phase completion with automated checks and user acceptance testing.
context: fork
agent: general-purpose
argument-hint: [phase-number]
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
  - AskUserQuestion
---

# Phase Verification

Verify phase {{args}} completion with automated checks and UAT.

## Context Loading

Before proceeding, load the following context:

1. **Phase Context**: Read `.planning/phase-{N}/CONTEXT.md` (first 30 lines) where {N} is the phase number from arguments
2. **Summaries**: List files matching `.planning/phase-{N}/*-SUMMARY.md`

---

## Target Phase
{{args}}

---

## Verification Protocol

### Layer 1: Automated Verification

#### 1.1 Artifact Check

Verify all must_have artifacts exist:

```bash
# Read must_haves from plan frontmatter
# Check each artifact exists
for artifact in "${ARTIFACTS[@]}"; do
  if [[ -f "$artifact" ]]; then
    echo "✓ $artifact"
  else
    echo "✗ $artifact MISSING"
    FAILED=true
  fi
done
```

#### 1.2 Test Execution

Run all relevant tests:

```bash
# Unit tests
npm test -- --coverage

# Integration tests (if applicable)
npm run test:integration

# E2E tests (if applicable)
npm run test:e2e
```

#### 1.3 Lint/Type Check

```bash
# TypeScript check
npx tsc --noEmit

# Linting
npm run lint

# Formatting
npm run format:check
```

#### 1.4 Coverage Check

```bash
# Check coverage meets threshold
npm test -- --coverage --coverageThreshold='{"global":{"lines":80}}'
```

#### 1.5 Verify Commands from Plans

Run all verify commands from each plan's tasks:

```bash
# Parse each PLAN.md for <verify> blocks
# Execute each command
# Collect results
```

### Layer 2: Goal-Backward Verification

Check against must_haves from plans:

#### Truths Verification
For each truth (observable behavior):
- Can we demonstrate this works?
- Does manual testing confirm?

#### Artifacts Verification
For each artifact:
- Does file exist?
- Does it contain expected content?

#### Key Links Verification
For each key link:
- Is the connection working?
- Can we trace the data flow?

---

## Write VERIFICATION.md

```markdown
# Phase {{args}} Verification Report

## Automated Checks

### Artifact Check
| Artifact | Status |
|----------|--------|
| path/to/file1.ts | ✓ Present |
| path/to/file2.ts | ✓ Present |

### Test Results
```
{test output}
```
- Unit Tests: {pass/fail} ({count} tests)
- Integration Tests: {pass/fail} ({count} tests)
- Coverage: {percentage}%

### Lint/Type Check
- TypeScript: {pass/fail}
- ESLint: {pass/fail}
- Formatting: {pass/fail}

### Plan Verification Commands
| Plan | Task | Verify Command | Result |
|------|------|----------------|--------|
| 1 | Task 1 | {command} | ✓ |
| 1 | Task 2 | {command} | ✓ |

## Goal-Backward Verification

### Truths
| Truth | Verified |
|-------|----------|
| "User can {behavior}" | {yes/no} |

### Artifacts
| Artifact | Verified |
|----------|----------|
| {artifact} | {yes/no} |

### Key Links
| Link | Verified |
|------|----------|
| {connection} | {yes/no} |

## Overall Status
{PASSED / FAILED}

## Issues Found
{List any issues}
```

Write to `.planning/phase-{{args}}/VERIFICATION.md`

---

## Layer 3: User Acceptance Testing

### UAT Protocol

For each requirement covered by this phase:

```
**[Ask User]** Present the user with these choices and wait for their response:
```
questions: [{
    header: "UAT",
    question: "Requirement: {requirement}. Does the implementation meet acceptance criteria: {criteria}?",
    options: [
      { label: "Accepted", description: "Works as expected" },
      { label: "Partial", description: "Works but needs minor fixes" },
      { label: "Failed", description: "Does not meet criteria" }
    ]
  }]
```
Describe the options clearly and ask for their selection.
```

### Interactive Verification

For UI/frontend phases, guide user through testing:

```markdown
## UAT Checklist

Please verify the following:

1. [ ] Navigate to {page}
2. [ ] Perform action: {action}
3. [ ] Observe: {expected behavior}
4. [ ] Confirm: {acceptance criteria}

When complete, select verification status.
```

### Write UAT.md

```markdown
# Phase {{args}} User Acceptance Testing

## Test Date
{ISO timestamp}

## Requirements Tested
| Requirement | Acceptance Criteria | Result |
|-------------|---------------------|--------|
| FR-1 | {criteria} | Accepted |
| FR-2 | {criteria} | Accepted |

## User Verification
- Tested by: CEO
- Date: {date}
- Status: ACCEPTED

## Notes
{Any observations or feedback}
```

Write to `.planning/phase-{{args}}/UAT.md`

---

## Handle Failures

### Automated Check Failure

1. Document failure in VERIFICATION.md
2. Create fix tasks:
   ```
   **[Create Task via MCP]** Use the `cvc_task_create` tool:
```
subject: "Fix: {issue}",
     description: "Verification failed: {details}"
```
   ```
3. Route back to execution

### UAT Failure

1. Document in UAT.md
2. Clarify issue with user
3. Create remediation tasks
4. Re-execute and re-verify

---

## Update State

```bash
cat >> .planning/STATE.md << EOF

## Session Update: $(date -Iseconds)
- Verified Phase {{args}}
- Automated checks: {pass/fail}
- UAT: {accepted/failed}
- Status: {complete/needs-fixes}
EOF
```

---

## Output

### On Success

```markdown
# Phase {{args}} Verification Complete

## Results
- Automated Checks: ✓ PASSED
- Goal Verification: ✓ PASSED
- User Acceptance: ✓ ACCEPTED

## Artifacts
- `.planning/phase-{{args}}/VERIFICATION.md`
- `.planning/phase-{{args}}/UAT.md`

## Phase Status
COMPLETE

## ▶ Next Up

**{Next phase or milestone completion}**

`/company-progress`
```

### On Failure

```markdown
# Phase {{args}} Verification Failed

## Issues Found
1. {Issue 1}: {details}
2. {Issue 2}: {details}

## Remediation Tasks Created
- Task {id}: Fix {issue 1}
- Task {id}: Fix {issue 2}

## Next Step
Fix issues and re-run:
`/company-execute {{args}}`

Then verify again:
`/company-verify {{args}}`
```


---

## Workflow Notes

### Sequential Execution
Gemini CLI executes roles sequentially. After completing this role:
1. Ensure all artifacts are written to the appropriate `.company/artifacts/` directory
2. Update `.company/state.json` with the new phase
3. Create any handoff documents for the next role
4. Notify the orchestrator by writing to `.company/inboxes/orchestrator/`

---
*Transpiled from: skills/company-verify/SKILL.md*