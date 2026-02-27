# Feature: Advanced Analytics

## What It Does

Advanced analytics extends beyond univariate SPC into multivariate analysis, correlation, prediction, and Design of Experiments (DOE). These are the tools a Six Sigma Black Belt uses for deeper process understanding and optimization -- moving from "is this single characteristic in control?" to "how do multiple characteristics interact, what drives variation, and how do we optimize the process?"

Cassini provides two entry points for advanced analytics:

1. **Analytics page** (`/analytics`) -- Tabbed interface for Correlation, Multivariate SPC, Predictions, and AI Insights. Requires engineer+ role.
2. **DOE page** (`/doe`) -- Design of Experiments studio for factorial designs, ANOVA analysis, and effect estimation. Requires engineer+ role.

These tools address the DMAIC (Define, Measure, Analyze, Improve, Control) methodology at the **Analyze** and **Improve** stages, where practitioners need to understand root causes and optimize process parameters.

---

## Where To Find It

| View | Route | Min Role | Description |
|------|-------|----------|-------------|
| Analytics | `/analytics` | engineer | Tabbed page: Correlation, Multivariate, Predictions, AI Insights |
| Analytics - Correlation tab | `/analytics?tab=correlation` | engineer | Pairwise correlation matrix computation and heatmap |
| Analytics - Multivariate tab | `/analytics?tab=multivariate` | engineer | Multivariate chart groups, T-squared charting, decomposition |
| Analytics - Predictions tab | `/analytics?tab=predictions` | engineer | Time-series forecasting and prediction overlays |
| Analytics - AI Insights tab | `/analytics?tab=ai-insights` | engineer | ML-driven anomaly insights and AI configuration |
| DOE | `/doe` | engineer | DOE study list with status filters (Design, Collecting, Analyzed) |
| DOE New Study | `/doe/new` | engineer | Create a new DOE study with factors |
| DOE Study Detail | `/doe/{study_id}` | engineer | View/edit study, design matrix, runs, analysis results |
| Multivariate API | `GET/POST /multivariate/groups` | JWT (engineer+) | Multivariate group CRUD |
| Multivariate Chart API | `POST /multivariate/groups/{id}/compute` | JWT (engineer+) | Compute T-squared or MEWMA chart data |
| Multivariate Chart Data API | `GET /multivariate/groups/{id}/chart-data` | JWT (engineer+) | Retrieve persisted T-squared time series |
| Correlation API | `POST /multivariate/correlation/compute` | JWT (engineer+) | Compute correlation matrix |
| PCA API | `POST /multivariate/correlation/compute-pca` | JWT (engineer+) | Compute principal component analysis |
| Correlation Results API | `GET /multivariate/correlation/results` | JWT (engineer+) | List recent correlation results |
| Phase Freeze API | `POST /multivariate/groups/{id}/freeze` | JWT (engineer+) | Freeze Phase I parameters for Phase II monitoring |
| DOE Studies API | `GET/POST /doe/studies` | JWT (engineer+) | DOE study CRUD |
| DOE Generate API | `POST /doe/studies/{id}/generate` | JWT (engineer+) | Generate design matrix and runs |
| DOE Runs API | `GET/PUT /doe/studies/{id}/runs` | JWT (engineer+) | View and update run response values |
| DOE Analyze API | `POST /doe/studies/{id}/analyze` | JWT (engineer+) | Run ANOVA and regression analysis |
| DOE Analysis API | `GET /doe/studies/{id}/analysis` | JWT (engineer+) | Get latest analysis results |

---

## Key Concepts (Six Sigma Context)

### Multivariate SPC (Hotelling's T-squared)

Traditional Shewhart charts monitor one characteristic at a time. But in real manufacturing, characteristics are often correlated -- a bore diameter and a surface finish may both be driven by the same tool wear mechanism. A process may appear in control on each individual X-bar chart while being out of control when considering the joint behavior of the correlated variables.

**Hotelling's T-squared statistic** is the multivariate generalization of the univariate t-test. For a vector observation **x** with p variables:

```
T^2 = (x - x-bar)' S^-1 (x - x-bar)
```

