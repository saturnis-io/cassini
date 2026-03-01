# Showcase Seed Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build `backend/scripts/seed_showcase.py` — a raw SQLite3 script that populates every Cassini SPC feature with realistic manufacturing data across 3 plants, 24 characteristics, and all compliance modules. Includes dummy server API integration for live connectivity.

**Architecture:** Single Python script using `sqlite3` for maximum speed (~2-5s). Data is mathematically crafted using `random`, `math`, and `numpy` (optional, graceful fallback). Dummy server calls use `urllib.request` (stdlib only). Script outputs `backend/showcase.db`.

**Tech Stack:** Python 3.11+, sqlite3 (stdlib), `cassini.core.auth.passwords.hash_password()` for bcrypt, `urllib.request` for HTTP, optional `numpy` for distribution sampling.

**Variable Subgroups:** Ply Thickness (Wichita, X-bar R, n=5) will include ~10% undersized samples where `actual_n` < 5 and `is_undersized=True`, demonstrating variable subgroup handling.

---

## Task 1: Script Skeleton & Helpers

**Files:**
- Create: `backend/scripts/seed_showcase.py`

**What to build:**
- Imports: `sqlite3`, `os`, `sys`, `math`, `random`, `hashlib`, `json`, `urllib.request`
- Add `backend/src` to `sys.path` so we can import `cassini.core.auth.passwords.hash_password`
- Constants: `DB_PATH`, `DUMMY_SERVER_URL = "http://localhost:3000/api"`
- Timestamp helper: `utcnow()` → ISO string, `ts_offset(base, minutes)` → offset timestamp
- ID tracking: Simple dict-based registry `IDS = {}` for cross-referencing
- `insert_plant(cur, name, code) -> int`
- `insert_hierarchy(cur, plant_id, name, htype, parent_id=None) -> int`
- `insert_user(cur, username, password, email=None, full_name=None) -> int`
- `insert_role(cur, user_id, plant_id, role) -> None`
- `insert_char(cur, hierarchy_id, name, **kwargs) -> int` — flexible kwargs for all characteristic columns
- `insert_sample_variable(cur, char_id, values: list[float], ts, batch=None, operator=None, actual_n=None, is_undersized=False) -> int` — creates sample + N measurements
- `insert_sample_attribute(cur, char_id, defect_count, sample_size=None, units_inspected=None, ts=None) -> int`
- `insert_violation(cur, sample_id, char_id, rule_id, rule_name, severity, acknowledged=False, ack_user=None, ack_reason=None) -> int`
- `insert_annotation(cur, char_id, atype, text, color=None, sample_id=None, start_sid=None, end_sid=None, created_by=None) -> int`
- `insert_capability(cur, char_id, cp, cpk, pp, ppk, cpm=None, count=100, p_value=None, calc_by="system") -> int`
- Data generators:
  - `gen_normal(n, mean, std)` → list of floats
  - `gen_weibull(n, shape, scale)` → list
  - `gen_gamma(n, shape, scale)` → list
  - `gen_lognormal(n, mu, sigma)` → list
  - `gen_exponential(n, lam)` → list
  - `gen_drift(n, mean, std, drift_per_sample)` → list (gradual shift)
  - `gen_shift(n, mean1, std1, shift_point, mean2, std2)` → list (step change)
  - `gen_poisson(n, lam)` → list of ints
  - `gen_binomial(n, trials, prob)` → list of ints
- Dummy server helper: `api_call(method, path, body=None) -> (success: bool, response_or_error: str)`

**Step 1:** Write the complete skeleton with all helpers and data generators.

**Step 2:** Verify it runs without errors:
```bash
cd backend && python scripts/seed_showcase.py --dry-run
```
(Add a `--dry-run` flag that tests imports and generators without writing DB)

**Step 3:** Commit:
```bash
git add backend/scripts/seed_showcase.py
git commit -m "feat(seed): showcase seed skeleton with helpers and data generators"
```

---

