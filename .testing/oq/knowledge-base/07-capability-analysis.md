# Feature: Capability Analysis

## What It Does

Process capability analysis quantifies how well a manufacturing process meets its engineering specifications. While control charts answer the question "Is my process stable?", capability indices answer "Is my stable process actually producing parts within specification?"

This distinction is critical: a process can be perfectly in control (stable, predictable) but still produce defective parts if its natural variation exceeds the specification tolerance. Conversely, a process can meet specifications today but be unpredictable and unreliable. Capability analysis bridges these two concerns.

Cassini calculates five standard capability indices, performs normality testing, supports non-normal distribution fitting, and provides a "Show Your Work" transparency feature that lets auditors see exactly how each value was computed.

From a compliance perspective:
- **AIAG SPC Reference Manual** -- Defines Cp, Cpk, Pp, Ppk calculation methods. Cassini follows these methods exactly, and the Show Your Work feature cites the manual.
- **IATF 16949** -- Requires Cpk >= 1.33 for production processes (1.67 for safety-critical). Cassini's color coding directly maps to these thresholds.
- **ISO 22514** -- Process capability and performance statistics. Cassini's distinction between within-subgroup sigma (Cp/Cpk) and overall sigma (Pp/Ppk) follows this standard.
- **21 CFR Part 11** -- Show Your Work provides computation traceability for electronic records. Capability history snapshots create a documented record of process performance over time.
- **AS9100** -- Aerospace quality requires documented evidence of process capability. Capability snapshots and history provide this evidence.

---

## Where To Find It

| Function | Location | Min Role | Description |
|---|---|---|---|
| Capability Card | `/dashboard` > select characteristic (below control chart) | Operator (view) | Displays Cp, Cpk, Pp, Ppk, Cpm with color coding |
| Show Your Work toggle | Header bar > calculator icon | Any | Enables clickable statistical values |
| Explanation Panel | Click any underlined value (when Show Your Work is on) | Any | Slide-out panel with formula, steps, citation |
| Distribution Analysis modal | Capability Card > "Distribution" button | Engineer | Histogram, Q-Q plot, distribution comparison |
| Capability History | Capability Card > "History" button or trend icon | Engineer | Cpk trend chart over saved snapshots |
| Save Snapshot | Capability Card > "Save" button | Engineer | Persist current capability calculation |
| Characteristic spec limits | `/configuration` > select characteristic > Limits tab | Engineer | Set USL, LSL, target for capability calculation |

---

## Key Concepts (Six Sigma Context)

### The Five Capability Indices

#### Cp -- Process Potential (Precision)

$$C_p = \frac{USL - LSL}{6\sigma_w}$$

- **What it measures**: The ratio of the specification width to the process width. Answers: "Could this process meet spec if it were perfectly centered?"
- **Sigma used**: Within-subgroup sigma ($\sigma_w$), estimated from R-bar/d2 or S-bar/c4. This reflects short-term, inherent process variation.
- **Interpretation**: Cp = 1.0 means the process spread exactly fills the spec window. Cp = 2.0 means the spec window is twice the process spread (Six Sigma level).
- **Limitation**: Cp ignores process centering. A process with Cp = 2.0 but centered at USL would still produce 50% defective parts.
- **Requires**: Both USL and LSL must be set.

#### Cpk -- Process Capability (Precision + Accuracy)

$$C_{pk} = \min\left(\frac{USL - \bar{x}}{3\sigma_w}, \frac{\bar{x} - LSL}{3\sigma_w}\right)$$

Where:
- $C_{pu} = \frac{USL - \bar{x}}{3\sigma_w}$ (upper capability)
- $C_{pl} = \frac{\bar{x} - LSL}{3\sigma_w}$ (lower capability)

- **What it measures**: Actual capability accounting for both spread and centering. THE most important capability index. Cpk is always <= Cp; they are equal only when the process is perfectly centered.
- **Sigma used**: Within-subgroup sigma ($\sigma_w$).
- **Industry thresholds**:
  - Cpk >= 1.33: Capable (standard requirement for IATF 16949)
  - Cpk >= 1.67: Capable for safety-critical characteristics
  - Cpk >= 2.0: Six Sigma level
  - Cpk >= 1.0: Marginal -- process barely fits within specs
  - Cpk < 1.0: Not capable -- process produces defects
