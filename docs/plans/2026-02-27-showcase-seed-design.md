# Showcase Seed Design — "One Ring to Rule Them All"

**Date:** 2026-02-27
**Purpose:** Comprehensive seed script that populates all features of Cassini SPC for demos, QA testing, and marketing screenshots.
**Approach:** Raw SQLite3 script (`backend/scripts/seed_showcase.py`) + dummy server API integration for live connectivity.

---

## 1. Plants & Industry Themes

3 plants, each a distinct regulated industry:

| Plant | Code | Industry | Compliance |
|-------|------|----------|------------|
| Precision Motors — Detroit | `DET` | Automotive (IATF 16949) | High-volume, tight tolerances, attribute + variable mix, short-run |
| Titan Aerospace — Wichita | `ICT` | Aerospace (AS9100/AS9102) | FAI reports, signatures, long-run, CUSUM/EWMA |
| BioVerde Pharma — Research Triangle | `RTP` | Pharmaceutical (FDA 21 CFR Part 11) | Full compliance, non-normal distributions, anomaly detection |

Each plant gets ISA-95 hierarchy, connectivity, retention policies, and role assignments.

---

## 2. Users & Roles

8 users across 4 role tiers:

| User | Full Name | Primary Role | Plants |
|------|-----------|-------------|--------|
| `admin` | Sarah Chen | Admin | All 3 (auto) |
| `eng.detroit` | Marcus Johnson | Engineer | Detroit |
| `eng.wichita` | Priya Patel | Engineer | Wichita |
| `eng.pharma` | David Kim | Engineer | RTP |
| `sup.detroit` | Ana Rodriguez | Supervisor | Detroit + Wichita |
| `sup.pharma` | James O'Brien | Supervisor | RTP |
| `op.floor1` | Tyler Washington | Operator | Detroit |
| `op.floor2` | Maria Santos | Operator | Wichita + RTP |

- All passwords: `demo123`
- RTP password policy: strict 21 CFR Part 11 (90-day expiry, 5 failed lockout, history 12, complex)
- Detroit/Wichita: lighter defaults

---

## 3. Equipment Hierarchy & Characteristics (24 total)

### Plant 1: Precision Motors — Detroit (9 characteristics)

```
Precision Motors Detroit
├── Machining Area
│   ├── CNC Line 1
│   │   ├── Lathe CNC-401 ← Crankshaft Bearing OD (X-bar R, subgroup=5, NARRATIVE ARC)
│   │   └── Mill CNC-402 ← Surface Finish Ra (I-MR, Weibull dist)
│   ├── CNC Line 2
│   │   └── Grinder CNC-501 ← Bore Diameter (X-bar S, subgroup=8, short-run standardized)
│   └── Inspection
│       └── CMM Station ← Pin Height (CUSUM)
├── Assembly Area
│   ├── Torque Station ← Bolt Torque (EWMA)
│   ├── Solder Line ← Solder Defects (p-chart, Laney p')
│   └── Final Test ← Pass/Fail Electrical (np-chart)
└── Paint Shop
    ├── Spray Booth ← Paint Defects per Panel (c-chart)
    └── Curing Oven ← Blemishes per m² (u-chart)
```

### Plant 2: Titan Aerospace — Wichita (7 characteristics)

```
Titan Aerospace Wichita
├── Composite Fabrication
│   ├── Layup Room ← Ply Thickness (X-bar R, AIAG preset)
│   └── Autoclave ← Cure Temperature (I-MR, NARRATIVE ARC — anomaly detection)
├── Machining
│   └── 5-Axis CNC ← Turbine Blade Profile (X-bar S, gamma dist)
├── Assembly
│   ├── Fastener Station ← Rivet Grip Length (I-MR, short-run deviation mode)
│   └── Torque Bench ← Fastener Torque (EWMA, Wheeler preset)
└── NDT Lab
    ├── X-Ray ← Void Percentage (p-chart)
    └── Ultrasonic ← Delamination Count (c-chart)
```

