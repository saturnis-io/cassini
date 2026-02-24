# SPC Engine

## Data Flow
```
ManualEntryPanel.tsx / AttributeEntryForm.tsx → useSubmitSample() / useSubmitAttributeData()
  → POST /api/v1/samples/ or POST /api/v1/data-entry/submit-attribute
  → SPCEngine.process_sample(char_id, measurements, context)
    → _validate_measurements() → _compute_sample_statistics()
    → SampleRepository.create_with_measurements()
    → RollingWindowManager.add_sample() + zone classification
    → NelsonRuleLibrary.check_all(window, enabled_rules)
    → ViolationRepository.create() → EventBus.publish(SampleProcessedEvent)
    → ProcessingResult

ControlChart.tsx → useChartData(charId)
  → GET /api/v1/characteristics/{id}/chart-data
  → characteristics.py:get_chart_data() branches on data_type/chart_type
    → variable: SampleRepository.get_rolling_window() + zone classify
    → attribute: _get_attribute_chart_data() + per-point limits
    → cusum: _get_cusum_chart_data()
    → ewma: _get_ewma_chart_data()
  → ChartDataResponse
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| Characteristic | db/models/characteristic.py | id, name, hierarchy_id(FK), subgroup_size, subgroup_mode(enum), ucl, lcl, stored_sigma, stored_center_line, data_type, chart_type, attribute_chart_type, target_value, short_run_mode, distribution_method, box_cox_lambda, distribution_params, use_laney_correction, decimal_precision; rels: rules, data_source, hierarchy | 001, 002, 003, 028, 032, 033 |
| CharacteristicRule | db/models/characteristic.py | id, char_id(FK), rule_id(1-8), is_enabled, require_acknowledgement, parameters(JSON text) | 001, 005, 032 |
| Sample | db/models/sample.py | id, char_id(FK), timestamp, actual_n, is_undersized, is_excluded, z_score, effective_ucl, effective_lcl, cusum_high, cusum_low, ewma_value, defect_count, sample_size, units_inspected, batch_number, operator_id; rels: measurements, violations | 001, 002, 023, 028 |
| Measurement | db/models/sample.py | id, sample_id(FK), value, sequence | 001 |
| SampleEditHistory | db/models/sample.py | id, sample_id(FK), edited_by, reason, old_values(JSON), new_values(JSON), edited_at | 006 |
| Violation | db/models/violation.py | id, sample_id(FK), char_id(FK denorm), rule_id, rule_name, severity(enum), acknowledged, ack_user, ack_reason, ack_timestamp, requires_acknowledgement | 001, 005, 020 |
| RulePreset | db/models/rule_preset.py | id, name, plant_id(FK nullable), rules_json, is_builtin | 032 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| GET | /api/v1/characteristics/ | hierarchy_id, provider_type, plant_id, in_control, offset, limit, page, per_page | PaginatedResponse[CharacteristicResponse] | get_current_user |
| POST | /api/v1/characteristics/ | body: CharacteristicCreate | CharacteristicResponse (201) | get_current_engineer |
| GET | /api/v1/characteristics/{char_id} | - | CharacteristicResponse | get_current_user |
| PATCH | /api/v1/characteristics/{char_id} | body: CharacteristicUpdate | CharacteristicResponse | get_current_engineer |
| DELETE | /api/v1/characteristics/{char_id} | - | 204 | get_current_engineer |
| GET | /api/v1/characteristics/{char_id}/chart-data | limit, start_date, end_date | ChartDataResponse | get_current_user |
| POST | /api/v1/characteristics/{char_id}/recalculate-limits | exclude_ooc, min_samples, start_date, end_date, last_n | {before, after, calculation} | get_current_engineer |
| POST | /api/v1/characteristics/{char_id}/set-limits | body: {ucl, lcl, center_line, sigma} | ControlLimitsResponse | get_current_engineer |
| GET | /api/v1/characteristics/{char_id}/rules | - | list[NelsonRuleConfig] | get_current_user |
| PUT | /api/v1/characteristics/{char_id}/rules | body: list[NelsonRuleConfig] | list[NelsonRuleConfig] | get_current_engineer |
| POST | /api/v1/characteristics/{char_id}/change-mode | body: {new_mode} | ChangeModeResponse | get_current_engineer |
| GET | /api/v1/rule-presets | plant_id | list[PresetResponse] | get_current_user |
| GET | /api/v1/rule-presets/{preset_id} | - | PresetResponse | get_current_user |
| POST | /api/v1/rule-presets | body: PresetCreate | PresetResponse (201) | get_current_engineer |
| PUT | /api/v1/characteristics/{char_id}/rules/preset | body: {preset_id} | dict | get_current_engineer |
| GET | /api/v1/violations/ | char_id, acknowledged, severity, plant_id, offset, limit | PaginatedResponse[ViolationResponse] | get_current_user |
| GET | /api/v1/violations/stats | plant_id | ViolationStats | get_current_user |
| GET | /api/v1/violations/reason-codes | plant_id | list[str] | get_current_user |
| GET | /api/v1/violations/{violation_id} | - | ViolationResponse | get_current_user |
| POST | /api/v1/violations/{violation_id}/acknowledge | body: {reason, user, exclude_sample} | ViolationResponse | get_current_user |
| POST | /api/v1/violations/batch-acknowledge | body: {violation_ids, reason, user, exclude_sample} | BatchAcknowledgeResult | get_current_user |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| SPCEngine | core/engine/spc_engine.py | process_sample(char_id, measurements, context) -> ProcessingResult, recalculate_limits(char_id, exclude_ooc) |
| ControlLimitService | core/engine/control_limits.py | calculate_limits(char_id, exclude_ooc, min_samples, ...) -> CalculationResult, recalculate_and_persist() |
| NelsonRuleLibrary | core/engine/nelson_rules.py | check_all(window, enabled_rules) -> list[RuleResult], check_single(), create_from_config(rule_configs), get_rule() |
| RollingWindowManager | core/engine/rolling_window.py | add_sample(), get_window(), invalidate() |
| AttributeEngine | core/engine/attribute_engine.py | calculate_attribute_limits(), calculate_laney_sigma_z(), get_per_point_limits(), get_per_point_limits_laney(), get_plotted_value() |
| CUSUMEngine | core/engine/cusum_engine.py | calculate_cusum(), cusum_limits() |
| EWMAEngine | core/engine/ewma_engine.py | calculate_ewma_limits(), estimate_sigma_from_values() |

### Repositories
| Class | File | Key Methods |
|-------|------|-------------|
| CharacteristicRepository | db/repositories/characteristic.py | get_by_id, get_with_rules, get_with_data_source, create |
| SampleRepository | db/repositories/sample.py | create_with_measurements, get_by_characteristic, get_rolling_window, get_rolling_window_data, get_attribute_rolling_window |
| ViolationRepository | db/repositories/violation.py | create, get_by_sample_ids, get_by_characteristic |

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| ControlChart | components/ControlChart.tsx | characteristicId | useChartData, useECharts, useAnnotations |
| CUSUMChart | components/CUSUMChart.tsx | characteristicId | useChartData, useECharts |
| EWMAChart | components/EWMAChart.tsx | characteristicId | useChartData, useECharts |
| AttributeChart | components/AttributeChart.tsx | characteristicId | useChartData, useECharts |
| AttributeEntryForm | components/AttributeEntryForm.tsx | characteristicId, onSubmit | useSubmitAttributeData |
| ChartPanel | components/ChartPanel.tsx | characteristicId | useChartData, useCharacteristic |
| ChartToolbar | components/ChartToolbar.tsx | charId, onRecalculate | useRecalculateLimits, useSetManualLimits |
| DualChartPanel | components/charts/DualChartPanel.tsx | characteristicId | useChartData |
| RangeChart | components/charts/RangeChart.tsx | data, limits | useECharts |
| BoxWhiskerChart | components/charts/BoxWhiskerChart.tsx | data | useECharts |
| ChartTypeSelector | components/charts/ChartTypeSelector.tsx | value, onChange | - |
| RulesTab | components/characteristic-config/RulesTab.tsx | charId | useNelsonRules, useUpdateNelsonRules, useRulePresets, useApplyPreset |
| LimitsTab | components/characteristic-config/LimitsTab.tsx | charId | useRecalculateLimits, useSetManualLimits |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useCharacteristics | characteristicApi.list | GET /characteristics/ | ['characteristics', 'list', params] |
| useCharacteristic | characteristicApi.get | GET /characteristics/{id} | ['characteristics', 'detail', id] |
| useChartData | characteristicApi.getChartData | GET /characteristics/{id}/chart-data | ['characteristics', 'chartData', id, {limit,startDate,endDate}] |
| useCreateCharacteristic | characteristicApi.create | POST /characteristics/ | invalidates list+hierarchy |
| useUpdateCharacteristic | characteristicApi.update | PATCH /characteristics/{id} | invalidates detail+list+chartData |
| useDeleteCharacteristic | characteristicApi.delete | DELETE /characteristics/{id} | invalidates all |
| useRecalculateLimits | characteristicApi.recalculateLimits | POST /characteristics/{id}/recalculate-limits | invalidates detail+chartData |
| useSetManualLimits | characteristicApi.setManualLimits | POST /characteristics/{id}/set-limits | invalidates detail+chartData |
| useChangeMode | characteristicApi.changeMode | POST /characteristics/{id}/change-mode | invalidates detail+chartData+samples |
| useNelsonRules | characteristicApi.getRules | GET /characteristics/{id}/rules | ['characteristics', 'rules', id] |
| useUpdateNelsonRules | characteristicApi.updateRules | PUT /characteristics/{id}/rules | invalidates rules |
| useSubmitSample | sampleApi.submit | POST /samples/ | invalidates chartData+samples+violations |
| useSubmitAttributeData | dataEntryApi.submitAttribute | POST /data-entry/submit-attribute | invalidates chartData+samples+violations |
| useViolations | violationApi.list | GET /violations/ | ['violations', 'list', params] |
| useViolationStats | violationApi.getStats | GET /violations/stats | ['violations', 'stats'] (45s poll) |
| useAcknowledgeViolation | violationApi.acknowledge | POST /violations/{id}/acknowledge | invalidates violations+characteristics |
| useBatchAcknowledgeViolation | violationApi.batchAcknowledge | POST /violations/batch-acknowledge | invalidates violations+characteristics |
| useRulePresets | rulePresetApi.list | GET /rule-presets | ['rule-presets', plantId] |
| useApplyPreset | rulePresetApi.applyToCharacteristic | PUT /characteristics/{id}/rules/preset | invalidates detail+rules |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /dashboard | OperatorDashboard.tsx | ChartPanel, ControlChart, CUSUMChart, EWMAChart, AttributeChart, DualChartPanel, ChartToolbar, ManualEntryPanel |
| /violations | ViolationsView.tsx | ViolationLegend, BulkAcknowledgeDialog |
| /configuration | ConfigurationView.tsx | CharacteristicConfigTabs (RulesTab, LimitsTab, SamplingTab, GeneralTab) |

## Migrations
- 001 (initial_schema): characteristic, characteristic_rule, sample, measurement, violation tables
- 002 (add_subgroup_modes): subgroup_mode enum, actual_n, is_undersized, z_score, effective_ucl/lcl on sample
- 005 (require_acknowledgement): require_acknowledgement on characteristic_rule
- 006 (sample_edit_history): sample_edit_history table
- 020 (schema_hardening): violation.char_id denormalized, CASCADE FKs, composite indexes
- 023 (attribute_columns): defect_count, sample_size, units_inspected, attribute_chart_type, default_sample_size
- 028 (cusum_ewma): cusum_high/low, ewma_value on sample; cusum_*/ewma_* on characteristic
- 032 (sprint5_statistical_credibility): distribution_method, box_cox_lambda, distribution_params, use_laney_correction, parameters on rules, rule_preset table
- 033 (sprint6_compliance_gate): short_run_mode on characteristic

## Known Issues / Gotchas
- TODO: Make DEFAULT_LIMIT_WINDOW_SIZE (100) configurable per-characteristic (spc_engine.py:34)
- TODO: Consider soft-delete for characteristics (characteristics.py:337)
- Short-run zone classification uses raw zones not transformed zones (audit finding, low priority)
- DualChartPanel client-side stats may diverge from backend (audit finding, low priority)
- Attribute Nelson rules: backend intersects with {1,2,3,4} -- rules 5-8 silently ignored. RulesTab must filter display by dataType
- useUpdateCharacteristic MUST invalidate chartData with key prefix ['characteristics', 'chartData', id] (not detail key)
- CharacteristicForm onChange type must be (field: string, value: string | boolean) for checkbox fields
- Short-run spec limits must use sigma_xbar = sigma/sqrt(n) to match display_value transform
- Backend validates short_run_mode incompatible with attribute data or CUSUM/EWMA
- Custom rule params not applied unless create_from_config() called in process_sample (fixed Sprint 5)
