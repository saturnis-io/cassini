# Feature: Data Entry

## What It Does

Data entry is how measurements get into the Cassini SPC system. It is the foundation of everything -- without data, no control charts render, no capability indices calculate, no violations fire, and no audit trail accrues. Cassini supports three entry methods:

1. **Manual entry via UI** -- An operator navigates to `/data-entry`, selects a characteristic from the hierarchy tree, and types measurement values into input fields. This is the most common shop-floor workflow.
2. **CSV/Excel import wizard** -- A toolbar button opens a multi-step import wizard that parses a CSV or Excel file, lets the user map columns to the characteristic schema, validates data, and bulk-imports rows as samples.
3. **API submission** -- External systems (gages, PLCs, LIMS, ERP connectors) submit samples programmatically via REST endpoints authenticated with API keys or JWT tokens.

Each entry method feeds the same SPC engine pipeline: measurements are stored as `Sample` + `Measurement` records, processed through the SPC engine, and evaluated against Nelson Rules. Violations are created in-line and returned in the response.

---

## Where To Find It

| Entry Method | Location | Min Role |
|---|---|---|
| Manual entry | `/data-entry` page | operator |
| CSV import | Import button in toolbar on `/data-entry` | operator |
| API single submit | `POST /data-entry/submit` | API key or JWT |
| API attribute submit | `POST /data-entry/submit-attribute` | API key or JWT |
| API CUSUM submit | `POST /data-entry/submit-cusum` | API key or JWT |
| API EWMA submit | `POST /data-entry/submit-ewma` | API key or JWT |
| API batch submit | `POST /data-entry/batch` | API key or JWT |
| Manual sample submit | `POST /samples/` | operator (JWT) |
| Manual batch import | `POST /samples/batch` | operator (JWT) |
| CSV upload | `POST /import/upload` | any authenticated |
| CSV validate | `POST /import/validate` | any authenticated |
| CSV confirm | `POST /import/confirm` | any authenticated |

Sample management (list, get, edit, delete, exclude) lives under `GET/PUT/DELETE /samples/` and `PATCH /samples/{id}/exclude`.

---

## Key Concepts (Six Sigma Context)

### Rational Subgrouping
Measurements taken together under the same conditions (same operator, same machine, same setup, same time window) form a **subgroup**. The subgroup size is configured on the characteristic and determines how many values constitute one data entry. For an X-bar/R chart with subgroup size 5, the operator enters 5 measurements per submission. The SPC engine computes the subgroup mean (X-bar) and range (R) from those 5 values.

### Variable vs. Attribute Data
- **Variable data** = continuous measurements on a scale (e.g., diameter 10.032 mm, temperature 72.4 F). Plotted on X-bar/R, X-bar/S, or I-MR charts.
- **Attribute data** = discrete counts or classifications (e.g., 3 defects found, 2 out of 50 failed). Plotted on p, np, c, or u charts. Each attribute chart type expects different input fields:
  - **p-chart**: defect count + sample size (proportion defective)
  - **np-chart**: defect count (fixed sample size configured on characteristic)
  - **c-chart**: defect count (count of defects per unit, fixed opportunity area)
  - **u-chart**: defect count + units inspected (defects per unit, variable opportunity)

### Measurement Traceability
Every sample records: timestamp (auto or user-provided), operator ID (optional), batch number (optional), and the raw measurement values. Edited samples create `SampleEditHistory` records preserving previous values, editor identity, reason, and timestamp. This chain supports 21 CFR Part 11 and IATF 16949 traceability requirements.

### Sample Processing Pipeline
1. Measurements arrive (UI, CSV, or API)
2. `SampleRepository.create_with_measurements()` persists `Sample` + `Measurement` rows
3. `SPCEngine.process_sample()` computes mean, range, zone classification
4. `NelsonRuleLibrary.check_all()` evaluates all enabled rules against the rolling window
5. `ViolationRepository` persists any triggered violations
6. Response returns sample ID, statistics, zone, in_control flag, and violation list
7. For CUSUM/EWMA charts, dedicated engines (`cusum_engine`, `ewma_engine`) handle the specialized processing

---

## How To Configure (Step-by-Step)

