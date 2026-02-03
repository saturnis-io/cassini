---
name: company-protocols
description: Shared protocols and standards for all virtual company roles. Preloaded into every role skill.
user-invocable: false
---

# Virtual Company Protocols

This skill defines shared standards that all roles must follow.

## Governance Matrix
!`cat .company/governance-matrix.json 2>/dev/null | head -100 || echo "Governance matrix not found"`

---

## Tiered Context Structure

All handoffs and key artifacts should use tier markers for progressive loading. This reduces context bloat while ensuring critical information is always available.

### Tier Markers

```markdown
<!-- TIER:SUMMARY --> ... <!-- /TIER:SUMMARY -->   (Always loaded, ~50 words)
<!-- TIER:DECISIONS --> ... <!-- /TIER:DECISIONS --> (Loaded for implementation)
<!-- TIER:FULL --> ... <!-- /TIER:FULL -->          (Loaded only if blocked)
```

### What Goes in Each Tier

| Tier | Content | When Loaded |
|------|---------|-------------|
| SUMMARY | TL;DR, one-line decisions | Always |
| DECISIONS | Acceptance criteria, verification, key constraints | Default |
| FULL | Rationale, alternatives, detailed context | On request |

### Example Tiered Handoff

```markdown
# Handoff: Architect → Tech Lead

<!-- TIER:SUMMARY -->
## Summary
REST API with JWT auth. 3 services: AuthService, UserService, SessionService.
PostgreSQL for persistence. Follow existing service patterns in src/services/.
<!-- /TIER:SUMMARY -->

<!-- TIER:DECISIONS -->
## Key Decisions
- JWT over sessions: stateless scaling
- Refresh tokens: 7-day expiry with rotation
- bcrypt cost factor: 12

## Acceptance Criteria
- [ ] Services created following existing patterns
- [ ] All endpoints documented in api-contracts.md
- [ ] Unit tests with 80%+ coverage

## Verification
\`\`\`bash
npm test -- --grep="Auth"
\`\`\`
<!-- /TIER:DECISIONS -->

<!-- TIER:FULL -->
## Alternatives Considered
[Full rationale...]

## Open Questions
[Deferred items...]
<!-- /TIER:FULL -->
```

---

## Mermaid Diagrams

Use Mermaid diagrams to convey relationships efficiently. Sub-agents read the Mermaid source as structured text, making it an effective way to communicate topology and flows.

### When to Use Mermaid

| Diagram Type | Use Case | Context Efficiency |
|--------------|----------|-------------------|
| `graph LR/TD` | Component relationships, service boundaries | High |
| `sequenceDiagram` | API flows, request/response patterns | High |
| `erDiagram` | Data model relationships | Medium |
| `flowchart` | Decision logic, state machines | Medium |

### When to Use Prose Instead

- Acceptance criteria (needs checkboxes)
- Verification commands (needs executable code)
- Rationale/decisions (narrative form)

### Guidelines

1. **Keep diagrams small** - 5-10 nodes maximum
2. **Place in DECISIONS tier** - relationships are key implementation context
3. **Pair with brief annotations** - diagram shows "what", text explains "why"
4. **Use consistent naming** - match component/service names across documents

### Component Diagram Template

```mermaid
graph TD
    subgraph "API Layer"
        API[API Gateway]
    end

    subgraph "Services"
        Auth[AuthService]
        User[UserService]
    end

    subgraph "Data"
        DB[(PostgreSQL)]
        Cache[(Redis)]
    end

    API --> Auth
    API --> User
    Auth --> DB
    Auth --> Cache
    User --> DB
```

### Sequence Diagram Template

```mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant S as Service
    participant D as Database

    C->>A: POST /login
    A->>S: validate(credentials)
    S->>D: findUser(email)
    D-->>S: user
    S-->>A: token
    A-->>C: 200 {token}
```

### ER Diagram Template

```mermaid
erDiagram
    User ||--o{ Session : has
    User {
        uuid id PK
        string email UK
        string passwordHash
    }
    Session {
        uuid id PK
        uuid userId FK
        string token UK
        datetime expiresAt
    }
```

### Dependency Graph Template (for Tech Lead)

```mermaid
graph LR
    subgraph "Wave 1"
        T1[Task 1.1]
        T4[Task 1.4]
    end

    subgraph "Wave 2"
        T2[Task 1.2]
        T3[Task 1.3]
    end

    subgraph "Wave 3"
        T5[Task 1.5]
    end

    T1 --> T2
    T1 --> T3
    T4 --> T5
    T2 --> T5
    T3 --> T5
```

