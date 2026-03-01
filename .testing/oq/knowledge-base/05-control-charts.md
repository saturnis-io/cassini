# Feature: Control Charts

## What It Does

Control charts are the primary SPC tool -- they plot process data over time with statistical control limits to distinguish **common cause variation** (inherent, stable, predictable) from **special cause variation** (assignable, unstable, actionable). Walter Shewhart invented this method at Bell Labs in the 1920s, and it remains the foundation of all statistical process control.

The Cassini dashboard (`/dashboard`) displays control charts for each characteristic. Each chart shows data points plotted chronologically with three reference lines:
- **UCL (Upper Control Limit)** = CL + 3 sigma -- the upper boundary of expected variation
- **CL (Center Line)** = process average (X-bar-bar, p-bar, c-bar, etc.)
- **LCL (Lower Control Limit)** = CL - 3 sigma -- the lower boundary of expected variation

The 3-sigma limits capture 99.73% of common cause variation. Any point outside these limits signals a special cause that demands investigation.

---

## Where To Find It

| View | Route | Min Role | Description |
|------|-------|----------|-------------|
| Dashboard | `/dashboard` | operator | Primary chart view with hierarchy tree |
| Kiosk | `/kiosk` | operator | Full-screen single-chart display for shop floor |
| Wall Dashboard | `/wall-dashboard` | operator | Multi-chart display, no status bar |
| Chart Data API | `GET /characteristics/{id}/chart-data` | JWT | Raw chart data with samples, limits, zones |
| Limits API | `POST /characteristics/{id}/recalculate-limits` | JWT (engineer+) | Force limit recalculation |
| Set Limits API | `POST /characteristics/{id}/set-limits` | JWT (engineer+) | Manually override limits |
| Annotations API | `GET/POST/PUT/DELETE /characteristics/{id}/annotations` | JWT | Chart annotation CRUD |

---

## Key Concepts (Six Sigma Context)

### Chart Type Selection

The choice of control chart depends on two factors: **data type** (variable vs. attribute) and **subgroup size**.

#### Variable Data Charts (continuous measurements)

| Chart | Subgroup Size | Plots | Limit Constants | When To Use |
|-------|---------------|-------|-----------------|-------------|
| **X-bar/R** | 2--10 | Mean chart + Range chart | A2, D3, D4 | Most common. Subgroup averages detect shifts; ranges detect dispersion changes. |
| **X-bar/S** | >10 | Mean chart + Std Dev chart | A3, B3, B4 | When subgroups are large enough for standard deviation to be more efficient than range. |
| **I-MR** | 1 | Individuals chart + Moving Range chart | E2 = 2.660 | When each measurement is its own subgroup (destructive testing, batch processes, slow data). |

**Limit formulas (variable)**:
- X-bar chart: UCL = X-bar-bar + A2 * R-bar, LCL = X-bar-bar - A2 * R-bar
- R chart: UCL = D4 * R-bar, LCL = D3 * R-bar
- I chart: UCL = X-bar + E2 * MR-bar, LCL = X-bar - E2 * MR-bar (E2 = 3/d2 = 2.660 for n=2)
- MR chart: UCL = D4 * MR-bar (D4 = 3.267 for n=2)

#### Attribute Data Charts (counts / classifications)

| Chart | Sample Size | Input | Plotted Value | Limit Formula |
|-------|-------------|-------|---------------|---------------|
| **p** | Variable OK | Defectives + sample size | p = defectives/n | UCL = p-bar + 3 * sqrt(p-bar(1-p-bar)/n) |
| **np** | Fixed | Defectives (n fixed on char) | np = defective count | UCL = np-bar + 3 * sqrt(np-bar(1-p-bar)) |
| **c** | Fixed | Defect count | c = defect count | UCL = c-bar + 3 * sqrt(c-bar) |
| **u** | Variable OK | Defects + units inspected | u = defects/units | UCL = u-bar + 3 * sqrt(u-bar/n) |

#### Special Charts

