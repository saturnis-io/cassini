# OQ Test Framework Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a comprehensive OQ test framework with ~232 test cases, a knowledge base, and a Claude Code skill that executes tests via playwright-cli with visual interpretation.

**Architecture:** Claude Code skill (`oq-test-runner`) reads YAML test cases from `.testing/oq/test-cases/`, references knowledge base docs in `.testing/oq/knowledge-base/`, seeds data via API helpers, navigates pages using `playwright-cli`, takes screenshots, and generates Markdown test reports.

**Tech Stack:** Claude Code skills (SKILL.md), YAML test cases, playwright-cli (npm global), curl for API seeding, Markdown reports

**Design Doc:** `docs/plans/2026-02-26-oq-test-framework-design.md`

---

## Task 1: Create Directory Structure and Config

**Files:**
- Create: `.testing/oq/config.yaml`
- Create: `.testing/oq/.gitignore` (for results/)

**Step 1: Create directory structure**

```bash
mkdir -p .testing/oq/{knowledge-base,test-cases,results,api-helpers}
```

**Step 2: Write config.yaml**

```yaml
# .testing/oq/config.yaml
# OQ Test Framework Configuration

environment:
  base_url: "http://localhost:5173"
  api_url: "http://localhost:8000/api/v1"
  backend_cmd: "cd backend && uvicorn cassini.main:app --reload"
  frontend_cmd: "cd frontend && npm run dev"

credentials:
  admin:
    username: "admin"
    password: "admin"
  operator:
    username: "oq-operator"
    password: "OqTest123!"
  supervisor:
    username: "oq-supervisor"
    password: "OqTest123!"
  engineer:
    username: "oq-engineer"
    password: "OqTest123!"

timeouts:
  page_load: 10000
  api_call: 5000
  screenshot_delay: 1000

screenshot:
  format: "png"
  full_page: false

categories:
  - { prefix: "AUTH", name: "Authentication & Accounts", kb: "01-auth-accounts.md" }
  - { prefix: "HIER", name: "Plants & Hierarchy", kb: "02-plants-hierarchy.md" }
  - { prefix: "CHAR", name: "Characteristic Configuration", kb: "03-characteristics-config.md" }
  - { prefix: "DATA", name: "Data Entry", kb: "04-data-entry.md" }
  - { prefix: "CTRL", name: "Control Charts", kb: "05-control-charts.md" }
  - { prefix: "VIOL", name: "Violations & Rules", kb: "06-violations-rules.md" }
  - { prefix: "CAP", name: "Capability Analysis", kb: "07-capability-analysis.md" }
  - { prefix: "RPT", name: "Reports & Export", kb: "08-reports-export.md" }
  - { prefix: "CONN", name: "Connectivity", kb: "09-connectivity.md" }
  - { prefix: "MSA", name: "MSA / Gage R&R", kb: "10-msa-gagerr.md" }
  - { prefix: "FAI", name: "First Article Inspection", kb: "11-fai-inspection.md" }
  - { prefix: "SIG", name: "Electronic Signatures", kb: "12-signatures-compliance.md" }
  - { prefix: "ANOM", name: "Anomaly Detection", kb: "13-anomaly-detection.md" }
  - { prefix: "ANLYT", name: "Advanced Analytics", kb: "14-analytics-advanced.md" }
  - { prefix: "SET", name: "Settings & Admin", kb: "15-settings-admin.md" }
  - { prefix: "AUDIT", name: "Audit Trail & Retention", kb: "16-audit-retention.md" }
  - { prefix: "DISP", name: "Display Modes", kb: "17-display-modes.md" }
  - { prefix: "RBAC", name: "RBAC & Security", kb: "18-rbac-security.md" }
```

**Step 3: Write .gitignore for results**

```
# .testing/oq/.gitignore
results/
```

**Step 4: Commit**

```bash
git add .testing/oq/config.yaml .testing/oq/.gitignore
git commit -m "feat(oq): create test framework directory structure and config"
```

---

## Task 2: Create the OQ Test Runner Skill

**Files:**
- Create: `.claude/skills/oq-test-runner/SKILL.md`

**Step 1: Write the skill definition**

The skill definition is large. It goes in `.claude/skills/oq-test-runner/SKILL.md` and defines:
- How to parse YAML test cases
- How to use playwright-cli for navigation/screenshots
- How to seed data via API
- How to generate reports
- The `/oq` command interface

```markdown
---
name: oq-test-runner
description: Use when executing OQ (Operational Qualification) test cases for the Cassini SPC platform. Triggers on requests to run quality tests, validate features, generate test reports, check OQ status, or execute test cases against the running application.
user-invocable: true
argument-hint: "run [AUTH|HIER|CHAR|DATA|CTRL|VIOL|CAP|RPT|CONN|MSA|FAI|SIG|ANOM|ANLYT|SET|AUDIT|DISP|RBAC|ALL] [--mode ui|api|all] [--verbose]"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - WebFetch
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
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

```bash
playwright-cli open http://localhost:5173/login
playwright-cli snapshot  # Find username/password fields
playwright-cli fill <username-ref> "admin"
playwright-cli fill <password-ref> "admin"
playwright-cli click <signin-button-ref>
playwright-cli snapshot  # Verify dashboard loaded
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

# Create plant (example)
curl -s -X POST http://localhost:8000/api/v1/plants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"OQ-Test-Plant","code":"OQ","description":"OQ test plant"}'

# Create hierarchy node
curl -s -X POST http://localhost:8000/api/v1/hierarchy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"OQ-Dept","node_type":"department","plant_id":PLANT_ID}'

# Create characteristic
curl -s -X POST http://localhost:8000/api/v1/characteristics \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"OQ-Diameter","usl":10.05,"lsl":9.95,...}'

