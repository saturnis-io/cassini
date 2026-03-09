---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-06
sprint: "[[Sprints/Sprint 1 - Visual Impact]]"
tags:
  - feature
  - active
aliases:
  - CSV Import
  - Manual Data Entry
---

# Data Entry

Manual data entry, CSV/Excel import, sample editing, and sample inspection. Supports both variable (measurements) and attribute (defect count/sample size) data entry. Includes edit history tracking with reason codes, sample exclusion for limit recalculation, and a 4-step import wizard with column mapping and validation.

## Key Backend Components

- **Import Service**: `core/import_service.py` -- `parse_file()` (CSV/Excel), `validate_mapping()`, `import_samples()`
- **SPC Engine**: `core/engine/spc_engine.py` -- `process_sample()` called by both manual entry and import
- **Models**: `Sample`, `Measurement`, `SampleEditHistory` in `db/models/sample.py`
- **Router**: `api/v1/data_entry.py` (submit, submit-attribute), `api/v1/samples.py` (CRUD, exclude), `api/v1/import_router.py` (upload, validate, confirm)
- **Repository**: `db/repositories/sample.py`
- **Migration**: 001

## Key Frontend Components

- `ManualEntryPanel.tsx` -- measurement value entry form
- `ImportWizard.tsx` -- 4-step modal (upload, map columns, validate, confirm)
- `SampleInspectorModal.tsx` -- detailed sample view with measurements, violations, annotations, edit history
- `SampleEditModal.tsx` -- edit sample values with required reason
- `SampleHistoryPanel.tsx` -- scrollable sample list
- Hooks: `useSubmitSample`, `useSubmitAttributeSample`, `useEditSample`, `useUploadImport`, `useConfirmImport`

## Connections

- Submits data to [[SPC Engine]] for processing and violation detection
- Attribute entry feeds [[SPC Engine]] attribute charts (p/np/c/u)
- Sample data used by [[Capability]] for index calculation
- Edit history contributes to [[Admin]] audit trail
- Also receives data from [[Connectivity]] providers (not through this UI)

## Known Limitations

- `fetchApi` must not set `Content-Type` header for `FormData` uploads (browser sets multipart boundary)
- Sample edits create `SampleEditHistory` records and set `is_modified=true` on the sample
- Import wizard uses temporary server-side storage between upload and confirm steps