Where **x-bar** is the mean vector and **S** is the covariance matrix. T-squared follows a scaled F-distribution, and the Upper Control Limit (UCL) is based on the F-distribution with p and n-p degrees of freedom and a chosen alpha (typically 0.05).

**Phase I vs. Phase II**:
- **Phase I**: Estimate mean vector and covariance from historical data. Use to identify and remove outliers. Parameters are computed from the data being charted.
- **Phase II**: Freeze the Phase I parameters and monitor new data against them. This is the ongoing monitoring phase, analogous to freezing control limits on a Shewhart chart.

**T-squared Decomposition**: When a point exceeds the UCL, decomposition identifies which variables contributed most to the out-of-control signal. Cassini uses the MTY (Mason, Tracy, Young) decomposition to rank variable contributions.

**MEWMA (Multivariate EWMA)**: Like the univariate EWMA extends Shewhart charts to detect small shifts, MEWMA applies exponential weighting to the multivariate mean vector. Controlled by a lambda parameter (0 < lambda <= 1) that determines the weighting of recent observations.

### Correlation Analysis

Correlation analysis quantifies the linear relationship between pairs of characteristics. The **Pearson correlation coefficient** (r) ranges from -1 (perfect negative) to +1 (perfect positive), with 0 indicating no linear relationship.

- **r > 0.7** or **r < -0.7**: Strong correlation -- investigate for common causes
- **0.3 < |r| < 0.7**: Moderate correlation -- worth monitoring
- **|r| < 0.3**: Weak correlation -- likely independent

Cassini supports both **Pearson** (linear) and **Spearman** (rank-based, handles nonlinear monotonic relationships) methods. Each correlation comes with a **p-value** -- the probability of observing such a correlation by chance. A p-value < 0.05 is conventionally considered statistically significant.

The **correlation heatmap** provides an at-a-glance view of all pairwise correlations. Color intensity maps to |r|, making it easy to spot clusters of correlated characteristics.

### PCA (Principal Component Analysis)

PCA reduces a p-dimensional dataset to a smaller number of **principal components** (PCs) that capture the most variance. Each PC is a linear combination of the original variables.

Key outputs:
- **Eigenvalues**: Variance captured by each PC. An eigenvalue > 1 (Kaiser criterion) suggests the PC captures more variance than any single original variable.
- **Explained variance ratio**: Percentage of total variance explained by each PC. Cumulative variance shows how many PCs are needed to explain a target (e.g., 80%) of the total variance.
- **Loadings**: Coefficients mapping original variables to PCs. High absolute loadings indicate strong contribution.
- **Scores**: Transformed data points in PC space.
- **Biplot**: Overlays variable vectors (loadings) on the score plot. Variables pointing in the same direction are positively correlated; opposite directions indicate negative correlation. Length indicates contribution strength.

PCA is useful when you have many correlated characteristics (e.g., 20 dimensional measurements on a casting) and want to understand the underlying structure. It can reveal that most variation is driven by 2-3 independent sources (PCs), simplifying both monitoring and root cause analysis.

### Predictions

Time-series forecasting uses historical process data to predict where values are heading. This supports **preventive action** -- acting before a process goes out of control rather than reacting after a violation.

The Predictions tab provides:
- Trend extrapolation overlays on control charts
- Predicted values with confidence intervals
- Early warning when predictions approach control limits

### DOE (Design of Experiments)

DOE is a systematic method to determine how input factors affect a response variable. Instead of changing one factor at a time (OFAT), DOE changes multiple factors simultaneously according to a structured design matrix. This is far more efficient and reveals **interaction effects** that OFAT misses.

**Supported Design Types**:

| Design | Description | Use Case |
|--------|-------------|----------|
| **Full Factorial** (2^k) | All combinations of k factors at 2 levels each | k <= 5 factors. Complete information on all main effects and interactions. |
| **Fractional Factorial** (2^(k-p)) | Subset of full factorial | k > 5 factors. Confounds higher-order interactions to reduce run count. |
| **Plackett-Burman** | Screening design | Many factors (6-47). Estimates main effects only. Identifies the vital few. |
| **Central Composite** (CCD) | Augmented factorial with center and axial points | Response Surface Methodology (RSM). Fits quadratic models for optimization. |

**Key Outputs**:

