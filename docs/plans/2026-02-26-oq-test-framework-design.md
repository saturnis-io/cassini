# OQ Test Framework Design — Cassini SPC Platform

**Date**: 2026-02-26
**Author**: Claude Code (brainstorming skill)
**Status**: Approved

## Overview

Build a comprehensive Operational Qualification (OQ) test framework for the Cassini SPC platform. The framework uses a Claude Code skill (`oq-test-runner`) that reads structured test case definitions, executes them via Playwright CLI with visual interpretation, and generates audit-quality reports.

### Goals

1. **Comprehensive feature coverage** — ~232 test cases across 18 feature domains
2. **Six Sigma BB perspective** — test cases designed by someone who understands SPC, capability analysis, MSA, and process control
3. **Hybrid OQ approach** — automated + visual, structured enough to formalize into regulatory OQ later
4. **Repeatable execution** — run against any environment, any version, produces consistent reports
5. **UI proof on major releases** — full UI walkthrough on version bumps; API-seeded verification for ongoing runs
6. **Knowledge base** — feature guides that serve as both test context and user documentation

### Non-Goals

- Not a replacement for the existing 211 Playwright E2E tests (those continue for CI)
- Not a formal IQ/OQ/PQ protocol (but structured to evolve into one)
- Not testing external system connectivity (MQTT brokers, OPC-UA servers, ERP systems — mocked/skipped)

---

## Architecture

### Execution Model

```
User invokes: /oq run [category]
        │
        ▼
┌─────────────────────┐
│  oq-test-runner      │
│  (Claude Code skill) │
└─────────┬───────────┘
          │
          ├─── Read config.yaml (URLs, creds, timeouts)
          ├─── Read test-cases/*.yaml (selected category)
          ├─── Read knowledge-base/*.md (context for interpretation)
          │
          ▼
┌─────────────────────┐
│  For each test case: │
│  1. Seed data (API)  │
│  2. Navigate (PW CLI)│
│  3. Screenshot       │
│  4. Interpret visual │
│  5. Record pass/fail │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Generate report     │
│  results/YYYY-MM-DD/ │
│  - report.md         │
│  - screenshots/      │
│  - data/             │
└─────────────────────┘
```

### Key Design Decisions

1. **YAML test cases, not code** — human-readable, editable by QA engineers, parseable by Claude
2. **Visual interpretation over coded assertions** — Claude reads screenshots and judges pass/fail against natural-language criteria, catching UX issues coded tests miss
3. **API seeding for efficiency** — once a feature's UI path is proven, subsequent tests seed data via API and jump to verification
4. **Timestamped results** — each run produces an immutable report directory for audit trail
5. **Knowledge base as context** — Claude reads feature guides before executing tests in that domain, giving it Six Sigma expert context

---

## Directory Structure

