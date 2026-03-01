# Feature: MSA / Gage R&R

## What It Does

Measurement System Analysis (MSA) evaluates the measurement system itself -- can your gages and operators produce reliable, repeatable measurements? If the measurement system contributes excessive variation, then all SPC data collected with it is suspect, and no amount of process improvement will fix what is actually a measurement problem. MSA is required by AIAG MSA 4th Edition, IATF 16949 (automotive), AS9100 (aerospace), and ISO 13485 (medical devices).

Cassini implements both variable MSA (Gage R&R) and attribute MSA (Kappa analysis) with full AIAG-compliant calculation engines, ANOVA decomposition, d2* constant lookup tables, and automated verdict classification.

---

## Where To Find It

| Location | Route | Min Role | Description |
|---|---|---|---|
| MSA study list | `/msa` | engineer | Table of all MSA studies for the selected plant |
| New study wizard | `/msa/new` | engineer | Create a new MSA study (type, operators, parts, replicates) |
| Study editor | `/msa/{studyId}` | engineer | Overview, data entry grid, and results tabs |

All MSA operations require **engineer+** role for the study's plant.

---

## Key Concepts (Six Sigma Context)

### Gage R&R (Repeatability & Reproducibility)

Gage R&R decomposes total measurement variation into its component sources:

- **Repeatability (EV -- Equipment Variation)**: Same operator, same part, same gage -- variation inherent to the instrument itself. High EV means the gage is imprecise regardless of who uses it.
- **Reproducibility (AV -- Appraiser Variation)**: Different operators measure the same part with the same gage -- variation from operator technique, training, or interpretation. High AV means operators need standardized procedures.
- **Interaction (Operator x Part)**: Some operators may measure certain parts differently than others. A significant interaction (p < 0.05 in the ANOVA table) suggests inconsistent technique across part geometries.
- **Part Variation (PV)**: The actual part-to-part variation. This is the signal you WANT to see -- it represents real process variation, not measurement noise.
- **Gage R&R (GRR)**: Combined measurement system variation. GRR = sqrt(EV^2 + AV^2).
- **Total Variation (TV)**: TV = sqrt(GRR^2 + PV^2). The total observed variation from all sources.

### Interpretation Thresholds (AIAG MSA 4th Edition)

| %Study GRR | Verdict | Interpretation |
|---|---|---|
| < 10% | Acceptable | Measurement system is adequate |
| 10 -- 30% | Marginal | May be acceptable depending on application, cost of measurement device, cost of repair |
| > 30% | Unacceptable | Measurement system needs improvement; corrective action required |

Cassini color-codes these thresholds: green for acceptable, amber for marginal, red for unacceptable.

### Number of Distinct Categories (ndc)

ndc = 1.41 x (PV / GRR), truncated to an integer. This indicates how many groups of parts the measurement system can reliably distinguish. AIAG requires ndc >= 5 for an adequate measurement system. If ndc < 2, the gage essentially cannot distinguish parts at all -- it is acting as a binary go/no-go gage. Cassini displays ndc with green (>= 5) or red (< 5) color coding.

### Study Types

| Type | Backend Key | Description |
|---|---|---|
| Crossed ANOVA | `crossed_anova` | Every operator measures every part multiple times. Full ANOVA decomposition with F-tests. Most common and most informative. |
| Range Method | `range_method` | Quick 2-operator assessment using average range. Provides EV, AV, GRR but no ANOVA table or interaction term. Faster but less information. |
| Nested ANOVA | `nested_anova` | Each operator measures unique parts (destructive testing). Cannot separate operator x part interaction because parts are not shared across operators. |
| Attribute Agreement | `attribute_agreement` | For pass/fail or categorical judgments. Uses Cohen's Kappa (2 raters) or Fleiss' Kappa (3+ raters). |

### ANOVA Method

Analysis of Variance (ANOVA) provides a statistically rigorous decomposition of variation. The ANOVA table shows for each source (operator, part, interaction, repeatability):
- **SS (Sum of Squares)**: Total squared deviation for that source
- **df (Degrees of Freedom)**: Number of independent values that can vary
- **MS (Mean Squares)**: SS / df -- the average squared deviation
- **F-statistic**: MS(source) / MS(error) -- ratio of source variation to random error
- **p-value**: Probability of observing this F-statistic by chance. p < 0.05 is statistically significant (highlighted in red in the UI).