# Submit samples
curl -s -X POST http://localhost:8000/api/v1/samples/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"characteristic_id":CHAR_ID,"values":[10.01,10.02,...]}'
```

Use the `seed_data` section of each test case YAML for specific values.

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
    playwright: "playwright-cli command(s)"  # Optional hint
    verify: "What to check"
    visual_check: true|false     # Needs screenshot analysis
    screenshot: true|false       # Capture evidence

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
| Treating visual_check as exact match | Use tolerances for numerical values (±10% or ±0.1) |
| Forgetting to seed data | Check seed_method field; api seeds must run before steps |
| Not cleaning up between tests | Check cleanup section; leftover data can affect next test |
```

**Step 2: Commit**

```bash
git add .claude/skills/oq-test-runner/SKILL.md
git commit -m "feat(oq): create oq-test-runner skill definition"
```

---

## Task 3: Write Knowledge Base — App Overview (00)

**Files:**
- Create: `.testing/oq/knowledge-base/00-app-overview.md`

**Step 1: Write the app overview knowledge base file**

This file provides the Six Sigma BB with context about what Cassini is, how it's structured, and how to navigate. Content should be derived from the actual application state — pages, roles, navigation patterns.

Key sections:
- What Cassini is (SPC platform for manufacturing quality)
- Role hierarchy (operator → supervisor → engineer → admin)
- Main navigation areas (sidebar links)
- Plant scoping concept
- How to switch between plants
- General UI patterns (cards, modals, tabs, data tables)
- The visual style system (Retro vs Glass themes)
- How to use the header controls (Show Your Work, notifications, user menu)

**Step 2: Commit**

```bash
git add .testing/oq/knowledge-base/00-app-overview.md
git commit -m "feat(oq): add app overview knowledge base"
```

---

## Task 4: Write Knowledge Base — Auth & Accounts (01)

**Files:**
- Create: `.testing/oq/knowledge-base/01-auth-accounts.md`

**Content covers:**
- Login flow (username/password → JWT access + refresh cookie)
- Logout (clears cookie)
- Password change (forced change flag, /change-password page)
- Forgot password flow (email token → /reset-password)
- Profile update (display name, email with verification)
- SSO/OIDC login (provider list, redirect flow, account linking)
- Session management (15-min access token, 7-day refresh, silent refresh on 401)
- API endpoints for seeding: `POST /auth/login`, `POST /users`, `POST /users/{id}/roles`
- Acceptance criteria: login works, logout clears session, password rules enforced, OIDC redirects correctly

**Step: Commit after writing**

---

## Task 5: Write Knowledge Base — Plants & Hierarchy (02)

**Files:**
- Create: `.testing/oq/knowledge-base/02-plants-hierarchy.md`

**Content covers:**
- Plant concept (manufacturing site, top-level scope)
- Creating/editing/deleting plants (admin only)
- Hierarchy tree structure (plant → department → line → station → characteristic)
- Creating hierarchy nodes (engineer+)
- Plant switcher in header
- How plant scoping affects all data visibility
- User-plant-role assignments
- API endpoints: `POST /plants`, `POST /hierarchy`, `GET /hierarchy`
- Acceptance criteria: plants CRUD works, hierarchy tree renders, plant switching filters data

---

## Task 6: Write Knowledge Base — Characteristics Config (03)

**Files:**
- Create: `.testing/oq/knowledge-base/03-characteristics-config.md`

**Content covers:**
- What a characteristic is (measurable quality attribute: diameter, weight, defect count)
- Chart types: X̄-R, X̄-S, I-MR, p, np, c, u, CUSUM, EWMA
- Variable vs attribute data
- Subgroup size and its significance
- Control limits (UCL, CL, LCL) — auto-calculated vs manual
- Spec limits (USL, LSL, target) — for capability analysis
- Sampling configuration (frequency, plan)
- Nelson rules configuration (8 rules, presets: Nelson/AIAG/WECO/Wheeler)
- Custom rule parameters (window sizes, sigma multipliers)
- Short-run modes (deviation, standardized Z-score)
- Distribution method (normal, lognormal, Weibull, etc.)
- Laney correction (for overdispersed p/u charts)
- Configuration UI: CharacteristicConfigTabs with Limits, Rules, Sampling tabs
- API endpoints: `POST /characteristics`, `PUT /{id}`, `PUT /{id}/limits`, `PUT /{id}/rules`

---

## Task 7: Write Knowledge Base — Data Entry (04)

**Files:**
- Create: `.testing/oq/knowledge-base/04-data-entry.md`

**Content covers:**
- Manual data entry page (/data-entry)
- Selecting characteristic from hierarchy tree
- Entering individual measurements (subgroup entry)
- Attribute data entry (pass/fail counts, defect counts)
- CSV import wizard (upload → column mapping → validation → confirm)
- API-based data entry (POST /data-entry/submit, /submit-attribute, /batch)
- Sample editing (updating values after submission)
- Sample exclusion (removing from control limit calculations)
- Batch operations
- Timestamp handling
- API endpoints: `POST /samples/submit`, `POST /samples/batch-submit`, `POST /import/upload`

---

## Task 8: Write Knowledge Base — Control Charts (05)

**Files:**
- Create: `.testing/oq/knowledge-base/05-control-charts.md`