```
.testing/
├── oq/
│   ├── skill.md                    # Claude Code skill definition
│   ├── config.yaml                 # Global config (URLs, creds, timeouts)
│   ├── knowledge-base/             # Feature guides (18 files)
│   │   ├── 00-app-overview.md
│   │   ├── 01-auth-accounts.md
│   │   ├── 02-plants-hierarchy.md
│   │   ├── 03-characteristics-config.md
│   │   ├── 04-data-entry.md
│   │   ├── 05-control-charts.md
│   │   ├── 06-violations-rules.md
│   │   ├── 07-capability-analysis.md
│   │   ├── 08-reports-export.md
│   │   ├── 09-connectivity.md
│   │   ├── 10-msa-gagerr.md
│   │   ├── 11-fai-inspection.md
│   │   ├── 12-signatures-compliance.md
│   │   ├── 13-anomaly-detection.md
│   │   ├── 14-analytics-advanced.md
│   │   ├── 15-settings-admin.md
│   │   ├── 16-audit-retention.md
│   │   └── 17-display-modes.md
│   ├── test-cases/                 # Structured YAML test cases (~232 files)
│   │   ├── TC-AUTH-*.yaml          # Auth & accounts (15 TC)
│   │   ├── TC-HIER-*.yaml         # Plants & hierarchy (12 TC)
│   │   ├── TC-CHAR-*.yaml         # Characteristic config (20 TC)
│   │   ├── TC-DATA-*.yaml         # Data entry (18 TC)
│   │   ├── TC-CTRL-*.yaml         # Control charts (25 TC)
│   │   ├── TC-VIOL-*.yaml         # Violations & rules (15 TC)
│   │   ├── TC-CAP-*.yaml          # Capability analysis (15 TC)
│   │   ├── TC-RPT-*.yaml          # Reports & export (8 TC)
│   │   ├── TC-CONN-*.yaml         # Connectivity (12 TC)
│   │   ├── TC-MSA-*.yaml          # MSA/Gage R&R (12 TC)
│   │   ├── TC-FAI-*.yaml          # FAI inspection (10 TC)
│   │   ├── TC-SIG-*.yaml          # Electronic signatures (12 TC)
│   │   ├── TC-ANOM-*.yaml         # Anomaly detection (8 TC)
│   │   ├── TC-ANLYT-*.yaml        # Analytics (10 TC)
│   │   ├── TC-SET-*.yaml          # Settings & admin (15 TC)
│   │   ├── TC-AUDIT-*.yaml        # Audit & retention (10 TC)
│   │   ├── TC-DISP-*.yaml         # Display modes (5 TC)
│   │   └── TC-RBAC-*.yaml         # RBAC & security (10 TC)
│   ├── results/                    # Test run output (gitignored)
│   │   └── YYYY-MM-DD-HHmm/
│   │       ├── report.md
│   │       ├── screenshots/
│   │       └── data/
│   └── api-helpers/                # Curl/httpie seed scripts
│       ├── auth.sh                 # Login, get JWT token
│       ├── seed-hierarchy.sh       # Create plant + hierarchy
│       ├── seed-characteristics.sh # Create characteristics
│       ├── seed-samples.sh         # Submit sample data
│       └── seed-users.sh           # Create test users with roles
```

---

## Test Case Format (YAML)

### Standard Test Case

```yaml
id: TC-AUTH-001
title: "User Login with Valid Credentials"
category: Authentication & Accounts
subcategory: Login
priority: critical
regulatory_relevance:
  - "21 CFR Part 11 - Access Control"
  - "ISO 13485 - User Authentication"

preconditions:
  description: "Application running, default admin account exists"
  seed_method: none
  seed_data: {}

execution_mode: ui
ui_proof_frequency: major-release

steps:
  - step: 1
    action: "Navigate to login page"
    playwright: "goto('http://localhost:5173/login')"
    verify: "Login form visible with username field, password field, and Sign In button"
    screenshot: true

  - step: 2
    action: "Enter valid admin credentials (admin/admin)"
    playwright: "fill('#username', 'admin'); fill('#password', 'admin')"
    verify: "Fields populated with entered values"

  - step: 3
    action: "Click Sign In"
    playwright: "click('button:has-text(\"Sign In\")')"
    verify: "Redirected to /dashboard, sidebar navigation visible, user menu shows admin username"
    screenshot: true

expected_result: "User authenticated and sees Operator Dashboard with no errors"
pass_criteria: "Dashboard loads within 5s, no console errors, correct user displayed in header"

cleanup:
  - "No cleanup needed (session persists for next test)"
```

### API-Seeded Test Case

```yaml
id: TC-CAP-003
title: "Cpk Calculation with Normal Distribution"
category: Capability Analysis
subcategory: Cpk Calculation
priority: critical
regulatory_relevance:
  - "AIAG SPC Reference Manual - Process Capability"
  - "ISO 22514 - Statistical Methods"

preconditions:
  description: "Characteristic with 50+ samples, spec limits USL=10.05 LSL=9.95"
  seed_method: api
  seed_data:
    plant:
      name: "OQ-Plant-Cap"
    hierarchy:
      - { name: "Dept-Cap", type: "department" }
      - { name: "Line-Cap", type: "line", parent: "Dept-Cap" }
    characteristic:
      name: "OQ-Diameter-Cpk"
      type: "variable"
      chart_type: "xbar_r"
      subgroup_size: 5
      usl: 10.05
      lsl: 9.95
      target: 10.0
    samples:
      count: 60
      distribution: normal
      mean: 10.01
      std_dev: 0.015

execution_mode: api-verify
ui_proof_frequency: major-release

steps:
  - step: 1
    action: "Navigate to dashboard, select OQ-Plant-Cap, expand hierarchy to characteristic"
    verify: "Control chart renders with ~60 data points, UCL/CL/LCL lines visible"
    screenshot: true

  - step: 2
    action: "Locate the Capability Card below the chart"
    verify: |
      Capability Card displays:
      - Cp value (expect ~1.11 ± 0.15)
      - Cpk value (expect ~0.89 ± 0.15)
      - Color coding: Cpk < 1.0 should show yellow/warning
      - Pp and Ppk values also displayed
    visual_check: true
    screenshot: true

  - step: 3
    action: "Enable Show Your Work mode (toggle in header)"
    verify: "Cpk value gets dotted underline indicating it's explainable"

  - step: 4
    action: "Click the underlined Cpk value"
    verify: |
      Explanation panel slides out showing:
      - Formula: Cpk = min(Cpu, Cpl)
      - Step-by-step: Cpu = (USL - X̄) / (3σ), Cpl = (X̄ - LSL) / (3σ)
      - Input values matching seeded data
      - AIAG citation
    screenshot: true

expected_result: "Cpk correctly calculated and explained with full audit trail"
pass_criteria: |
  - Cpk within ±0.15 of expected 0.89
  - Color coding matches threshold rules
  - Show Your Work explanation matches displayed value
  - All formula steps shown correctly
```