### Plant 3: BioVerde Pharma — RTP (8 characteristics)

```
BioVerde Pharma RTP
├── API Manufacturing
│   ├── Reactor R-100 ← Active Ingredient Concentration (X-bar R, lognormal)
│   └── Dryer D-200 ← Moisture Content % (I-MR)
├── Formulation
│   ├── Blender B-300 ← Blend Uniformity (X-bar S, custom rule preset)
│   └── Tablet Press ← Tablet Weight (I-MR, NARRATIVE ARC — signature workflow)
├── Packaging
│   ├── Fill Line ← Fill Volume (CUSUM, tight detection)
│   └── Seal Station ← Seal Failures (p-chart)
└── QC Lab
    ├── HPLC ← Assay % (I-MR, exponential dist)
    └── Dissolution ← Dissolution Rate (EWMA)
```

### Chart Type Coverage

| Chart Type | Count | Characteristics |
|-----------|-------|-----------------|
| X-bar R | 3 | Bearing OD, Ply Thickness, API Concentration |
| X-bar S | 3 | Bore Diameter, Turbine Blade, Blend Uniformity |
| I-MR | 5 | Surface Finish, Cure Temp, Rivet Grip, Moisture, Tablet Weight, Assay |
| CUSUM | 2 | Pin Height, Fill Volume |
| EWMA | 3 | Bolt Torque, Fastener Torque, Dissolution Rate |
| p-chart | 3 | Solder Defects (Laney), Void %, Seal Failures |
| np-chart | 1 | Electrical Pass/Fail |
| c-chart | 2 | Paint Defects, Delamination |
| u-chart | 1 | Blemishes per m² |

### Distribution Coverage

| Distribution | Characteristic |
|-------------|---------------|
| Normal (default) | Most characteristics |
| Weibull | Surface Finish Ra (shape=2.5, scale=1.2) |
| Gamma | Turbine Blade Profile (shape=5, scale=0.3) |
| Lognormal | API Concentration (μ=4.6, σ=0.05) |
| Exponential | Assay % |

### Short-Run Coverage

| Mode | Characteristic |
|------|---------------|
| Standardized (Z-scores) | Bore Diameter |
| Deviation (target-relative) | Rivet Grip Length |

### Rule Preset Coverage

| Preset | Characteristic |
|--------|---------------|
| Nelson (default) | Most |
| AIAG | Ply Thickness |
| Wheeler | Fastener Torque |
| Custom (pharma) | Blend Uniformity |

---

## 4. Connectivity — Live via Dummy Server

### Architecture

The seed script calls `http://localhost:3000/api/` to configure a local dummy server for live data during demos. Fails gracefully if the server is down.

### Cassini-Side Config (in SQLite)

- **MQTT Brokers**: `localhost:1883`, no auth, no TLS
- **OPC-UA Servers**: `opc.tcp://localhost:4840/UA/TestHarness`, anonymous, no security policy
- **Data source mappings**: Each OPC-UA/MQTT characteristic gets a DataSource row

### Dummy Server Config

Push via `PUT /api/config/current`:

**OPC-UA Nodes:**
```
Plant (folder)
├── Detroit (object)
│   ├── Detroit.BearingOD      (Double, 25.000)
│   ├── Detroit.SurfaceFinish  (Double, 1.200)
│   ├── Detroit.BoreDiameter   (Double, 50.000)
│   └── Detroit.PinHeight      (Double, 12.700)
├── Wichita (object)
│   ├── Wichita.CureTemp       (Double, 177.0)
│   ├── Wichita.BladeProfile   (Double, 2.150)
│   └── Wichita.RivetGrip      (Double, 6.350)
└── RTP (object)
    ├── RTP.APIConcentration   (Double, 99.50)
    ├── RTP.TabletWeight       (Double, 200.0)
    └── RTP.FillVolume         (Double, 5.000)
```