### Prerequisite: Characteristic Must Exist
Before entering data, you need a characteristic configured with:
- **Chart type** (xbar_r, xbar_s, i_mr, p, np, c, u, cusum, ewma)
- **Subgroup size** (1 for individuals, 2-10 for X-bar/R, >10 for X-bar/S)
- **Data type** (variable or attribute)
- **Spec limits** (optional but needed for capability analysis)

### Manual Entry Setup
1. Log in as operator or higher
2. Navigate to `/data-entry`
3. Select the target plant from the header plant switcher
4. Expand the hierarchy tree in the left sidebar (Department > Line > Characteristic)
5. Click on the target characteristic -- input fields appear matching the subgroup size and data type

### CSV Import Setup
1. Prepare a CSV or Excel file with measurement data
2. Column headers should be descriptive (e.g., "Value 1", "Value 2", "Timestamp", "Batch")
3. Variable data: one or more measurement columns (one per subgroup member)
4. Attribute data: defect_count column (required), sample_size/units_inspected (depends on chart type)
5. Maximum file size: 10 MB

### API Entry Setup
1. Create an API key in Settings > API Keys (engineer+ role)
2. Note the key value (shown only once)
3. Include the key in the `X-API-Key` header
4. Rate limit: 30 requests per minute per endpoint

---

## How To Use (Typical Workflow)

### Manual Variable Data Entry
1. Navigate to `/data-entry`, select plant, select characteristic from tree
2. Enter measurement values in the input fields (e.g., for subgroup of 5: 10.01, 10.03, 9.98, 10.02, 10.00)
3. Optionally enter batch number and operator ID
4. Click **Submit**
5. Toast notification confirms success; the sample appears on the dashboard chart

### Manual Attribute Data Entry
1. Navigate to `/data-entry`, select an attribute characteristic (p, np, c, or u chart)
2. Enter the required fields:
   - p-chart: defect count and sample size
   - np-chart: defect count (sample size is fixed on the characteristic)
   - c-chart: defect count
   - u-chart: defect count and units inspected
3. Click **Submit**

### CSV Import Workflow
1. Click the **Import** button in the data entry toolbar
2. **Step 1 -- Upload**: Select a CSV or Excel file. The wizard parses it and shows column names and preview rows.
3. **Step 2 -- Map Columns**: Map file columns to characteristic fields (measurement_1...measurement_N, timestamp, batch_number, operator_id). For attribute data, map to defect_count, sample_size, units_inspected.
4. **Step 3 -- Validate**: The system validates all rows against the characteristic schema. Shows valid count, invalid count, and error details for bad rows.
5. **Step 4 -- Confirm**: Click Confirm to import valid rows as samples. Returns imported count, error count, and error details.

### API Submission
```
POST /api/v1/data-entry/submit
X-API-Key: cassini_your_key_here
Content-Type: application/json

{
  "characteristic_id": 42,
  "measurements": [10.01, 10.03, 9.98, 10.02, 10.00],
  "batch_number": "LOT-2026-001",
  "operator_id": "OP-42"
}
```

### Sample Editing
1. On the dashboard, click a data point to open the sample inspector
2. Click **Edit** (supervisor+ required)
3. Modify measurement values
4. Enter a reason for the change (required for audit trail)
5. Save -- the system re-runs Nelson Rules on the updated values

### Sample Exclusion
1. In the sample inspector, click **Exclude** (supervisor+ required)
2. The sample is excluded from control limit calculations
3. On the chart, excluded points display with a distinct style (typically hollow or grayed)
4. Control limits recalculate without the excluded point
5. **Re-include** reverses the exclusion and restores normal styling

---

## Acceptance Criteria (OQ-Style)

| # | Criterion | Pass Condition |
|---|---|---|
| 1 | Single measurement submits | POST returns 201, sample_id > 0, mean matches input |
| 2 | Subgroup of N submits | POST returns 201, mean = average of N values, range = max-min |
| 3 | Attribute p-chart entry | Defect count and sample size accepted, plotted_value = defects/sample_size |
| 4 | Attribute c-chart entry | Defect count accepted without sample size |
| 5 | Attribute u-chart entry | Defect count and units inspected accepted |
| 6 | CSV upload parses | Returns columns array and preview_rows |
| 7 | CSV validation works | Returns valid_count and error_rows |
| 8 | CSV confirm imports | Returns imported count matching valid_count |
| 9 | Sample edit tracked | SampleEditHistory record created with previous and new values |
| 10 | Sample delete cascades | Measurements and violations deleted with sample |
| 11 | Sample exclude recalculates | Control limits change after exclusion |
| 12 | API key auth works | X-API-Key header accepted, 401 without key |
| 13 | Non-numeric rejected | Validation error returned, no sample created |
| 14 | CUSUM/EWMA entry | Dedicated engines process samples correctly |

