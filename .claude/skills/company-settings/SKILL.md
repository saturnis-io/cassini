---
name: company-settings
description: View and modify virtual company configuration settings.
disable-model-invocation: true
argument-hint: "[setting.path] [value]"
---

# Company Settings

View or modify the virtual company configuration.

## Context Loading

Read `.company/config.json` (first 100 lines) for current configuration. If missing, display: "No configuration found. Run /company to initialize."

## Arguments
$ARGUMENTS

---

## Usage

### View All Settings
```
/company-settings
```

### View Specific Setting
```
/company-settings quality.test_coverage_minimum
/company-settings git_flow.strategy
```

### Modify Setting
```
/company-settings quality.test_coverage_minimum 90
/company-settings git_flow.strategy trunk-based
/company-settings hiring.auto_hire false
```

---

## Available Settings

### Company
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `company.name` | string | "Virtual Engineering Co." | Company name |

### Hiring
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `hiring.auto_hire` | boolean | true | Auto-create specialists |
| `hiring.require_ceo_approval_for_new_roles` | boolean | false | Ask before creating specialists |
| `hiring.max_specialists` | number | 20 | Maximum specialists to create |
| `hiring.expertise_evaluation.on_project_init` | boolean | true | Evaluate on project start |
| `hiring.expertise_evaluation.on_escalation` | boolean | true | Evaluate on escalations |
| `hiring.expertise_evaluation.self_evaluation_enabled` | boolean | true | Enable self-evaluation |

### Quality
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `quality.test_coverage_minimum` | number | 80 | Minimum test coverage % |
| `quality.require_tests.unit` | string | "required" | Unit test requirement |
| `quality.require_tests.integration` | string | "required" | Integration test requirement |
| `quality.require_tests.e2e` | string | "required_for_user_flows" | E2E test requirement |
| `quality.require_tests.ui` | string | "required_for_frontend" | UI test requirement |
| `quality.require_code_review` | boolean | true | Require code review |
| `quality.review_approval_count` | number | 1 | Required approvals |
| `quality.block_merge_on_test_failure` | boolean | true | Block merge on failures |

### Git Flow
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `git_flow.enabled` | boolean | true | Enable git flow |
| `git_flow.strategy` | string | "gitflow" | Branch strategy |
| `git_flow.branches.main` | string | "main" | Main branch name |
| `git_flow.branches.develop` | string | "develop" | Develop branch name |
| `git_flow.require_pr` | boolean | true | Require pull requests |
| `git_flow.squash_on_merge` | boolean | true | Squash commits on merge |
| `git_flow.delete_branch_on_merge` | boolean | true | Delete branch after merge |

### Testing
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `testing.frameworks.unit` | string | "auto-detect" | Unit test framework |
| `testing.frameworks.e2e` | string | "playwright" | E2E test framework |
| `testing.frameworks.ui` | string | "puppeteer" | UI test framework |
| `testing.screenshot_on_failure` | boolean | true | Take screenshots on failure |
| `testing.visual_regression` | boolean | false | Enable visual regression |

### Workflow
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `workflow.require_acceptance_criteria` | boolean | true | Require AC for tasks |
| `workflow.require_handoff_validation` | boolean | true | Validate handoffs |
| `workflow.auto_assign_tasks` | boolean | true | Auto-assign tasks |
| `workflow.parallel_development` | boolean | true | Allow parallel dev |
| `workflow.max_parallel_developers` | number | 3 | Max parallel developers |

### Notifications
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `notifications.on_blocker` | string | "immediate" | Blocker notification |
| `notifications.on_phase_complete` | string | "summary" | Phase complete notification |
| `notifications.on_test_failure` | string | "immediate" | Test failure notification |
| `notifications.on_merge_ready` | string | "ask_ceo" | Merge ready notification |

---

## Modifying Settings

When arguments are provided, update the configuration:

### Parse Arguments
- First argument: Setting path (e.g., `quality.test_coverage_minimum`)
- Second argument: New value

### Update Configuration

```bash
# Read current config
CONFIG=$(cat .company/config.json)

# Update using jq
echo "$CONFIG" | jq '.[path] = value' > .company/config.json

# Confirm change
echo "Updated [path] to [value]"
```

### Validation

Before saving, validate:
- Setting path exists
- Value is correct type
- Value is within allowed range

---

## Examples

### Increase Test Coverage Requirement
```
/company-settings quality.test_coverage_minimum 90
```

### Switch to Trunk-Based Development
```
/company-settings git_flow.strategy trunk-based
```

### Disable Auto-Hiring
```
/company-settings hiring.auto_hire false
```

### Use Playwright for E2E Tests
```
/company-settings testing.frameworks.e2e playwright
```

---

## Reset to Defaults

To reset all settings to defaults:
```bash
cp /path/to/templates/config.json .company/config.json
```

Or reset a specific section by re-running `/company init --force`.