**MQTT Topics:**
```
detroit/machining/measurements
detroit/assembly/measurements
detroit/paint/measurements
wichita/composite/measurements
wichita/ndt/measurements
rtp/api-mfg/measurements
rtp/formulation/measurements
rtp/packaging/measurements
rtp/qc-lab/measurements
```

### Generator Configs

Started via `POST /api/opcua/generate/start` and `POST /api/mqtt/generate/start`:

| Node/Topic | Mode | Nominal | StdDev | Rate |
|---|---|---|---|---|
| Detroit.BearingOD | `drift` | 25.000 | 0.008 | 2000ms |
| Detroit.SurfaceFinish | `normal` | 1.200 | 0.050 | 2000ms |
| Wichita.CureTemp | `drift` | 177.0 | 0.30 | 3000ms |
| RTP.FillVolume | `sine` | 5.000 | 0.015 | 2000ms |
| RTP.TabletWeight | `normal` | 200.0 | 0.50 | 2000ms |
| All others | `normal` | (per spec) | (tight) | 2000ms |

### Graceful Failure

If `http://localhost:3000` is unreachable:
1. Print warning with specific failed API calls
2. SQLite seed completes normally — all Cassini configs still created
3. User can start dummy server later and re-run connectivity portion

---

## 5. Narrative Arcs

### Arc 1: "The Out-of-Control Crankshaft" (Detroit — Bearing OD, X-bar R)

~500 samples over 3 months:
1. **Samples 1-200**: Stable, Cpk ~1.45
2. **Samples 201-280**: Mean shift upward (tool wear) — Nelson Rule 2 + Rule 5 fire
3. **Sample 250**: Annotation "Tool wear investigation initiated"
4. **Sample 260**: MSA study triggered (crossed ANOVA, 3 ops × 10 parts × 3 reps, GR&R 12.3%)
5. **Samples 281-320**: Halted, recalibrated
6. **Annotation**: "Replaced cutting insert, recalibrated"
7. **Samples 321-500**: Back in control, Cpk ~1.67
8. **Capability history**: 4 snapshots showing dip and recovery
9. **Violations**: Mix of acknowledged (with reasons) and unacknowledged

### Arc 2: "The Anomaly in the Autoclave" (Wichita — Cure Temp, I-MR)

~500 samples over 2 months:
1. **Samples 1-300**: Stable, normal
2. **Samples 301-350**: Subtle shift — PELT changepoint, IsolationForest outliers, K-S distribution shift
3. **Anomaly events**: 2 high, 3 medium, 1 dismissed
4. **Annotation**: "AI flagged potential heater element degradation"
5. **Samples 351-500**: Corrective action, return to normal

### Arc 3: "The Regulated Tablet" (RTP — Tablet Weight, I-MR)

~500 samples over 6 weeks:
1. **Samples 1-500**: Generally in-control
2. **Signature workflows**: Pending, approved, rejected, expired (full lifecycle)
3. **FAI report**: Tablet press AS9102 (submitted → approved, separation of duties)
4. **Capability snapshots**: Strong Cpk >1.33 throughout

---

## 6. Studies & Compliance

### MSA Studies (3)

| Study | Plant | Type | Characteristic | Result |
|-------|-------|------|---------------|--------|
| Crankshaft Gage R&R | Detroit | Crossed ANOVA | Bearing OD | GR&R 12.3%, NDC 8 |
| CMM Repeatability | Detroit | Range Method | Pin Height | GR&R 8.1% |
| X-Ray Inspection Agreement | Wichita | Attribute Agreement | Void % | Kappa 0.87 |

### FAI Reports (3)

| Report | Plant | Status | Part | Items |
|--------|-------|--------|------|-------|
| Turbine Blade Rev C | Wichita | Approved | TB-2026-001 | 15 items |
| Tablet Press Setup | RTP | Submitted | TP-500-R4 | 8 items |
| Crankshaft Housing | Detroit | Draft | CH-8800-A | 12 items |