| Chart | Purpose | Key Parameters |
|-------|---------|----------------|
| **CUSUM** | Cumulative Sum of deviations from target. Detects small persistent shifts that Shewhart charts miss. | target (mu_0), K (slack/allowance, typically 0.5 sigma), H (decision interval, typically 4-5 sigma) |
| **EWMA** | Exponentially Weighted Moving Average. Smooths noise to detect small shifts. | lambda (weighting, 0.05--0.25), L (control limit width, typically 2.7--3.0), target |

### Short-Run Charts

For low-volume / high-mix manufacturing where a single part number does not accumulate enough data for traditional charts:

- **Deviation mode**: Subtracts the target value from each measurement. Plots deviations from nominal. Allows mixed parts on one chart if they share similar variation characteristics.
- **Z-score (standardized) mode**: Z = (X-bar - Target) / (sigma / sqrt(n)). Fully standardizes so different parts with different scales can coexist. Y-axis shows Z-scores; limits are at +/-3.

### Laney p'/u' Charts

When attribute data shows **overdispersion** (more variation than the binomial/Poisson model predicts -- common with large sample sizes or multiple defect streams), the standard p or u chart generates excessive false alarms. The Laney correction applies a sigma-Z factor that accounts for between-subgroup variation:

- Calculate Z_i = (p_i - p-bar) / sigma_within for each subgroup
- sigma_Z = MR-bar(Z) / d2
- Adjusted limits: UCL = p-bar + 3 * sigma_Z * sqrt(p-bar(1-p-bar)/n)

When enabled, a sigma-Z badge is visible on the chart.

### Nelson Rules (Western Electric Rules)

Beyond simple limit violations, Nelson rules detect non-random patterns:

| Rule | Name | Pattern |
|------|------|---------|
| 1 | Beyond limits | 1 point > 3 sigma from CL |
| 2 | Zone A run | 2 of 3 consecutive points > 2 sigma (same side) |
| 3 | Zone B run | 4 of 5 consecutive points > 1 sigma (same side) |
| 4 | Run of 8 | 8 consecutive points on same side of CL |
| 5 | Trend | 6 consecutive points continuously increasing or decreasing |
| 6 | Alternation | 14 consecutive points alternating up and down |
| 7 | Stratification | 15 consecutive points within 1 sigma of CL |
| 8 | Mixture | 8 consecutive points > 1 sigma from CL (either side) |

Rules 1--4 apply to attribute charts; rules 5--8 are silently ignored for attribute data (they require continuous distributions). All rules are configurable per characteristic with custom parameters (Sprint 5).

### Annotations

Cassini supports two annotation types on charts:
- **Point annotations**: A note attached to a specific data point (e.g., "New tooling installed", "Operator changed")
- **Period annotations**: A note spanning a date range, rendered as a shaded region (e.g., "Machine maintenance window", "Material batch change")

Annotations provide context for future analysis and support CAPA (Corrective and Preventive Action) documentation.

---

## How To Configure (Step-by-Step)

### Setting Up a New Chart
1. Navigate to `/configuration` (engineer+ role)
2. Create or select a characteristic within a department > line hierarchy
3. Set **chart_type**: xbar_r, xbar_s, i_mr, p, np, c, u, cusum, or ewma
4. Set **subgroup_size**: matches the chart type requirements
5. Set **data_type**: "variable" or "attribute"
6. Optionally set **spec limits** (USL, LSL, target) -- these display as reference lines on the chart but do NOT affect control limits
7. Save the characteristic

### Control Limit Calculation
Control limits auto-calculate once sufficient data exists (typically 25+ subgroups for stable estimates). You can also:
- **Force recalculation**: `POST /characteristics/{id}/recalculate-limits` (engineer+)
- **Manual override**: `POST /characteristics/{id}/set-limits` with explicit UCL/CL/LCL values (engineer+)
- **Exclude samples**: Excluding outliers from limit calculations gives more representative limits

