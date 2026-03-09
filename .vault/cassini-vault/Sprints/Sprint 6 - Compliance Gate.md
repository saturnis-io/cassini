---
type: sprint
status: complete
created: 2026-03-06
updated: 2026-03-06
branch: feature/sprint1-visual-impact
started: 2026-02-22
completed: 2026-02-22
features:
  - "[[Features/Gage R&R MSA]]"
  - "[[Features/Short-Run Charts]]"
  - "[[Features/First Article Inspection]]"
decisions: []
migration_range: "033"
tags:
  - sprint
  - complete
  - phase-b
  - compliance
  - automotive
  - aerospace
aliases:
  - Sprint 6
---

## Overview

Sprint 6 delivered the automotive/aerospace compliance gate -- the features required to meet IATF 16949 and AS9100 audit requirements. This included a full Gage R&R / Measurement System Analysis engine (crossed ANOVA, range, nested methods plus attribute MSA), short-run chart modes for low-volume production, and AS9102 Rev C First Article Inspection with separation-of-duties workflow. Executed via 6-wave subagent-driven development with Opus skeptic review.

## Features Delivered

- **B1 Gage R&R / MSA** ([[Features/Gage R&R MSA]])
  - `core/msa/` module: `engine.py` (~770 lines), `attribute_msa.py`, `models.py`
  - GageRREngine: crossed ANOVA, range method, nested designs
  - AttributeMSAEngine: Cohen's Kappa and Fleiss' Kappa
  - 2D d2* lookup table per AIAG MSA 4th Edition
  - 12 API endpoints for study CRUD, measurements, and results
  - MSA wizard UI + results display (5 frontend components in `components/msa/`)

- **B2 Short-Run Charts** ([[Features/Short-Run Charts]])
  - Deviation mode: subtract target from each value
  - Standardized Z-score mode: Z = (mean - target) / (sigma / sqrt(n))
  - Transform applied in `spc_engine.py`
  - CharacteristicForm dropdown for mode selection
  - ControlChart axis label updates for transformed data

- **B3 First Article Inspection** ([[Features/First Article Inspection]])
  - AS9102 Rev C Forms 1, 2, and 3
  - `FAIReport` + `FAIItem` database models
  - Draft -> Submitted -> Approved workflow
  - Separation of duties: approver cannot be submitter (enforced via `submitted_by` column)
  - 12 API endpoints for report CRUD, items, and workflow transitions
  - FAI editor + print view UI (5 frontend components in `components/fai/`)

## Key Commits

| Hash | Description |
|------|-------------|
| (10 commits) | Sprint 6 delivered across 10 commits on `feature/sprint1-visual-impact` branch |

## Migration

**Migration 033** added 6 new tables and 1 column:
- `msa_study` — study metadata, method, status
- `msa_operator` — operators in a study
- `msa_part` — parts in a study
- `msa_measurement` — individual measurements (operator x part x trial)
- `fai_report` — AS9102 report header with workflow state
- `fai_item` — individual inspection items within a report
- `characteristic.short_run_mode` column

## Codebase Impact

- **Backend models**: ~36 total (up from ~29 post Sprint 4)
- **Backend routers**: ~26 total (~200+ endpoints)
- **Backend modules**: `core/msa/` (4 files), `db/models/fai.py`, `api/v1/msa.py`, `api/v1/fai.py`
- **Frontend**: ~175 files, ~130 components, 14 pages (MSA and FAI pages added)
- **Frontend API**: 22 namespaces (msaApi 12 endpoints, faiApi 12 endpoints added)
- **Frontend components**: 5 MSA components, 5 FAI components (10 new)
- **React Query hooks**: ~100 total
- **Test seeds**: `seed_test_sprint6.py` populates MSA/FAI tables for verification

## Skeptic Review

**3 BLOCKERs fixed:**
1. d2* lookup using 1D table instead of required 2D table for range method (AIAG MSA 4th Ed requires operators x parts matrix)
2. Z-score standardized mode using raw sigma instead of sigma/sqrt(n) for subgroups > 1 -- caused scale mismatch
3. FAI approval endpoint did not enforce separation of duties (approver could be same as submitter)

**5 WARNINGs fixed** (details not itemized in source)

## Lessons Learned

- Short-run spec limits must use `sigma_xbar` (sigma / sqrt(n)) to match the display_value transform -- raw sigma creates scale mismatch for subgroups > 1
- `short_run_mode` is incompatible with attribute data or CUSUM/EWMA charts -- must validate both directions (setting short_run AND setting chart_type)
- Separation of duties requires a `submitted_by` column separate from the approval actor -- cannot rely on session user alone
- See [[Lessons/Lessons Learned]] for full cross-sprint patterns