## Task 2: Plants, Hierarchy, Users & Roles

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_foundation(cur)` that creates:

**3 Plants:**
- "Precision Motors — Detroit" (DET)
- "Titan Aerospace — Wichita" (ICT)
- "BioVerde Pharma — Research Triangle" (RTP)

**Hierarchy trees** (ISA-95 style per design doc Section 3):
- Detroit: Plant → Machining Area (CNC Line 1 [Lathe, Mill], CNC Line 2 [Grinder], Inspection [CMM]) → Assembly Area (Torque Station, Solder Line, Final Test) → Paint Shop (Spray Booth, Curing Oven)
- Wichita: Plant → Composite Fabrication (Layup Room, Autoclave) → Machining (5-Axis CNC) → Assembly (Fastener Station, Torque Bench) → NDT Lab (X-Ray, Ultrasonic)
- RTP: Plant → API Manufacturing (Reactor R-100, Dryer D-200) → Formulation (Blender B-300, Tablet Press) → Packaging (Fill Line, Seal Station) → QC Lab (HPLC, Dissolution)

**8 Users** (all password `demo123`):
- admin / Sarah Chen / admin@cassini-demo.com
- eng.detroit / Marcus Johnson
- eng.wichita / Priya Patel
- eng.pharma / David Kim
- sup.detroit / Ana Rodriguez
- sup.pharma / James O'Brien
- op.floor1 / Tyler Washington
- op.floor2 / Maria Santos

**Role assignments** per design doc Section 2.

**Password Policy** on RTP: strict 21 CFR Part 11 settings.

**Step 1:** Implement `seed_foundation(cur)`.

**Step 2:** Test by running the script and checking plant/hierarchy/user counts:
```bash
cd backend && python scripts/seed_showcase.py
sqlite3 showcase.db "SELECT COUNT(*) FROM plant; SELECT COUNT(*) FROM hierarchy; SELECT COUNT(*) FROM user;"
```
Expected: 3 plants, ~35+ hierarchy nodes, 8 users.

**Step 3:** Commit:
```bash
git add backend/scripts/seed_showcase.py
git commit -m "feat(seed): showcase plants, hierarchy, users, roles, password policy"
```

---

## Task 3: All 24 Characteristics

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_characteristics(cur)` that creates all 24 characteristics with correct configuration per the design doc.

Key configurations requiring attention:
- **X-bar R**: `subgroup_size=5` (Bearing OD, Ply Thickness, API Conc.), `subgroup_mode="NOMINAL_TOLERANCE"`
- **X-bar S**: `subgroup_size=8` (Bore Diameter, Turbine Blade, Blend Uniformity)
- **I-MR**: `subgroup_size=1`
- **CUSUM**: `chart_type="cusum"`, `cusum_target`, `cusum_k=0.5`, `cusum_h=5.0`
- **EWMA**: `chart_type="ewma"`, `ewma_lambda=0.2`, `ewma_l=3.0`
- **Attribute**: `data_type="attribute"`, `attribute_chart_type` = p/np/c/u, `default_sample_size`
- **Non-normal**: `distribution_method="auto"`, `distribution_params` JSON
- **Short-run**: `short_run_mode="standardized"` or `"deviation"`, `stored_sigma`, `stored_center_line`
- **Laney**: `use_laney_correction=1` on Solder Defects p-chart

Each characteristic needs realistic `target_value`, `usl`, `lsl`, `ucl`, `lcl`, `stored_sigma`.

Store all characteristic IDs in the `IDS` dict for cross-referencing.

**Step 1:** Implement `seed_characteristics(cur)` with all 24.

**Step 2:** Verify:
```bash
sqlite3 showcase.db "SELECT name, subgroup_size, data_type, chart_type, distribution_method, short_run_mode, use_laney_correction FROM characteristic;"
```
Expected: 24 rows with correct configs.

**Step 3:** Commit:
```bash
git commit -m "feat(seed): 24 characteristics covering all chart types, distributions, and modes"
```

---

## Task 4: Rule Presets & Characteristic Rules

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_rules(cur)` that creates:

**Note:** Built-in presets (Nelson, AIAG, WECO, Wheeler) are created by migration 032's `reseed_built_in_rule_presets` migration. Check if they already exist in the schema. If so, just reference them. If not, insert them.

**1 custom rule preset:**
- "BioVerde Pharma QC" — plant-scoped to RTP, rules 1-4 enabled with custom thresholds:
  - Rule 1: `sigma_multiplier: 2.5` (tighter than default 3)
  - Rule 2: `consecutive_count: 7` (tighter than default 9)

**Characteristic rules:**
- Most chars: default Nelson rules (1-4 enabled)
- Ply Thickness: AIAG preset (1,2,3,4,5,6 enabled)
- Fastener Torque: Wheeler preset
- Blend Uniformity: custom pharma preset

Insert `characteristic_rules` rows for each characteristic with the appropriate rule config.

**Step 1:** Implement `seed_rules(cur)`.
**Step 2:** Verify with `SELECT * FROM rule_preset` and `SELECT * FROM characteristic_rules`.
**Step 3:** Commit.

---

## Task 5: Sample Data — Variable Charts (Non-Narrative)

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_variable_samples(cur)` that generates ~500 samples each for the non-narrative variable characteristics.

