---
name: oq-test-runner
description: Use when executing OQ (Operational Qualification) test cases for the Cassini SPC platform. Triggers on requests to run quality tests, validate features, generate test reports, check OQ status, or execute test cases against the running application.
user-invocable: true
argument-hint: "run [AUTH|HIER|CHAR|DATA|CTRL|VIOL|CAP|RPT|CONN|MSA|FAI|SIG|ANOM|ANLYT|SET|AUDIT|DISP|RBAC|ALL] [--mode ui|api|all] [--verbose]"
skills:
  - playwright-cli
---

# OQ Test Runner — Cassini SPC Platform

## Overview

Executes Operational Qualification test cases against the running Cassini SPC application. Tests are defined as YAML files in `.testing/oq/test-cases/`, with feature context in `.testing/oq/knowledge-base/`.

## Commands

| Command | Description |
|---------|-------------|
| `/oq run [CATEGORY] [--mode ui\|api\|all]` | Execute test cases for a category or ALL |
| `/oq status` | Show coverage status and last run results |
| `/oq seed [CATEGORY]` | Run API seeding only (no test execution) |
| `/oq report [run-id]` | Display test report for a specific run |
| `/oq knowledge [topic]` | Display knowledge base entry |

## Execution Flow

### 1. Setup Phase

Before running tests:

1. Read `.testing/oq/config.yaml` for environment config
2. Verify both servers are running:
   - Backend: `curl -s http://localhost:8000/health` should return 200
   - Frontend: `curl -s http://localhost:5173` should return 200
3. If servers not running, inform user and stop (do NOT start servers automatically)
4. Create results directory: `.testing/oq/results/YYYY-MM-DD-HHmm/`

### 2. Authentication

Login via playwright-cli to establish session:

```
playwright-cli open http://localhost:5173/login
playwright-cli snapshot                          # Find username/password field refs
playwright-cli fill <username-ref> "admin"
playwright-cli fill <password-ref> "admin"
playwright-cli click <signin-button-ref>
playwright-cli snapshot                          # Verify dashboard loaded
playwright-cli state-save .testing/oq/results/auth-state.json
```

### 3. Test Case Execution

For each YAML test case file in the selected category:

1. **Read the test case** from `.testing/oq/test-cases/TC-{PREFIX}-{NNN}.yaml`
2. **Read the knowledge base** file for context (referenced in config.yaml categories)
3. **Check execution mode**:
   - If `seed_method: api` → call API endpoints to create test data
   - If `seed_method: ui-first-run` → execute UI steps on first run only
   - If `seed_method: none` → no setup needed
4. **Execute each step**:
   - Use `playwright-cli goto`, `fill`, `click`, `select`, etc. for navigation
   - Use `playwright-cli snapshot` to read the page state after each action
   - Use `playwright-cli screenshot` to capture visual evidence when `screenshot: true`
   - Interpret the snapshot against the `verify` field — does the page show what's expected?
   - For `visual_check` fields, analyze screenshots for layout, colors, values
5. **Record result**: Pass if all verify/visual_check criteria met, Fail with details if not

### 4. API Seeding

When a test case has `seed_method: api`, create test data before executing steps:

```bash
# Get auth token
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Create plant
curl -s -X POST http://localhost:8000/api/v1/plants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"OQ-Test-Plant","code":"OQ","description":"OQ test plant"}'

# Create hierarchy, characteristics, samples per seed_data section
```

Use the `seed_data` section of each test case YAML for specific values. Handle 409 Conflict gracefully (data already exists from previous run).

### 5. Visual Interpretation

When interpreting page state against `verify` criteria:

- **Take a snapshot**: `playwright-cli snapshot` returns an accessibility tree with element refs
- **Take a screenshot**: `playwright-cli screenshot` for visual evidence
- **Check for elements**: Look for expected text, buttons, values in the snapshot
- **Check for errors**: Look for error toasts, console errors, missing elements
- **Check values**: For numerical values (Cpk, UCL, etc.), verify they're within tolerance
- **Check colors**: For status indicators, verify color coding matches thresholds
- **Check layout**: For responsive/display tests, verify element positioning