### d2* Constants

AIAG MSA 4th Edition Appendix C provides d2* values based on the number of measurements in a subgroup and the number of subgroups. These constants are critical for converting average ranges into standard deviation estimates. Cassini implements both the 1D d2* table (for crossed/nested ANOVA) and the 2D d2*(m, g) table (for the range method), with linear interpolation for keys not in the lookup table.

### Attribute MSA (Kappa Analysis)

For pass/fail or categorical measurement systems:

- **Cohen's Kappa (2 raters)**: Measures agreement between a pair of raters, corrected for chance agreement. kappa = (p_o - p_e) / (1 - p_e), where p_o = observed agreement and p_e = expected agreement by chance.
- **Fleiss' Kappa (3+ raters)**: Generalizes kappa to multiple raters. Measures the degree of agreement beyond what would be expected by chance across all raters simultaneously.
- **Within-Appraiser Agreement**: Each rater's self-consistency across repeated trials of the same items.
- **Between-Appraiser Agreement**: Cross-rater agreement percentage.

| Kappa | Interpretation |
|---|---|
| > 0.75 | Good to excellent agreement |
| 0.40 -- 0.75 | Fair to good agreement |
| < 0.40 | Poor agreement |

Cassini reports verdict as "acceptable" (kappa > 0.75), "marginal" (0.40-0.75), or "unacceptable" (< 0.40).

---

## How To Configure (Step-by-Step)

### Creating a Crossed ANOVA Study

1. Log in as engineer or admin
2. Navigate to `/msa`
3. Click **New Study**
4. Fill the study creation form:
   - **Name**: Descriptive name (e.g., "OQ-GRR-Crossed-Caliper")
   - **Type**: Select "Crossed ANOVA (standard Gage R&R)"
   - **Operators**: Set number (minimum 2, typically 3)
   - **Parts**: Set number (minimum 2, typically 10)
   - **Replicates**: Set number (minimum 1, typically 2-3)
   - **Tolerance** (optional): USL - LSL for P/T ratio calculation
   - **Characteristic** (optional): Link to a Cassini characteristic for traceability
5. Click Create -- redirects to the study editor

### Setting Up Operators and Parts

1. In the study editor Overview tab, enter operator names (e.g., "Op-A", "Op-B", "Op-C")
2. Enter part names (e.g., "Part-01" through "Part-10") with optional reference values
3. Both are set as bulk operations -- all operators/parts are replaced on each save

### Entering Measurements

1. Switch to the Data tab
2. A data grid appears: rows = parts, columns = operators x replicates
3. Enter measurement values in each cell
4. Grid updates automatically as values are entered
5. All cells must be filled before calculation is allowed

### Calculating Results

1. Switch to the Results tab (or click Calculate from the Overview)
2. Click **Calculate** -- the engine reshapes data into a 3D array and runs the appropriate method
3. Results display: verdict banner, ndc badge, variance components chart, %Contribution table, ANOVA table (crossed only), and interpretation guide

---

## How To Use (Typical Workflow)

### Standard Gage R&R Workflow (Crossed ANOVA)

1. Select 10 parts that span the expected process variation range
2. Have 3 operators each measure all 10 parts twice (2 replicates) in random order
3. Enter the 60 measurements (3 x 10 x 2) into Cassini
4. Click Calculate
5. Review %Study GRR, ndc, and ANOVA table
6. If %GRR > 30%, investigate EV vs. AV:
   - High EV: gage needs calibration, repair, or replacement
   - High AV: operators need training, procedures need standardization
   - Significant interaction: some operators handle certain part geometries differently

### Quick Assessment (Range Method)

1. Select 5 parts, 2 operators, 1 replicate each
2. Enter measurements (10 total)
3. Calculate -- returns simplified EV/AV/GRR without ANOVA table
4. Use as a screening tool; follow up with full crossed ANOVA if results are marginal