For each characteristic, generate data using the appropriate distribution and insert via `insert_sample_variable()`. Key details:

- **Surface Finish Ra** (Weibull): `gen_weibull(500, shape=2.5, scale=1.2)`, I-MR so 1 measurement per sample
- **Bore Diameter** (short-run Z): Multiple part families with different targets, Z-scored. `stored_sigma` and `stored_center_line` set on characteristic. Each sample gets `z_score` column populated.
- **Pin Height** (CUSUM): Normal with small shift at sample 300. Populate `cusum_high` and `cusum_low` on each sample.
- **Bolt Torque** (EWMA): Gradual trend. Populate `ewma_value` on each sample.
- **Ply Thickness** (X-bar R, AIAG): Normal, subgroup=5. **~10% of samples have actual_n=3 or 4 with is_undersized=True** — variable subgroup showcase.
- **Turbine Blade** (Gamma): `gen_gamma(500, shape=5, scale=0.3)`, subgroup=8
- **Rivet Grip** (deviation mode): Multiple targets, deviation from nominal stored
- **Fastener Torque** (EWMA, Wheeler): Stable with `ewma_value`
- **API Concentration** (lognormal): `gen_lognormal(500, mu=4.6, sigma=0.05)`, subgroup=5
- **Moisture Content** (I-MR): Normal, tight limits
- **Blend Uniformity** (X-bar S, custom rules): Normal, subgroup=8
- **Tablet Weight** — skip here, handled in narrative arc (Task 7)
- **Fill Volume** (CUSUM): Tight pharma, populate `cusum_high`/`cusum_low`
- **Assay %** (exponential): `gen_exponential(500, lam=0.02)` shifted to center around 99.5
- **Dissolution Rate** (EWMA): Gradual changes, populate `ewma_value`

Timestamps should span realistic ranges (2-3 months, roughly 5-10 samples per day).

**Step 1:** Implement `seed_variable_samples(cur)`.
**Step 2:** Verify sample counts:
```bash
sqlite3 showcase.db "SELECT c.name, COUNT(s.id) FROM characteristic c JOIN sample s ON s.char_id=c.id WHERE c.data_type='variable' GROUP BY c.name;"
```
**Step 3:** Verify variable subgroups on Ply Thickness:
```bash
sqlite3 showcase.db "SELECT actual_n, is_undersized, COUNT(*) FROM sample WHERE char_id=(SELECT id FROM characteristic WHERE name LIKE '%Ply%') GROUP BY actual_n, is_undersized;"
```
Expected: Mix of actual_n=5 (is_undersized=0) and actual_n=3,4 (is_undersized=1).
**Step 4:** Commit.

---

## Task 6: Sample Data — Attribute Charts

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_attribute_samples(cur)` that generates ~500 samples each for the 5 attribute characteristics.

- **Solder Defects (p-chart, Laney)**: `sample_size` varies 80-120, `defect_count` from overdispersed binomial (higher variance than pure binomial to show Laney correction value)
- **Electrical Pass/Fail (np-chart)**: Fixed `sample_size=100`, `defect_count` from binomial(100, 0.03)
- **Paint Defects (c-chart)**: No sample_size, `defect_count` from Poisson(λ=4) with seasonal pattern
- **Blemishes (u-chart)**: `units_inspected` varies 5-15, `defect_count` from Poisson scaled by area
- **Void % (p-chart)**: `sample_size=50`, `defect_count` from binomial(50, 0.02), low rate aerospace
- **Seal Failures (p-chart)**: `sample_size=200`, `defect_count` from binomial(200, 0.01), low rate pharma
- **Delamination (c-chart)**: `defect_count` from Poisson(λ=1.5), rare events

**Step 1:** Implement `seed_attribute_samples(cur)`.
**Step 2:** Verify attribute samples have correct fields populated:
```bash
sqlite3 showcase.db "SELECT c.name, s.defect_count, s.sample_size, s.units_inspected FROM characteristic c JOIN sample s ON s.char_id=c.id WHERE c.data_type='attribute' LIMIT 20;"
```
**Step 3:** Commit.

---

## Task 7: Narrative Arc Data

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_narrative_arcs(cur)` that creates the 3 narrative arcs from design doc Section 5.

