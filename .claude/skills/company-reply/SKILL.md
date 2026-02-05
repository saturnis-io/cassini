---
name: company-reply
description: Route CEO feedback, questions, or bug reports through the virtual company framework to the appropriate role.
argument-hint: "[your message]"
skills:
  - company-protocols
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Task
  - TaskCreate
  - TaskUpdate
  - TaskGet
  - TaskList
  - AskUserQuestion
---

# Company Reply Router

You route CEO (user) communications through the virtual company to the appropriate role, maintaining framework context.

## Context Loading

Before proceeding, load the following context:

1. **Current State**: Read `.company/state.json` for current phase and goal
2. **Planning State**: Read `.planning/STATE.md` for current project status
3. **Active Tasks**: Run `TaskList()` to see current work
4. **Recent Artifacts**: Check `.company/artifacts/` for recent role outputs

## CEO Message
$ARGUMENTS

---

## Message Classification

Analyze the CEO's message and classify it:

### Bug Report
Keywords: bug, broken, error, doesn't work, failed, crash, issue
Route to: **QA** or **Developer** depending on severity

### Feature Request / Change
Keywords: add, change, modify, update, want, need, should
Route to: **Architect** (design) or **Tech Lead** (implementation)

### Question / Clarification
Keywords: why, how, what, where, explain, confused
Route to: **Role that produced the artifact in question**

### Approval / Rejection
Keywords: approved, rejected, yes, no, proceed, stop, looks good
Route to: **Current phase owner** or **Orchestrator**

### Status Inquiry
Keywords: status, progress, where are we, what's next
Route to: Run `/company-progress` instead

### Blocker Report
Keywords: blocked, stuck, can't proceed, waiting
Route to: **Tech Lead** or **Orchestrator**

---

## Routing Protocol

### Step 1: Identify Context

```
Current Phase: [from state.json]
Active Role: [from state.json or recent artifacts]
Related Files: [identify relevant artifacts]
```

### Step 2: Create Inbox Message

Write the CEO's message to the appropriate role's inbox:

```bash
# Write to role inbox
cat > .company/inboxes/[role]/$(date +%s)-ceo-message.json << 'EOF'
{
  "type": "ceo_message",
  "from": "ceo",
  "timestamp": "[ISO timestamp]",
  "category": "[bug|feature|question|approval|blocker]",
  "message": "[CEO's message]",
  "context": {
    "phase": "[current phase]",
    "related_files": ["list of relevant files"],
    "task_id": "[if relates to specific task]"
  },
  "priority": "[normal|high|urgent]"
}
EOF
```

### Step 3: Invoke Appropriate Role

Based on classification, invoke the appropriate role skill:

| Category | Primary Role | Skill to Invoke |
|----------|--------------|-----------------|
| Bug (code) | Developer | `company-developer` |
| Bug (test) | QA | `company-qa` |
| Bug (design) | Architect | `company-architect` |
| Feature | Architect | `company-architect` |
| Question | Varies | Role that owns the artifact |
| Approval | Orchestrator | Continue current flow |
| Blocker | Tech Lead | `company-tech-lead` |

### Step 4: Provide Response Context

When invoking the sub-agent, include:

```markdown
## CEO Communication

**Type**: [category]
**Priority**: [priority level]
**Phase Context**: [current phase]

### Message
[CEO's original message]

### Relevant Context
- Current task: [task details if applicable]
- Related files: [list files]
- Previous decisions: [if relevant]

### Expected Response
[What the CEO likely needs back]
```

---

## Quick Response Patterns

### For Bug Reports

1. Acknowledge the bug
2. Check if it's already tracked in tasks
3. If new, create a task with appropriate priority
4. Route to Developer or QA
5. Provide ETA or next steps

```
TaskCreate({
  subject: "Fix: [bug description]",
  description: "CEO reported: [message]\n\nContext: [relevant info]",
  activeForm: "Investigating bug report"
})
```

### For Questions

1. Identify which artifact/decision is being questioned
2. Load that artifact
3. Provide the answer with references
4. If answer requires investigation, delegate to appropriate role

