# Governance Matrix Reference

## Role Hierarchy

```
CEO (User)
    │
    └── CTO
        │
        └── Architect
            │
            └── Tech Lead
                │
                ├── Senior Dev
                │   │
                │   └── Developer
                │
                └── QA
```

## Permission Matrix

### Task Operations

| Operation | CTO | Architect | Tech Lead | Senior Dev | Developer | QA |
|-----------|-----|-----------|-----------|------------|-----------|-----|
| Create task for self | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create task for junior | ✅ | ✅ | ✅ | ✅ | ✅* | ❌ |
| Update own task | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Update other's task | ❌ | ❌ | ✅** | ✅** | ❌ | ❌ |
| Complete own task | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Delete task | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

*Developer can create QA tasks
**With proposal

### Handoff Permissions

| From | Can Hand Off To |
|------|-----------------|
| CTO | Architect |
| Architect | Tech Lead |
| Tech Lead | Senior Dev, Developer |
| Senior Dev | Developer |
| Developer | QA |
| QA | Developer (rejection), Tech Lead (escalation) |

### Proposal Auto-Approval

These proposals are automatically approved:
- Create subtask for self
- Mark own task complete
- Developer creating QA verification task
- Tech Lead creating Developer task
- Escalation to higher role

### Proposal Requires Review

These proposals require orchestrator review:
- Cross-role task creation (non-standard)
- Modifying another role's task
- Adding cross-role dependencies
- Rejecting a handoff

### Proposal Requires CEO

These proposals require user approval:
- Scope changes
- Blocking release
- Security concerns
- Resource conflicts
- Deadline risks

## Escalation Paths

| Role | Escalates To |
|------|--------------|
| Developer | Senior Dev → Tech Lead |
| Senior Dev | Tech Lead → Architect |
| Tech Lead | Architect → CTO |
| Architect | CTO → CEO |
| QA | Tech Lead → Architect |

## Quality Gates

### Architecture → Design
Required: `architecture-decision-record.md`, `tech-stack.md`

### Design → Planning
Required: `component-design.md`, `api-contracts.md`

### Planning → Implementation
Required: `feature-spec.md`, `task-breakdown.md`

### Implementation → QA
Required: `implementation-complete.md`, passing unit tests

### QA → Merge
Required: `qa-report.md`, all tests pass, code review approved