### Arc 1: "The Out-of-Control Crankshaft" (Bearing OD, X-bar R, n=5)
- Samples 1-200: `gen_normal(200, mean=25.000, std=0.008)` — stable, Cpk ~1.45
- Samples 201-280: `gen_drift(80, mean=25.000, std=0.008, drift=0.0003)` — gradual upward shift
- Insert violations at appropriate samples: Rule 2 (9 above CL) around sample 240, Rule 5 (2/3 Zone A) around sample 260
- Annotation at sample 250: "Tool wear investigation initiated — Bearing OD trending high"
- Samples 281-320: Gap period (no data for 2 days), then recalibrated data at new center
- Annotation at sample 285: "Replaced cutting insert CNC-401. Process recalibrated."
- Samples 321-500: `gen_normal(180, mean=25.000, std=0.006)` — tighter after fix
- 4 capability snapshots: at sample 100 (Cpk=1.45), 250 (Cpk=0.89), 350 (Cpk=1.52), 500 (Cpk=1.67)
- Mix violations: some acknowledged with reasons by `eng.detroit`, some unacknowledged

### Arc 2: "The Anomaly in the Autoclave" (Cure Temp, I-MR)
- Samples 1-300: `gen_normal(300, mean=177.0, std=0.3)` — stable
- Samples 301-350: `gen_drift(50, mean=177.0, std=0.35, drift=0.01)` — subtle shift
- Annotation at sample 320: "AI flagged potential heater element degradation"
- Samples 351-500: `gen_normal(150, mean=177.0, std=0.28)` — corrected
- (Anomaly events inserted separately in Task 12)

### Arc 3: "The Regulated Tablet" (Tablet Weight, I-MR)
- Samples 1-500: `gen_normal(500, mean=200.0, std=0.5)` — in-control throughout
- 2 capability snapshots: at sample 250 (Cpk=1.38), 500 (Cpk=1.41)
- (Signature workflows inserted separately in Task 13)

**Step 1:** Implement `seed_narrative_arcs(cur)`.
**Step 2:** Verify narrative data patterns:
```bash
sqlite3 showcase.db "SELECT COUNT(*) FROM sample WHERE char_id=(SELECT id FROM characteristic WHERE name LIKE '%Bearing%');"
sqlite3 showcase.db "SELECT COUNT(*) FROM violation WHERE char_id=(SELECT id FROM characteristic WHERE name LIKE '%Bearing%');"
sqlite3 showcase.db "SELECT COUNT(*) FROM annotation WHERE characteristic_id=(SELECT id FROM characteristic WHERE name LIKE '%Bearing%');"
```
**Step 3:** Commit.

---

## Task 8: Violations for Non-Narrative Characteristics

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_violations(cur)` that sprinkles realistic violations across the non-narrative characteristics.

- For each variable characteristic: ~3-8 Rule 1 violations (values beyond 3σ), scattered through the 500 samples
- For CUSUM characteristics: ~2-3 violations where cumulative sum exceeds h
- For attribute charts: ~5-10 Rule 1 violations (proportion above UCL)
- Mix of acknowledged/unacknowledged, different severity levels
- Some violations acknowledged by operators, some by engineers

**Step 1:** Implement.
**Step 2:** Verify:
```bash
sqlite3 showcase.db "SELECT char_id, COUNT(*), SUM(acknowledged) FROM violation GROUP BY char_id;"
```
**Step 3:** Commit.

---

## Task 9: Capability History & Annotations for Non-Narrative

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_capability_and_annotations(cur)`:

- **Capability snapshots**: 2 per non-narrative characteristic (one early, one recent). Compute realistic Cp/Cpk/Pp/Ppk values based on the generated data distributions.
- **Annotations**: 1-2 per plant as general notes:
  - Detroit: "Scheduled maintenance - all lines" (period annotation)
  - Wichita: "New material batch received" (point annotation)
  - RTP: "Annual FDA audit preparation" (period annotation)

**Step 1:** Implement.
**Step 2:** Verify:
```bash
sqlite3 showcase.db "SELECT COUNT(*) FROM capability_history;"
sqlite3 showcase.db "SELECT COUNT(*) FROM annotation;"
```
**Step 3:** Commit.

---

