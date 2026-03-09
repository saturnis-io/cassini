---
type: feature
status: active
created: 2026-03-06
updated: 2026-03-08
sprint: "[[Sprints/Sprint 1 - Visual Impact]]"
tags:
  - feature
  - active
aliases:
  - Charts
  - Control Charts
  - Attribute Charts
  - CUSUM EWMA
---

# SPC Engine

The core statistical process control engine. Processes incoming samples, calculates control limits (X-bar/R, X-bar/S, I-MR, CUSUM, EWMA), evaluates Nelson rules for out-of-control conditions, and generates violations. Supports both variable and attribute (p/np/c/u) chart types, short-run modes (deviation, Z-score), and Laney p'/u' corrections.

## Key Backend Components

- **SPC Engine**: `backend/src/cassini/core/engine/spc_engine.py` -- `process_sample()` orchestrates limit check + Nelson rules
- **Control Limits**: `core/engine/control_limits.py` -- `calculate_limits()`, `recalculate_and_persist()`
- **Nelson Rules**: `core/engine/nelson_rules.py` -- `NelsonRuleLibrary` with all 8 parameterized rules, `create_from_config()`
- **Attribute Engine**: `core/engine/attribute_engine.py` -- p/np/c/u limits, Laney sigma-Z, per-point limits
- **CUSUM/EWMA**: `core/engine/cusum_engine.py`, `core/engine/ewma_engine.py`
- **Models**: `Characteristic`, `Sample`, `Measurement`, `Violation`, `CharacteristicRule`, `RulePreset`
- **Router**: `api/v1/characteristics.py` -- ~20 endpoints (CRUD, chart-data, recalculate, rules, presets, violations, annotations)
- **Migrations**: 001, 020, 023, 032

## Key Frontend Components

- `ControlChart.tsx`, `CUSUMChart.tsx`, `EWMAChart.tsx`, `AttributeChart.tsx` -- main chart renderers
- `ChartPanel.tsx`, `ChartToolbar.tsx` -- chart container and toolbar with recalculate/export actions
- `DualChartPanel.tsx`, `RangeChart.tsx`, `BoxWhiskerChart.tsx` -- companion charts
- `AttributeEntryForm.tsx` -- defect/defective data entry for attribute charts
- Hooks: `useCharacteristicChartData`, `useRecalculateLimits`, `useNelsonRules`, `useRulePresets`

## Connections

- Feeds into [[Capability]] (samples used for Cp/Cpk/Pp/Ppk calculation)
- Triggers [[Anomaly Detection]] via Event Bus (`SampleProcessedEvent`)
- Triggers [[Notifications]] via Event Bus (`ViolationCreatedEvent`)
- Data enters via [[Data Entry]] (manual) or [[Connectivity]] (MQTT/OPC-UA/Gage)
- Rule presets and chart config editable by engineers per [[Auth]] role hierarchy
- All mutations logged by [[Admin]] audit middleware
- Displayed on Operator Dashboard (`/` route)

## Material-Aware SPC (2026-03-08)

All SPC paths now resolve material-specific limit overrides via `MaterialResolver`:

- **Resolution cascade**: material override > deepest class > parent class > root class > characteristic default
- **Affected paths**: Shewhart chart data, CUSUM chart data + engine, EWMA chart data + engine, attribute chart data + engine, capability calculations, explain API
- **Rolling window**: Cache key changed from `int` (char_id) to `tuple[int, int | None]` (char_id, material_id) to prevent Nelson Rule cross-contamination across materials
- **Data entry**: All 5 submission endpoints (`/submit`, `/batch`, `/submit-cusum`, `/submit-ewma`, `/submit-attribute`) accept `material_id` and thread it to engines
- **Capability + Explain**: Both resolve `usl`, `lsl`, `target_value`, `stored_sigma` from material overrides before computing indices

Key files changed: `rolling_window.py`, `spc_engine.py`, `cusum_engine.py`, `ewma_engine.py`, `attribute_engine.py`, `characteristics.py`, `capability.py`, `explain.py`, `data_entry.py`, `samples.py`

## Known Limitations

- `DEFAULT_LIMIT_WINDOW_SIZE` hardcoded to 100 (TODO: make configurable per-characteristic)
- Attribute Nelson rules limited to {1,2,3,4} -- rules 5-8 silently ignored
- `short_run_mode` incompatible with attribute data or CUSUM/EWMA
- `use_laney_correction` only valid for p/u charts
- ECharts container div must always be in DOM (use `visibility: hidden`, not conditional rendering)

See also: [[Architecture/System Overview]], [[Lessons/Lessons Learned]]