### Nelson Rule Configuration
1. Go to characteristic detail > Rules tab
2. Enable/disable individual rules (checkboxes)
3. Select a preset (Nelson, AIAG, WECO, Wheeler) or customize parameters
4. Custom parameters: adjust thresholds (e.g., Rule 4: change run length from 8 to 9)

### Short-Run Configuration
1. In characteristic configuration, set `short_run_mode` to "deviation" or "z_score"
2. Ensure a `target` value is set on the characteristic
3. For Z-score mode, `stored_sigma` must also be set
4. Note: short_run_mode is incompatible with attribute data and CUSUM/EWMA charts

### Laney Correction
1. In characteristic configuration (attribute charts only), check `use_laney_correction`
2. Only applicable to p and u charts
3. Requires sufficient data (20+ subgroups) for meaningful sigma-Z calculation

---

## How To Use (Typical Workflow)

### Viewing Charts on Dashboard
1. Navigate to `/dashboard`
2. Select plant from header switcher
3. Expand hierarchy tree -- click a characteristic to load its chart
4. The primary chart (X-bar, I, p, etc.) renders with UCL/CL/LCL lines
5. The secondary chart (R, MR, S) renders below the primary chart
6. Violations are marked with colored indicators on affected points

### Interacting with Charts
- **Hover**: Tooltip shows value, timestamp, subgroup measurements, zone classification
- **Click point**: Opens sample inspector with full measurement details, edit history, and exclude option
- **Scroll**: Zoom in/out on the time axis
- **Drag**: Pan across the time axis
- **Time filter**: Toolbar controls for "last N points" or date range filter
- **Export**: Download chart as PNG image via toolbar button

### Adding Annotations
1. Click the annotation button in the chart toolbar
2. For **point annotation**: click a specific data point, enter note text
3. For **period annotation**: select start and end dates, enter note text
4. Annotations display as flags (point) or shaded regions (period) on the chart
5. Hover over an annotation to see the full text

### Real-Time Updates
When new data is submitted (via UI, API, or connectivity source), the chart updates via React Query invalidation. The new point appears without a full page refresh. WebSocket notifications can trigger immediate re-fetch.

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Pass Condition |
|---|---|---|
| 1 | X-bar/R chart renders | Both mean and range sub-charts visible with UCL/CL/LCL lines |
| 2 | I-MR chart renders | Individuals chart + moving range chart visible |
| 3 | p-chart renders | Proportion chart with correct per-point limits for variable sample sizes |
| 4 | np-chart renders | Count nonconforming chart with fixed limits |
| 5 | c-chart renders | Defect count chart with Poisson-based limits |
| 6 | u-chart renders | Defects per unit chart with per-point limits |
| 7 | CUSUM chart renders | Cumulative sum chart with H decision interval lines |
| 8 | EWMA chart renders | Weighted average chart with control limits |
| 9 | Limits auto-calculate | With 25+ samples, UCL/CL/LCL values are non-null and correctly positioned |
| 10 | Spec lines display | USL/LSL render as distinct lines (different style from control limits) |
| 11 | Violations marked | Out-of-control points display violation indicators (color/shape) |
| 12 | Tooltip works | Hover shows value, timestamp, subgroup data |
| 13 | Zoom/pan works | Scroll zooms, drag pans, chart responds smoothly |
| 14 | Annotation displays | Point annotations show flags, period annotations show shaded regions |
| 15 | Time filter works | Filtering by count or date range updates visible points |
| 16 | Short-run deviation | Y-axis shows deviations from target, limits based on deviation data |
| 17 | Short-run Z-score | Y-axis shows standardized Z-scores, limits at +/- 3 |
| 18 | Laney p' correction | sigma-Z badge visible, limits wider than uncorrected p-chart |
| 19 | Chart export | Image downloads successfully in PNG format |
| 20 | Real-time update | New sample appears on chart without page refresh |

---

## Edge Cases & Constraints

