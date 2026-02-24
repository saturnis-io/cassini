# MSA (Measurement System Analysis)

## Data Flow
```
MSAPage.tsx → MSAStudyEditor → useCreateMSAStudy()
  → POST /api/v1/msa/studies (create study with method, char_id, plant_id)
  → set operators → POST /studies/{id}/operators
  → set parts → POST /studies/{id}/parts
  → submit measurements → POST /studies/{id}/measurements
  → calculate → POST /studies/{id}/calculate
    → GageRREngine.calculate_crossed_anova() or .calculate_range() or .calculate_nested()
    → GageRRResult (EV, AV, GRR, PV, TV, %GRR, ndc)

MSAResults.tsx → useMSAResults(studyId)
  → GET /api/v1/msa/studies/{id}/results
  → cached results from last calculation
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| MSAStudy | db/models/msa.py | id, name, plant_id(FK), characteristic_id(FK nullable), method(crossed/range/nested/attribute), status(setup/data_collection/completed), num_operators, num_parts, num_trials, tolerance, results_json, created_at; rels: operators, parts, measurements | 033 |
| MSAOperator | db/models/msa.py | id, study_id(FK), name | 033 |
| MSAPart | db/models/msa.py | id, study_id(FK), name, reference_value | 033 |
| MSAMeasurement | db/models/msa.py | id, study_id(FK), operator_id(FK), part_id(FK), trial_number, value, attribute_result(pass/fail nullable) | 033 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| POST | /api/v1/msa/studies | body: MSAStudyCreate | MSAStudyResponse (201) | get_current_engineer |
| GET | /api/v1/msa/studies | plant_id, status | list[MSAStudyResponse] | get_current_user |
| GET | /api/v1/msa/studies/{study_id} | - | MSAStudyDetailResponse | get_current_user |
| DELETE | /api/v1/msa/studies/{study_id} | - | 204 | get_current_engineer |
| POST | /api/v1/msa/studies/{study_id}/operators | body: list[str] | list[MSAOperatorResponse] | get_current_engineer |
| POST | /api/v1/msa/studies/{study_id}/parts | body: list[{name, reference_value}] | list[MSAPartResponse] | get_current_engineer |
| POST | /api/v1/msa/studies/{study_id}/measurements | body: list[MSAMeasurementInput] | list[MSAMeasurementResponse] | get_current_engineer |
| GET | /api/v1/msa/studies/{study_id}/measurements | - | list[MSAMeasurementResponse] | get_current_user |
| POST | /api/v1/msa/studies/{study_id}/attribute-measurements | body: list[MSAAttributeInput] | list[MSAMeasurementResponse] | get_current_engineer |
| POST | /api/v1/msa/studies/{study_id}/calculate | - | GageRRResultResponse | get_current_engineer |
| POST | /api/v1/msa/studies/{study_id}/attribute-calculate | - | AttributeMSAResultResponse | get_current_engineer |
| GET | /api/v1/msa/studies/{study_id}/results | - | GageRRResultResponse or AttributeMSAResultResponse | get_current_user |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| GageRREngine | core/msa/engine.py | calculate_crossed_anova(), calculate_range(), calculate_nested(); d2_star_table (2D lookup AIAG MSA 4th Ed) |
| AttributeMSAEngine | core/msa/attribute_msa.py | calculate_cohens_kappa(), calculate_fleiss_kappa() |
| MSA models | core/msa/models.py | GageRRResult, AttributeMSAResult dataclasses |

### Repositories
No dedicated repository; direct session queries in msa.py router.

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| MSAStudyEditor | components/msa/MSAStudyEditor.tsx | studyId | useMSAStudy, useSetMSAOperators, useSetMSAParts, useSubmitMSAMeasurements, useCalculateMSA |
| MSAResults | components/msa/MSAResults.tsx | studyId | useMSAResults |
| AttributeMSAResults | components/msa/AttributeMSAResults.tsx | studyId | useMSAResults |
| MSADataGrid | components/msa/MSADataGrid.tsx | measurements, operators, parts | - |
| CharacteristicPicker (MSA) | components/msa/CharacteristicPicker.tsx | value, onChange | useCharacteristics |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useMSAStudies | msaApi.listStudies | GET /msa/studies | ['msa', 'list', plantId, status] |
| useMSAStudy | msaApi.getStudy | GET /msa/studies/{id} | ['msa', 'detail', id] |
| useMSAResults | msaApi.getResults | GET /msa/studies/{id}/results | ['msa', 'results', id] |
| useMSAMeasurements | msaApi.getMeasurements | GET /msa/studies/{id}/measurements | ['msa', 'measurements', id] |
| useCreateMSAStudy | msaApi.createStudy | POST /msa/studies | invalidates msa.all |
| useDeleteMSAStudy | msaApi.deleteStudy | DELETE /msa/studies/{id} | invalidates msa.all |
| useSetMSAOperators | msaApi.setOperators | POST /msa/studies/{id}/operators | invalidates detail |
| useSetMSAParts | msaApi.setParts | POST /msa/studies/{id}/parts | invalidates detail |
| useSubmitMSAMeasurements | msaApi.submitMeasurements | POST /msa/studies/{id}/measurements | invalidates detail+measurements |
| useCalculateMSA | msaApi.calculate | POST /msa/studies/{id}/calculate | invalidates detail+results+all |
| useSubmitMSAAttributeMeasurements | msaApi.submitAttributeMeasurements | POST /msa/studies/{id}/attribute-measurements | invalidates detail+measurements |
| useCalculateAttributeMSA | msaApi.calculateAttribute | POST /msa/studies/{id}/attribute-calculate | invalidates detail+results+all |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /msa | MSAPage.tsx | MSAStudyEditor, MSAResults, AttributeMSAResults, MSADataGrid |

## Migrations
- 033 (sprint6_compliance_gate): msa_study, msa_operator, msa_part, msa_measurement tables

## Known Issues / Gotchas
- d2* 2D lookup table for range method uses AIAG MSA 4th Edition values (fixed Sprint 6 skeptic)
- Range method must use d2* (not d2) for GRR calculation with small samples
- Attribute MSA uses Cohen's Kappa (2 operators) or Fleiss' Kappa (3+ operators)
- Study status transitions: setup -> data_collection -> completed
