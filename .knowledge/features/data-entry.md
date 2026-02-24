# Data Entry

## Data Flow
```
Manual Variable Entry:
  ManualEntryPanel.tsx → useSubmitSample()
    → POST /api/v1/samples/ { characteristic_id, measurements[], batch_number, operator_id }
    → samples.py:submit_sample() → SPCEngine.process_sample()
    → SampleProcessingResult

Manual Attribute Entry:
  AttributeEntryForm.tsx → useSubmitAttributeData()
    → POST /api/v1/data-entry/submit-attribute { characteristic_id, defect_count, sample_size, ... }
    → data_entry.py → SPCEngine.process_sample() (attribute branch)

CSV/Excel Import:
  ImportWizard.tsx (4-step modal)
    1. Upload: POST /api/v1/import/upload (FormData) → {columns, preview_rows}
    2. Map columns: UI column mapping
    3. Validate: POST /api/v1/import/validate → {valid_count, error_count, errors[]}
    4. Confirm: POST /api/v1/import/confirm → {imported, skipped, errors[]}

Sample Edit:
  SampleEditModal.tsx → useUpdateSample()
    → PUT /api/v1/samples/{id} { measurements, reason, edited_by }
    → samples.py:update_sample() → re-process through SPC engine
    → SampleEditHistory created
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| Sample | db/models/sample.py | (see spc-engine.md) | 001+ |
| Measurement | db/models/sample.py | (see spc-engine.md) | 001 |
| SampleEditHistory | db/models/sample.py | id, sample_id(FK), edited_by, reason, old_values(JSON), new_values(JSON), edited_at | 006 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| POST | /api/v1/data-entry/submit | body: {characteristic_id, measurements, batch_number, operator_id} | SampleProcessingResult (201) | get_current_user |
| POST | /api/v1/data-entry/submit-attribute | body: {characteristic_id, defect_count, sample_size, units_inspected, ...} | SampleProcessingResult | get_current_user |
| POST | /api/v1/data-entry/submit-cusum | body: {characteristic_id, measurement} | SampleProcessingResult | get_current_user |
| POST | /api/v1/data-entry/submit-ewma | body: {characteristic_id, measurement} | SampleProcessingResult | get_current_user |
| POST | /api/v1/data-entry/quick-stats | body: {characteristic_id} | QuickStatsResponse | get_current_user |
| GET | /api/v1/data-entry/last-samples | characteristic_id, limit | list[SampleResponse] | get_current_user |
| GET | /api/v1/samples/ | characteristic_id, start_date, end_date, offset, limit | PaginatedResponse[SampleResponse] | get_current_user |
| POST | /api/v1/samples/ | body: SampleCreate | SampleProcessingResult (201) | get_current_user |
| GET | /api/v1/samples/{sample_id} | - | SampleResponse | get_current_user |
| PATCH | /api/v1/samples/{sample_id}/exclude | body: {excluded} | SampleResponse | get_current_user |
| DELETE | /api/v1/samples/{sample_id} | - | 204 | get_current_engineer |
| PUT | /api/v1/samples/{sample_id} | body: {measurements, reason, edited_by} | SampleProcessingResult | get_current_user |
| GET | /api/v1/samples/{sample_id}/history | - | list[SampleEditHistoryResponse] | get_current_user |
| POST | /api/v1/samples/batch | body: BatchImportRequest | BatchImportResult | get_current_engineer |
| POST | /api/v1/import/upload | FormData: file | {columns, preview_rows, row_count} | get_current_engineer |
| POST | /api/v1/import/validate | FormData: file + mapping | {valid_count, error_count, errors} | get_current_engineer |
| POST | /api/v1/import/confirm | FormData: file + mapping | {imported, skipped, errors} | get_current_engineer |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| ImportService | core/import_service.py | parse_csv(), parse_excel(), validate_mapping(), import_samples() |

### Repositories
| Class | File | Key Methods |
|-------|------|-------------|
| SampleRepository | db/repositories/sample.py | create_with_measurements, get_by_characteristic, update_measurements, get_rolling_window |

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| ManualEntryPanel | components/ManualEntryPanel.tsx | characteristicId | useSubmitSample, useCharacteristic |
| SampleInspectorModal | components/SampleInspectorModal.tsx | sampleId, open | useSample |
| SampleHistoryPanel | components/SampleHistoryPanel.tsx | characteristicId | useSamples |
| SampleEditModal | components/SampleEditModal.tsx | sampleId, open, onClose | useUpdateSample, useSampleEditHistory |
| ImportWizard | components/ImportWizard.tsx | characteristicId, open, onClose | useUploadFile, useValidateMapping, useConfirmImport |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useSubmitSample | sampleApi.submit | POST /samples/ | invalidates chartData+samples+violations |
| useSubmitAttributeData | dataEntryApi.submitAttribute | POST /data-entry/submit-attribute | invalidates chartData+samples+violations |
| useSamples | sampleApi.list | GET /samples/ | ['samples', 'list', params] |
| useSample | sampleApi.get | GET /samples/{id} | ['samples', 'detail', id] |
| useExcludeSample | sampleApi.exclude | PATCH /samples/{id}/exclude | invalidates samples+chartData |
| useDeleteSample | sampleApi.delete | DELETE /samples/{id} | invalidates samples+characteristics |
| useUpdateSample | sampleApi.update | PUT /samples/{id} | invalidates samples+editHistory+characteristics |
| useSampleEditHistory | sampleApi.getEditHistory | GET /samples/{id}/history | ['samples', 'editHistory', id] |
| useUploadFile | importApi.upload | POST /import/upload | - |
| useValidateMapping | importApi.validate | POST /import/validate | - |
| useConfirmImport | importApi.confirm | POST /import/confirm | invalidates samples+characteristics |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /data-entry | DataEntryView.tsx | ManualEntryPanel, SampleHistoryPanel, ImportWizard, AttributeEntryForm |
| /dashboard | OperatorDashboard.tsx | ManualEntryPanel (inline) |

## Migrations
- 001 (initial): sample, measurement tables
- 006 (sample_edit_history): sample_edit_history table

## Known Issues / Gotchas
- ImportWizard uses FormData for file upload; fetchApi in client.ts has special FormData handling (no Content-Type header)
- Sample edit creates SampleEditHistory and re-processes through SPC engine (recomputes violations)
- Batch import endpoint (/samples/batch) is separate from CSV import (/import/*)