---

## Knowledge Base Template

Each knowledge base file follows this structure:

```markdown
# Feature: [Name]

## What It Does
[2-3 sentences from a Six Sigma BB perspective — what problem does this solve?]

## Where To Find It
- **Page**: /path-in-app
- **Role Required**: minimum role level
- **Related Settings**: /settings/relevant-tab
- **Related API**: POST /api/v1/endpoint

## Key Concepts (Six Sigma Context)
[SPC/Six Sigma terminology and how it maps to this feature]

## How To Configure (Step-by-Step)
1. Navigate to ...
2. Click ...
3. Set ...

## How To Use (Typical Workflow)
1. ...

## Acceptance Criteria (OQ-Style)
- [ ] Feature loads without errors
- [ ] Data entry validates correctly
- [ ] Calculations match expected formulas
- [ ] RBAC enforced (unauthorized users blocked)
- [ ] Audit trail entries created

## Edge Cases & Constraints
- [Known limitations]
- [What happens with bad input]
- [Features that require external systems — mock/skip]

## API Reference (for seeding)
- `POST /characteristics` — create test characteristic
- `POST /samples/submit` — submit sample data
```

---

## Feature Coverage Map

| # | Domain | KB File | TC Prefix | TC Count | Priority | Key SPC Concepts |
|---|--------|---------|-----------|----------|----------|------------------|
| 1 | Auth & Accounts | 01 | TC-AUTH | 15 | Critical | Access control, 21 CFR Part 11 |
| 2 | Plants & Hierarchy | 02 | TC-HIER | 12 | High | Plant scoping, measurement system structure |
| 3 | Characteristic Config | 03 | TC-CHAR | 20 | Critical | Chart types, subgroup size, sampling plans |
| 4 | Data Entry | 04 | TC-DATA | 18 | Critical | Measurement input, data integrity |
| 5 | Control Charts | 05 | TC-CTRL | 25 | Critical | X̄-R, I-MR, p/np/c/u, CUSUM, EWMA, Western Electric |
| 6 | Violations & Rules | 06 | TC-VIOL | 15 | Critical | Nelson rules, out-of-control signals |
| 7 | Capability Analysis | 07 | TC-CAP | 15 | Critical | Cp/Cpk/Pp/Ppk/Cpm, non-normal, Box-Cox |
| 8 | Reports & Export | 08 | TC-RPT | 8 | High | SPC reports, CSV/PDF export |
| 9 | Connectivity | 09 | TC-CONN | 12 | Medium | MQTT, OPC-UA, serial gages (mock) |
| 10 | MSA / Gage R&R | 10 | TC-MSA | 12 | Critical | Gage R&R (crossed/nested), Kappa, AIAG MSA 4th Ed |
| 11 | FAI (AS9102) | 11 | TC-FAI | 10 | Critical | First Article Inspection, Forms 1/2/3 |
| 12 | Electronic Signatures | 12 | TC-SIG | 12 | Critical | Workflow approval, SHA-256, Part 11 |
| 13 | Anomaly Detection | 13 | TC-ANOM | 8 | Medium | PELT, K-S test, Isolation Forest |
| 14 | Advanced Analytics | 14 | TC-ANLYT | 10 | Medium | Multivariate T², PCA, correlation |
| 15 | Settings & Admin | 15 | TC-SET | 15 | High | System config, user management |
| 16 | Audit & Retention | 16 | TC-AUDIT | 10 | Critical | Audit trail, data retention, purge |
| 17 | Display Modes | 17 | TC-DISP | 5 | Low | Kiosk, wall dashboard |
| 18 | RBAC & Security | (cross) | TC-RBAC | 10 | Critical | Role hierarchy, plant scoping |
| | **Total** | | | **~232** | | |