- **Requires**: At least one spec limit (USL or LSL). If only one is set, Cpk equals the one-sided index.

#### Pp -- Process Performance (Long-Term Precision)

$$P_p = \frac{USL - LSL}{6s}$$

- **What it measures**: Same concept as Cp, but uses overall (long-term) standard deviation instead of within-subgroup sigma.
- **Sigma used**: Overall sigma ($s$), calculated from all individual measurements regardless of subgroup. This includes between-subgroup variation.
- **Interpretation**: If Pp approximately equals Cp, the process is stable (no significant between-subgroup variation). If Pp << Cp, special causes are adding variation between subgroups.
- **Requires**: Both USL and LSL.

#### Ppk -- Process Performance Index (Long-Term Capability)

$$P_{pk} = \min\left(\frac{USL - \bar{x}}{3s}, \frac{\bar{x} - LSL}{3s}\right)$$

- **What it measures**: Long-term capability. The Ppk vs. Cpk comparison is the key diagnostic:
  - Ppk approximately equals Cpk: Process is stable over time. Good.
  - Ppk << Cpk: Special causes are present between subgroups. The short-term capability (Cpk) looks better than long-term reality (Ppk).
- **Sigma used**: Overall sigma ($s$).
- **Requires**: At least one spec limit.

#### Cpm -- Taguchi Capability Index

$$C_{pm} = \frac{USL - LSL}{6\tau}, \quad \tau = \sqrt{\sigma_w^2 + (\bar{x} - T)^2}$$

- **What it measures**: Capability with an explicit penalty for deviation from the target value (T). Named after Genichi Taguchi, who argued that any deviation from target -- even within spec -- represents quality loss.
- **Interpretation**: Cpm = Cp when the process mean exactly equals the target. As the mean drifts from target, Cpm decreases even if all parts are within spec.
- **Requires**: Both spec limits AND a target value must be set.

### Sigma Estimation Methods

Understanding the difference between $\sigma_w$ (within) and $s$ (overall) is essential:

| Sigma | Estimation | Used By | Reflects |
|---|---|---|---|
| $\sigma_w$ (within-subgroup) | $\bar{R}/d_2$ for small subgroups, $\bar{S}/c_4$ for larger | Cp, Cpk | Short-term, inherent variation within each subgroup |
| $s$ (overall) | Standard deviation of all individual measurements | Pp, Ppk | Total variation including between-subgroup effects |

The $d_2$ and $c_4$ constants are tabulated values that depend on subgroup size. Cassini uses the AIAG-standard tables for these constants.

### Color Coding

Cassini uses traffic-light color coding for capability indices:

| Color | Threshold | Meaning | IATF 16949 Context |
|---|---|---|---|
| **Green** | >= 1.33 | Capable | Meets standard production requirement |
| **Yellow** | >= 1.0 and < 1.33 | Marginal | Process is at risk; improvement needed |
| **Red** | < 1.0 | Not capable | Process produces defects; immediate action required |

### Normality Testing

Capability indices assume normally distributed data. Cassini uses the **Shapiro-Wilk test** to verify this assumption:

- **W statistic**: Measures how well the data fits a normal distribution (0 to 1, where 1 is perfect normality).
- **p-value**: Probability of observing the data if it were truly normal.
  - p > 0.05: Fail to reject normality -- normal assumption is reasonable.
  - p <= 0.05: Reject normality -- data is significantly non-normal.
- **Sample size**: For large datasets (>5000), the test uses a random sample of 5000 observations due to computational constraints.

### Non-Normal Capability

When the Shapiro-Wilk test rejects normality (p <= 0.05), standard Cp/Cpk calculations may be misleading. Cassini supports several approaches:

1. **Distribution fitting**: Fit the data to one of 6 distribution families:
   - Normal, Lognormal, Weibull, Gamma, Exponential, Beta
2. **Box-Cox transformation**: Find a power transformation (lambda) that normalizes the data. Lambda near 0 indicates a log transformation.
3. **Auto-cascade**: Cassini can automatically try: Shapiro-Wilk --> Box-Cox --> distribution fitting --> percentile method, selecting the best approach.
4. **Percentile method**: Use empirical percentiles (0.135th and 99.865th) instead of +/- 3 sigma. This is distribution-free and works for any shape.

