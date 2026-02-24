# Capability

## Data Flow
```
CapabilityCard.tsx → useCapability(charId)
  → GET /api/v1/characteristics/{id}/capability
  → capability.py:get_capability()
    → SampleRepository.get_rolling_window_data()
    → if distribution_method != "normal": calculate_capability_nonnormal()
    → else: calculate_capability() in core/capability.py
    → CapabilityResult (Cp, Cpk, Pp, Ppk, Cpm, normality)

DistributionAnalysis.tsx → useFitDistribution() + useNonNormalCapability()
  → POST /api/v1/characteristics/{id}/fit-distribution
  → distributions.py → DistributionFitter.fit_all()
  → 6 distribution families, auto-cascade
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| CapabilityHistory | db/models/capability.py | id, char_id(FK), cp, cpk, pp, ppk, cpm, sample_count, is_normal, p_value, calculated_at | 025 |
| Characteristic (dist cols) | db/models/characteristic.py | distribution_method, box_cox_lambda, distribution_params(JSON) | 032 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| GET | /api/v1/characteristics/{char_id}/capability | - | CapabilityResponse (cp, cpk, pp, ppk, cpm, normality test) | get_current_user |
| GET | /api/v1/characteristics/{char_id}/capability/history | - | list[CapabilityHistoryItem] | get_current_user |
| POST | /api/v1/characteristics/{char_id}/capability/snapshot | - | CapabilityHistoryItem (201) | get_current_engineer |
| POST | /api/v1/characteristics/{char_id}/fit-distribution | - | FitResult (families, best_fit, params) | get_current_engineer |
| POST | /api/v1/characteristics/{char_id}/nonnormal-capability | method(auto/box-cox/...) | NonNormalCapabilityResult | get_current_user |
| PUT | /api/v1/characteristics/{char_id}/distribution-config | body: {distribution_method, box_cox_lambda, distribution_params} | dict | get_current_engineer |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| capability | core/capability.py | calculate_capability(values, usl, lsl, target) -> CapabilityResult, calculate_capability_nonnormal(), save_capability_snapshot() |
| distributions | core/distributions.py | DistributionFitter (6 families: normal, lognormal, weibull, gamma, exponential, beta), fit_all(), box_cox_transform(), percentile_capability() |

### Repositories
| Class | File | Key Methods |
|-------|------|-------------|
| CapabilityRepository | db/repositories/capability.py | create, get_history_by_char_id |

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| CapabilityCard | components/capability/CapabilityCard.tsx | characteristicId | useCapability, useCapabilityHistory, useSaveCapabilitySnapshot |
| DistributionAnalysis | components/capability/DistributionAnalysis.tsx | characteristicId, open, onClose | useNonNormalCapability, useFitDistribution, useUpdateDistributionConfig |
| ReportPreview | components/ReportPreview.tsx | (capability section) | useCapability |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useCapability | capabilityApi.getCapability | GET /characteristics/{id}/capability | ['capability', 'current', charId] |
| useCapabilityHistory | capabilityApi.getHistory | GET /characteristics/{id}/capability/history | ['capability', 'history', charId] |
| useSaveCapabilitySnapshot | capabilityApi.saveSnapshot | POST /characteristics/{id}/capability/snapshot | invalidates current+history |
| useNonNormalCapability | distributionApi.calculateNonNormal | POST /characteristics/{id}/nonnormal-capability | ['nonnormal-capability', charId, method] |
| useFitDistribution | distributionApi.fitDistribution | POST /characteristics/{id}/fit-distribution | invalidates nonnormal-capability |
| useUpdateDistributionConfig | distributionApi.updateConfig | PUT /characteristics/{id}/distribution-config | invalidates nonnormal-capability+detail |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /dashboard | OperatorDashboard.tsx | CapabilityCard (in sidebar/panel) |
| /reports | ReportsView.tsx | ReportPreview (includes capability section) |

## Migrations
- 025 (add_capability_history): capability_history table
- 032 (sprint5): distribution_method, box_cox_lambda, distribution_params on characteristic

## Known Issues / Gotchas
- GET capability must dispatch to calculate_capability_nonnormal() when distribution_method is set and != "normal"
- save_capability_snapshot must also use nonnormal path when applicable
- Box-Cox Cp==Pp bug was a wrong sigma selection (fixed Sprint 5 skeptic review)
- USL must be > LSL -- validation added in Sprint 5
- Shapiro-Wilk uses random sample of max 5000 for large datasets
