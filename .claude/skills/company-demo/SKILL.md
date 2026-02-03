---
name: company-demo
description: Interactive demo of the Claude Virtual Company framework. Simulates the workflow without requiring full setup, git repository, or file changes. Use to explore how the framework works.
disable-model-invocation: true
---

# Claude Virtual Company - Demo Mode

Welcome to the interactive demo of Claude Virtual Company! This mode lets you explore how the framework works without requiring a fully configured project or git repository.

## What is Claude Virtual Company?

Claude Virtual Company simulates a hierarchical software development organization where you act as the CEO, delegating work through a structured engineering team:

```
                     CEO (You)
                        │
                        ▼
              ┌─────────────────┐
              │   Orchestrator   │
              │ (/company skill) │
              └─────────────────┘
                        │
    ┌───────┬───────┬───┴───┬───────┬───────┐
    ▼       ▼       ▼       ▼       ▼       ▼
  ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐   ┌───┐
  │CTO│──▶│Arch│─▶│Lead│─▶│Dev│──▶│Rev│──▶│QA │
  └───┘   └───┘   └───┘   └───┘   └───┘   └───┘
```

## The Workflow Phases

Here's how a typical project flows through the organization:

### Phase 0: Expertise Assessment
The Hiring Manager evaluates the project and recommends specialists:

```
┌──────────────────────────────────────────────────────────────┐
│ HIRING MANAGER ASSESSMENT                                     │
├──────────────────────────────────────────────────────────────┤
│ Project: "Build user authentication with OAuth"              │
│                                                              │
│ Required Specialists:                                        │
│   ✓ backend-nodejs     (API development)                    │
│   ✓ security-auth      (OAuth expertise)                    │
│   ✓ database-postgres  (Session storage)                    │
│                                                              │
│ Recommendation: Hire 3 specialists before proceeding        │
└──────────────────────────────────────────────────────────────┘
```

### Phase 1: Architecture (CTO)
The CTO defines technical strategy and high-level decisions:

```
┌──────────────────────────────────────────────────────────────┐
│ CTO ARCHITECTURE DECISION                                     │
├──────────────────────────────────────────────────────────────┤
│ Decision: Authentication Strategy                            │
│                                                              │
│ Option A: Session-based auth with Redis                     │
│ Option B: JWT with refresh tokens ✓ SELECTED                │
│ Option C: OAuth-only with external providers                │
│                                                              │
│ Rationale: JWT provides stateless auth suitable for         │
│ microservices architecture and mobile clients.              │
│                                                              │
│ Artifact: .company/artifacts/cto/architecture-decision.md   │
└──────────────────────────────────────────────────────────────┘
```

### Phase 2: Design (Architect)
The Architect creates detailed system design:

```
┌──────────────────────────────────────────────────────────────┐
│ ARCHITECT SYSTEM DESIGN                                       │
├──────────────────────────────────────────────────────────────┤
│ Component: AuthService                                       │
│                                                              │
│ Endpoints:                                                   │
│   POST /auth/login        → { accessToken, refreshToken }   │
│   POST /auth/register     → { user, accessToken }           │
│   POST /auth/refresh      → { accessToken }                 │
│   POST /auth/logout       → { success }                     │
│                                                              │
│ Data Model:                                                  │
│   User { id, email, passwordHash, createdAt }               │
│   RefreshToken { id, userId, token, expiresAt }             │
│                                                              │
│ Artifact: .company/artifacts/architect/system-design.md     │
└──────────────────────────────────────────────────────────────┘
```

### Phase 3: Planning (Tech Lead)
The Tech Lead breaks work into tasks with dependencies:

```
┌──────────────────────────────────────────────────────────────┐
│ TECH LEAD TASK BREAKDOWN                                      │
├──────────────────────────────────────────────────────────────┤
│ Feature: User Authentication                                 │
│                                                              │
│ Tasks:                                                       │
│   [1] Set up database schema          (no deps)             │
│   [2] Create User model               (blocked by: 1)       │
│   [3] Implement JWT utilities         (no deps)             │
│   [4] Build login endpoint            (blocked by: 2, 3)    │
│   [5] Build register endpoint         (blocked by: 2, 3)    │
│   [6] Add refresh token flow          (blocked by: 4)       │
│   [7] Write integration tests         (blocked by: 4, 5, 6) │
│                                                              │
│ Parallel Opportunities: Tasks 1 and 3 can run together      │
└──────────────────────────────────────────────────────────────┘
```

### Phase 4: Implementation (Developers)
Developers execute tasks, producing code with tests:

