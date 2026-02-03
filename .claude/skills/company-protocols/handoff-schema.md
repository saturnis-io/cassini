# Handoff Schema Reference

## Purpose

Handoffs are formal documents that transfer work between roles. They ensure:
- Clear communication of what was done
- Explicit acceptance criteria for the next role
- Verifiable deliverables
- Traceable decision history

## Schema

```yaml
handoff:
  metadata:
    id: string              # Unique identifier
    timestamp: datetime     # When handoff was created
    from_role: string       # Source role
    to_role: string         # Target role
    phase: string           # Current workflow phase
    project_id: string      # Parent project reference

  deliverables:
    artifacts:              # List of files produced
      - path: string
        description: string
        verification: string  # Command to verify

    decisions:              # Key decisions made
      - decision: string
        rationale: string
        alternatives_considered: string[]

  acceptance_criteria:      # What next role must verify
    - id: string
      criterion: string     # Clear, testable statement
      verification: string  # How to verify
      required: boolean     # Blocking or advisory

  context:
    summary: string         # Brief context for next role
    assumptions: string[]   # Assumptions made
    constraints: string[]   # Constraints to respect
    risks: string[]         # Known risks
    open_questions: string[] # Unresolved items

  verification:
    commands: string[]      # Commands to validate deliverables
    expected_results: string # What success looks like

  sign_off:
    completed: boolean
    timestamp: datetime
    notes: string
```

## Example

```markdown
# Handoff: Architect → Tech Lead

## Metadata
- ID: handoff-arch-tl-001
- Phase: design-to-planning
- Project: User Authentication System

## Deliverables

### Artifacts
| File | Description |
|------|-------------|
| `.company/artifacts/architect/component-design.md` | System component breakdown |
| `.company/artifacts/architect/api-contracts.md` | API endpoint specifications |
| `.company/artifacts/architect/data-model.md` | Database schema design |

### Key Decisions
1. **JWT for authentication** - Stateless, scalable, industry standard
2. **PostgreSQL for user data** - ACID compliance, JSON support
3. **Redis for session cache** - Fast, supports TTL

## Acceptance Criteria for Tech Lead

- [ ] AC-1: Break down into features that can be implemented in <2 days each
- [ ] AC-2: Identify dependencies between features
- [ ] AC-3: Define acceptance criteria for each feature
- [ ] AC-4: Estimate complexity (S/M/L) for each feature

### Verification
```bash
# Check design documents exist
ls .company/artifacts/architect/*.md

# Validate API contract format
cat .company/artifacts/architect/api-contracts.md | head -50
```

## Context

### Summary
Designed a secure, scalable authentication system using JWT tokens with
refresh token rotation. The system supports email/password login with
optional 2FA. All sensitive data is encrypted at rest.

### Assumptions
- Frontend will handle token storage securely
- Email service is already available
- Rate limiting will be handled at API gateway

### Constraints
- Must support 10,000 concurrent users
- Token expiry must be configurable
- Must pass security audit

### Open Questions
- Should we support social login (OAuth)? Deferred to v2.
- Password complexity requirements? Using NIST guidelines.

## Sign-off
- [x] All artifacts complete
- [x] Verification commands pass
- [x] Ready for Tech Lead
```

## Validation Rules

1. **Required Fields**
   - All metadata fields must be present
   - At least one deliverable artifact
   - At least one acceptance criterion

2. **Artifact Validation**
   - All referenced files must exist
   - Verification commands must be runnable

3. **Acceptance Criteria**
   - Must be specific and testable
   - Must include verification method
   - At least one must be marked required

4. **Context**
   - Summary must be concise (<500 words)
   - Assumptions must be explicit
   - Open questions must be acknowledged
