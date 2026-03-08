---
type: design
status: complete
created: 2026-02-21
updated: 2026-03-06
sprint: "[[Sprints/Sprint 6 - Compliance Gate]]"
tags: [design, complete]
---

# Sprint 6: Compliance Gate

Three features unlocking automotive (IATF 16949) and aerospace (AS9100) verticals: Gage R&R/MSA, short-run charts, and First Article Inspection.

## Features

- **B1**: Gage R&R / Measurement System Analysis
- **B2**: Short-Run Charts
- **B3**: First Article Inspection (AS9102 Rev C)

## Migration 033

6 new tables + 1 new column:

| Table | Purpose |
|-------|---------|
| `msa_study` | Core study definition (type, operator/part/replicate counts, tolerance) |
| `msa_operator` | Named operators within a study |
| `msa_part` | Named parts with optional reference values |
| `msa_measurement` | Individual measurement records |
| `fai_report` | AS9102 Forms 1+2 header (part accountability, product accountability) |
| `fai_item` | AS9102 Form 3 rows (characteristic inspection data) |
| `characteristic.short_run_mode` | NULL / 'deviation' / 'standardized' |

## B1: Gage R&R / MSA

### Engine Module (`core/msa/`)

Four calculation methods in `GageRREngine`:

**Crossed ANOVA** (primary method):
- Two-way ANOVA with interaction: SS decomposition into operator, part, interaction, equipment
- F-test for interaction significance (p > 0.25 -> pool with equipment)
- Variance components -> EV, AV, GRR, PV, TV
- %Contribution (variance-based, sums to 100%), %Study Variation (5.15-sigma-based)
- ndc = floor(1.41 x PV / GRR)
- AIAG verdict: <10% acceptable, 10-30% marginal, >30% unacceptable

**Range Method**: d2* constants from AIAG MSA 4th Edition Table D3, K-factor calculations

**Nested ANOVA**: For non-crossed designs (operators measure different parts)

**Attribute MSA** (`AttributeMSAEngine`):
- Within/between appraiser agreement percentages
- Cohen's Kappa (pairwise), Fleiss' Kappa (multi-rater)
- Verdict: Kappa >= 0.90 excellent, >= 0.75 acceptable, < 0.75 unacceptable

### API: 12 Endpoints

Studies CRUD (4), setup (operators/parts, 2), data collection (measurements + attribute, 3), analysis (calculate + results, 3).

### Frontend

- `MSAPage.tsx` -- Study list with status badges
- `MSAStudyWizard.tsx` -- 4-step wizard (Setup -> Data Entry -> Review -> Results)
- `MSADataGrid.tsx` -- Measurement grid with tab navigation and random order toggle
- `MSAResults.tsx` -- Variance components bar chart, %Contribution/%Study tables, interaction plot, X-bar/R chart, ndc badge
- `AttributeMSAResults.tsx` -- Kappa heatmap, agreement tables

## B2: Short-Run Charts

### Two Modes

| Mode | Transform | Center Line | Limits |
|------|-----------|-------------|--------|
| **Deviation** | Subtract target from mean | 0 | +/-3sigma from 0 |
| **Standardized** | Z = (mean - target) / (sigma/sqrt(n)) | 0 | +3 / -3 (fixed) |

Transform applied server-side in `spc_engine.py`. Frontend only changes Y-axis labels ("Deviation from Target" or "Standardized Value (Z)").

**Critical**: Standardized mode sigma must use `sigma / sqrt(n)` to match `display_value` transform. Raw sigma creates scale mismatch for subgroups > 1.

### Frontend

- `CharacteristicForm.tsx`: Short-run mode dropdown (Off / Deviation / Standardized) in Settings tab
- `ControlChart.tsx`: Y-axis label changes based on mode

## B3: First Article Inspection

### AS9102 Rev C Compliance

Three forms matching the standard:
- **Form 1** -- Part Number Accountability (part number, revision, serial, drawing, supplier, PO)
- **Form 2** -- Product Accountability (material spec, special processes, functional tests)
- **Form 3** -- Characteristic Accountability (inspection grid with balloon numbers, nominal/USL/LSL, actuals, pass/fail/deviation)

### Workflow

`draft -> submitted -> approved` (or `rejected` back to draft). Separation of duties enforced: approver must differ from submitter (via `submitted_by` column check).

### API: 12 Endpoints

Reports CRUD (5), items CRUD (3), workflow (submit/approve/reject, 3), export (AS9102 form data, 1).

### Frontend

- `FAIPage.tsx` -- Report list with status badges (Draft/Submitted/Approved/Rejected)
- `FAIReportEditor.tsx` -- 3-tab editor matching AS9102 forms
- `FAIPrintView.tsx` -- Print-ready AS9102 layout with `@media print` CSS

## Execution Model

6-wave subagent-driven development:
1. Migration + models (sequential)
2. MSA engine + short-run engine + FAI API (3 parallel)
3. MSA API (needs engine)
4. MSA frontend + short-run frontend + FAI frontend (3 parallel)
5. Navigation + routing integration
6. Skeptic review (Opus)

## Skeptic Findings (Fixed)

- 3 BLOCKERs: d2* 2D lookup for range method, Z-score sigma/sqrt(n) for subgroups, FAI separation of duties
- 5 WARNINGs fixed (negative variance clamping, Kappa edge cases, etc.)