- **Design Matrix**: Table of coded factor levels (-1, +1) for each run, with randomized run order
- **ANOVA Table**: Analysis of Variance decomposing total variation into factor contributions. Tests significance via F-test and p-values.
  - Source: Factor name, interaction, error, total
  - Sum of Squares (SS): Variation attributed to each source
  - Degrees of Freedom (df): Number of independent comparisons
  - Mean Square (MS): SS/df
  - F-value: MS_factor / MS_error -- ratio of explained to unexplained variation
  - p-value: Probability of F-value occurring by chance. p < 0.05 = significant.
- **Main Effects**: The effect of changing a factor from low to high, averaged over all other factors. Magnitude indicates practical significance.
- **Interaction Effects**: The extent to which a factor's effect depends on the level of another factor. Significant interactions mean you cannot interpret main effects in isolation.
- **Pareto Chart**: Ranks effects by absolute magnitude. Helps identify the "vital few" factors following the Pareto principle.
- **R-squared**: Proportion of response variation explained by the model. R^2 > 0.8 is generally good for process DOE.
- **Regression Model**: Coefficients for predicting response from factor levels. Enables optimization.

**DOE Workflow** in Cassini:
1. **Design** (status: "design"): Create study, define factors with low/high levels
2. **Generate**: Generate the design matrix (randomized run order)
3. **Collect** (status: "collecting"): Enter response values for each run
4. **Analyze** (status: "analyzed"): Compute ANOVA, effects, interactions, regression

---

## How To Configure (Step-by-Step)

### Creating a Multivariate Chart Group

1. Navigate to `/analytics?tab=multivariate` (engineer+ role)
2. In the Group Manager panel, click "New Group"
3. Enter a group name (e.g., "Cylinder Bore Dimensions")
4. Select the chart type:
   - **T-squared**: Standard Hotelling's T-squared for detecting shifts in mean vector
   - **MEWMA**: Multivariate EWMA for detecting small persistent shifts
5. If MEWMA, set the lambda parameter (default 0.2, range 0.05-1.0)
6. Set the alpha level (default 0.05 for 95% confidence)
7. Add 2+ characteristics from the current plant to the group
8. Click Create/Save

### Running Correlation Analysis

1. Navigate to `/analytics?tab=correlation`
2. Use the characteristic multi-selector to choose 2+ characteristics
3. Select the correlation method (Pearson or Spearman)
4. Optionally check "Include PCA" to also compute principal components
5. Click "Compute" to run the analysis
6. Results display as a heatmap with r-values
7. If PCA was included, the biplot appears below the heatmap

### Creating a DOE Study

1. Navigate to `/doe` (engineer+ role)
2. Click "New Study"
3. Enter study name (e.g., "Injection Mold Temperature Optimization")
4. Select design type (Full Factorial, Fractional Factorial, Plackett-Burman, or Central Composite)
5. For fractional factorial, specify the resolution
6. Enter response variable name (e.g., "Tensile Strength") and unit (e.g., "MPa")
7. Add factors:
   - Factor name (e.g., "Temperature")
   - Low level (e.g., 180)
   - High level (e.g., 220)
   - Unit (e.g., "degC")
8. Click Create -- study is created in "design" status

### Generating the Design Matrix

1. Open the study (click the study card on `/doe`)
2. Click "Generate Design" -- creates the run matrix
3. Study transitions to "collecting" status
4. The run table shows run order, standard order, and coded factor levels

### Entering Run Data

1. Open the study in "collecting" status
2. For each run in the matrix, enter the observed response value
3. Optionally add notes for each run (e.g., "Operator A, morning shift")
4. Save/update the runs

### Running Analysis

1. Ensure all runs have response values (no missing data)
2. Click "Analyze" -- computes ANOVA, effects, interactions
3. Study transitions to "analyzed" status
4. View results: ANOVA table, main effects plot, interaction plot, Pareto chart

---

## How To Use (Typical Workflow)

### Multivariate Monitoring

1. An engineer notices that two characteristics (bore diameter and circularity) have occasional joint violations even though individual charts look fine
2. Create a multivariate group with both characteristics
3. Compute the T-squared chart -- Phase I analysis
4. Review the T-squared chart for out-of-control points
5. Click an OOC point to see the decomposition -- which variable contributed most?
6. Once Phase I is clean (remove outliers, re-compute), freeze parameters
7. Phase II monitoring begins -- new data is monitored against frozen parameters