## Task 10: Connectivity — MQTT Brokers, OPC-UA Servers, Data Sources

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_connectivity(cur)`:

**MQTT Brokers (one per plant):**
- "Detroit MQTT" — plant_id=Detroit, host=localhost, port=1883, no auth, no TLS, outbound_enabled=True
- "Wichita MQTT" — plant_id=Wichita, same config
- "RTP MQTT" — plant_id=RTP, same config

**OPC-UA Servers (one per plant):**
- "Detroit OPC-UA" — plant_id=Detroit, endpoint=`opc.tcp://localhost:4840/UA/TestHarness`, anonymous, no security
- "Wichita OPC-UA" — plant_id=Wichita, same
- "RTP OPC-UA" — plant_id=RTP, same

**Data Sources (for ~10 OPC-UA mapped + ~14 MQTT mapped characteristics):**
- OPC-UA data sources: Bearing OD, Surface Finish, Bore Diameter, Pin Height (Detroit), Cure Temp, Blade Profile, Rivet Grip (Wichita), API Concentration, Tablet Weight, Fill Volume (RTP)
- MQTT data sources: Bolt Torque, Solder Defects, Electrical, Paint Defects, Blemishes (Detroit), Ply Thickness, Fastener Torque, Void %, Delamination (Wichita), Moisture, Blend Uniformity, Seal Failures, Assay, Dissolution (RTP)

For each: insert `data_source` base row, then `mqtt_data_source` or `opcua_data_source` child row.

**Step 1:** Implement.
**Step 2:** Verify:
```bash
sqlite3 showcase.db "SELECT COUNT(*) FROM mqtt_broker; SELECT COUNT(*) FROM opcua_server; SELECT COUNT(*) FROM data_source;"
```
**Step 3:** Commit.

---

## Task 11: Gage Bridges

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_gage_bridges(cur)`:

**2 gage bridges:**
1. "CMM Bridge — Detroit Floor" — plant=Detroit, mqtt_broker=Detroit MQTT, status="online", recent heartbeat, api_key_hash=SHA256 of a dummy key
   - Port 1: COM3, Mitutoyo Digimatic, baud=9600, mapped to Pin Height char
   - Port 2: COM5, generic regex, baud=115200, parse_pattern for bore readings
2. "QC Lab Bridge — RTP" — plant=RTP, mqtt_broker=RTP MQTT, status="online"
   - Port 1: COM1, generic, baud=9600, mapped to Assay char

**Step 1:** Implement.
**Step 2:** Verify:
```bash
sqlite3 showcase.db "SELECT b.name, COUNT(p.id) FROM gage_bridge b LEFT JOIN gage_port p ON p.bridge_id=b.id GROUP BY b.name;"
```
**Step 3:** Commit.

---

## Task 12: Anomaly Detection Config & Events

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_anomaly(cur)`:

**Anomaly configs** (enabled on Cure Temp and a few others):
- Cure Temp: all 3 detectors enabled (PELT + IsolationForest + K-S)
- Bearing OD: PELT only
- Tablet Weight: K-S only

**Anomaly events** for Arc 2 (Cure Temp):
1. PELT changepoint at sample 310 — severity "high", event_type "changepoint"
2. IsolationForest outlier at sample 315 — severity "medium", event_type "anomaly_score"
3. IsolationForest outlier at sample 325 — severity "medium"
4. IsolationForest outlier at sample 340 — severity "medium"
5. K-S distribution shift window 280-350 — severity "high", event_type "distribution_shift"
6. Dismissed false positive at sample 200 — severity "low", is_dismissed=True, dismissed_reason="Normal variation during startup"

**Step 1:** Implement.
**Step 2:** Verify:
```bash
sqlite3 showcase.db "SELECT detector_type, severity, is_acknowledged, is_dismissed FROM anomaly_event;"
```
**Step 3:** Commit.

---

## Task 13: Electronic Signatures — Full Lifecycle

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_signatures(cur)`:

**Signature meanings** (per plant — RTP gets all, others get basics):
- approved, reviewed, verified, rejected, released (all plants)

**4 workflow configs:**
1. FAI Report Approval (RTP, is_required=True): Step 1: Engineer review → Step 2: Supervisor approve
2. Spec Limit Change (RTP, is_required=True): Step 1: Engineer review → Step 2: Supervisor approve
3. MSA Study Sign-off (Wichita): Step 1: Engineer review
4. Critical Sample Approval (Detroit): Step 1: Supervisor approve

**5 workflow instances:**
1. **Approved** — Tablet weight spec update (RTP). Both steps signed by eng.pharma (reviewed) and sup.pharma (approved). 2 electronic_signature rows.
2. **Rejected** — Wider API concentration limits (RTP). Step 1 signed, Step 2 rejected with comment. 2 signature rows (1 valid, 1 rejection).
3. **Pending** — Fill Volume limit change (RTP). Initiated, no signatures yet. current_step=1.
4. **Partial** — MSA sign-off (Wichita). Step 1 signed by eng.wichita. Waiting for step 2 (if workflow has 2 steps).
5. **Expired** — Old Detroit sample approval. expires_at in the past, status="expired".

**Step 1:** Implement.
**Step 2:** Verify:
```bash
sqlite3 showcase.db "SELECT status, COUNT(*) FROM signature_workflow_instance GROUP BY status;"
sqlite3 showcase.db "SELECT COUNT(*) FROM electronic_signature;"
```
**Step 3:** Commit.

---

## Task 14: MSA Studies

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_msa(cur)`:

