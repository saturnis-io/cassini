---
name: company-hire
description: Manually request hiring of a specific specialist.
disable-model-invocation: true
argument-hint: [domain-id]
---

# Hire Specialist

Manually request the creation of a specialist for a specific domain.

## Current Roster
!`cat .company/roster.json 2>/dev/null | jq '.specialists[].id' || echo "No roster found"`

## Requested Domain
$ARGUMENTS

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
cat .company/roster.json | jq '.specialists[] | select(.id == "$ARGUMENTS")'

# Check skill folder
ls .claude/skills/company-specialists/$ARGUMENTS/ 2>/dev/null
```

If already exists, inform user and skip creation.

### Step 3: Check CEO Approval (if configured)

```bash
# Check config
NEEDS_APPROVAL=$(cat .company/config.json | jq '.company.hiring.require_ceo_approval_for_new_roles')
```

If approval required:
```
AskUserQuestion({
  questions: [{
    header: "Hire Specialist",
    question: "Create new specialist: $ARGUMENTS?",
    options: [
      { label: "Approve", description: "Create the specialist" },
      { label: "Deny", description: "Don't create" }
    ]
  }]
})
```

### Step 4: Create Specialist

Create the specialist directly:

```bash
# Create skill directory
mkdir -p .claude/skills/company-specialists/$ARGUMENTS

# Generate SKILL.md based on domain
# (Use domain-specific template)
```

### Step 5: Update Roster

```bash
# Add to roster
ROSTER=$(cat .company/roster.json)
echo "$ROSTER" | jq '.specialists += [{
  "id": "$ARGUMENTS",
  "type": "hired",
  "skill_path": "company-specialists/$ARGUMENTS",
  "created": "'$(date -Iseconds)'",
  "expertise": ["domain-specific-tech"]
}]' > .company/roster.json
```

### Step 6: Confirm

```markdown
## Specialist Created

**Domain**: $ARGUMENTS
**Skill Path**: company-specialists/$ARGUMENTS
**Status**: Available

The specialist is now available for task assignment.

### Usage
This specialist will be automatically invoked when:
1. A task requires this expertise
2. Another role self-evaluates and requests help
3. The orchestrator assigns relevant work

### Verify
\`\`\`bash
ls .claude/skills/company-specialists/$ARGUMENTS/
cat .company/roster.json | jq '.specialists[] | select(.id == "$ARGUMENTS")'
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