### Root Cause Analysis with Correlation

1. A process engineer suspects that surface roughness is related to tool wear
2. Run correlation analysis on Surface Roughness vs. Tool Hours
3. Pearson r = 0.82, p < 0.001 -- strong positive correlation confirmed
4. Add PCA to see if other characteristics cluster with these two
5. Use insights to set tool change intervals before surface roughness deteriorates

### DOE for Process Optimization

1. Define the problem: "Injection molding cycle time too long, parts have sink marks"
2. Brainstorm factors: Mold Temperature, Injection Pressure, Cooling Time, Pack Pressure
3. Create a 2^4 full factorial study (16 runs)
4. Generate the design matrix -- randomized run order to avoid confounding with time
5. Execute runs on the shop floor, recording the response (sink mark depth)
6. Enter response data into Cassini
7. Analyze: ANOVA shows Mold Temperature (p=0.002) and Pack Pressure (p=0.01) are significant, plus their interaction (p=0.03)
8. Main effects plot shows: higher mold temp reduces sink marks, higher pack pressure reduces sink marks
9. Interaction plot shows: the benefit of higher pack pressure is greater at lower mold temperature
10. Optimal settings: Mold Temp = 210degC, Pack Pressure = 85 MPa

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Pass Condition |
|---|---|---|
| 1 | Analytics page loads | Page renders with 4 tabs: Correlation, Multivariate, Predictions, AI Insights |
| 2 | Multivariate group CRUD | Create, read, update, delete groups works. Group appears in list after creation. |
| 3 | Add characteristics to group | Characteristics from the plant can be added to a group. Members are displayed with names. |
| 4 | T-squared chart renders | After computing, chart shows T-squared values with UCL line. OOC points are highlighted. |
| 5 | T-squared decomposition | Clicking an OOC point shows decomposition table ranking variable contributions. |
| 6 | Phase freeze | Freezing Phase I stores reference mean/covariance. Group transitions to Phase II. |
| 7 | MEWMA chart renders | MEWMA chart type shows smoothed multivariate statistic with UCL. |
| 8 | Correlation heatmap | Heatmap renders with color scale. r-values are displayed. Method (Pearson/Spearman) is selectable. |
| 9 | PCA biplot | Biplot renders with component axes and variable vectors. Explained variance ratios are shown. |
| 10 | PCA eigenvalues | Eigenvalues and cumulative variance are displayed. |
| 11 | Correlation results persist | Recent correlation results are listed and re-viewable. |
| 12 | Predictions tab loads | Predictions tab renders (may show empty state if no models configured). |
| 13 | DOE study CRUD | Create, view, update, delete DOE studies. Status filters work. |
| 14 | Design matrix generation | Full factorial design generates correct number of runs (2^k). Run order is randomized. |
| 15 | Run data entry | Response values can be entered and saved for each run. |
| 16 | ANOVA table | Analysis produces ANOVA table with SS, df, MS, F-value, p-value for each factor. |
| 17 | Main effects | Effect estimates and coefficients are computed for each factor. |
| 18 | Interaction effects | Two-factor interactions are computed with effect magnitudes. |
| 19 | R-squared | Model fit statistic (R-squared, adjusted R-squared) is reported. |
| 20 | DOE status transitions | Study transitions design -> collecting (on generate) -> analyzed (on analyze). |

---

## Edge Cases & Constraints