**3 studies per design doc:**

1. **Crankshaft Gage R&R** (Detroit, crossed_anova, Bearing OD):
   - 3 operators × 10 parts × 3 reps = 90 measurements
   - Generate realistic measurement data with operator and part variation
   - `results_json` with ANOVA table, GR&R=12.3%, NDC=8
   - status="complete", created_by=eng.detroit

2. **CMM Repeatability** (Detroit, range_method, Pin Height):
   - 2 operators × 10 parts × 2 reps = 40 measurements
   - `results_json` with GR&R=8.1%
   - status="complete"

3. **X-Ray Inspection Agreement** (Wichita, attribute_agreement, Void %):
   - 3 operators × 20 parts × 2 reps = 120 measurements
   - `attribute_value` = "Pass"/"Fail" instead of numeric value
   - `results_json` with Kappa=0.87
   - status="complete"

**Step 1:** Implement.
**Step 2:** Verify:
```bash
sqlite3 showcase.db "SELECT s.name, s.study_type, COUNT(m.id) FROM msa_study s JOIN msa_measurement m ON m.study_id=s.id GROUP BY s.name;"
```
**Step 3:** Commit.

---

## Task 15: FAI Reports

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_fai(cur)`:

**3 reports per design doc:**

1. **Turbine Blade Rev C** (Wichita, approved):
   - part_number="TB-2026-001", revision="C", status="approved"
   - created_by=eng.wichita, submitted_by=eng.wichita, approved_by=sup.detroit (cross-plant supervisor)
   - 15 FAI items: balloon 1-15, realistic aerospace dims, 14 pass + 1 rework with deviation_reason
   - Forms 1+2 fields populated (organization, supplier, PO, material_spec, special_processes)

2. **Tablet Press Setup** (RTP, submitted):
   - part_number="TP-500-R4", status="submitted"
   - created_by=eng.pharma, submitted_by=sup.pharma (different user = separation of duties)
   - 8 FAI items, all pass

3. **Crankshaft Housing** (Detroit, draft):
   - part_number="CH-8800-A", status="draft"
   - created_by=eng.detroit, no submitted_by or approved_by
   - 12 FAI items, some with actual_value=NULL (in progress)

**Step 1:** Implement.
**Step 2:** Verify:
```bash
sqlite3 showcase.db "SELECT r.part_number, r.status, COUNT(i.id) FROM fai_report r JOIN fai_item i ON i.report_id=r.id GROUP BY r.part_number;"
```
**Step 3:** Commit.

---

## Task 16: Notifications, ERP, Retention, Audit

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_compliance(cur)`:

**SMTP Config:**
- server="smtp.company-internal.local", port=587, use_tls=1, from_address="cassini@company-internal.local", is_active=0

**2 Webhook Configs:**
- "Slack Quality Alerts" — url="https://hooks.slack-mock.local/cassini-alerts", events_filter="violation,anomaly"
- "ERP Quality Webhook" — url="https://erp.precision-motors.local/api/webhooks/quality", events_filter="capability,fai"

**Notification Preferences** — per user × event type:
- Operators: violation (email, critical only)
- Engineers: violation + anomaly + capability (email, all)
- Supervisors: violation + fai + signature (email, warning+)
- Admin: everything (email + webhook, all)

**2 ERP Connectors:**
1. "SAP Quality Mgmt" (Detroit, sap_odata):
   - base_url="https://sap.precision-motors.local/sap/opu/odata/sap/API_QUALITYNOTIFICATION"
   - auth_type="oauth2_client_credentials", auth_config="{}" (empty — demo only)
   - 2 field mappings: MaterialNumber↔characteristic.name, InspLotQuantity↔sample.actual_n
   - Sync schedule: "0 */6 * * *" (every 6 hours)
   - 2 sync logs: 1 success (42 records), 1 older success (38 records)