### Destructive Testing (Nested)

1. Each operator gets their own set of unique parts (e.g., 3 operators x 5 parts each = 15 unique parts)
2. Enter measurements (parts are not shared across operators)
3. Calculate -- operator x part interaction cannot be separated from part variation in this design

### Attribute MSA

1. Select study type "Attribute Agreement Analysis"
2. Set 2+ raters and define items (typically 50+ items for statistical power)
3. Each rater classifies each item (e.g., "pass" or "fail") multiple times
4. Calculate -- returns within-appraiser agreement, between-appraiser agreement, Cohen's kappa (all pairs), and Fleiss' kappa

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Pass Condition |
|---|---|---|
| 1 | Crossed study creation | POST returns 201 with study_type "crossed_anova", status "setup" |
| 2 | Operators set | POST returns operator list with correct names and sequence_order |
| 3 | Parts set | POST returns part list with correct names and sequence_order |
| 4 | Measurements submit | POST returns measurement records, study status changes to "collecting" |
| 5 | ANOVA calculation | POST returns GageRRResult with all variance components, ANOVA table, verdict |
| 6 | %GRR thresholds | < 10% = "acceptable", 10-30% = "marginal", > 30% = "unacceptable" |
| 7 | ndc calculation | ndc = int(1.41 x PV / GRR), displayed with >= 5 / < 5 color coding |
| 8 | Range method | Returns EV, AV, GRR without ANOVA table or interaction term |
| 9 | Nested method | Handles non-shared parts, returns valid variance decomposition |
| 10 | Attribute MSA | Returns Cohen's kappa (pairs), Fleiss' kappa, within/between agreement |
| 11 | Study list | GET returns studies with status, type, operator/part counts, dates |
| 12 | Delete study | DELETE removes study and cascades to operators, parts, measurements |
| 13 | Incomplete data rejected | 400 if measurement matrix has unfilled cells |
| 14 | Wrong study type | 400 if calculate endpoint called on wrong study type (variable vs attribute) |

---

## Edge Cases & Constraints

- **Minimum dimensions**: At least 2 operators and 2 parts required (enforced by schema validation `ge=2`)
- **Range method**: Best with exactly 2 operators; engine handles >2 but the range method is designed for 2
- **Nested study parts**: Each operator measures unique parts -- the data grid layout reflects this; entering shared parts would violate the nested design assumption
- **Zero part variation**: If all parts measure identically, PV = 0, and %GRR = 100% regardless of how good the gage is. This is a study design problem, not a gage problem -- select parts that span the tolerance range.
- **Negative variance components**: ANOVA can produce negative variance estimates (typically for interaction). The engine floors these at zero.
- **Replicate count**: At least 1 replicate required, but 1 replicate with crossed ANOVA provides no within-operator repeatability estimate. Use 2+ replicates for meaningful results.
- **Tolerance required for P/T ratio**: `pct_tolerance_grr` is null if tolerance is not provided at study creation. P/T ratio compares measurement variation to spec width.
- **Attribute MSA degenerate cases**: If all raters agree perfectly, kappa = 1.0. If agreement equals chance, kappa = 0.0. If agreement is worse than chance, kappa < 0 (possible but rare).
- **Study status flow**: setup -> collecting (on first measurement submission) -> complete (on calculation). Recalculation overwrites previous results.
- **Signature workflows**: If electronic signatures are configured for `msa_study` resource type, completing a study initiates a signature workflow.
- **RBAC enforcement**: All endpoints require engineer+ for the study's plant. Operators and supervisors cannot access MSA.

---

## API Reference (for seeding)

### Study Lifecycle
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/msa/studies` | JWT (engineer+) | Create a new MSA study |
| `GET` | `/msa/studies?plant_id=N` | JWT (engineer+) | List studies for a plant |
| `GET` | `/msa/studies/{id}` | JWT (engineer+) | Get study with operators, parts, measurement count |
| `DELETE` | `/msa/studies/{id}` | JWT (engineer+) | Delete study and all associated data |

### Operators and Parts
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/msa/studies/{id}/operators` | JWT (engineer+) | Set operators (bulk replace) |
| `POST` | `/msa/studies/{id}/parts` | JWT (engineer+) | Set parts (bulk replace) |