### Show Your Work

The "Show Your Work" feature provides full computational transparency:

1. **Toggle**: Click the calculator icon in the header to enable Show Your Work mode.
2. **Visual indicator**: All statistical values (Cpk, Ppk, UCL, etc.) wrapped with the `<Explainable>` component display a dotted underline.
3. **Click to explain**: Clicking any underlined value opens the ExplanationPanel slide-out, showing:
   - **Title**: The metric name (e.g., "Process Capability (Cpk)")
   - **Formula**: KaTeX-rendered mathematical formula
   - **Steps**: Step-by-step computation with intermediate values and actual numbers
   - **Inputs**: Raw data values used in the calculation
   - **Citation**: AIAG SPC Reference Manual section reference
4. **Value matching**: The explanation API recalculates the metric and the returned value must exactly match what is displayed on screen. Two data modes exist:
   - **With chart options** (start_date/end_date/limit): Uses subgroup means + sigma from means -- matches dashboard quickStats.
   - **Without chart options**: Flattens individual measurements + uses stored sigma (R-bar/d2) -- matches the Capability Card / capability GET endpoint.

### Capability History

Engineers can save capability snapshots to track process performance over time:
- Each snapshot captures: Cp, Cpk, Pp, Ppk, Cpm, sample count, normality test result, timestamp, who saved it.
- The Capability Card displays a trend chart showing Cpk over saved snapshots.
- History is useful for PPAP (Production Part Approval Process) documentation and customer audits.

---

## How To Configure (Step-by-Step)

### Setting Specification Limits (Engineer+)

1. Navigate to `/configuration`.
2. Select the target characteristic from the hierarchy tree.
3. Click the **Limits** tab.
4. Enter the specification limits:
   - **USL** (Upper Specification Limit): Maximum acceptable value.
   - **LSL** (Lower Specification Limit): Minimum acceptable value.
   - **Target**: Nominal/ideal value (needed for Cpm).
5. Save. Capability analysis is now available for this characteristic (requires data).

### Enabling Show Your Work

1. Click the calculator/equation icon in the header bar.
2. The icon highlights when active.
3. Statistical values throughout the application now show dotted underlines.
4. Click any underlined value to see the explanation panel.
5. Click the icon again to disable.

### Setting Distribution Method (Engineer+)

1. Navigate to `/configuration` > select characteristic.
2. Go to the **Distribution** tab (or Limits tab, depending on layout).
3. Select distribution method: Normal (default), Lognormal, Weibull, Gamma, Exponential, Beta, or Auto.
4. Save. The capability calculation will use the selected distribution fitting.

---

## How To Use (Typical Workflow)

### Viewing Capability (Operator/Engineer)

1. Navigate to `/dashboard`.
2. Select a characteristic from the hierarchy tree.
3. Below the control chart, the **Capability Card** displays:
   - Cp, Cpk, Pp, Ppk (and Cpm if target is set)
   - Color coding (green/yellow/red) for each index
   - Sample count used in the calculation
   - Normality test result (normal/non-normal with p-value)
4. If any index is red (< 1.0), the process needs immediate attention.
5. If indices are yellow (1.0-1.33), improvement is recommended.

### Investigating with Show Your Work (Engineer/Auditor)

1. Enable Show Your Work (header toggle).
2. Click the Cpk value on the Capability Card.
3. The ExplanationPanel slides out showing:
   - Formula: $C_{pk} = \min(C_{pu}, C_{pl})$
   - Step 1: Compute mean ($\bar{x}$) with actual value
   - Step 2: Compute within-subgroup sigma ($\sigma_w$) with actual value
   - Step 3: Compute $C_{pu} = (USL - \bar{x}) / 3\sigma_w$ with actual numbers
   - Step 4: Compute $C_{pl} = (\bar{x} - LSL) / 3\sigma_w$ with actual numbers
   - Step 5: $C_{pk} = \min(C_{pu}, C_{pl})$ with final result
   - Citation: AIAG SPC Reference Manual, Section on Process Capability
