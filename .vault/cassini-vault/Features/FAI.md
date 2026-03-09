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
  - First Article Inspection
  - FAI Inspection
---

# FAI

First Article Inspection per AS9102 Rev C. Supports Forms 1 (Part Number Accountability), 2 (Product Accountability), and 3 (Characteristic Accountability). Implements a draft -> submitted -> approved/rejected workflow with separation of duties enforcement (approver cannot be the same user as submitter).

## Key Backend Components

- **Models**: `FAIReport`, `FAIItem` in `db/models/fai.py`
- **Router**: `api/v1/fai.py` -- 12 endpoints (report CRUD, items CRUD, submit, approve, reject, clone)
- **Workflow**: Inline in router -- `draft -> submitted -> approved/rejected` state machine
- **Migration**: 033

## Key Frontend Components

- `FAIReportEditor.tsx` -- report creation and metadata editing
- `FAIForm1.tsx`, `FAIForm2.tsx`, `FAIForm3.tsx` -- AS9102 form sections
- `FAIPrintView.tsx` -- print-ready report view
- Page route: `/fai`
- Hooks: `useFAIReports`, `useFAIReport`, `useCreateFAIReport`, `useSubmitFAI`, `useApproveFAI`

## Connections

- FAI items optionally link to [[SPC Engine]] characteristics for actual value comparison
- Approval workflow integrable with [[Electronic Signatures]]
- Audit trail via [[Admin]] middleware
- Delivered in [[Sprints/Sprint 6 - Compliance Gate]] alongside [[MSA]]

## Known Limitations

- Separation of duties: `approved_by` must differ from `submitted_by` (enforced in router)
- `created_by`/`submitted_by`/`approved_by` FKs intentionally lack `ondelete CASCADE` -- preserve audit trail
- CRUD queries are inline in router (no dedicated repository)
- Clone endpoint creates a new draft from an existing report for re-inspection