2. "QC LIMS" (RTP, generic_lims):
   - base_url="https://lims.bioverde.local/api/v2/results"
   - auth_type="api_key", auth_config="{}"
   - 2 field mappings
   - Sync schedule: "0 */2 * * *" (every 2 hours)
   - 3 sync logs: 2 success, 1 failed with error_message="Connection timeout after 30s"

**Retention Policies:**
- Detroit global: time_delta, 730 days
- Detroit per-char: sample_count, 500 (on Bearing OD)
- Wichita global: forever
- RTP global: time_delta, 2555 days (7 years)
- RTP API Mfg: time_delta, 3650 days (10 years) on API Manufacturing hierarchy

**Audit Trail:**
~50 entries spread across users and action types:
- login/logout events for each user
- characteristic edits by engineers
- sample submissions by operators
- FAI status changes
- limit change approvals
- Config changes by admin

**Step 1:** Implement `seed_compliance(cur)`.
**Step 2:** Verify counts:
```bash
sqlite3 showcase.db "SELECT COUNT(*) FROM smtp_config; SELECT COUNT(*) FROM webhook_config; SELECT COUNT(*) FROM notification_preference; SELECT COUNT(*) FROM erp_connector; SELECT COUNT(*) FROM retention_policy; SELECT COUNT(*) FROM audit_log;"
```
**Step 3:** Commit.

---

## Task 17: Dummy Server Integration

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:** Function `seed_dummy_server()` (no cursor — uses HTTP only):

1. Check if dummy server is running: `GET /api/status`
   - If fails: print warning with specific error, return early

2. Push full config: `PUT /api/config/current` with ProjectConfig JSON containing:
   - OPC-UA nodes (10 variable nodes per design doc)
   - MQTT topics (9 topics per design doc)
   - metadata (partIdPattern, machineId, etc.)

3. Start servers: `POST /api/opcua/start`, `POST /api/mqtt/start`

4. Start generators: `POST /api/opcua/generate/start` for each node with appropriate mode/nominal/stdDev/rateMs per design doc Section 4

5. Print summary of what was configured, or specific errors for each failed call

**Graceful failure:** Each API call is independently try/excepted. Report all failures at the end. Never crash the seed script.

**Step 1:** Implement.
**Step 2:** Test with dummy server down (should print warning and continue):
```bash
cd backend && python scripts/seed_showcase.py
```
**Step 3:** Test with dummy server running (should configure and start generators).
**Step 4:** Commit.

---

## Task 18: Main Entry Point & Final Polish

**Files:**
- Modify: `backend/scripts/seed_showcase.py`

**What to build:**

`main()` function that:
1. Parse args: `--db-path` (default `showcase.db`), `--dry-run`, `--skip-dummy-server`, `--force` (overwrite existing)
2. If DB exists and no `--force`: prompt or error
3. Run Alembic migrations on fresh DB (or copy from migrated template)
   - Actually: create DB, run `alembic upgrade head`, THEN seed
   - Alternative: just run raw CREATE TABLE statements (simpler for a seed)
   - **Decision:** Use Alembic. The script should:
     ```python
     # Create fresh DB
     os.makedirs(os.path.dirname(db_path), exist_ok=True)
     # Set CASSINI_DATABASE_URL env var
     os.environ["CASSINI_DATABASE_URL"] = f"sqlite:///{os.path.abspath(db_path)}"
     # Run alembic upgrade head
     subprocess.run(["alembic", "upgrade", "head"], cwd=backend_dir, check=True)
     ```
4. Open sqlite3 connection, enable WAL mode, enable foreign keys
5. Call seed functions in order:
   - `seed_foundation(cur)` — plants, hierarchy, users, roles
   - `seed_characteristics(cur)` — 24 characteristics
   - `seed_rules(cur)` — rule presets, characteristic rules
   - `seed_variable_samples(cur)` — non-narrative variable data
   - `seed_attribute_samples(cur)` — attribute data
   - `seed_narrative_arcs(cur)` — 3 narrative arcs with violations, annotations, capability
   - `seed_violations(cur)` — scattered violations for non-narrative chars
   - `seed_capability_and_annotations(cur)` — capability history + annotations
   - `seed_connectivity(cur)` — MQTT, OPC-UA, data sources
   - `seed_gage_bridges(cur)` — gage bridges + ports
   - `seed_anomaly(cur)` — anomaly configs + events
   - `seed_signatures(cur)` — signature meanings, workflows, instances, signatures
   - `seed_msa(cur)` — MSA studies + measurements
   - `seed_fai(cur)` — FAI reports + items
   - `seed_compliance(cur)` — notifications, ERP, retention, audit