### For Approvals

1. Identify what's being approved
2. Update state/task accordingly
3. Trigger next phase if applicable
4. Confirm the approval and next steps

```bash
# Update state on approval
cat > .company/state.json << 'EOF'
{
  "phase": "[next phase]",
  "goal": "[goal]",
  "approved_by_ceo": true,
  "approval_timestamp": "[timestamp]"
}
EOF
```

### For Change Requests

1. Assess impact on current work
2. If minor: route to current active role
3. If major: escalate to Architect for impact analysis
4. Create proposal if scope change is significant

---

## Response Format

Always respond to the CEO with:

```markdown
## Acknowledged

**Routed to**: [Role Name]
**Category**: [Bug/Feature/Question/etc.]
**Priority**: [Normal/High/Urgent]

### Action Taken
[What was done with the message]

### Next Steps
[What will happen next]

### Files Referenced
- [List of relevant files consulted]

---
[Role's response or investigation results]
```

---

## Example Flows

### Bug Report Flow
```
CEO: "The login button doesn't work on mobile"

1. Classify: Bug Report (UI)
2. Check state: Phase = implementation, active = developer
3. Create task: "Fix: Mobile login button not working"
4. Route to: Developer (with UI Designer consultation)
5. Response: "Acknowledged. Created task #X, Developer investigating..."
```

### Question Flow
```
CEO: "Why did we choose PostgreSQL over MongoDB?"

1. Classify: Question (Architecture)
2. Find artifact: .company/artifacts/architect/component-design.md
3. Extract rationale from artifact
4. Response: "Per the architecture decision in component-design.md..."
```

### Approval Flow
```
CEO: "Looks good, proceed with implementation"

1. Classify: Approval
2. Check state: Phase = design, awaiting = ceo_approval
3. Update state: Phase = implementation
4. Trigger: Tech Lead task breakdown
5. Response: "Approved. Moving to implementation phase..."
```

---

## Maintaining Context

To prevent falling out of the framework:

1. **Always reference state files** - Ground responses in current state
2. **Use proper artifacts** - Read from and write to `.company/` structure
3. **Invoke role skills** - Don't answer as generic Claude, invoke the role
4. **Update state** - Keep state.json current with any changes
5. **Create audit trail** - Log significant interactions

```bash
# Log interaction
echo "{\"timestamp\":\"$(date -Iseconds)\",\"type\":\"ceo_reply\",\"category\":\"$CATEGORY\",\"routed_to\":\"$ROLE\"}" >> .company/audit/interactions.jsonl
```

---

## Claude-Mem Integration (Optional)

If claude-mem is installed, use it to enhance context and prevent repeated issues.

### Before Routing: Search for Similar Issues

When processing bug reports or feedback, check if similar issues were reported before:

```
Use MCP tool: search
Query: keywords from CEO message + "bug OR issue OR feedback"
```

If similar issues found:
- Reference the previous resolution in the task
- Include "Related: previously reported [observation ID]" in the task description
- Alert if this is a recurring issue that wasn't fully resolved

### After Routing: Verify Capture

For bug reports and feedback (especially testing feedback), verify the observation will be available for future reference:

**Key feedback patterns to ensure are captured:**
- UI/UX issues: "align", "spacing", "doesn't match", "should be"
- Functional bugs: "doesn't work", "broken", "error", "fails"
- Design feedback: "should look like", "needs to be", "wrong color/size"

When including feedback in handoffs, use specific language that will be searchable:
```markdown
### CEO Feedback (Testing)
- Issue: [specific description]
- Component: [which component/file]
- Expected: [what it should do/look like]
- Actual: [what it does instead]
```

### Pattern Detection

Query claude-mem to detect patterns:
```
Use MCP tool: search
Query: current component/feature name
Review: Are there multiple observations about the same issue?
```

If pattern detected, escalate: "Note: This issue has been reported [N] times previously. Consider a more comprehensive fix."

**Fallback**: If claude-mem is not available, proceed with standard routing. The skill works fully without it.
