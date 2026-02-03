---
name: company-propose
description: Submit a proposal for task changes, escalations, or cross-role requests.
disable-model-invocation: true
argument-hint: [proposal-type]
---

# Submit Proposal

Create and submit a proposal for actions that require approval or cross-role coordination.

## Arguments
$ARGUMENTS

---

## Proposal Types

### 1. Create Task for Another Role
```
/company-propose create-task
```

Creates a task for a different role to work on.

### 2. Escalate Issue
```
/company-propose escalate
```

Report a blocker or issue that needs attention.

### 3. Request Expertise
```
/company-propose request-expertise
```

Request a specialist to help with a task.

### 4. Reject Handoff
```
/company-propose reject-handoff
```

Return work to a previous role due to issues.

### 5. Scope Change
```
/company-propose scope-change
```

Request a change to project requirements (requires CEO).

---

## Interactive Proposal Creation

Based on the proposal type, gather the necessary information:

### For `create-task`

```
AskUserQuestion({
  questions: [
    {
      header: "Target Role",
      question: "Which role should receive this task?",
      options: [
        { label: "Developer", description: "For implementation work" },
        { label: "QA", description: "For testing and verification" },
        { label: "Senior Dev", description: "For complex technical work" }
      ]
    },
    {
      header: "Priority",
      question: "What's the priority?",
      options: [
        { label: "High", description: "Blocking other work" },
        { label: "Medium", description: "Important but not blocking" },
        { label: "Low", description: "Nice to have" }
      ]
    }
  ]
})
```

Then ask for:
- Task subject
- Task description
- Acceptance criteria
- Justification

### For `escalate`

```
AskUserQuestion({
  questions: [
    {
      header: "Severity",
      question: "How severe is this issue?",
      options: [
        { label: "Blocking", description: "Cannot continue without resolution" },
        { label: "High", description: "Significantly impacts progress" },
        { label: "Medium", description: "Slows down work" },
        { label: "Low", description: "Minor inconvenience" }
      ]
    }
  ]
})
```

Then ask for:
- Issue description
- What was attempted
- Suggested resolution

### For `request-expertise`

```
AskUserQuestion({
  questions: [
    {
      header: "Domain",
      question: "What expertise is needed?",
      options: [
        { label: "Frontend", description: "React, Vue, UI/UX" },
        { label: "Backend", description: "Node, Python, APIs" },
        { label: "DevOps", description: "Docker, K8s, CI/CD" },
        { label: "Other", description: "Specify in details" }
      ]
    }
  ]
})
```

Then ask for:
- Specific technologies needed
- Why current expertise is insufficient
- Related task ID

---

## Proposal Templates

### Create Task Proposal
```json
{
  "proposal_type": "create_task",
  "from_role": "[your-role]",
  "timestamp": "[ISO datetime]",
  "target_role": "[target]",
  "priority": "high|medium|low",
  "payload": {
    "task": {
      "subject": "[Task title]",
      "description": "[Detailed description]",
      "acceptance_criteria": ["AC1", "AC2", "AC3"]
    }
  },
  "justification": "[Why this task is needed]"
}
```

### Escalate Proposal
```json
{
  "proposal_type": "escalate",
  "from_role": "[your-role]",
  "timestamp": "[ISO datetime]",
  "severity": "blocking|high|medium|low",
  "issue": "[Clear description of the problem]",
  "impact": "[What's affected]",
  "attempted": "[What you tried]",
  "suggested_resolution": "[Your recommendation]",
  "affected_tasks": ["task-id-1", "task-id-2"]
}
```

### Request Expertise Proposal
```json
{
  "proposal_type": "request_expertise",
  "from_role": "[your-role]",
  "timestamp": "[ISO datetime]",
  "task_id": "[related-task]",
  "required_expertise": ["domain-1", "domain-2"],
  "reason": "[Why this expertise is needed]",
  "blocking": true|false
}
```

### Reject Handoff Proposal
```json
{
  "proposal_type": "reject_handoff",
  "from_role": "[your-role]",
  "timestamp": "[ISO datetime]",
  "handoff_id": "[handoff identifier]",
  "target_role": "[role that sent the handoff]",
  "reason": "[Why the handoff is rejected]",
  "missing_items": ["item-1", "item-2"],
  "required_additions": ["what needs to be added"]
}
```

### Scope Change Proposal
```json
{
  "proposal_type": "scope_change",
  "from_role": "[your-role]",
  "timestamp": "[ISO datetime]",
  "requires_ceo_approval": true,
  "current_scope": "[What was originally planned]",
  "proposed_change": "[What should change]",
  "reason": "[Why this change is needed]",
  "impact": {
    "timeline": "[How it affects timeline]",
    "resources": "[How it affects resources]",
    "quality": "[How it affects quality]"
  }
}
```

---

## Submit Proposal

After gathering information, write the proposal:

```bash
PROPOSAL_ID=$(date +%s)
cat > .company/proposals/pending/$PROPOSAL_ID-[type].json << 'EOF'
{
  [proposal content]
}
EOF

echo "Proposal submitted: $PROPOSAL_ID"
echo "Location: .company/proposals/pending/$PROPOSAL_ID-[type].json"
```

---

## What Happens Next

1. **Orchestrator** picks up the proposal during next sync
2. **Evaluation** against governance rules
3. **Auto-approve** if eligible
4. **Review** if needed
5. **CEO approval** if required
6. **Execution** or **Rejection** with feedback

---

## Check Proposal Status

```bash
# Pending
ls .company/proposals/pending/

# Approved
ls .company/proposals/approved/

# Rejected
ls .company/proposals/rejected/
```

---

## Related Commands

- `/company-status` - See overall workflow status
- `/company-settings` - Configure approval rules