---

## Edge Cases & Constraints

- **Non-numeric input**: Frontend validates before submission; backend returns 400 if measurements contain non-numeric values
- **Empty submissions**: Submit button is disabled until all required fields are filled
- **Wrong measurement count**: If a characteristic has subgroup_size=5 and you submit 3 values, the backend returns 400 "Invalid input"
- **CSV with missing values**: Rows with missing required columns are flagged as invalid during validation step
- **CSV max file size**: 10 MB limit enforced server-side (413 if exceeded)
- **Duplicate timestamps**: Allowed -- the system generates display keys (YYMMDD-NNN) to disambiguate
- **Sample editing**: Creates immutable `SampleEditHistory` record; original values preserved. Re-runs Nelson Rules.
- **Rate limiting**: API data entry endpoints are limited to 30 requests/minute
- **Batch import**: Maximum 1000 samples per batch request
- **CUSUM/EWMA routing**: The samples router auto-detects chart_type and routes to the correct engine (cusum_engine or ewma_engine)
- **Plant scoping**: All data entry is scoped to the currently selected plant. Authorization checks resolve the plant from the characteristic's hierarchy.

---

## API Reference (for seeding)

### Sample Submission
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/samples/` | JWT (operator+) | Submit single sample (variable data, auto-routes CUSUM/EWMA) |
| `POST` | `/samples/batch` | JWT (operator+) | Batch import (up to 1000 samples) |
| `GET` | `/samples/` | JWT | List samples with filters (char_id, date range, pagination) |
| `GET` | `/samples/{id}` | JWT | Get single sample with measurements |
| `PUT` | `/samples/{id}` | JWT (supervisor+) | Update sample measurements (creates edit history) |
| `DELETE` | `/samples/{id}` | JWT (supervisor+) | Delete sample (cascades measurements + violations) |
| `PATCH` | `/samples/{id}/exclude` | JWT (supervisor+) | Toggle exclusion status |
| `GET` | `/samples/{id}/history` | JWT | Get sample edit history |

### Data Entry (API Key or JWT)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/data-entry/submit` | API key or JWT | Submit single variable sample |
| `POST` | `/data-entry/submit-attribute` | API key or JWT | Submit single attribute sample |
| `POST` | `/data-entry/submit-cusum` | API key or JWT | Submit single CUSUM sample |
| `POST` | `/data-entry/submit-ewma` | API key or JWT | Submit single EWMA sample |
| `POST` | `/data-entry/batch` | API key or JWT | Submit multiple samples |
| `GET` | `/data-entry/schema` | None | Get API schema documentation |

### CSV Import
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/import/upload` | JWT | Upload file, get column preview |
| `POST` | `/import/validate` | JWT | Validate column mapping (multipart: file + mapping + char_id) |
| `POST` | `/import/confirm` | JWT | Confirm import (multipart: file + mapping + char_id) |

### Request Schemas (key fields)
```json
// SampleCreate (POST /samples/)
{
  "characteristic_id": 42,
  "measurements": [10.01, 10.03, 9.98, 10.02, 10.00],
  "batch_number": "LOT-001",  // optional
  "operator_id": "OP-42"       // optional
}

// DataEntryRequest (POST /data-entry/submit)
{
  "characteristic_id": 42,
  "measurements": [10.02],
  "batch_number": "LOT-001",
  "operator_id": "OP-42",
  "metadata": {}               // optional key-value pairs
}

// AttributeDataEntryRequest (POST /data-entry/submit-attribute)
{
  "characteristic_id": 55,
  "defect_count": 3,
  "sample_size": 50,           // required for p-chart
  "units_inspected": 10,       // required for u-chart
  "batch_number": "LOT-001",
  "operator_id": "OP-42"
}

// SampleUpdate (PUT /samples/{id})
{
  "measurements": [10.05, 10.03, 9.98, 10.02, 10.00],
  "reason": "Corrected transcription error"
}

// SampleExclude (PATCH /samples/{id}/exclude)
{
  "is_excluded": true
}
```