### 6. Report Generation

After all tests complete, generate `.testing/oq/results/YYYY-MM-DD-HHmm/report.md`:

```markdown
# Cassini SPC — OQ Test Report

**Version**: [read from frontend/package.json]
**Run ID**: YYYY-MM-DD-HHmm
**Date**: [timestamp]
**Executed By**: Claude Code (oq-test-runner)
**Environment**: [OS, DB type, URLs]
**Mode**: [ui|api|all]

## Executive Summary
| Metric | Value |
|--------|-------|
| Total Test Cases | N |
| Passed | N |
| Failed | N |
| Skipped | N |
| Pass Rate | N% |

## Results by Category
[Table of pass/fail per category]

## Failed Test Details
[For each failure: ID, expected, actual, screenshot, root cause hypothesis]

## Evidence Index
[All screenshots with timestamps]
```

## Test Case YAML Schema

```yaml
id: TC-{PREFIX}-{NNN}           # Unique test case ID
title: "Human-readable title"    # What this tests
category: "Category Name"       # Domain category
subcategory: "Sub-area"          # Specific sub-feature
priority: critical|high|medium|low
regulatory_relevance:            # Standards this supports
  - "Standard name - section"

preconditions:
  description: "What must be true before this test"
  seed_method: none|api|ui-first-run
  seed_data: {}                  # API seed parameters

execution_mode: ui|api-verify|visual-check
ui_proof_frequency: every-run|major-release|once

steps:
  - step: 1
    action: "What to do"
    playwright: "command hints"
    verify: "What to check"
    visual_check: true|false
    screenshot: true|false

expected_result: "Overall expected outcome"
pass_criteria: "Specific pass/fail criteria"

cleanup:
  - "Post-test cleanup steps"
```

## Category Prefixes

| Prefix | Domain | Knowledge Base |
|--------|--------|----------------|
| AUTH | Authentication & Accounts | 01-auth-accounts.md |
| HIER | Plants & Hierarchy | 02-plants-hierarchy.md |
| CHAR | Characteristic Configuration | 03-characteristics-config.md |
| DATA | Data Entry | 04-data-entry.md |
| CTRL | Control Charts | 05-control-charts.md |
| VIOL | Violations & Rules | 06-violations-rules.md |
| CAP | Capability Analysis | 07-capability-analysis.md |
| RPT | Reports & Export | 08-reports-export.md |
| CONN | Connectivity | 09-connectivity.md |
| MSA | MSA / Gage R&R | 10-msa-gagerr.md |
| FAI | First Article Inspection | 11-fai-inspection.md |
| SIG | Electronic Signatures | 12-signatures-compliance.md |
| ANOM | Anomaly Detection | 13-anomaly-detection.md |
| ANLYT | Advanced Analytics | 14-analytics-advanced.md |
| SET | Settings & Admin | 15-settings-admin.md |
| AUDIT | Audit Trail & Retention | 16-audit-retention.md |
| DISP | Display Modes | 17-display-modes.md |
| RBAC | RBAC & Security | 18-rbac-security.md |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Running tests without servers | Check health endpoints first |
| Hardcoding element refs | Always `snapshot` first, refs change between pages |
| Skipping screenshot on failures | ALWAYS screenshot on failure for evidence |
| Not reading knowledge base | Read KB file for context before interpreting results |
| Treating visual_check as exact match | Use tolerances for numerical values (±10% or ±0.15) |
| Forgetting to seed data | Check seed_method field; api seeds must run before steps |
| Not cleaning up between tests | Check cleanup section; leftover data can affect next test |
| Trying to start servers | Never start servers — inform user and stop |