**Content covers:**
- Dashboard chart display (X̄ chart + R/S chart pair, or I-MR)
- Chart anatomy: data points, UCL/CL/LCL lines, spec limit lines, violation markers
- Variable charts: X̄-R (subgroup means + ranges), X̄-S (means + std dev), I-MR (individuals + moving range)
- Attribute charts: p (proportion), np (count), c (defects), u (defects per unit)
- Special charts: CUSUM (cumulative sum), EWMA (exponentially weighted moving average)
- Chart interactions: zoom, pan, tooltip, point selection
- Annotations (point and period annotations on chart)
- Chart toolbar controls (time range, density, export)
- AI Insights toggle (anomaly overlay)
- ECharts rendering details
- How control limits are calculated (A2/D3/D4 constants for X̄-R, etc.)
- Short-run chart behavior (deviation mode, Z-score mode)
- API endpoints: `GET /{id}/chart-data`, `GET /{id}/limits`

---

## Task 9: Write Knowledge Base — Violations & Rules (06)

**Files:**
- Create: `.testing/oq/knowledge-base/06-violations-rules.md`

**Content covers:**
- What a violation is (Nelson rule trigger on a control chart)
- The 8 Nelson rules with SPC significance:
  1. Point beyond 3σ (out of control)
  2. 9 points same side of CL (shift)
  3. 6 points continuously increasing/decreasing (trend)
  4. 14 points alternating up/down (systematic variation)
  5. 2 of 3 points beyond 2σ (warning)
  6. 4 of 5 points beyond 1σ (shift warning)
  7. 15 points within 1σ (stratification)
  8. 8 points beyond 1σ on both sides (mixture)
- Violation list page (/violations)
- Acknowledging violations (single and batch)
- Violation statistics
- Rule presets (Nelson, AIAG, WECO, Wheeler)
- Custom rule parameters
- Attribute chart rules (only rules 1-4 apply)
- API endpoints: `GET /violations`, `POST /{id}/acknowledge`, `GET /violations/stats`

---

## Task 10: Write Knowledge Base — Capability Analysis (07)

**Files:**
- Create: `.testing/oq/knowledge-base/07-capability-analysis.md`

**Content covers:**
- Process capability indices:
  - Cp = (USL - LSL) / 6σ (potential capability)
  - Cpk = min(Cpu, Cpl) (actual capability, accounts for centering)
  - Pp = (USL - LSL) / 6s (performance, uses overall sigma)
  - Ppk = min(Ppu, Ppl) (performance index)
  - Cpm = Cp / √(1 + ((X̄-T)/σ)²) (Taguchi capability)
- Normal vs non-normal capability analysis
- Distribution fitting (6 families: normal, lognormal, Weibull, gamma, exponential, beta)
- Box-Cox transformation
- Shapiro-Wilk normality test
- Capability history snapshots
- CapabilityCard display (color coding: green ≥1.33, yellow ≥1.0, red <1.0)
- Distribution Analysis modal (histogram, Q-Q plot, comparison table)
- Show Your Work integration for capability metrics
- API endpoints: `GET /{id}/capability`, `POST /{id}/capability/snapshot`, `GET /{id}/capability/history`

---

## Task 11: Write Knowledge Base — Reports & Export (08)

**Files:**
- Create: `.testing/oq/knowledge-base/08-reports-export.md`

**Content covers:**
- Reports page (/reports, supervisor+)
- Report generation (SPC summary, control chart, capability)
- Export formats (PDF, CSV)
- Chart screenshot export
- Scheduled reports (configuration, delivery)
- Audit log CSV export
- API endpoints: relevant report endpoints

---

## Task 12: Write Knowledge Base — Connectivity (09)

**Files:**
- Create: `.testing/oq/knowledge-base/09-connectivity.md`

**Content covers:**
- Connectivity Hub page (/connectivity, engineer+)
- MQTT broker configuration (host, port, TLS, auth)
- MQTT topic discovery and mapping
- OPC-UA server configuration (endpoint, security policy)
- OPC-UA node browsing
- Tag-to-characteristic mapping
- RS-232/USB gage bridge (registration, serial port config, parser profiles)
- ERP connectors (SAP, Oracle, LIMS, webhook adapters)
- Sync schedules (cron-based)
- Connection testing
- Monitor tab (health dashboard)
- NOTE: External system connectivity should be mocked/skipped in OQ tests. Focus on UI configuration.
- API endpoints: brokers, opcua-servers, tags, gage-bridges, erp endpoints

---

## Task 13: Write Knowledge Base — MSA / Gage R&R (10)

**Files:**
- Create: `.testing/oq/knowledge-base/10-msa-gagerr.md`

**Content covers:**
- What MSA is (Measurement System Analysis, AIAG MSA 4th Edition)
- Gage R&R study types:
  - Crossed (every operator measures every part) — most common
  - Nested (operators measure different parts)
  - Range method (quick 2-operator assessment)
- ANOVA method vs Range method
- Key metrics: Repeatability (EV), Reproducibility (AV), GRR, Part Variation (PV), Total Variation (TV)
- %GRR interpretation: <10% acceptable, 10-30% conditional, >30% unacceptable
- Number of Distinct Categories (ndc)
- Attribute MSA (Cohen's Kappa for 2 raters, Fleiss' Kappa for 3+)
- d2* constants table (AIAG MSA 4th Ed, Appendix C)
- MSA wizard UI (/msa page)
- Creating a study (name, type, operators, parts, replicates)
- Entering measurement data grid
- Calculating results
- API endpoints: `POST /msa/studies`, `POST /studies/{id}/measurements`, `POST /studies/{id}/calculate`

---

## Task 14: Write Knowledge Base — FAI (11)

**Files:**
- Create: `.testing/oq/knowledge-base/11-fai-inspection.md`

**Content covers:**
- What FAI is (First Article Inspection per AS9102 Rev C)
- Three AS9102 forms:
  - Form 1: Part Number Accountability (part info, revision, material)
  - Form 2: Product Accountability (sub-assembly, raw material)
  - Form 3: Characteristic Accountability (measurements vs drawing requirements)
