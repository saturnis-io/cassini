---
name: company-plan-phase
description: Create detailed executable plan for a phase with atomic tasks, verification criteria, and goal-backward methodology.
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
  - WebSearch
---

# Phase Planning

Create executable PLAN.md for phase $ARGUMENTS using goal-backward methodology.

## Context Loading

!`cat .planning/PROJECT.md 2>/dev/null | head -30`
!`cat .planning/REQUIREMENTS.md 2>/dev/null | head -50`
!`cat .planning/phase-$ARGUMENTS/CONTEXT.md 2>/dev/null || echo "Run /company-discuss first"`

---

## Target Phase
$ARGUMENTS

---

## Planning Protocol

### Step 1: Research Phase

Spawn researcher to gather technical context:

```
Task(
  subagent_type: "Explore",
  prompt: "Research implementation approach for phase $ARGUMENTS. Analyze codebase patterns, relevant files, and technical considerations. Context: {from CONTEXT.md}",
  run_in_background: false
)
```

Capture in `.planning/phase-$ARGUMENTS/RESEARCH.md`

### Step 2: Define Success Criteria (Goal-Backward)

Start from the end state:

**Truths** (Observable behaviors from user perspective):
- What will the user be able to do?
- What will they see?
- How will they interact?

**Artifacts** (Files/objects that must exist):
- What files will be created/modified?
- What tests must pass?
- What documentation needed?

**Key Links** (Critical connections):
- How does this connect to existing code?
- What APIs are called?
- What data flows?

### Step 3: Break Into Tasks

Maximum 2-3 tasks per plan. Each task must be:
- **Atomic**: Single responsibility
- **Verifiable**: Clear completion proof
- **15-60 minutes**: Right-sized for context

For larger phases, create multiple plans:
- Plan 1: Foundation
- Plan 2: Core Logic
- Plan 3: Integration
- Plan 4: Testing/Polish

### Step 4: Write PLAN.md

```markdown
---
phase: $ARGUMENTS
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - path/to/file1.ts
  - path/to/file2.ts
autonomous: true
must_haves:
  truths:
    - "User can {observable behavior}"
  artifacts:
    - "path/to/file.ts exists"
    - "Tests in path/to/test.ts pass"
  key_links:
    - "Component connects to {service}"
---

# Phase $ARGUMENTS - Plan 1: {Name}

## Objective
{One sentence describing what this plan achieves}

## Tasks

<task type="auto">
  <name>Task 1: {Action-oriented name}</name>
  <files>path/to/file.ts</files>
  <action>
    Create {component/function/module} that:
    1. {Specific step}
    2. {Specific step}
    3. {Specific step}

    Constraints:
    - Use {pattern} approach
    - Avoid {anti-pattern} because {reason}
    - Follow existing conventions in {reference file}
  </action>
  <verify>
    ```bash
    # File exists with expected exports
    grep -q "export.*{name}" path/to/file.ts

    # TypeScript compiles
    npx tsc --noEmit path/to/file.ts
    ```
  </verify>
  <done>
    - File exists at path/to/file.ts
    - Exports {expected exports}
    - Follows {pattern} convention
  </done>
</task>

<task type="auto">
  <name>Task 2: {Action-oriented name}</name>
  <files>path/to/test.ts</files>
  <action>
    Write tests for Task 1 implementation:
    1. Test {scenario 1}
    2. Test {scenario 2}
    3. Test edge case: {edge case}

    Use {testing framework} following existing test patterns.
  </action>
  <verify>
    ```bash
    npm test -- path/to/test.ts
    ```
  </verify>
  <done>
    - Test file exists
    - All tests pass
    - Coverage for {component} > 80%
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] SUMMARY.md updated
```

Write to `.planning/phase-$ARGUMENTS/1-PLAN.md`

### Step 5: Plan Verification

Before execution, verify the plan:

1. **Completeness Check**
   - Are all must_haves addressed?
   - Is every task verifiable?
   - Are dependencies explicit?

2. **Scope Check**
   - Maximum 3 tasks?
   - Estimated < 50% context budget?
   - No scope creep from requirements?

3. **Executability Check**
   - Are file paths specific?
   - Are actions unambiguous?
   - Can Claude execute without interpretation?

If any check fails, revise the plan.

---

## Multi-Plan Phases

For complex phases, create plan sequence:

```
.planning/phase-{N}/
├── 1-PLAN.md    # Foundation (Wave 1)
├── 2-PLAN.md    # Core Logic (Wave 1, parallel)
├── 3-PLAN.md    # Integration (Wave 2, depends on 1,2)
└── 4-PLAN.md    # Testing (Wave 3, depends on 3)
```

Frontmatter indicates dependencies:
```yaml
depends_on: [1, 2]  # Must complete before starting
wave: 2             # Execution wave
```

---

## Update State

```bash
cat >> .planning/STATE.md << EOF

## Session Update: $(date -Iseconds)
- Created plan(s) for Phase $ARGUMENTS
- Plans: {list of plan numbers}
- Ready for execution
EOF
```

---

## Output

```markdown
# Phase $ARGUMENTS Planning Complete

## Plans Created
- Plan 1: {name} — {task count} tasks, Wave 1
- Plan 2: {name} — {task count} tasks, Wave 1 (parallel)
- Plan 3: {name} — {task count} tasks, Wave 2

## Task Summary
| Plan | Task | Type | Files |
|------|------|------|-------|
| 1 | Task 1: {name} | auto | {files} |
| 1 | Task 2: {name} | auto | {files} |
| 2 | Task 1: {name} | auto | {files} |

## Verification
- [x] All must_haves addressed
- [x] Tasks are atomic and verifiable
- [x] Scope within constraints
- [x] Dependencies mapped

## ▶ Next Up

**Execute Phase $ARGUMENTS** — Run plans with parallel waves

`/company-execute $ARGUMENTS`
```