- **Multivariate needs 2+ characteristics**: A group with fewer than 2 members cannot compute T-squared (the statistic requires multiple correlated variables). The backend validates this.
- **Aligned data requirement**: Multivariate analysis requires data points that share timestamps across all group members. If characteristics have different sampling frequencies, only overlapping time points are used. This can drastically reduce the effective sample count.
- **Minimum 3 aligned observations**: Correlation and PCA require at least 3 aligned data points. The backend returns a 400 error if fewer are available.
- **Covariance matrix singularity**: If characteristics are perfectly collinear (r=1.0), the covariance matrix is singular and T-squared cannot be computed. The backend uses pseudo-inverse (pinv) as a fallback when the condition number is too high.
- **PCA needs more samples than variables**: For reliable PCA results, the number of observations should exceed the number of variables. With few observations, loadings may be unstable.
- **DOE run count grows exponentially**: A 2^k full factorial with k=7 requires 128 runs. Fractional factorial designs reduce this but confound some interactions. Cassini supports up to the practical limits of the design type.
- **DOE analysis requires complete data**: All runs must have response values before analysis can run. The backend validates and returns the list of incomplete run orders.
- **DOE study status transitions are one-way**: Design -> Collecting -> Analyzed. You cannot revert to "design" after generating runs.
- **Correlation heatmap with many variables**: With 20+ characteristics, the heatmap may be dense. Color coding helps but very large matrices benefit from PCA to reduce dimensionality first.
- **Phase freeze is permanent**: Once Phase I parameters are frozen, the group moves to Phase II. There is no "unfreeze" in the current implementation -- create a new group if Phase I needs to be re-estimated.
- **MEWMA lambda selection**: Very small lambda (0.05) gives a long memory (detects small shifts but responds slowly). Large lambda (1.0) is equivalent to T-squared. Typical values are 0.1-0.3.
- **Alpha level**: Lower alpha (e.g., 0.01) gives a higher UCL and fewer false alarms but is less sensitive to real shifts. The default 0.05 provides a 95% confidence level.
- **DOE delete requires admin**: Deleting a study and all its associated data requires admin role, while CRUD and analysis require only engineer+.

---

## API Reference (for seeding)

### Multivariate Group CRUD

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/multivariate/groups?plant_id={id}` | JWT (engineer+) | List groups for a plant |
| `POST` | `/multivariate/groups` | JWT (engineer+) | Create a new group |
| `GET` | `/multivariate/groups/{group_id}` | JWT (engineer+) | Get group with members |
| `PUT` | `/multivariate/groups/{group_id}` | JWT (engineer+) | Update group config |
| `DELETE` | `/multivariate/groups/{group_id}` | JWT (admin) | Delete group and all data |

### Create Group Schema
```json
{
  "plant_id": 1,
  "name": "OQ-Multivariate",
  "description": "Test multivariate group",
  "chart_type": "t_squared",
  "lambda_param": 0.2,
  "alpha": 0.05,
  "characteristic_ids": [10, 11, 12]
}
```

### Multivariate Chart Computation

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/multivariate/groups/{id}/compute` | JWT (engineer+) | Compute T-squared or MEWMA chart data |
| `GET` | `/multivariate/groups/{id}/chart-data` | JWT (engineer+) | Get persisted T-squared time series |
| `POST` | `/multivariate/groups/{id}/freeze` | JWT (engineer+) | Freeze Phase I parameters for Phase II |

### Compute Response Schema
```json
{
  "group_id": 1,
  "group_name": "OQ-Multivariate",
  "chart_type": "t_squared",
  "phase": "phase_i",
  "points": [
    {
      "timestamp": "2026-02-01T10:00:00Z",
      "t_squared": 4.23,
      "ucl": 9.49,
      "in_control": true,
      "decomposition": null
    }
  ],
  "ucl": 9.49,
  "mean": [10.0, 25.3, 0.8],
  "characteristic_names": ["Diameter", "Length", "Roughness"]
}
```

### Correlation Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/multivariate/correlation/compute` | JWT (engineer+) | Compute correlation matrix |
| `GET` | `/multivariate/correlation/results?plant_id={id}` | JWT (engineer+) | List recent correlation results |
| `GET` | `/multivariate/correlation/results/{id}` | JWT (engineer+) | Get specific correlation result |
| `POST` | `/multivariate/correlation/compute-pca` | JWT (engineer+) | Compute PCA |

### Correlation Compute Schema
```json
{
  "plant_id": 1,
  "characteristic_ids": [10, 11, 12],
  "method": "pearson",
  "include_pca": true
}
```

### PCA Response Schema
```json
{
  "eigenvalues": [2.31, 0.52, 0.17],
  "explained_variance_ratios": [0.77, 0.173, 0.057],
  "cumulative_variance": [0.77, 0.943, 1.0],
  "loadings": [[0.58, 0.57, 0.58], [-0.71, 0.0, 0.71], [0.40, -0.82, 0.41]],
  "scores": [[1.2, 0.3, -0.1], ...],
  "characteristic_names": ["Diameter", "Length", "Roughness"]
}
```