- Workflow: draft → submitted → approved/rejected
- Separation of duties (submitter ≠ approver)
- FAI page (/fai, engineer+)
- Creating a report, adding items, entering measurements
- Submit/approve/reject flow
- Print view (AS9102-formatted)
- API endpoints: `POST /fai/reports`, `POST /{id}/items`, `POST /{id}/submit`, `POST /{id}/approve`

---

## Task 15: Write Knowledge Base — Electronic Signatures (12)

**Files:**
- Create: `.testing/oq/knowledge-base/12-signatures-compliance.md`

**Content covers:**
- 21 CFR Part 11 context (electronic records, electronic signatures)
- Signature types: standalone (single sign) vs workflow (multi-step approval)
- Workflow engine: define steps, assign required signers/roles, enforce order
- SHA-256 content hashing (tamper detection)
- Signature meanings (e.g., "Reviewed", "Approved", "Authorized")
- Password policies (complexity, expiration, reuse prevention)
- Pending approvals dashboard
- Signature history and verification
- Settings page (/settings/signatures)
- API endpoints: `POST /signatures/sign`, `POST /workflows`, `GET /pending`

---

## Task 16: Write Knowledge Base — Anomaly Detection (13)

**Files:**
- Create: `.testing/oq/knowledge-base/13-anomaly-detection.md`

**Content covers:**
- AI/ML anomaly detection algorithms:
  - PELT (Pruned Exact Linear Time) — changepoint detection
  - K-S test (Kolmogorov-Smirnov) — distribution shift detection
  - Isolation Forest — outlier detection
- Configuration (sensitivity, algorithms, auto-run)
- Anomaly overlay on control charts (markPoint/markArea)
- Anomaly event list, acknowledge/dismiss
- Dashboard view (plant-wide anomaly summary)
- AI Insights toggle in chart toolbar
- Settings (/settings/ai)
- API endpoints: anomaly endpoints

---

## Task 17: Write Knowledge Base — Advanced Analytics (14)

**Files:**
- Create: `.testing/oq/knowledge-base/14-analytics-advanced.md`