```
┌──────────────────────────────────────────────────────────────┐
│ DEVELOPER IMPLEMENTATION                                      │
├──────────────────────────────────────────────────────────────┤
│ Task: [3] Implement JWT utilities                            │
│ Status: ✓ COMPLETE                                          │
│                                                              │
│ Files Created:                                               │
│   src/utils/jwt.js         (token generation/validation)    │
│   tests/utils/jwt.test.js  (unit tests - 100% coverage)     │
│                                                              │
│ Commit: feat(auth): add JWT utility functions               │
│                                                              │
│ Handoff: Ready for code review                              │
└──────────────────────────────────────────────────────────────┘
```

### Phase 5: Code Review
The Code Reviewer checks quality, security, and standards:

```
┌──────────────────────────────────────────────────────────────┐
│ CODE REVIEW REPORT                                            │
├──────────────────────────────────────────────────────────────┤
│ Files Reviewed: 8                                            │
│ Status: APPROVED with suggestions                           │
│                                                              │
│ Findings:                                                    │
│   ⚠ MEDIUM: Consider rate limiting on /auth/login          │
│   ℹ INFO: Add JSDoc comments to exported functions          │
│   ✓ PASS: No security vulnerabilities detected              │
│   ✓ PASS: Test coverage meets 80% threshold                 │
│                                                              │
│ Verdict: Approved for QA verification                       │
└──────────────────────────────────────────────────────────────┘
```

### Phase 6: QA Verification
QA runs comprehensive tests and validates acceptance criteria:

```
┌──────────────────────────────────────────────────────────────┐
│ QA VERIFICATION REPORT                                        │
├──────────────────────────────────────────────────────────────┤
│ Test Results:                                                │
│   Unit Tests:        47 passed, 0 failed                    │
│   Integration Tests: 12 passed, 0 failed                    │
│   E2E Tests:         8 passed, 0 failed                     │
│                                                              │
│ Coverage: 87% (exceeds 80% minimum)                         │
│                                                              │
│ Acceptance Criteria:                                         │
│   ✓ Users can register with email/password                  │
│   ✓ Users can login and receive JWT                         │
│   ✓ Invalid credentials return 401                          │
│   ✓ Tokens expire after configured TTL                      │
│   ✓ Refresh tokens work correctly                           │
│                                                              │
│ Verdict: READY FOR MERGE                                    │
└──────────────────────────────────────────────────────────────┘
```

## Governance: The Proposal System

When actions cross role boundaries, proposals are required:

```
┌──────────────────────────────────────────────────────────────┐
│ PROPOSAL #7: Scope Change Request                            │
├──────────────────────────────────────────────────────────────┤
│ From: Tech Lead                                              │
│ Type: scope_change                                           │
│ Requires: CEO Approval                                       │
│                                                              │
│ Request: Add OAuth provider support (Google, GitHub)        │
│                                                              │
│ Justification: Customer feedback indicates 60% of users     │
│ prefer social login over email/password registration.       │
│                                                              │
│ Impact: +2 additional tasks, extends timeline               │
│                                                              │
│ ┌────────────┐  ┌────────────┐  ┌────────────┐              │
│ │  APPROVE   │  │   MODIFY   │  │   REJECT   │              │
│ └────────────┘  └────────────┘  └────────────┘              │
└──────────────────────────────────────────────────────────────┘
```

## PM Mode: GSD-Inspired Project Management

For larger projects, use the full PM workflow:

```
┌──────────────────────────────────────────────────────────────┐
│ PM WORKFLOW: Discuss → Plan → Execute → Verify              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  PHASE 1: User Auth    ████████████████████ COMPLETE        │
│  PHASE 2: Profiles     ████████████░░░░░░░░ IN PROGRESS     │
│  PHASE 3: Settings     ░░░░░░░░░░░░░░░░░░░░ PENDING         │
│  PHASE 4: Dashboard    ░░░░░░░░░░░░░░░░░░░░ PENDING         │
│                                                              │
│ Current: Phase 2 - Execute                                   │
│ Next Action: /company-verify 2                               │
└──────────────────────────────────────────────────────────────┘
```

## Try It For Real!

To use the actual framework in your project:

1. **Initialize the framework:**
   ```bash
   npx claude-virtual-company init
   ```

2. **Start a project:**
   ```
   /company "Build a REST API for todo management"
   ```

3. **Check status anytime:**
   ```
   /company-status
   ```

4. **For larger projects, use PM mode:**
   ```
   /company-new-project "E-commerce platform with cart and checkout"
   ```

## Key Commands

| Command | Purpose |
|---------|---------|
| `/company [goal]` | Start new project with hierarchy |
| `/company-status` | Check current workflow state |
| `/company-new-project` | Start PM mode for larger projects |
| `/company-progress` | See PM progress and next action |
| `/company-quick [task]` | Quick ad-hoc task execution |
| `/company-merge` | Merge completed work to main |

## Learn More

- Full documentation: See README.md
- Architecture details: See docs/ARCHITECTURE.md
- Command reference: See docs/SLASH-COMMANDS.md
- State machine: See docs/STATE-MACHINE.md