### Electronic Signatures (full lifecycle)

- 4 workflow configurations (FAI approval, limit change, MSA sign-off, sample approval)
- 5 workflow instances: approved, rejected, pending, partially-signed, expired
- ~12 individual signatures

### Notifications

- SMTP config: `smtp.company-internal.local:587`
- 2 webhook configs (Slack mock + ERP webhook)
- Per-user notification preferences matching roles

### ERP Connectors (2)

| Connector | Plant | Type | Schedule |
|-----------|-------|------|----------|
| SAP Quality Mgmt | Detroit | SAP OData | Every 6 hours |
| QC LIMS | RTP | Generic LIMS | Every 2 hours |

### Retention Policies

- Detroit: 2-year global + 500-sample per characteristic
- Wichita: Forever (aerospace records)
- RTP: 7-year global + 10-year on API Manufacturing

### Audit Trail

~50 entries: logins, edits, submissions, approvals, config changes across all users.

---

## 7. Data Patterns (Non-Narrative Characteristics)

~500 samples each, mathematically crafted:

| Characteristic | Pattern | Demo Angle |
|---|---|---|
| Surface Finish Ra | Weibull right-skew (shape=2.5) | Non-normal capability |
| Bore Diameter | Multi-family Z-scored | Short-run overlay |
| Pin Height | Small shift at sample 300 | CUSUM V-mask detection |
| Bolt Torque | Gradual trend, λ=0.2 | EWMA smoothing |
| Solder Defects | Overdispersed proportions | Laney σ_z badge |
| Electrical Pass/Fail | Stable binomial | Basic attribute |
| Paint Defects | Poisson + seasonal | Count chart patterns |
| Blemishes | Variable inspection area | Per-unit rate |
| Ply Thickness | Stable, AIAG rules | Different rule set |
| Turbine Blade | Gamma right-skew (shape=5) | Gamma fit |
| Rivet Grip | Multi-target deviation | Short-run deviation |
| Fastener Torque | Stable, Wheeler rules | Conservative rules |
| Void % | Low rate ~2% | Aerospace NDT |
| Delamination | Poisson rare events | Aerospace quality |
| API Concentration | Lognormal (μ=4.6, σ=0.05) | Pharma precision |
| Moisture Content | Normal, tight limits | Pharma drying |
| Blend Uniformity | Custom rule thresholds | Custom preset |
| Fill Volume | Tight pharma CUSUM | Pharma detection |
| Seal Failures | Low rate packaging | Pharma attribute |
| Assay % | Exponential distribution | Rare distribution |
| Dissolution Rate | Gradual EWMA changes | Pharma monitoring |

---

## 8. Totals

- **3 plants**, 3 industries, 3 hierarchy trees
- **24 characteristics**: 10 chart types, 4 distributions, 2 short-run modes, 4 rule presets
- **8 users** across 4 role tiers with cross-plant assignments
- **3 narrative arcs** (recovery, anomaly, compliance)
- **3 MSA studies** (crossed ANOVA, range, attribute agreement)
- **3 FAI reports** (approved, submitted, draft)
- **5 signature workflow instances** (every status)
- **~500 samples per characteristic** (~12,000 total)
- **Live connectivity** via dummy server (MQTT + OPC-UA)
- **ERP, notifications, retention, audit trail** all populated
- **Anomaly detection** configs + events

## 9. Technical Notes

- **Script**: `backend/scripts/seed_showcase.py`
- **Pattern**: Raw SQLite3 (same as `seed_e2e.py`)
- **Runtime**: ~2-5 seconds for SQLite, additional ~2s for dummy server API calls
- **Output**: Fresh `showcase.db` in backend root
- **Dummy server**: `http://localhost:3000/api/` — optional, fails gracefully
