---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 6 - Compliance Gate]]"
tags:
  - feature
  - active
aliases:
  - Gage R&R MSA
  - Gage R&R
  - Gage R&R/MSA
---

# MSA

Measurement System Analysis (Gage R&R) implementing AIAG MSA 4th Edition methods. Supports crossed ANOVA, range method, and nested study types for variable data, plus Cohen's/Fleiss' Kappa for attribute agreement analysis. Studies track operators, parts, replicates, and compute repeatability, reproducibility, and part-to-part variance components.

## Key Backend Components

- **Engine**: `core/msa/engine.py` (~770 lines) -- `GageRREngine` with `analyze_crossed_anova()`, `analyze_range_method()`, `analyze_nested()`, 2D d2* table
- **Attribute MSA**: `core/msa/attribute_msa.py` -- `AttributeMSAEngine`, Cohen's/Fleiss' Kappa
- **Data Models**: `core/msa/models.py` -- `GageRRResult`, `ANOVARow`, `VarianceComponent` dataclasses
- **DB Models**: `MSAStudy`, `MSAOperator`, `MSAPart`, `MSAMeasurement` in `db/models/msa.py`
- **Router**: `api/v1/msa.py` -- 12 endpoints (study CRUD, operators, parts, measurements, batch, analyze, complete)
- **Migration**: 033

## Key Frontend Components

- `MSAStudyEditor.tsx` -- study creation/edit wizard
- `MSADataGrid.tsx` -- measurement data entry grid
- `MSAResults.tsx` -- variable Gage R&R results display
- `AttributeMSAResults.tsx` -- attribute agreement results
- `CharacteristicPicker.tsx` -- links study to characteristic
- Page route: `/msa`
- Hooks: `useMSAStudies`, `useMSAStudy`, `useCreateMSAStudy`, `useAnalyzeMSA`

## Connections

- Optionally linked to [[SPC Engine]] characteristics for tolerance context
- Sign-off workflows via [[Electronic Signatures]] (optional per plant)
- Audit logged via [[Admin]] middleware
- Delivered in [[Sprints/Sprint 6 - Compliance Gate]] alongside [[FAI]]

## Known Limitations

- Range method must use 2D d2* table (keyed by operators x parts), not the 1D d2 table
- MSA `created_by` FK intentionally lacks `ondelete CASCADE` -- users should be soft-deleted to preserve audit trail
- CRUD queries are inline in router (no dedicated repository)