**Content covers:**
- Analytics page (/analytics, engineer+)
- Multivariate SPC (Hotelling's T², MEWMA)
- Multivariate chart groups (selecting multiple characteristics)
- Correlation analysis (heatmap, coefficient matrix)
- PCA (Principal Component Analysis) — biplot, decomposition table
- Predictions tab (time-series forecasting)
- DOE page (/doe) — 2^k factorial design, ANOVA, main effects, interactions
- API endpoints: multivariate, correlation, PCA, DOE endpoints

---

## Task 18: Write Knowledge Base — Settings & Admin (15)

**Files:**
- Create: `.testing/oq/knowledge-base/15-settings-admin.md`

**Content covers:**
- Settings page (/settings) with role-gated tabs
- Account settings (profile, password change) — operator+
- Appearance (theme: light/dark, style: Retro/Glass) — operator+
- Notifications (email/webhook/push preferences) — operator+
- Branding (logo, colors) — admin
- Sites/Plants management — admin
- Localization (timezone, formats) — admin
- Email/Webhook config (SMTP, outbound webhooks) — admin
- API keys management — engineer+
- Data retention policies — engineer+
- Scheduled reports — engineer+
- SSO/OIDC configuration — admin
- Audit log viewer — admin
- Database settings (connection, backup, vacuum) — engineer+
- User management (/admin/users) — admin
- API endpoints: system-settings, notifications, api-keys, users endpoints

---

## Task 19: Write Knowledge Base — Audit Trail & Retention (16)

**Files:**
- Create: `.testing/oq/knowledge-base/16-audit-retention.md`

**Content covers:**
- Audit trail (automatic logging of all POST/PUT/PATCH/DELETE)
- Audit log viewer (/settings/audit-log, admin)
- Filtering (by action, resource, user, date range)
- CSV export
- Statistics view
- Data retention policies (global → plant → hierarchy → characteristic inheritance)
- Retention tree browser
- Policy inheritance chain visualization
- Purge engine (scheduled, history tracking)
- API endpoints: `GET /audit/logs`, retention endpoints

---

## Task 20: Write Knowledge Base — Display Modes (17)

**Files:**
- Create: `.testing/oq/knowledge-base/17-display-modes.md`

**Content covers:**
- Kiosk mode (/kiosk) — fullscreen chart display, auto-rotation
- Wall dashboard (/wall-dashboard) — TV display, no status bar
- KioskLayout component (stripped UI chrome)
- How to access (sidebar links, direct URL)
- Chart rotation settings
- API endpoints: none specific (uses existing chart-data endpoints)

---

## Task 21: Write Knowledge Base — RBAC & Security (18)

**Files:**
- Create: `.testing/oq/knowledge-base/18-rbac-security.md`

**Content covers:**
- 4-tier role hierarchy: operator < supervisor < engineer < admin
- Per-plant role assignments (user can have different roles in different plants)
- Route protection (ProtectedRoute component)
- API authorization (check_plant_role dependency)
- Admin bootstrap (admin gets ALL plants automatically)
- Security features: JWT rotation, refresh token cookies, httpOnly, CORS
- Password policies (complexity, expiration)
- API key authentication (for external systems)
- OIDC/SSO security (nonce validation, state store)

---

## Task 22: Write Test Cases — Authentication (TC-AUTH-001 through TC-AUTH-015)

**Files:**
- Create: `.testing/oq/test-cases/TC-AUTH-001.yaml` through `TC-AUTH-015.yaml`

**Test cases to create:**

| ID | Title | Priority |
|----|-------|----------|
| TC-AUTH-001 | Login with valid admin credentials | Critical |
| TC-AUTH-002 | Login with invalid password shows error | Critical |
| TC-AUTH-003 | Login with non-existent username shows error | Critical |
| TC-AUTH-004 | Logout clears session and redirects to login | Critical |
| TC-AUTH-005 | Unauthenticated user redirected to login | Critical |
| TC-AUTH-006 | Session persists across page refresh (token refresh) | Critical |
| TC-AUTH-007 | Password change enforced when flag is set | High |
| TC-AUTH-008 | Forgot password flow sends email | High |
| TC-AUTH-009 | Reset password with valid token | High |
| TC-AUTH-010 | Reset password with expired/invalid token fails | High |
| TC-AUTH-011 | Profile update changes display name | Medium |
| TC-AUTH-012 | Email change triggers verification | Medium |
| TC-AUTH-013 | Create new user (admin) | Critical |
| TC-AUTH-014 | Assign plant role to user | Critical |
| TC-AUTH-015 | Login as each role level verifies access | Critical |

Each test case follows the YAML schema from the skill definition. Steps use playwright-cli commands. Verification uses visual interpretation.

**Step: Write all 15 YAML files, then commit**

```bash
git add .testing/oq/test-cases/TC-AUTH-*.yaml
git commit -m "feat(oq): add authentication test cases (TC-AUTH-001 to TC-AUTH-015)"
```

---

## Task 23: Write Test Cases — Plants & Hierarchy (TC-HIER-001 through TC-HIER-012)

| ID | Title | Priority |
|----|-------|----------|
| TC-HIER-001 | Create a new plant | High |
| TC-HIER-002 | Edit plant name and description | High |
| TC-HIER-003 | Delete a plant | High |
| TC-HIER-004 | Switch active plant via header dropdown | Critical |
| TC-HIER-005 | Create department hierarchy node | High |
| TC-HIER-006 | Create line under department | High |
| TC-HIER-007 | Create station under line | High |
| TC-HIER-008 | Create characteristic under station | Critical |
| TC-HIER-009 | Hierarchy tree expands and collapses | Medium |
| TC-HIER-010 | Rename hierarchy node | Medium |
| TC-HIER-011 | Delete hierarchy node (cascade) | High |
| TC-HIER-012 | Plant data isolation (switching plant hides other plant's data) | Critical |

---

## Task 24: Write Test Cases — Characteristic Config (TC-CHAR-001 through TC-CHAR-020)

| ID | Title | Priority |
|----|-------|----------|
| TC-CHAR-001 | Create X̄-R characteristic with subgroup size 5 | Critical |
| TC-CHAR-002 | Create I-MR characteristic (subgroup size 1) | Critical |
| TC-CHAR-003 | Create p-chart characteristic | Critical |
| TC-CHAR-004 | Create np-chart characteristic | High |
| TC-CHAR-005 | Create c-chart characteristic | High |
| TC-CHAR-006 | Create u-chart characteristic | High |
| TC-CHAR-007 | Create CUSUM characteristic | High |
| TC-CHAR-008 | Create EWMA characteristic | High |
| TC-CHAR-009 | Set specification limits (USL, LSL, target) | Critical |
| TC-CHAR-010 | Set manual control limits (override auto-calc) | High |
| TC-CHAR-011 | Configure Nelson rules (enable/disable individual rules) | Critical |
| TC-CHAR-012 | Apply AIAG rule preset | High |
| TC-CHAR-013 | Apply WECO rule preset | High |
| TC-CHAR-014 | Create custom rule preset with modified parameters | High |
| TC-CHAR-015 | Configure sampling plan (frequency, size) | Medium |
| TC-CHAR-016 | Enable short-run deviation mode | High |
| TC-CHAR-017 | Enable short-run Z-score mode | High |
| TC-CHAR-018 | Set distribution method to lognormal | High |
| TC-CHAR-019 | Enable Laney correction on p-chart | High |
| TC-CHAR-020 | Delete characteristic | Medium |

---

## Task 25: Write Test Cases — Data Entry (TC-DATA-001 through TC-DATA-018)

| ID | Title | Priority |
|----|-------|----------|
| TC-DATA-001 | Submit single measurement via data entry page | Critical |
| TC-DATA-002 | Submit subgroup of 5 measurements | Critical |
| TC-DATA-003 | Submit attribute data (p-chart: pass/fail) | Critical |
| TC-DATA-004 | Submit attribute data (c-chart: defect count) | High |
| TC-DATA-005 | Submit attribute data (u-chart: defects per unit) | High |
| TC-DATA-006 | CSV import — upload valid CSV file | Critical |
| TC-DATA-007 | CSV import — column mapping step | Critical |
| TC-DATA-008 | CSV import — validation shows invalid rows | High |
| TC-DATA-009 | CSV import — confirm imports valid rows | Critical |
| TC-DATA-010 | Edit submitted sample value | High |
| TC-DATA-011 | Delete a sample | High |
| TC-DATA-012 | Exclude sample from control limit calculation | High |
| TC-DATA-013 | Re-include excluded sample | High |
| TC-DATA-014 | Submit data via API (POST /samples/submit) | Critical |
| TC-DATA-015 | Batch submit multiple samples via API | High |
| TC-DATA-016 | Data entry with timestamp | Medium |
| TC-DATA-017 | Data entry validation — reject non-numeric input | High |
| TC-DATA-018 | Data entry for CUSUM/EWMA chart types | High |

---

## Task 26: Write Test Cases — Control Charts (TC-CTRL-001 through TC-CTRL-025)

| ID | Title | Priority |
|----|-------|----------|
| TC-CTRL-001 | X̄-R chart renders with data points and control limits | Critical |
| TC-CTRL-002 | X̄-R range chart renders below means chart | Critical |
| TC-CTRL-003 | I-MR chart renders individuals + moving range | Critical |
| TC-CTRL-004 | p-chart renders proportion nonconforming | Critical |
| TC-CTRL-005 | np-chart renders count nonconforming | High |
| TC-CTRL-006 | c-chart renders defect count | High |
| TC-CTRL-007 | u-chart renders defects per unit | High |
| TC-CTRL-008 | CUSUM chart renders cumulative sum | High |
| TC-CTRL-009 | EWMA chart renders weighted average | High |
| TC-CTRL-010 | Control limits auto-calculate from data | Critical |
| TC-CTRL-011 | Spec limit lines display on chart | High |
| TC-CTRL-012 | Violation markers highlight rule-breaking points | Critical |
| TC-CTRL-013 | Chart tooltip shows point details on hover | Medium |
| TC-CTRL-014 | Chart zoom/pan functionality | Medium |
| TC-CTRL-015 | Add point annotation to chart | High |
| TC-CTRL-016 | Add period annotation (date range) | High |
| TC-CTRL-017 | Chart time range filter (last N points, date range) | High |
| TC-CTRL-018 | Short-run deviation mode display | High |
| TC-CTRL-019 | Short-run Z-score mode display | High |
| TC-CTRL-020 | Laney p' chart with sigma_z correction | High |
| TC-CTRL-021 | Multiple charts on dashboard (scroll/grid) | Medium |
| TC-CTRL-022 | Chart export/screenshot | Medium |
| TC-CTRL-023 | Real-time update when new sample submitted | High |
| TC-CTRL-024 | Chart with >100 data points renders correctly | Medium |
| TC-CTRL-025 | Dual chart panel (side-by-side comparison) | Low |

---

## Task 27: Write Test Cases — Violations & Rules (TC-VIOL-001 through TC-VIOL-015)

| ID | Title | Priority |
|----|-------|----------|
| TC-VIOL-001 | Nelson Rule 1 triggers on point beyond 3σ | Critical |
| TC-VIOL-002 | Nelson Rule 2 triggers on 9 same-side points | Critical |
| TC-VIOL-003 | Nelson Rule 3 triggers on 6 trending points | High |
| TC-VIOL-004 | Nelson Rule 4 triggers on 14 alternating points | High |
| TC-VIOL-005 | Nelson Rule 5 triggers (2/3 beyond 2σ) | High |
| TC-VIOL-006 | Nelson Rule 6 triggers (4/5 beyond 1σ) | High |
| TC-VIOL-007 | Nelson Rule 7 triggers (15 within 1σ) | Medium |
| TC-VIOL-008 | Nelson Rule 8 triggers (8 beyond 1σ both sides) | Medium |
| TC-VIOL-009 | Violations page lists all violations | Critical |
| TC-VIOL-010 | Acknowledge single violation | Critical |
| TC-VIOL-011 | Batch acknowledge multiple violations | High |
| TC-VIOL-012 | Violation details show rule, timestamp, value | High |
| TC-VIOL-013 | Violation statistics summary | Medium |
| TC-VIOL-014 | Disabled rule does not generate violations | High |
| TC-VIOL-015 | Attribute charts only trigger rules 1-4 | High |

---

## Task 28: Write Test Cases — Capability Analysis (TC-CAP-001 through TC-CAP-015)

| ID | Title | Priority |
|----|-------|----------|
| TC-CAP-001 | Cp calculated correctly for centered process | Critical |
| TC-CAP-002 | Cpk calculated for off-center process | Critical |
| TC-CAP-003 | Pp and Ppk calculated (overall sigma) | Critical |
| TC-CAP-004 | Cpm calculated (Taguchi index) | High |
| TC-CAP-005 | Capability color coding (green ≥1.33, yellow ≥1.0, red <1.0) | High |
| TC-CAP-006 | Show Your Work explains Cpk calculation | Critical |
| TC-CAP-007 | Capability history snapshot save | High |
| TC-CAP-008 | Capability history trend chart | High |
| TC-CAP-009 | Non-normal capability — lognormal distribution | Critical |
| TC-CAP-010 | Non-normal capability — Weibull distribution | High |
| TC-CAP-011 | Box-Cox transformation auto-detection | High |
| TC-CAP-012 | Distribution Analysis modal — histogram | High |
| TC-CAP-013 | Distribution Analysis modal — Q-Q plot | High |
| TC-CAP-014 | Normality test (Shapiro-Wilk) result display | High |
| TC-CAP-015 | Capability with insufficient data shows warning | Medium |

---

## Task 29: Write Test Cases — Reports (TC-RPT-001 through TC-RPT-008)

| ID | Title | Priority |
|----|-------|----------|
| TC-RPT-001 | Reports page accessible to supervisor+ | High |
| TC-RPT-002 | Generate SPC summary report | High |
| TC-RPT-003 | Report includes charts and capability data | High |
| TC-RPT-004 | Export report as CSV | High |
| TC-RPT-005 | Export chart as image | Medium |
| TC-RPT-006 | Operator cannot access reports page | High |
| TC-RPT-007 | Report filters by date range | Medium |
| TC-RPT-008 | Report filters by characteristic/hierarchy | Medium |

---

## Task 30: Write Test Cases — Connectivity (TC-CONN-001 through TC-CONN-012)

| ID | Title | Priority |
|----|-------|----------|
| TC-CONN-001 | Connectivity Hub page loads with tabs | High |
| TC-CONN-002 | Add MQTT broker configuration | High |
| TC-CONN-003 | Edit MQTT broker settings | Medium |
| TC-CONN-004 | Delete MQTT broker | Medium |
| TC-CONN-005 | Add OPC-UA server configuration | High |
| TC-CONN-006 | Edit OPC-UA server settings | Medium |
| TC-CONN-007 | Delete OPC-UA server | Medium |
| TC-CONN-008 | Gages tab loads and displays | High |
| TC-CONN-009 | Register new gage bridge | High |
| TC-CONN-010 | Configure gage port (serial settings) | Medium |
| TC-CONN-011 | ERP integrations tab loads | Medium |
| TC-CONN-012 | Monitor tab shows connection status cards | Medium |

---

## Task 31: Write Test Cases — MSA (TC-MSA-001 through TC-MSA-012)

| ID | Title | Priority |
|----|-------|----------|
| TC-MSA-001 | Create crossed Gage R&R study | Critical |
| TC-MSA-002 | Add operators to MSA study | Critical |
| TC-MSA-003 | Add parts to MSA study | Critical |
| TC-MSA-004 | Enter measurement data in grid | Critical |
| TC-MSA-005 | Calculate ANOVA Gage R&R results | Critical |
| TC-MSA-006 | Verify %GRR calculation | Critical |
| TC-MSA-007 | Verify ndc (number of distinct categories) | High |
| TC-MSA-008 | Create range method study (quick assessment) | High |
| TC-MSA-009 | Create nested Gage R&R study | High |
| TC-MSA-010 | Attribute MSA — Cohen's Kappa (2 raters) | High |
| TC-MSA-011 | Attribute MSA — Fleiss' Kappa (3+ raters) | High |
| TC-MSA-012 | MSA study list and filtering | Medium |

---

## Task 32: Write Test Cases — FAI (TC-FAI-001 through TC-FAI-010)

| ID | Title | Priority |
|----|-------|----------|
| TC-FAI-001 | Create FAI report (draft) | Critical |
| TC-FAI-002 | Enter Form 1 data (part accountability) | Critical |
| TC-FAI-003 | Enter Form 2 data (product accountability) | High |
| TC-FAI-004 | Add Form 3 items (characteristics) | Critical |
| TC-FAI-005 | Enter measurements in Form 3 items | Critical |
| TC-FAI-006 | Submit FAI report for approval | Critical |
| TC-FAI-007 | Approve FAI report (different user than submitter) | Critical |
| TC-FAI-008 | Reject FAI report with reason | High |
| TC-FAI-009 | Print view renders AS9102 format | High |
| TC-FAI-010 | Separation of duties enforced (submitter ≠ approver) | Critical |

---

## Task 33: Write Test Cases — Electronic Signatures (TC-SIG-001 through TC-SIG-012)

| ID | Title | Priority |
|----|-------|----------|
| TC-SIG-001 | Create signature workflow template | Critical |
| TC-SIG-002 | Add steps to workflow (role-based) | Critical |
| TC-SIG-003 | Execute standalone electronic signature | Critical |
| TC-SIG-004 | Initiate workflow-based approval | Critical |
| TC-SIG-005 | Sign pending approval (correct password) | Critical |
| TC-SIG-006 | Reject pending approval with reason | High |
| TC-SIG-007 | Verify signature history shows all signatures | High |
| TC-SIG-008 | SHA-256 hash verification (tamper detection) | Critical |
| TC-SIG-009 | Create and manage signature meanings | High |
| TC-SIG-010 | Password policy enforcement (complexity rules) | High |
| TC-SIG-011 | Pending approvals dashboard | High |
| TC-SIG-012 | Wrong password fails signature attempt | Critical |

---

## Task 34: Write Test Cases — Anomaly Detection (TC-ANOM-001 through TC-ANOM-008)

| ID | Title | Priority |
|----|-------|----------|
| TC-ANOM-001 | AI/ML config settings page loads | Medium |
| TC-ANOM-002 | Configure anomaly detector (sensitivity, algorithms) | Medium |
| TC-ANOM-003 | Run on-demand anomaly analysis | High |
| TC-ANOM-004 | Anomaly overlay renders on control chart | High |
| TC-ANOM-005 | Anomaly event list displays detected events | High |
| TC-ANOM-006 | Acknowledge anomaly event | Medium |
| TC-ANOM-007 | Dismiss anomaly event | Medium |
| TC-ANOM-008 | AI Insights toggle in chart toolbar | Medium |

---

## Task 35: Write Test Cases — Analytics (TC-ANLYT-001 through TC-ANLYT-010)

| ID | Title | Priority |
|----|-------|----------|
| TC-ANLYT-001 | Analytics page loads with tabs | Medium |
| TC-ANLYT-002 | Create multivariate chart group | High |
| TC-ANLYT-003 | Add characteristics to multivariate group | High |
| TC-ANLYT-004 | T² control chart renders | High |
| TC-ANLYT-005 | Correlation heatmap displays | High |
| TC-ANLYT-006 | PCA biplot renders | Medium |
| TC-ANLYT-007 | Predictions tab loads | Medium |
| TC-ANLYT-008 | DOE page — create 2^k factorial design | High |
| TC-ANLYT-009 | DOE — enter run data | High |
| TC-ANLYT-010 | DOE — ANOVA table and effects plots | High |

---

## Task 36: Write Test Cases — Settings & Admin (TC-SET-001 through TC-SET-015)

| ID | Title | Priority |
|----|-------|----------|
| TC-SET-001 | Settings page loads with role-appropriate tabs | High |
| TC-SET-002 | Change theme (light/dark) | Medium |
| TC-SET-003 | Change visual style (Retro/Glass) | Medium |
| TC-SET-004 | Configure SMTP email settings | High |
| TC-SET-005 | Send test email | High |
| TC-SET-006 | Create outbound webhook | High |
| TC-SET-007 | Configure notification preferences | High |
| TC-SET-008 | Create API key | High |
| TC-SET-009 | Revoke API key | High |
| TC-SET-010 | SSO/OIDC configuration page loads | Medium |
| TC-SET-011 | Database settings page loads | High |
| TC-SET-012 | Database backup creation | High |
| TC-SET-013 | Create user via admin panel | Critical |
| TC-SET-014 | Assign roles to user across plants | Critical |
| TC-SET-015 | Deactivate user | High |

---

## Task 37: Write Test Cases — Audit & Retention (TC-AUDIT-001 through TC-AUDIT-010)

| ID | Title | Priority |
|----|-------|----------|
| TC-AUDIT-001 | Audit log viewer loads with entries | Critical |
| TC-AUDIT-002 | Audit log captures POST operation | Critical |
| TC-AUDIT-003 | Audit log captures PUT/PATCH operation | Critical |
| TC-AUDIT-004 | Audit log captures DELETE operation | Critical |
| TC-AUDIT-005 | Filter audit log by action type | High |
| TC-AUDIT-006 | Filter audit log by user | High |
| TC-AUDIT-007 | Export audit log as CSV | High |
| TC-AUDIT-008 | Retention policy — set global default | High |
| TC-AUDIT-009 | Retention policy — override at hierarchy level | High |
| TC-AUDIT-010 | Retention inheritance chain display | Medium |

---

## Task 38: Write Test Cases — Display Modes (TC-DISP-001 through TC-DISP-005)

| ID | Title | Priority |
|----|-------|----------|
| TC-DISP-001 | Kiosk mode loads fullscreen chart | Medium |
| TC-DISP-002 | Kiosk mode hides sidebar/header | Medium |
| TC-DISP-003 | Wall dashboard loads TV display | Low |
| TC-DISP-004 | Wall dashboard has no status bar | Low |
| TC-DISP-005 | Kiosk/wall accessible via direct URL | Low |

---

## Task 39: Write Test Cases — RBAC & Security (TC-RBAC-001 through TC-RBAC-010)

| ID | Title | Priority |
|----|-------|----------|
| TC-RBAC-001 | Operator can access dashboard | Critical |
| TC-RBAC-002 | Operator can access data entry | Critical |
| TC-RBAC-003 | Operator CANNOT access configuration | Critical |
| TC-RBAC-004 | Supervisor can access reports | Critical |
| TC-RBAC-005 | Engineer can access configuration | Critical |
| TC-RBAC-006 | Engineer can access connectivity | High |
| TC-RBAC-007 | Engineer CANNOT access user management | Critical |
| TC-RBAC-008 | Admin can access all pages | Critical |
| TC-RBAC-009 | Plant-scoped role (admin in plant A, operator in plant B) | Critical |
| TC-RBAC-010 | API returns 403 for unauthorized role | High |

---

## Task 40: Write API Seeding Helpers

**Files:**
- Create: `.testing/oq/api-helpers/auth.sh`
- Create: `.testing/oq/api-helpers/seed-hierarchy.sh`
- Create: `.testing/oq/api-helpers/seed-characteristics.sh`
- Create: `.testing/oq/api-helpers/seed-samples.sh`
- Create: `.testing/oq/api-helpers/seed-users.sh`

**Step 1: Write auth.sh** — Gets JWT token, exports as variable

```bash
#!/bin/bash
# Usage: source .testing/oq/api-helpers/auth.sh
API_URL="${API_URL:-http://localhost:8000/api/v1}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-admin}"

export TOKEN=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token acquired for $USERNAME"
```

**Step 2: Write seed-hierarchy.sh** — Creates plant + department + line + station

```bash
#!/bin/bash
# Usage: .testing/oq/api-helpers/seed-hierarchy.sh <plant-name>
source "$(dirname "$0")/auth.sh"
PLANT_NAME="${1:-OQ-Test-Plant}"

# Create plant
PLANT_ID=$(curl -s -X POST "$API_URL/plants" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PLANT_NAME\",\"code\":\"OQ\",\"description\":\"OQ test\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Created plant: $PLANT_ID"
# ... similar for hierarchy nodes
```

**Step 3: Write remaining helpers following same pattern**

**Step 4: Commit**

```bash
git add .testing/oq/api-helpers/
git commit -m "feat(oq): add API seeding helper scripts"
```

---

## Task 41: Final Commit and Verification

**Step 1: Verify directory structure**

```bash
find .testing/oq -type f | sort
```

Expected: config.yaml, .gitignore, 18 knowledge base files, ~232 test case YAMLs, 5 API helpers

**Step 2: Verify skill is discoverable**

```bash
ls .claude/skills/oq-test-runner/SKILL.md
```

**Step 3: Run a smoke test**

Invoke `/oq run AUTH` to execute the authentication test cases against the running app. Verify:
- Skill loads and parses config
- Test cases are read correctly
- playwright-cli navigates the app
- Screenshots are captured
- Report is generated

**Step 4: Final commit**

```bash
git add -A .testing/oq/ .claude/skills/oq-test-runner/
git commit -m "feat(oq): complete OQ test framework with 232 test cases and knowledge base"
```

---

## Execution Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| Foundation | 1-2 | Directory structure, config, skill definition |
| Knowledge Base | 3-21 | 18 feature knowledge base files + app overview |
| Test Cases | 22-39 | ~232 test case YAML files across 18 categories |
| Helpers | 40 | API seeding scripts |
| Verification | 41 | Smoke test and final commit |

**Total estimated tasks:** 41
**Recommended execution:** Subagent-driven development with parallel agents for knowledge base writing (Tasks 3-21 can parallelize) and test case writing (Tasks 22-39 can parallelize).