6. Commit and close DB
7. Print summary (table counts)
8. If not `--skip-dummy-server`: call `seed_dummy_server()`
9. Print final success message with login instructions

**Step 1:** Implement main entry point.
**Step 2:** Full end-to-end test:
```bash
cd backend && python scripts/seed_showcase.py --force
```
Verify it runs without errors and creates a populated DB.

**Step 3:** Start the backend against the showcase DB and verify it boots:
```bash
CASSINI_DATABASE_URL=sqlite:///showcase.db uvicorn cassini.main:app --port 8000
```

**Step 4:** Commit:
```bash
git commit -m "feat(seed): complete showcase seed script with all features and dummy server integration"
```

---

## Verification Checklist

After all tasks, run the full seed and verify against the HTML companion:

```bash
cd backend
python scripts/seed_showcase.py --force
sqlite3 showcase.db <<'SQL'
SELECT 'plants', COUNT(*) FROM plant;
SELECT 'hierarchy', COUNT(*) FROM hierarchy;
SELECT 'users', COUNT(*) FROM user;
SELECT 'characteristics', COUNT(*) FROM characteristic;
SELECT 'samples', COUNT(*) FROM sample;
SELECT 'measurements', COUNT(*) FROM measurement;
SELECT 'violations', COUNT(*) FROM violation;
SELECT 'annotations', COUNT(*) FROM annotation;
SELECT 'capability_history', COUNT(*) FROM capability_history;
SELECT 'rule_presets', COUNT(*) FROM rule_preset;
SELECT 'char_rules', COUNT(*) FROM characteristic_rules;
SELECT 'mqtt_brokers', COUNT(*) FROM mqtt_broker;
SELECT 'opcua_servers', COUNT(*) FROM opcua_server;
SELECT 'data_sources', COUNT(*) FROM data_source;
SELECT 'gage_bridges', COUNT(*) FROM gage_bridge;
SELECT 'gage_ports', COUNT(*) FROM gage_port;
SELECT 'msa_studies', COUNT(*) FROM msa_study;
SELECT 'msa_measurements', COUNT(*) FROM msa_measurement;
SELECT 'fai_reports', COUNT(*) FROM fai_report;
SELECT 'fai_items', COUNT(*) FROM fai_item;
SELECT 'anomaly_configs', COUNT(*) FROM anomaly_detector_config;
SELECT 'anomaly_events', COUNT(*) FROM anomaly_event;
SELECT 'sig_meanings', COUNT(*) FROM signature_meaning;
SELECT 'sig_workflows', COUNT(*) FROM signature_workflow;
SELECT 'sig_instances', COUNT(*) FROM signature_workflow_instance;
SELECT 'signatures', COUNT(*) FROM electronic_signature;
SELECT 'smtp_config', COUNT(*) FROM smtp_config;
SELECT 'webhook_config', COUNT(*) FROM webhook_config;
SELECT 'notif_prefs', COUNT(*) FROM notification_preference;
SELECT 'erp_connectors', COUNT(*) FROM erp_connector;
SELECT 'erp_mappings', COUNT(*) FROM erp_field_mapping;
SELECT 'erp_schedules', COUNT(*) FROM erp_sync_schedule;
SELECT 'erp_logs', COUNT(*) FROM erp_sync_log;
SELECT 'retention', COUNT(*) FROM retention_policy;
SELECT 'audit_log', COUNT(*) FROM audit_log;
SQL
```

**Expected approximate counts:**
- plants: 3, hierarchy: ~35, users: 8, characteristics: 24
- samples: ~12,000, measurements: ~30,000+, violations: ~80-120
- annotations: ~8-10, capability_history: ~30-40
- MSA measurements: ~250, FAI items: ~35
- anomaly events: 6, signatures: ~12
- audit_log: ~50

---

## Execution Notes

- Tasks 1-3 are sequential (foundation must exist before characteristics)
- Tasks 4-16 can be parallelized in groups:
  - **Wave A** (data): Tasks 4, 5, 6, 7 (rules + sample data)
  - **Wave B** (violations/stats): Tasks 8, 9 (depend on samples)
  - **Wave C** (infrastructure): Tasks 10, 11 (connectivity)
  - **Wave D** (compliance): Tasks 12, 13, 14, 15, 16 (can run in parallel)
- Task 17 (dummy server) and 18 (main) are sequential, last