4. Verify the computation is correct.
5. Close the panel and repeat for other metrics as needed.

### Saving a Capability Snapshot (Engineer)

1. On the Capability Card, click the **Save Snapshot** button.
2. The current capability is calculated, persisted, and the snapshot ID is returned.
3. To view the history trend: click the **History** button on the Capability Card.
4. A trend chart shows Cpk values over time, with each point representing a snapshot.

### Running Distribution Analysis (Engineer)

1. On the Capability Card, click the **Distribution Analysis** button.
2. A modal opens with:
   - **Histogram**: Data distribution with fitted curve overlay
   - **Q-Q Plot**: Quantile-quantile plot comparing observed quantiles to theoretical normal quantiles. Points should follow the diagonal line for normal data.
   - **Distribution Comparison Table**: AIC/BIC scores for each fitted distribution family
   - **Normality Test**: Shapiro-Wilk W statistic and p-value
3. If data is non-normal: select the best-fitting distribution from the comparison table.
4. Set the distribution method on the characteristic to use it for capability calculations.

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Verification |
|---|---|---|
| 1 | Cp calculated correctly for centered process | Seed known data, verify Cp matches manual calculation |
| 2 | Cpk accounts for off-center process | Seed shifted data, verify Cpk < Cp |
| 3 | Pp and Ppk calculated using overall sigma | Verify Pp/Ppk values differ from Cp/Cpk appropriately |
| 4 | Cpm calculated when target is set | Verify Cpm displayed and penalizes off-target centering |
| 5 | Color coding: green >= 1.33, yellow >= 1.0, red < 1.0 | Verify colors match index values |
| 6 | Show Your Work shows formula, steps, and citation | Enable toggle, click Cpk, verify panel content |
| 7 | Capability snapshot saves and retrieves | Save snapshot, query history, verify persisted |
| 8 | Capability history trend chart displays | Save 2+ snapshots, verify trend chart renders |
| 9 | Normality test (Shapiro-Wilk) result displayed | Verify W statistic and p-value shown |
| 10 | Non-normal distribution fitting works | Set lognormal method on lognormal data, verify capability |
| 11 | Box-Cox transformation detects correct lambda | Seed skewed data, run auto-detection, verify transform |
| 12 | Distribution Analysis histogram renders | Open modal, verify histogram with curve overlay |
| 13 | Q-Q plot renders correctly | Verify diagonal pattern for normal data |
| 14 | Insufficient data shows warning | Seed < 20 samples, verify warning message |
| 15 | Missing spec limits shows error/warning | No USL or LSL set, verify capability not calculated |

---

## Edge Cases & Constraints

- **Minimum sample count**: The capability API requires at least 2 measurements. However, for statistically meaningful results, 30+ subgroups (AIAG recommendation) or 100+ individual measurements are needed. Cassini displays the sample count so users can judge significance.
- **Insufficient data warning**: When fewer than approximately 20 samples exist, the Capability Card may show a warning about insufficient data for reliable capability estimates.
- **Missing spec limits**: If neither USL nor LSL is set, the capability endpoint returns HTTP 400. At least one spec limit is required.
- **Cpm requires target**: If no target value is set on the characteristic, Cpm will be null in the response.
- **One-sided specs**: If only USL is set, Cp is undefined (null), Cpk equals Cpu. If only LSL is set, Cp is undefined (null), Cpk equals Cpl.
- **Sigma within (stored_sigma)**: The within-subgroup sigma used for Cp/Cpk comes from `characteristic.stored_sigma`, which is set during control limit calculation. If limits have not been calculated, stored_sigma may be null, and capability may use only overall sigma.
- **Attribute charts**: Capability analysis is not supported for attribute data types (p, np, c, u charts). The API returns HTTP 400 for attribute characteristics.
- **Non-normal fitting minimum**: Distribution fitting generally requires 30+ data points for reliable parameter estimation. With fewer points, the fit may be unreliable.
- **Box-Cox lambda**: A lambda near 0 means a log transformation is optimal. Lambda = 1 means no transformation needed (data is already normal). Lambda = 0.5 means square root transformation.
- **Show Your Work value matching**: The explain API has two computation paths. When called from the dashboard with chart options, it uses subgroup means and sigma of means. When called from the Capability Card without chart options, it uses individual measurements and stored sigma. Mismatched paths produce different values.
- **Snapshot persistence**: Snapshots are immutable once saved. They capture the capability at a point in time. If data changes after a snapshot is saved, the snapshot retains the original values.
- **History ordering**: Capability history is returned in descending order (most recent first).