### DOE Study CRUD

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/doe/studies?plant_id={id}` | JWT (engineer+) | List studies (optional status filter) |
| `POST` | `/doe/studies` | JWT (engineer+) | Create study with factors |
| `GET` | `/doe/studies/{id}` | JWT (engineer+) | Get study with factors and run counts |
| `PUT` | `/doe/studies/{id}` | JWT (engineer+) | Update study metadata |
| `DELETE` | `/doe/studies/{id}` | JWT (admin) | Delete study and all associated data |

### Create Study Schema
```json
{
  "plant_id": 1,
  "name": "OQ Temperature Study",
  "design_type": "full_factorial",
  "response_name": "Surface Roughness",
  "response_unit": "um",
  "notes": "2-factor temperature/pressure study",
  "factors": [
    { "name": "Temperature", "low_level": 180, "high_level": 220, "unit": "degC" },
    { "name": "Pressure", "low_level": 50, "high_level": 100, "unit": "MPa" }
  ]
}
```

### DOE Design Generation and Runs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/doe/studies/{id}/generate` | JWT (engineer+) | Generate design matrix and runs |
| `GET` | `/doe/studies/{id}/runs` | JWT (engineer+) | Get all runs for a study |
| `PUT` | `/doe/studies/{id}/runs` | JWT (engineer+) | Batch update run response values |

### Batch Run Update Schema
```json
{
  "runs": [
    { "run_id": 1, "response_value": 3.2, "notes": "Run 1 completed" },
    { "run_id": 2, "response_value": 4.1 },
    { "run_id": 3, "response_value": 2.8 },
    { "run_id": 4, "response_value": 5.5, "notes": "High response" }
  ]
}
```

### DOE Analysis

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/doe/studies/{id}/analyze` | JWT (engineer+) | Run ANOVA and regression analysis |
| `GET` | `/doe/studies/{id}/analysis` | JWT (engineer+) | Get latest analysis results |

### Analysis Response Schema
```json
{
  "id": 1,
  "study_id": 1,
  "anova_table": [
    { "source": "Temperature", "sum_of_squares": 12.5, "df": 1, "mean_square": 12.5, "f_value": 25.0, "p_value": 0.002 },
    { "source": "Pressure", "sum_of_squares": 8.0, "df": 1, "mean_square": 8.0, "f_value": 16.0, "p_value": 0.01 },
    { "source": "Temperature*Pressure", "sum_of_squares": 3.2, "df": 1, "mean_square": 3.2, "f_value": 6.4, "p_value": 0.03 },
    { "source": "Error", "sum_of_squares": 2.0, "df": 4, "mean_square": 0.5, "f_value": null, "p_value": null },
    { "source": "Total", "sum_of_squares": 25.7, "df": 7, "mean_square": null, "f_value": null, "p_value": null }
  ],
  "effects": [
    { "factor_index": 0, "factor_name": "Temperature", "effect": 2.5, "coefficient": 1.25 },
    { "factor_index": 1, "factor_name": "Pressure", "effect": 2.0, "coefficient": 1.0 }
  ],
  "interactions": [
    { "factor_indices": [0, 1], "factor_names": ["Temperature", "Pressure"], "effect": 1.2 }
  ],
  "r_squared": 0.922,
  "adj_r_squared": 0.879,
  "computed_at": "2026-02-26T10:00:00Z"
}
```

### Seeding Correlated Data for Testing

To seed characteristics with correlated data suitable for multivariate analysis:

1. Create 3 characteristics (variable data, i_mr) under the same station
2. Submit samples with correlated values using batch import:

```
POST /api/v1/samples/batch
{
  "characteristic_id": {char_1_id},
  "samples": [
    {"measurements": [10.01]},
    {"measurements": [10.03]},
    {"measurements": [9.98]},
    // ... 30+ samples
  ]
}
```

Repeat for each characteristic, using values that have known correlation (e.g., Char2 = Char1 * 2.5 + noise, Char3 = Char1 * -0.8 + offset + noise).

After seeding all three, the correlation endpoint will load aligned data (matching timestamps across characteristics) for analysis.