### Measurements
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/msa/studies/{id}/measurements` | JWT (engineer+) | Submit variable measurements batch |
| `GET` | `/msa/studies/{id}/measurements` | JWT (engineer+) | Get all measurements |
| `POST` | `/msa/studies/{id}/attribute-measurements` | JWT (engineer+) | Submit attribute measurements batch |

### Calculation
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/msa/studies/{id}/calculate` | JWT (engineer+) | Run Gage R&R (crossed/range/nested) |
| `POST` | `/msa/studies/{id}/attribute-calculate` | JWT (engineer+) | Run attribute MSA (kappa) |
| `GET` | `/msa/studies/{id}/results` | JWT (engineer+) | Get cached calculation results |

### Request Schemas (key fields)
```json
// MSAStudyCreate (POST /msa/studies)
{
  "name": "OQ-GRR-Crossed",
  "study_type": "crossed_anova",  // crossed_anova | range_method | nested_anova | attribute_agreement
  "num_operators": 3,
  "num_parts": 10,
  "num_replicates": 2,
  "tolerance": 0.10,              // optional, USL - LSL
  "characteristic_id": null,      // optional, link to characteristic
  "plant_id": 1
}

// MSAOperatorsSet (POST /msa/studies/{id}/operators)
{
  "operators": ["Op-A", "Op-B", "Op-C"]
}

// MSAPartsSet (POST /msa/studies/{id}/parts)
{
  "parts": [
    {"name": "Part-01", "reference_value": null},
    {"name": "Part-02", "reference_value": null}
  ]
}

// MSAMeasurementBatch (POST /msa/studies/{id}/measurements)
{
  "measurements": [
    {"operator_id": 1, "part_id": 1, "replicate_num": 1, "value": 25.01},
    {"operator_id": 1, "part_id": 1, "replicate_num": 2, "value": 25.02}
  ]
}

// MSAAttributeBatch (POST /msa/studies/{id}/attribute-measurements)
{
  "measurements": [
    {"operator_id": 1, "part_id": 1, "replicate_num": 1, "attribute_value": "pass"},
    {"operator_id": 1, "part_id": 1, "replicate_num": 2, "attribute_value": "fail"}
  ]
}
```

### Response Schemas (key fields)
```json
// GageRRResultResponse (from calculate)
{
  "method": "crossed_anova",
  "repeatability_ev": 0.0098,
  "reproducibility_av": 0.0052,
  "interaction": 0.0012,
  "gage_rr": 0.0111,
  "part_variation": 0.0823,
  "total_variation": 0.0831,
  "pct_contribution_ev": 1.39,
  "pct_contribution_av": 0.39,
  "pct_contribution_interaction": 0.02,
  "pct_contribution_grr": 1.78,
  "pct_contribution_pv": 98.22,
  "pct_study_ev": 11.79,
  "pct_study_av": 6.26,
  "pct_study_grr": 13.36,
  "pct_study_pv": 99.10,
  "pct_tolerance_grr": 5.70,
  "ndc": 10,
  "anova_table": {
    "operator": {"SS": 0.0012, "df": 2, "MS": 0.0006, "F": 3.21, "p": 0.0451},
    "part": {"SS": 0.4521, "df": 9, "MS": 0.0502, "F": 267.3, "p": 0.0000},
    "interaction": {"SS": 0.0008, "df": 18, "MS": 0.00004, "F": 0.89, "p": 0.592},
    "repeatability": {"SS": 0.0014, "df": 30, "MS": 0.00005}
  },
  "verdict": "marginal"
}

// AttributeMSAResultResponse (from attribute-calculate)
{
  "within_appraiser": {"Op-A": 0.92, "Op-B": 0.88, "Op-C": 0.90},
  "between_appraiser": 0.87,
  "vs_reference": null,
  "cohens_kappa_pairs": {"Op-A vs Op-B": 0.82, "Op-A vs Op-C": 0.79, "Op-B vs Op-C": 0.81},
  "fleiss_kappa": 0.80,
  "verdict": "acceptable"
}
```