- **Empty chart (0 data points)**: Renders an empty state message. No limit lines (limits require data).
- **Single data point**: Chart renders the one point but cannot calculate limits or ranges (need 2+ for range, 25+ for stable limits).
- **No control limits set**: Chart renders data points without UCL/CL/LCL lines. Quick stats show "N/A" for limits.
- **100+ data points**: ECharts handles large datasets efficiently. Default view may show last 50 points with scroll to see more.
- **ECharts container**: The chart container div MUST always be in the DOM. Use `visibility: hidden` during loading states, NOT conditional rendering (React unmount destroys the ECharts instance and causes flicker/errors).
- **Concurrent chart updates**: React Query manages cache invalidation. Multiple users viewing the same chart see consistent data after their next query refresh.
- **Attribute charts with variable sample size (p, u)**: Control limits are per-point (different UCL/LCL at each subgroup based on its sample size). The chart draws stepped limit lines.
- **CUSUM/EWMA**: These charts have fundamentally different rendering than Shewhart charts. CUSUM shows cumulative sums (C+ and C-) with H boundaries. EWMA shows the weighted average with time-varying limits.
- **Short-run incompatibility**: short_run_mode cannot be combined with attribute data or CUSUM/EWMA charts. Backend validates this constraint.
- **Laney correction constraint**: Only valid for p and u charts. The `use_laney_correction` checkbox is hidden for other chart types.
- **Spec limits vs. control limits**: Spec limits (USL, LSL) come from the engineering specification and are independent of process performance. Control limits come from the data. A process can be in statistical control (within control limits) but still producing out-of-spec parts if the process is not capable.
- **ExplanationPanel z-index**: The "Show Your Work" explanation panel renders at z-index 60, above modals (z-50). Do not lower this.

---

## API Reference (for seeding)

### Chart Data
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/characteristics/{id}/chart-data` | JWT | Returns samples, control limits, spec limits, zones, violations |

Response includes:
- `samples[]` -- array of {timestamp, mean, range, zone, is_excluded, measurements[], violations[]}
- `control_limits` -- {ucl, lcl, center_line}
- `spec_limits` -- {usl, lsl, target}
- `quick_stats` -- {count, grand_mean, sigma, cpk, ppk}

### Control Limits
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/characteristics/{id}/recalculate-limits` | JWT (engineer+) | Force recalculation from current data |
| `POST` | `/characteristics/{id}/set-limits` | JWT (engineer+) | Manually set UCL, CL, LCL values |

### Nelson Rules
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/characteristics/{id}/rules` | JWT | Get rule configuration for characteristic |
| `PUT` | `/characteristics/{id}/rules` | JWT (engineer+) | Update rule configuration |

### Annotations
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/characteristics/{id}/annotations` | JWT | List annotations (optional type filter) |
| `POST` | `/characteristics/{id}/annotations` | JWT (supervisor+) | Create point or period annotation |
| `PUT` | `/characteristics/{id}/annotations/{ann_id}` | JWT (supervisor+) | Update annotation text |
| `DELETE` | `/characteristics/{id}/annotations/{ann_id}` | JWT (supervisor+) | Delete annotation |

### Annotation Schema
```json
// Point annotation
{
  "type": "point",
  "sample_id": 123,
  "text": "New tooling installed",
  "category": "process_change"
}

// Period annotation
{
  "type": "period",
  "start_date": "2026-02-01T00:00:00Z",
  "end_date": "2026-02-03T23:59:59Z",
  "text": "Preventive maintenance window",
  "category": "maintenance"
}
```

### Seeding Chart Data
To seed a characteristic with enough data for a meaningful control chart, use the batch import endpoint:
```
POST /api/v1/samples/batch
{
  "characteristic_id": 42,
  "samples": [
    {"measurements": [10.01, 10.03, 9.98, 10.02, 10.00]},
    {"measurements": [10.02, 9.99, 10.01, 10.04, 9.97]},
    // ... 25+ subgroups for stable limits
  ],
  "skip_rule_evaluation": true
}
```

After seeding, trigger limit calculation:
```
POST /api/v1/characteristics/42/recalculate-limits
```
