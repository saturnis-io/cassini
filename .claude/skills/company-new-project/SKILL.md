---
name: company-new-project
description: Start a new project with vision capture, requirements gathering, and roadmap creation.
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
  - AskUserQuestion
  - WebSearch
---

# New Project Initialization

You are starting a new project with the Virtual Company using GSD-inspired methodology.

## Input
$ARGUMENTS

---

## Phase 1: Vision Capture

Ask clarifying questions to understand the project:

```
AskUserQuestion({
  questions: [
    {
      header: "Project Type",
      question: "What type of project is this?",
      options: [
        { label: "Web Application", description: "Frontend + backend web app" },
        { label: "API/Backend", description: "REST/GraphQL backend service" },
        { label: "CLI Tool", description: "Command-line application" },
        { label: "Library/Package", description: "Reusable code package" }
      ]
    },
    {
      header: "Scale",
      question: "What is the expected scope?",
      options: [
        { label: "Small", description: "Few days, focused feature" },
        { label: "Medium", description: "Week or two, multiple features" },
        { label: "Large", description: "Multi-week, full application" }
      ]
    }
  ]
})
```

---

## Phase 2: Create PROJECT.md

Based on responses, create the vision document:

```markdown
# PROJECT.md

## Vision
{One paragraph describing what we're building and why}

## Objectives
1. {Primary objective}
2. {Secondary objective}
3. {Tertiary objective}

## Success Criteria
- [ ] {Measurable outcome 1}
- [ ] {Measurable outcome 2}
- [ ] {Measurable outcome 3}

## Constraints
- Timeline: {if any}
- Technology: {required stack}
- Integration: {existing systems}

## Out of Scope
- {What we're explicitly NOT building}
```

Write to `.planning/PROJECT.md`

---

## Phase 3: Requirements Gathering

Create REQUIREMENTS.md with v1/v2 scoping:

```markdown
# REQUIREMENTS.md

## v1 (MVP)
Must-have features for initial release.

### Functional Requirements
- [ ] FR-1: {Requirement}
- [ ] FR-2: {Requirement}

### Non-Functional Requirements
- [ ] NFR-1: {Performance, security, etc.}

## v2 (Future)
Nice-to-have features for subsequent releases.

### Planned Enhancements
- {Enhancement 1}
- {Enhancement 2}

## Acceptance Criteria Matrix

| Requirement | Acceptance Criteria | Priority |
|-------------|---------------------|----------|
| FR-1 | {Specific, measurable} | Must |
| FR-2 | {Specific, measurable} | Should |
```

Write to `.planning/REQUIREMENTS.md`

---

## Phase 4: Domain Research

Spawn parallel researchers to analyze the domain:

```
Task(
  subagent_type: "Explore",
  prompt: "Research technical approaches for: $ARGUMENTS. Focus on architecture patterns, libraries, and best practices.",
  run_in_background: true
)

Task(
  subagent_type: "Explore",
  prompt: "Analyze the existing codebase for patterns, conventions, and integration points relevant to: $ARGUMENTS",
  run_in_background: true
)
```

Synthesize research into `.planning/research/SUMMARY.md`

---

## Phase 5: Create Roadmap

Map requirements to phases:

```markdown
# ROADMAP.md

## Milestone: v1.0

### Phase 1: Foundation
**Goal:** {What this phase achieves}
**Requirements:** FR-1, NFR-1
**Status:** pending

### Phase 2: Core Features
**Goal:** {What this phase achieves}
**Requirements:** FR-2, FR-3
**Status:** pending
**Depends on:** Phase 1

### Phase 3: Integration
**Goal:** {What this phase achieves}
**Requirements:** FR-4
**Status:** pending
**Depends on:** Phase 2

### Phase 4: Polish
**Goal:** {What this phase achieves}
**Requirements:** NFR-2
**Status:** pending
**Depends on:** Phase 3

## Validation
- [x] All v1 requirements mapped to phases
- [x] Dependencies identified
- [x] Each phase has clear goal
```

Write to `.planning/ROADMAP.md`

---

## Phase 6: Update State

```markdown
# STATE.md Update

## Current Phase
Phase 0: Project Initialized

## Session Log
| Timestamp | Action | Details |
|-----------|--------|---------|
| {now} | new-project | Created PROJECT.md, REQUIREMENTS.md, ROADMAP.md |

## ▶ Next Up

**Phase 1: {name}** — {one-line summary}

`/company-discuss phase-1`
```

---

## Output

Provide summary:

```markdown
# Project Initialized: {name}

## Created Artifacts
- `.planning/PROJECT.md` - Vision and objectives
- `.planning/REQUIREMENTS.md` - Scoped requirements
- `.planning/ROADMAP.md` - Phase breakdown
- `.planning/research/SUMMARY.md` - Domain research

## Roadmap Overview
- Phase 1: {name} — {goal}
- Phase 2: {name} — {goal}
- Phase 3: {name} — {goal}
- Phase 4: {name} — {goal}

## Next Step
Run `/company-discuss phase-1` to capture implementation preferences.
```
