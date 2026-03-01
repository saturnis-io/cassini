# Feature: Characteristic Configuration

## What It Does

A characteristic is a measurable quality attribute -- the fundamental entity in SPC. Every control chart, sample, violation, capability index, and Nelson rule evaluation hangs off a characteristic. The characteristic configuration determines:

- **Chart type**: Which control chart to use (X-bar-R, I-MR, p, np, c, u, CUSUM, EWMA)
- **Specification limits**: USL, LSL, and Target -- required for capability analysis (Cp, Cpk, Pp, Ppk)
- **Control limits**: UCL, CL, LCL -- auto-calculated from data or manually overridden
- **Nelson rules**: Which special cause detection rules are active (1-8), with configurable parameters
- **Sampling plan**: Subgroup size, sampling frequency, minimum measurements
- **Advanced options**: Short-run mode, distribution method, Laney correction

Configuration is performed by engineers or above on the Configuration page (`/configuration`).

## Where To Find It

| Function | Location | Role Required |
|---|---|---|
| Characteristic CRUD | Configuration page (`/configuration`) -- tree panel + config tabs | Engineer+ |
| Config tabs | Right panel when a characteristic is selected | Engineer+ to edit |
| Limits tab | Specification and control limits | Engineer+ |
| Rules tab | Nelson rule configuration and presets | Engineer+ |
| Sampling tab | Subgroup size and sampling plan | Engineer+ |
| Chart type | Set during characteristic creation or via PATCH update | Engineer+ |

## Key Concepts (Six Sigma Context)

### Chart Type Selection

Chart type selection is the first and most consequential decision in SPC configuration. The wrong chart produces meaningless limits and false signals.

| Chart Type | Data Type | Use When | Subgroup Size | Six Sigma Context |
|---|---|---|---|---|
| **X-bar-R** | Variable | Subgroup size 2-10 (most common: 5) | 2-10 | Workhorse chart for process monitoring. Uses A2, D3, D4 constants. |
| **X-bar-S** | Variable | Subgroup size > 10 | >10 | Uses A3, B3, B4 constants. More efficient for large subgroups. |
| **I-MR** | Variable | Individual measurements (subgroup = 1) | 1 | For destructive testing, batch processes, or slow production. Uses E2=2.660. |
| **p-chart** | Attribute | Proportion defective, variable sample size | Varies | Fraction nonconforming. Limits vary per subgroup if sample size changes. |
| **np-chart** | Attribute | Number defective, fixed sample size | Fixed | Count of nonconforming units. Simpler than p when sample size is constant. |
| **c-chart** | Attribute | Defect count per inspection unit, fixed area | Fixed | Defects per unit (Poisson model). For scratch counts, weld defects, etc. |
| **u-chart** | Attribute | Defect rate, variable inspection area | Varies | Defects per unit with varying sample size. Variable limits like p-chart. |
| **CUSUM** | Variable | Detect small sustained shifts | 1 | Cumulative sum. More sensitive to small shifts than Shewhart charts. Uses k (slack) and h (decision interval). |
| **EWMA** | Variable | Detect small shifts, robust to non-normality | 1 | Exponentially weighted moving average. Uses lambda (smoothing, typical 0.2) and L (limit multiplier, typical 2.7). |

### Specification Limits vs. Control Limits

This distinction is critical and frequently confused:

- **Specification Limits (USL/LSL)**: Defined by the customer or engineering drawing. These are *requirements*. They do not change based on process data. Set in the Limits tab.
- **Control Limits (UCL/CL/LCL)**: Calculated from process data using statistical formulas. These are *the voice of the process*. They tell you what the process *is* doing, not what it *should* do.
- **Target**: The nominal/ideal value. Usually the midpoint between USL and LSL but can be offset for one-sided specifications.

A process can be in statistical control (within control limits) but not capable (exceeding spec limits), or vice versa. Capability indices (Cp, Cpk) measure the relationship between the two.

### Nelson Rules

Nelson rules detect non-random patterns (special cause variation) on control charts:

| Rule | Description | Default Window |
|---|---|---|
| 1 | One point beyond 3-sigma | 1 point |
| 2 | N points in a row on same side of center line | 9 consecutive |
| 3 | N points in a row, all increasing or decreasing | 6 consecutive |
| 4 | N points in a row, alternating up and down | 14 consecutive |
| 5 | M of N points beyond 2-sigma on same side | 2 of 3 |
| 6 | M of N points beyond 1-sigma on same side | 4 of 5 |
| 7 | N points in a row within 1-sigma of center line | 15 consecutive |
| 8 | N points in a row beyond 1-sigma (either side) | 8 consecutive |