---

## Context Loading Utilities

### Load by Tier (bash patterns for role skills)

```bash
# Summary only (fastest)
sed -n '/<!-- TIER:SUMMARY -->/,/<!-- \/TIER:SUMMARY -->/p' FILE | grep -v '<!-- '

# Summary + Decisions (default for implementation)
sed -n '/<!-- TIER:SUMMARY -->/,/<!-- \/TIER:DECISIONS -->/p' FILE | grep -v '<!-- '

# Full document (when blocked)
cat FILE
```

### Graceful Fallback

If tier markers not present, fall back to head:

```bash
CONTENT=$(sed -n '/<!-- TIER:SUMMARY -->/,/<!-- \/TIER:DECISIONS -->/p' "$FILE" 2>/dev/null | grep -v '<!-- ')
if [ -z "$CONTENT" ]; then
  CONTENT=$(head -50 "$FILE" 2>/dev/null)
fi
echo "$CONTENT"
```

### Node.js Loading (via platform.js)

```javascript
const { readTier } = require('./src/platform');

// Load summary only
const summary = readTier('.company/artifacts/architect/handoff.md', 'summary');

// Load summary + decisions (default)
const decisions = readTier('.company/artifacts/architect/handoff.md', 'decisions');

// Load full document
const full = readTier('.company/artifacts/architect/handoff.md', 'full');
```

---

## Handoff Protocol

Every role transition requires a formal handoff document.

### Handoff Document Structure

```markdown
# Handoff: [From Role] → [To Role]

## Phase
[Current phase name]

## Deliverables
[List of artifacts produced]

## Acceptance Criteria for Next Role
- [ ] Criterion 1 (must be testable)
- [ ] Criterion 2 (must be testable)
- [ ] Criterion 3 (must be testable)

## Verification Commands
\`\`\`bash
# Commands to verify the deliverables
\`\`\`

## Context Summary
[Essential context for the next role - keep concise]

## Open Questions
[Any unresolved items that need attention]

## Handoff Checklist
- [ ] All artifacts written to correct location
- [ ] Acceptance criteria are specific and testable
- [ ] Verification commands work
- [ ] No blocking issues remain
```

### Writing Handoffs

1. Write to `.company/artifacts/[your-role]/handoff-[phase].md`
2. Include all required sections
3. Ensure acceptance criteria are specific and testable
4. Provide working verification commands

### Receiving Handoffs

1. Read the handoff document from the previous role
2. Run verification commands
3. Check all acceptance criteria from previous phase
4. If any fail, create a rejection proposal

---

## Proposal Protocol

When you need to request something outside your permissions:

### Proposal Types

| Type | When to Use |
|------|-------------|
| `create_task` | Create a task for another role |
| `update_task` | Modify another role's task |
| `add_dependency` | Add cross-role task dependency |
| `escalate` | Report a blocker or issue |
| `request_expertise` | Need specialist help |
| `reject_handoff` | Previous deliverable incomplete |
| `scope_change` | Requirements need to change |

### Proposal Format

```bash
cat > .company/proposals/pending/$(date +%s)-[type].json << 'EOF'
{
  "proposal_type": "[type]",
  "from_role": "[your-role]",
  "timestamp": "[ISO timestamp]",
  "priority": "normal|urgent|blocking",
  "payload": {
    // Type-specific data
  },
  "justification": "[Why this is needed]"
}
EOF
```

### What You Can Do Without Proposals

- Mark your own tasks as in_progress or completed
- Create subtasks for your own work
- Add notes to your own tasks
- Read any file or task

---

## Expertise Self-Evaluation

Every role must evaluate if they have the expertise for their assigned task.

### Before Starting Work

1. **Analyze Task Requirements**
   - What technologies are involved?
   - What domains does this touch?
   - What expertise is assumed?

2. **Check Your Expertise**
   - Does the task match your skill definition?
   - Are there aspects outside your domain?

3. **If Gap Detected**

```bash
cat > .company/proposals/pending/$(date +%s)-expertise-gap.json << 'EOF'
{
  "proposal_type": "request_expertise",
  "from_role": "$CURRENT_ROLE",
  "required_expertise": ["domain-1", "domain-2"],
  "reason": "Task requires X which is outside my expertise in Y",
  "blocking": false
}
EOF
```

4. **Continue or Wait**
   - Non-blocking gap: Continue with best effort, flag for review
   - Blocking gap: Submit proposal and wait