---

## API Reference (for seeding)

### Capability Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/characteristics/{id}/capability` | User | Calculate current capability. Query: `window_size` (default 1000, range 10-10000). Returns: Cp, Cpk, Pp, Ppk, Cpm, sample_count, normality_test, is_normal, normality_p_value, usl, lsl, target, sigma_within |
| `GET` | `/characteristics/{id}/capability/history` | User | Get saved snapshots. Query: `limit` (default 50, max 200). Returns array of snapshots ordered by calculated_at desc |
| `POST` | `/characteristics/{id}/capability/snapshot` | Engineer+ | Calculate and save snapshot. Query: `window_size`. Returns: id, capability object |

### Explain Endpoints (Show Your Work)

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/explain/capability/{metric}/{char_id}` | User | Get explanation for a capability metric. Path: `metric` is one of cp, cpk, pp, ppk, cpm. Query: `start_date`, `end_date`, `limit` (optional chart options). Returns: metric, title, formula, steps[], citation, value |

### Distribution Analysis

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/characteristics/{id}/distribution-analysis` | Engineer+ | Fit distributions, return analysis results |

### Prerequisite: Characteristic with Spec Limits

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/characteristics` | Engineer+ | Create characteristic. Body includes: `usl`, `lsl`, `target_value` |
| `PATCH` | `/characteristics/{id}` | Engineer+ | Update characteristic to add/change spec limits |

### Prerequisite: Sample Data

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/samples` | Operator+ | Submit sample. Body: `{ characteristic_id, measurements: [float] }` |
| `POST` | `/samples/batch` | Operator+ | Batch import samples |

### Seeding Example

```bash
# 1. Create characteristic with spec limits
CHAR=$(curl -s -X POST $API/characteristics \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "hierarchy_id": '$HIER_ID',
    "name": "OQ-Cap-Test",
    "subgroup_size": 5,
    "usl": 10.05,
    "lsl": 9.95,
    "target_value": 10.0
  }')
CHAR_ID=$(echo $CHAR | jq '.id')

# 2. Seed 60 samples from N(10.0, 0.015)
# Each sample has 5 measurements (subgroup_size=5)
# Use values like: [10.01, 9.99, 10.00, 9.98, 10.02]
for i in $(seq 1 60); do
  curl -X POST $API/samples \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"characteristic_id\": $CHAR_ID, \"measurements\": [10.01, 9.99, 10.00, 9.98, 10.02]}"
done

# 3. Recalculate control limits (to establish stored_sigma)
curl -X POST $API/characteristics/$CHAR_ID/recalculate-limits \
  -H "Authorization: Bearer $TOKEN"

# 4. Get capability
curl -X GET $API/characteristics/$CHAR_ID/capability \
  -H "Authorization: Bearer $TOKEN"
# Returns: { cp, cpk, pp, ppk, cpm, sample_count, ... }

# 5. Save a snapshot
curl -X POST $API/characteristics/$CHAR_ID/capability/snapshot \
  -H "Authorization: Bearer $TOKEN"

# 6. Get history
curl -X GET $API/characteristics/$CHAR_ID/capability/history \
  -H "Authorization: Bearer $TOKEN"

# 7. Get Show Your Work explanation for Cpk
curl -X GET "$API/explain/capability/cpk/$CHAR_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Response Schema: CapabilityResponse

```json
{
  "cp": 1.11,
  "cpk": 1.05,
  "pp": 1.08,
  "ppk": 1.02,
  "cpm": 0.98,
  "sample_count": 300,
  "normality_p_value": 0.42,
  "normality_test": "Shapiro-Wilk",
  "is_normal": true,
  "calculated_at": "2026-02-26T12:00:00",
  "usl": 10.05,
  "lsl": 9.95,
  "target": 10.0,
  "sigma_within": 0.015,
  "short_run_mode": null
}
```