**Rule Presets**: Pre-configured sets of rules for different standards:
- **Nelson**: All 8 rules enabled (comprehensive)
- **AIAG**: Rules 1-4 only (automotive industry standard, per AIAG SPC Manual)
- **WECO**: Western Electric rules 1-4 (original Bell Labs rules)
- **Wheeler**: Rules 1-4 (Donald Wheeler's recommended set)

For **attribute charts**, only rules 1-4 are applicable. Rules 5-8 require zone calculations that depend on normal distribution assumptions.

### Short-Run Modes

For mixed-part production or low-volume manufacturing where a single characteristic may track multiple part numbers:

- **Deviation Mode**: Subtracts the target value from each measurement. Chart Y-axis shows deviation from nominal. Used when parts share the same variability but different targets.
- **Z-Score (Standardized) Mode**: Transforms values to Z = (X-bar - Target) / (sigma / sqrt(n)). Fully standardized, dimensionless. The most rigorous short-run approach. Important: uses sigma/sqrt(n) for subgroups > 1 to match the standard error of the mean.

Short-run mode is **incompatible** with attribute data and with CUSUM/EWMA chart types.

### Distribution Method

For non-normal data, capability analysis can use alternative distributions:

- **Normal** (default): Standard Cp/Cpk formulas
- **Lognormal**: For right-skewed data (cycle times, concentrations)
- **Weibull**: For reliability data, failure times
- **Gamma**: For wait times, positive-skewed counts
- **Exponential**: Memoryless processes
- **Box-Cox**: Automatic power transformation to normality

Set via the distribution analysis modal in the capability section.

### Laney Correction (p'/u' charts)

For attribute charts with large sample sizes where overdispersion is present (variation exceeds the binomial/Poisson model), the Laney correction adjusts control limits using a sigma-Z multiplier. This prevents excessive false alarms on high-volume processes. The sigma-Z badge appears on the chart when enabled.

Only available for p-charts (Laney p') and u-charts (Laney u').

## How To Configure (Step-by-Step)

### Creating a Characteristic

1. Navigate to **Configuration** (`/configuration`).
2. In the hierarchy tree (left panel), select the station (parent node) under which the characteristic belongs.
3. Click the "Add Characteristic" button or right-click > "Add Characteristic".
4. Fill in creation fields:
   - **Name**: Descriptive name (e.g., "Bore Diameter", "Surface Roughness Ra")
   - **Data Type**: Variable (continuous measurements) or Attribute (pass/fail, defect counts)
   - **Chart Type**: For variable data, this is determined by subgroup size (X-bar-R for n>=2, I-MR for n=1) or explicitly set to CUSUM/EWMA. For attribute data, select p/np/c/u.
   - **Subgroup Size**: Number of measurements per sample. Determines control limit constants.
   - **Attribute Chart Type** (if attribute): p, np, c, or u
5. Click **Create**. The characteristic appears as a leaf node in the tree.

### Setting Specification Limits (Limits Tab)

1. Select the characteristic in the tree.
2. Open the **Limits** tab in the right panel.
3. Enter:
   - **USL** (Upper Specification Limit): e.g., 10.05
   - **LSL** (Lower Specification Limit): e.g., 9.95
   - **Target**: e.g., 10.00 (typically midpoint)
4. Click **Save**.
5. Spec limits are required for capability analysis (Cp, Cpk, Pp, Ppk). Without them, capability cards show "N/A".

### Setting Manual Control Limits (Limits Tab)

1. In the Limits tab, toggle **Manual Control Limits** on.
2. Enter:
   - **UCL**: Upper Control Limit
   - **CL**: Center Line
   - **LCL**: Lower Control Limit
3. Click **Save**.
4. Manual limits override the auto-calculated limits from data. Useful for frozen limits or when starting with historical values.

### Configuring Nelson Rules (Rules Tab)

1. Select the characteristic.
2. Open the **Rules** tab.
3. Option A -- use a preset:
   - Select from dropdown: Nelson, AIAG, WECO, or Wheeler.
   - Click **Apply Preset**. Rules are updated to match the preset configuration.
4. Option B -- manual configuration:
   - Toggle individual rules on/off using checkboxes.
   - For rules with parameters (e.g., Rule 2 window size), click to edit and enter custom values.
5. Option C -- save custom preset:
   - Configure rules as desired.
   - Click **Save as Preset**, enter a name and optional description.
   - Custom presets are plant-scoped and reusable.

### Enabling Short-Run Mode

1. Select the characteristic (must be variable data, not CUSUM/EWMA).
2. In the characteristic config, select **Short-Run Mode**: Deviation or Standardized (Z-score).
3. Ensure a **Target** value is set (required for both modes).
4. Save. The chart axis labels change to reflect the transformation mode.

### Enabling Laney Correction

1. Select a p-chart or u-chart characteristic.
2. In the configuration, check **Use Laney Correction** (or "Laney p'" / "Laney u'" option).
3. Save. The sigma-Z (sigma_z) badge appears on the chart indicating the correction factor.
4. Control limits are recalculated using the Laney-adjusted sigma.

### Setting Distribution Method

1. Select the characteristic.
2. Open the capability section or distribution analysis modal.
3. Select a distribution method: Normal, Lognormal, Weibull, Gamma, Exponential, or Box-Cox.
4. Save. Capability calculations use the selected distribution's percentile-based method instead of standard normal formulas.

## How To Use (Typical Workflow)

1. **Engineer sets up**: Creates characteristics with correct chart type and subgroup size. Sets spec limits from engineering drawings.
2. **Engineer configures rules**: Selects AIAG preset for automotive parts, or Nelson preset for comprehensive monitoring.
3. **Data collection begins**: Operators enter data (manual) or data flows from connected gages/MQTT. Control limits auto-calculate after sufficient data (typically 20-25 subgroups).
4. **Monitor**: Operators and supervisors view control charts on the dashboard. Nelson rule violations appear as markers on the chart and in the violations list.
5. **Capability assessment**: Engineers review Cp/Cpk/Pp/Ppk on the capability card. Values depend on spec limits and process data.
6. **Iterate**: If the process is not capable, engineers investigate root causes using the DMAIC methodology, adjust process parameters, and verify improvement on the chart.

## Acceptance Criteria (OQ-Style)

| # | Criterion | Verification Method |
|---|---|---|
| 1 | All 9 chart types can be created (X-bar-R, X-bar-S, I-MR, p, np, c, u, CUSUM, EWMA) | UI: create each type, verify config panel |
| 2 | Subgroup size correctly maps to chart type constants | API: create with subgroup 5, verify A2/D3/D4 used |
| 3 | Spec limits (USL/LSL/Target) save and persist on refresh | UI: set limits, refresh page, verify values |
| 4 | Manual control limits override auto-calculated limits | UI: set manual UCL/CL/LCL, verify chart uses them |
| 5 | Control limits auto-calculate from data | API: submit 25 subgroups, GET limits, verify non-null |
| 6 | Nelson rules configurable per characteristic | UI: enable/disable individual rules, save, verify |
| 7 | Rule presets apply correctly (Nelson, AIAG, WECO, Wheeler) | UI: apply each preset, verify rule states |
| 8 | Custom rule parameters editable (e.g., Rule 2 window) | UI: change window from 9 to 7, save, verify |
| 9 | Custom presets can be saved and reused | UI: save preset, apply to another characteristic |
| 10 | Short-run deviation mode changes chart display | UI: enable deviation, verify axis labels |
| 11 | Short-run Z-score mode standardizes values | UI: enable Z-score, verify standardized values |
| 12 | Laney correction shows sigma-Z badge | UI: enable on p-chart, verify badge |
| 13 | Distribution method saves and affects capability | UI: set lognormal, verify capability uses it |
| 14 | Characteristic can be deleted | UI: delete, verify removed from tree |
| 15 | Deleting characteristic removes all associated data | API: verify samples/violations cascade |
| 16 | CUSUM-specific config (target, k, h) saves correctly | UI: set CUSUM params, verify persisted |
| 17 | EWMA-specific config (lambda, L) saves correctly | UI: set EWMA params, verify persisted |
| 18 | Attribute chart type selection (p/np/c/u) works | UI: create each type, verify config |
| 19 | Short-run mode blocked for attribute data | API: attempt set, verify 400 error |
| 20 | Short-run mode blocked for CUSUM/EWMA | API: attempt set, verify 400 error |

## Edge Cases & Constraints

- **Subgroup size and chart type**: X-bar-R requires subgroup size >= 2 (typically 2-10). X-bar-S is preferred for subgroup > 10. I-MR forces subgroup size = 1. CUSUM/EWMA typically use subgroup size = 1.
- **Attribute chart restrictions**: Attribute characteristics (p/np/c/u) cannot use short-run mode, CUSUM, or EWMA. Nelson rules 5-8 are silently ignored for attribute charts.
- **Laney correction scope**: Only valid for p-charts and u-charts. The `use_laney_correction` flag is ignored for other chart types.
- **Short-run prerequisites**: Both modes require a target value to be set. Deviation mode subtracts target; Z-score mode requires both target and sigma.
- **USL must exceed LSL**: The system should validate that USL > LSL when both are provided. One-sided specifications (only USL or only LSL) are valid.
- **Control limit recalculation**: Changing subgroup size or chart type requires control limit recalculation. Existing data may need to be re-evaluated.
- **Custom rule parameter bounds**: Rule parameters have practical limits (e.g., Rule 2 window size must be >= 2, Rule 5 requires M < N). The API validates these bounds.
- **Decimal precision**: Configurable 0-10 decimal places. Affects display only, not stored values.
- **min_measurements vs subgroup_size**: `min_measurements` cannot exceed `subgroup_size`. Controls how many measurements are required before a subgroup is considered complete.
- **Distribution method and Box-Cox**: Box-Cox automatically finds the best lambda transformation. The fitted lambda is stored on the characteristic for reproducibility.
- **Rule preset builtin flag**: Built-in presets (Nelson, AIAG, WECO, Wheeler) are seeded at migration time and cannot be deleted. Custom presets can be deleted.

## API Reference (for seeding)

### Characteristics

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/characteristics` | Engineer+ | Create characteristic. Body: `{hierarchy_id, name, subgroup_size, data_type, chart_type?, attribute_chart_type?, ...}` |
| `GET` | `/characteristics/{id}` | User | Get characteristic by ID |
| `PATCH` | `/characteristics/{id}` | Engineer+ | Partial update. Body: any subset of fields |
| `DELETE` | `/characteristics/{id}` | Engineer+ | Delete characteristic and all associated data |
| `GET` | `/characteristics/{id}/chart-data` | User | Get chart data with control limits |

### Limits

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `PUT` | `/characteristics/{id}/limits` | Engineer+ | Set spec and/or control limits. Body: `{usl?, lsl?, target?, ucl?, cl?, lcl?}` |
| `POST` | `/characteristics/{id}/recalculate-limits` | Engineer+ | Recalculate control limits from data |

### Nelson Rules

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/characteristics/{id}/rules` | User | Get current rule configuration |
| `PUT` | `/characteristics/{id}/rules` | Engineer+ | Update rules. Body: list of `{rule_id, is_enabled, parameters?}` |
| `PUT` | `/characteristics/{id}/rules/preset` | Engineer+ | Apply a preset. Body: `{preset_id}` |

### Rule Presets

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/rule-presets` | User | List all presets (builtin + custom). Query: `plant_id` |
| `GET` | `/rule-presets/{id}` | User | Get preset by ID |
| `POST` | `/rule-presets` | Engineer+ | Create custom preset. Body: `{name, description?, rules_config, plant_id?}` |

### Configuration

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/characteristics/{id}/config` | User | Get characteristic configuration |
| `PUT` | `/characteristics/{id}/config` | Engineer+ | Update configuration |
| `DELETE` | `/characteristics/{id}/config` | Engineer+ | Delete configuration |

### Seeding Example (curl)

```bash
# Create X-bar-R characteristic (subgroup 5, variable data)
curl -X POST $API/characteristics \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "hierarchy_id": 3,
    "name": "Bore Diameter",
    "subgroup_size": 5,
    "data_type": "variable",
    "target_value": 10.0,
    "usl": 10.05,
    "lsl": 9.95,
    "decimal_precision": 4
  }'

# Create p-chart (attribute, proportion defective)
curl -X POST $API/characteristics \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "hierarchy_id": 3,
    "name": "Solder Defect Rate",
    "data_type": "attribute",
    "attribute_chart_type": "p",
    "default_sample_size": 100
  }'

# Apply AIAG rule preset (ID 2 for built-in AIAG)
curl -X PUT $API/characteristics/1/rules/preset \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"preset_id": 2}'

# Set spec limits
curl -X PATCH $API/characteristics/1 \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"usl": 10.05, "lsl": 9.95, "target_value": 10.0}'
```
