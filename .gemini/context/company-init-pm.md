# Init Pm

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
# Read: >
# Read: .planning/config.json
# Read: .planning/STATE.md
```


## Role Instructions

---
name: company-init-pm
description: Initialize project manager directory structure and configuration.
---

# Initialize Project Manager

Sets up the `.planning/` directory structure for GSD-inspired project management.

## Initialization

```bash
# Create directory structure
mkdir -p .planning/{research,quick}

# Create PM config
cat > .planning/config.json << 'EOF'
{
  "pm": {
    "version": "1.0.0",
    "methodology": "gsd-inspired",
    "constraints": {
      "max_tasks_per_plan": 3,
      "context_budget_percent": 50,
      "require_verification": true,
      "require_uat": true
    },
    "phases": {
      "require_discuss": true,
      "require_plan_check": true,
      "parallel_execution": true,
      "max_parallel_waves": 3
    },
    "commits": {
      "atomic": true,
      "semantic": true,
      "require_co_author": true
    },
    "quick_mode": {
      "skip_research": true,
      "skip_plan_verify": true,
      "require_commits": true
    }
  }
}
EOF

# Create initial STATE.md
cat > .planning/STATE.md << 'EOF'
# Project State

## Status
Initialized, awaiting project definition.

## Session Log
| Timestamp | Action | Details |
|-----------|--------|---------|
| $(date -Iseconds) | init | PM structure created |

## Active Decisions
None yet.

## Open Blockers
None.

## ▶ Next Up

**Initialize Project** — Define vision and requirements

`/company-new-project`
EOF

echo "PM initialized at .planning/"
```

## Verification

Confirm structure exists:
```bash
ls -la .planning/
cat .planning/config.json
```

## Next Step

Run `/company-new-project` to define your project vision.


---

## Workflow Notes

### Sequential Execution
Gemini CLI executes roles sequentially. After completing this role:
1. Ensure all artifacts are written to the appropriate `.company/artifacts/` directory
2. Update `.company/state.json` with the new phase
3. Create any handoff documents for the next role
4. Notify the orchestrator by writing to `.company/inboxes/orchestrator/`

---
*Transpiled from: skills/company-init-pm/SKILL.md*