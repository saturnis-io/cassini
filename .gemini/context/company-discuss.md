# Discuss

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
# Read: .planning/PROJECT.md
# Read: .planning/REQUIREMENTS.md
# Read: .planning/ROADMAP.md
# Read: .planning/STATE.md
```


## Role Instructions

---
name: company-discuss
description: Discuss phase implementation preferences and identify gray areas before planning.
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

# Phase Discussion

Capture implementation preferences and identify gray areas for phase {{args}}.

## Context Loading

Before proceeding, load the following context:

1. **Project**: Read `.planning/PROJECT.md` if it exists
2. **Requirements**: Read `.planning/REQUIREMENTS.md` (first 60 lines)
3. **Roadmap**: Read `.planning/ROADMAP.md` if it exists

---

## Phase Target
{{args}}

---

## Discussion Protocol

### Step 1: Identify Phase Requirements

Read ROADMAP.md to find the phase:
- What requirements are mapped to this phase?
- What are the dependencies?
- What is the stated goal?

### Step 2: Analyze Gray Areas

Based on the phase type, identify gray areas:

**For UI/Frontend phases:**
- Layout structure and component hierarchy
- Responsive breakpoints and behavior
- Animation/interaction patterns
- State management approach
- Styling methodology (CSS modules, Tailwind, etc.)

**For API/Backend phases:**
- Request/response format specifics
- Error handling and status codes
- Authentication/authorization flow
- Database schema decisions
- Caching strategy

**For Data/Infrastructure phases:**
- Schema structure and relationships
- Migration approach
- Backup/recovery strategy
- Scaling considerations

**For Integration phases:**
- API contract specifics
- Event/message formats
- Retry/failure handling
- Monitoring approach

### Step 3: Ask Clarifying Questions

Use AskUserQuestion to resolve gray areas:

```
**[Ask User]** Present the user with these choices and wait for their response:
```
questions: [
    {
      header: "Gray Area 1",
      question: "{Specific question about implementation choice}",
      options: [
        { label: "Option A", description: "Approach and tradeoffs" },
        { label: "Option B", description: "Approach and tradeoffs" },
        { label: "Option C", description: "Approach and tradeoffs" }
      ]
    }
  ]
```
Describe the options clearly and ask for their selection.
```

### Step 4: Document Decisions

Create phase CONTEXT.md:

```markdown
# Phase {N} Context

## Phase Goal
{From roadmap}

## Requirements Covered
- FR-X: {requirement}
- FR-Y: {requirement}

## Gray Areas Resolved

### {Gray Area 1}
**Question:** {What needed to be decided}
**Decision:** {What was chosen}
**Rationale:** {Why this choice}

### {Gray Area 2}
**Question:** {What needed to be decided}
**Decision:** {What was chosen}
**Rationale:** {Why this choice}

## Implementation Preferences
- Preference 1: {Specific choice}
- Preference 2: {Specific choice}

## Constraints Identified
- Constraint 1: {Limitation to work within}
- Constraint 2: {Dependency to respect}

## Ready for Planning
[x] All gray areas resolved
[x] User preferences captured
[x] Constraints documented
```

Write to `.planning/phase-{N}/CONTEXT.md`

---

## Update State

```bash
# Update STATE.md with discussion completion
cat >> .planning/STATE.md << EOF

## Session Update: $(date -Iseconds)
- Completed discussion for Phase {{args}}
- Gray areas resolved: {count}
- Decisions captured in phase-{N}/CONTEXT.md
EOF
```

---

## Output

```markdown
# Phase {N} Discussion Complete

## Gray Areas Resolved
1. {Area 1}: {Decision}
2. {Area 2}: {Decision}
3. {Area 3}: {Decision}

## Key Decisions
- {Decision 1}
- {Decision 2}

## Artifacts Created
- `.planning/phase-{N}/CONTEXT.md`

## ▶ Next Up

**Plan Phase {N}** — Create executable task breakdown

`/company-plan-phase {N}`
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
*Transpiled from: skills/company-discuss/SKILL.md*