---

## Sync Protocol

Since agents don't receive automatic updates, follow this sync protocol:

### On Start

```bash
# 1. Refresh task list
TaskList()

# 2. Check inbox
for f in .company/inboxes/$ROLE/*.json; do
  cat "$f"
  mv "$f" .company/inboxes/$ROLE/archive/ 2>/dev/null
done

# 3. Check sync state
cat .company/sync-state.json 2>/dev/null
```

### During Work

Every 5 operations, quick sync:
```
TaskList()
```

### On Completion

```bash
# Write completion notification
cat > .company/inboxes/orchestrator/$(date +%s)-complete.json << 'EOF'
{
  "type": "phase_complete",
  "from_role": "$ROLE",
  "phase": "$PHASE",
  "artifacts": ["list", "of", "files"]
}
EOF
```

---

## Quality Standards

### Code Quality
- Follow existing project conventions
- No hardcoded secrets or credentials
- Proper error handling
- No dead code or debug statements

### Architecture & Design Patterns

**Prefer established patterns over ad-hoc solutions.** Well-known patterns produce consistent, maintainable code that other developers can understand quickly.

#### Common Patterns to Consider

| Pattern | When to Use | Example |
|---------|-------------|---------|
| **MVC/MVVM** | UI applications with clear view/logic separation | React + hooks, Vue components |
| **Repository** | Data access abstraction | `UserRepository.findById()` |
| **Service Layer** | Business logic encapsulation | `AuthService.validateCredentials()` |
| **Factory** | Complex object creation | `createDatabaseConnection(config)` |
| **Strategy** | Interchangeable algorithms | Payment processors, auth providers |
| **Observer/Pub-Sub** | Event-driven communication | Webhooks, real-time updates |
| **Middleware** | Cross-cutting concerns | Auth, logging, error handling |
| **DTO/ViewModel** | Data transfer between layers | API responses, form data |

#### Anti-Patterns to Avoid

- **God objects** - Classes/files doing too much (split by responsibility)
- **Spaghetti code** - Tangled dependencies (use clear layers)
- **Magic numbers/strings** - Unexplained values (use named constants)
- **Copy-paste code** - Duplicated logic (extract to shared functions)
- **Deep nesting** - Excessive if/loop depth (extract functions, use early returns)

#### Pattern Selection by Role

- **Architect**: Selects architectural patterns (MVC, microservices, etc.) and documents in `component-design.md`
- **Tech Lead**: References patterns in feature specs, ensures consistency across features
- **Developer**: Implements following specified patterns, proposes patterns for new scenarios

#### When Starting a New Component

1. Check if existing codebase has established patterns
2. If new pattern needed, document rationale in handoff
3. Keep files focused - one class/component per file when practical
4. Separate concerns: data access, business logic, presentation

### Testing Requirements
- Unit tests for new functions
- Integration tests for API endpoints
- E2E tests for user flows
- UI tests for frontend components

### Documentation
- Document public APIs
- Comment complex logic
- Update README when needed

---

## Communication Standards

### Status Updates

Write status to your role's outbox:
```bash
cat > .company/artifacts/$ROLE/status.json << 'EOF'
{
  "status": "in_progress|blocked|complete",
  "current_task": "[what you're working on]",
  "progress": "[percentage or description]",
  "blockers": [],
  "eta": "[if known]"
}
EOF
```

### Escalation Format

```json
{
  "severity": "low|medium|high|blocking",
  "issue": "[Clear description]",
  "impact": "[What's affected]",
  "attempted": "[What you tried]",
  "suggested": "[Your recommendation]"
}
```

---

## File Organization

### Artifact Locations

| Role | Directory |
|------|-----------|
| CTO | `.company/artifacts/cto/` |
| Architect | `.company/artifacts/architect/` |
| Tech Lead | `.company/artifacts/tech-lead/` |
| Senior Dev | `.company/artifacts/senior-dev/` |
| Developer | `.company/artifacts/developer/` |
| QA | `.company/artifacts/qa/` |
| Specialists | `.company/artifacts/specialist-[name]/` |

### Standard Artifacts

| Artifact | Location |
|----------|----------|
| Handoff | `artifacts/[role]/handoff-[phase].md` |
| Status | `artifacts/[role]/status.json` |
| Proposals | `proposals/pending/[timestamp]-[type].json` |
| Notifications | `inboxes/[role]/[timestamp]-[type].json` |