---

## Skill Commands

### `/oq run [category] [--mode ui|api|all] [--verbose]`

Execute test cases. `category` matches TC prefix (e.g., `AUTH`, `CAP`, `ALL`).

- `--mode ui` — force UI-based execution (major release proof)
- `--mode api` — force API-seeded execution (fast regression)
- `--mode all` — respect `ui_proof_frequency` field per test case
- `--verbose` — include all screenshots, not just failures

### `/oq status`

Show current test coverage, last run date, pass/fail summary per category.

### `/oq seed [category]`

Run API seeding only (no test execution). Creates all test data prerequisites for the given category.

### `/oq report [run-id]`

Display or regenerate the test report for a specific run. Default: latest run.

### `/oq knowledge [topic]`

Display the knowledge base entry for a topic (quick reference during manual testing).

---

## Report Format

```markdown
# Cassini SPC — OQ Test Report

**Version**: [app version from package.json]
**Run ID**: 2026-02-26-1430
**Date**: 2026-02-26 14:30:00 UTC
**Executed By**: Claude Code (oq-test-runner v1.0)
**Environment**: Windows 11, SQLite, localhost:5173/8000
**Mode**: Full (UI proof + API verify)

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Test Cases | 232 |
| Passed | 228 |
| Failed | 3 |
| Skipped | 1 |
| Pass Rate | 98.3% |
| Duration | 47 min |
| Critical Failures | 1 |

## Results by Category

| Category | Total | Pass | Fail | Skip | Pass Rate |
|----------|-------|------|------|------|-----------|
| Auth & Accounts | 15 | 15 | 0 | 0 | 100% |
| Control Charts | 25 | 23 | 2 | 0 | 92% |
| Capability | 15 | 14 | 1 | 0 | 93% |
| ... | | | | | |

## Failed Test Details

### TC-CTRL-014: CUSUM Chart V-Mask Display
- **Priority**: High
- **Expected**: V-mask overlay renders on CUSUM chart
- **Actual**: V-mask lines not visible after 5s wait
- **Screenshot**: screenshots/TC-CTRL-014-step3.png
- **Root Cause Hypothesis**: ECharts custom series rendering may not trigger on initial load
- **Recommended Action**: Check CUSUM chart component's useEffect dependencies

### [Additional failures...]

## Deviations & Notes
[Any test cases that required manual judgment or had ambiguous results]

## Evidence Index
[List of all screenshots with timestamps and test case IDs]
```

---

## Implementation Phases

### Phase 1: Foundation (Current Sprint)
- Create directory structure
- Write `config.yaml` and skill definition
- Write knowledge base files (all 18)
- Write critical-priority test cases first (~120 TC)

### Phase 2: Full Coverage
- Write remaining test cases (~112 TC)
- Build API seeding helpers
- Test and refine the skill execution flow

### Phase 3: Hardening
- Run full suite, fix issues
- Calibrate visual interpretation criteria
- Add edge case test cases based on findings
- Document deviations and workarounds

---

## Relationship to Existing Tests

| Aspect | Existing E2E (Playwright) | OQ Test Framework |
|--------|---------------------------|-------------------|
| **Purpose** | Regression detection | Feature qualification |
| **Execution** | Automated, CI-friendly | Claude-driven, on-demand |
| **Assertions** | Coded (DOM queries) | Visual interpretation |
| **Coverage** | 211 tests, breadth | 232 tests, depth + breadth |
| **Data** | Pre-seeded SQLite | API-seeded per test case |
| **Output** | HTML report | Markdown report + screenshots |
| **Who runs it** | npm script / CI | Claude Code skill |
| **Catches** | Functional regressions | UX issues, calculation errors, layout problems |

The two systems complement each other. The existing E2E tests run fast in CI. The OQ framework runs on-demand for deeper qualification with expert-level visual interpretation.
