# Hire

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
# Read: .company/roster.json
# Read: .company/roster.json)
```


## Role Instructions

---
name: company-hire
description: Manually request hiring of a specific specialist.
argument-hint: [domain-id]
---

# Hire Specialist

Manually request the creation of a specialist for a specific domain.

## Context Loading

Before proceeding, read `.company/roster.json` to see current specialist IDs.

## Requested Domain
{{args}}

---

## Process

### Step 1: Validate Domain

Check if the requested domain is valid:

**Valid Domains:**

#### Frontend
- `frontend-react`, `frontend-vue`, `frontend-angular`, `frontend-svelte`
- `ui-css`, `ui-accessibility`, `ui-animation`

#### Backend
- `backend-node`, `backend-python`, `backend-go`, `backend-rust`
- `backend-java`, `backend-dotnet`, `backend-ruby`, `backend-php`

#### Data
- `database-postgresql`, `database-mysql`, `database-mongodb`, `database-redis`
- `data-etl`, `data-analytics`, `data-ml`

#### Infrastructure
- `infra-docker`, `infra-kubernetes`, `infra-terraform`
- `cloud-aws`, `cloud-gcp`, `cloud-azure`
- `cicd-github`, `cicd-gitlab`

#### Quality
- `testing-unit`, `testing-integration`, `testing-e2e`, `testing-visual`
- `security-appsec`, `security-auth`

#### Mobile
- `mobile-react-native`, `mobile-flutter`, `mobile-ios`, `mobile-android`

### Step 2: Check If Already Exists

```bash
# Check roster
cat .company/roster.json | jq '.specialists[] | select(.id == "{{args}}")'

# Check skill folder
ls .claude/skills/company-specialists/{{args}}/ 2>/dev/null
```

If already exists, inform user and skip creation.

### Step 3: Check CEO Approval (if configured)

```bash
# Check config
NEEDS_APPROVAL=$(cat .company/config.json | jq '.company.hiring.require_ceo_approval_for_new_roles')
```

If approval required:
```
**[Ask User]** Present the user with these choices and wait for their response:
```
questions: [{
    header: "Hire Specialist",
    question: "Create new specialist: {{args}}?",
    options: [
      { label: "Approve", description: "Create the specialist" },
      { label: "Deny", description: "Don't create" }
    ]
  }]
```
Describe the options clearly and ask for their selection.
```

### Step 4: Create Specialist

Create the specialist directly:

```bash
# Create skill directory
mkdir -p .claude/skills/company-specialists/{{args}}

# Generate SKILL.md based on domain
# (Use domain-specific template)
```

### Step 5: Update Roster

```bash
# Add to roster
ROSTER=$(cat .company/roster.json)
echo "$ROSTER" | jq '.specialists += [{
  "id": "{{args}}",
  "type": "hired",
  "skill_path": "company-specialists/{{args}}",
  "created": "'$(date -Iseconds)'",
  "expertise": ["domain-specific-tech"]
}]' > .company/roster.json
```

### Step 6: Confirm

```markdown
## Specialist Created

**Domain**: {{args}}
**Skill Path**: company-specialists/{{args}}
**Status**: Available

The specialist is now available for task assignment.

### Usage
This specialist will be automatically invoked when:
1. A task requires this expertise
2. Another role self-evaluates and requests help
3. The orchestrator assigns relevant work

### Verify
\`\`\`bash
ls .claude/skills/company-specialists/{{args}}/
cat .company/roster.json | jq '.specialists[] | select(.id == "{{args}}")'
\`\`\`
```

---

## Examples

### Hire React Specialist
```
/company-hire frontend-react
```

### Hire Python Backend Specialist
```
/company-hire backend-python
```

### Hire E2E Testing Specialist
```
/company-hire testing-e2e
```

---

## Troubleshooting

### Domain Not Recognized
Check the valid domains list above. Domain IDs are lowercase with hyphens.

### Specialist Already Exists
The specialist is already in your roster. Use `/company-roster` to see current specialists.

### Creation Failed
Check that:
1. The .claude/skills/ directory is writable
2. The .company/roster.json file exists
3. You have necessary permissions

---

## Related Commands

- `/company-roster` - View all specialists
- `/company-settings` - Configure hiring settings
- `/company` - Start a project (auto-hires needed specialists)


---

## Workflow Notes

### Sequential Execution
Gemini CLI executes roles sequentially. After completing this role:
1. Ensure all artifacts are written to the appropriate `.company/artifacts/` directory
2. Update `.company/state.json` with the new phase
3. Create any handoff documents for the next role
4. Notify the orchestrator by writing to `.company/inboxes/orchestrator/`

---
*Transpiled from: skills/company-hire/SKILL.md*