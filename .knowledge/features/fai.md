# FAI (First Article Inspection)

## Data Flow
```
FAIPage.tsx → FAIReportEditor → useCreateFAIReport()
  → POST /api/v1/fai/reports (create draft report)
  → add items → POST /reports/{id}/items
  → edit items → PUT /reports/{id}/items/{itemId}
  → submit → POST /reports/{id}/submit (draft→submitted)
  → approve → POST /reports/{id}/approve (submitted→approved, separation of duties check)
  → reject → POST /reports/{id}/reject (submitted→rejected→draft)
  → print → GET /reports/{id}/forms → AS9102 Forms 1/2/3

FAIPrintView.tsx → useFAIReport(reportId)
  → GET /api/v1/fai/reports/{id} (detail with items)
  → AS9102 Rev C Forms 1 (Part Info), 2 (Product Accountability), 3 (Characteristic Accountability)
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| FAIReport | db/models/fai.py | id, plant_id(FK), part_number, part_name, revision, drawing_number, serial_number, status(draft/submitted/approved/rejected), submitted_by(FK nullable), approved_by(FK nullable), rejection_reason, created_at, updated_at; rels: items | 033 |
| FAIItem | db/models/fai.py | id, report_id(FK), sequence_number, characteristic_name, nominal, usl, lsl, actual_value, unit_of_measure, result(conforming/nonconforming/not_inspected), notes, balloon_number | 033 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| POST | /api/v1/fai/reports | body: FAIReportCreate | FAIReportResponse (201) | get_current_engineer |
| GET | /api/v1/fai/reports | plant_id, status | list[FAIReportResponse] | get_current_user |
| GET | /api/v1/fai/reports/{report_id} | - | FAIReportDetailResponse (with items) | get_current_user |
| PUT | /api/v1/fai/reports/{report_id} | body: FAIReportUpdate | FAIReportResponse | get_current_engineer |
| DELETE | /api/v1/fai/reports/{report_id} | - | 204 | get_current_engineer |
| POST | /api/v1/fai/reports/{report_id}/items | body: list[FAIItemCreate] | list[FAIItemResponse] (201) | get_current_engineer |
| PUT | /api/v1/fai/reports/{report_id}/items/{item_id} | body: FAIItemUpdate | FAIItemResponse | get_current_engineer |
| DELETE | /api/v1/fai/reports/{report_id}/items/{item_id} | - | 204 | get_current_engineer |
| POST | /api/v1/fai/reports/{report_id}/submit | - | FAIReportResponse | get_current_engineer |
| POST | /api/v1/fai/reports/{report_id}/approve | - | FAIReportResponse | get_current_engineer |
| POST | /api/v1/fai/reports/{report_id}/reject | body: {reason} | FAIReportResponse | get_current_engineer |
| GET | /api/v1/fai/reports/{report_id}/forms | - | AS9102 Forms 1/2/3 JSON | get_current_user |

### Services
No dedicated service module; logic in fai.py router directly.

### Repositories
No dedicated repository; direct session queries in fai.py router.

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| FAIReportEditor | components/fai/FAIReportEditor.tsx | reportId | useFAIReport, useUpdateFAIReport, useAddFAIItem, useUpdateFAIItem, useDeleteFAIItem, useSubmitFAIReport |
| FAIForm1 | components/fai/FAIForm1.tsx | report | - |
| FAIForm2 | components/fai/FAIForm2.tsx | report | - |
| FAIForm3 | components/fai/FAIForm3.tsx | report, items | - |
| FAIPrintView | components/fai/FAIPrintView.tsx | reportId | useFAIReport |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useFAIReports | faiApi.listReports | GET /fai/reports | ['fai', 'list', params] |
| useFAIReport | faiApi.getReport | GET /fai/reports/{id} | ['fai', 'detail', id] |
| useCreateFAIReport | faiApi.createReport | POST /fai/reports | invalidates fai.all |
| useUpdateFAIReport | faiApi.updateReport | PUT /fai/reports/{id} | invalidates detail+list |
| useDeleteFAIReport | faiApi.deleteReport | DELETE /fai/reports/{id} | invalidates fai.all |
| useAddFAIItem | faiApi.addItem | POST /fai/reports/{id}/items | invalidates detail |
| useUpdateFAIItem | faiApi.updateItem | PUT /fai/reports/{id}/items/{itemId} | invalidates detail |
| useDeleteFAIItem | faiApi.deleteItem | DELETE /fai/reports/{id}/items/{itemId} | invalidates detail |
| useSubmitFAIReport | faiApi.submit | POST /fai/reports/{id}/submit | invalidates detail+list |
| useApproveFAIReport | faiApi.approve | POST /fai/reports/{id}/approve | invalidates detail+list |
| useRejectFAIReport | faiApi.reject | POST /fai/reports/{id}/reject | invalidates detail+list |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /fai | FAIPage.tsx | FAIReportEditor, FAIPrintView, FAIForm1, FAIForm2, FAIForm3 |

## Migrations
- 033 (sprint6_compliance_gate): fai_report, fai_item tables

## Known Issues / Gotchas
- Separation of duties: approver != submitter enforced via submitted_by column (fixed Sprint 6 skeptic)
- AS9102 Rev C compliance: Forms 1 (Part Number Accountability), 2 (Product Accountability/Raw Material), 3 (Characteristic Accountability)
- Status transitions: draft -> submitted -> approved/rejected; rejected -> draft (re-submit)
- Only draft reports can be edited; submitted/approved are immutable
