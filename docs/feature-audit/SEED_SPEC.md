# Cassini Feature-Highlight Seed — Spec

> **Derived from**: [`CATALOG.md`](CATALOG.md) (380 UI states across 73 features). This is the union of every "Seed needs" line in the catalog, deduplicated and made concrete.
>
> **Goal**: ONE seed script (idempotent, runs against postgres or sqlite) that populates every entity the feature-highlight skill needs to walk the catalog. After the seed runs, every P0 + P1 state in the catalog must be reachable via navigation + interaction — no further data setup.
>
> **Not in scope**: synthetic-but-realistic distributions for stat correctness (we have unit tests). The seed prioritizes UI demonstrability — non-trivial chart shapes, mixed statuses, edge-case visibility.

---

## 1. Plants — three of them

The seed creates **3 plants** so multi-plant, plant-switcher, compare-plants, and per-plant licensing all work. Each plant has a distinct industrial flavor so screenshots feel like real facilities.

| Plant | Code | Industry slant | Chart bias | License-tier showcase |
|-------|------|---------------|-----------|----------------------|
| **Aerospace Forge** | `AERO-FORGE` | Forging precision parts (turbine housings, shafts) | Variable charts, capability indices, FAI workflow | Full Enterprise: signatures, FAI, retention, AI insights |
| **Pharma Fill** | `PHARMA-FILL` | Sterile fill-finish line | Attribute charts (p, np), retention policies, signatures | Enterprise compliance surface |
| **Auto Stamping** | `AUTO-STAMP` | Sheet-metal stamping, high-volume | High-throughput variable + multivariate + predictions + anomaly detection | Pro analytics |

Each plant gets the same admin auto-bootstrap; per-plant role assignments differ (see Users below).

---

## 2. Users — full RBAC matrix

| Username | Password | Role | Plant access | Notes |
|----------|----------|------|--------------|-------|
| `admin` | `admin` (must-change on first login) | Admin (global) | All plants | Auto-bootstrapped. Used by the skill to capture admin states. |
| `engineer.aero` | `seed-pass-1` | Engineer | Aerospace Forge | Can configure characteristics, run analytics, sign FAIs |
| `supervisor.pharma` | `seed-pass-1` | Supervisor | Pharma Fill | Can run reports, acknowledge violations |
| `operator.auto` | `seed-pass-1` | Operator | Auto Stamping | Data entry only, no settings |
| `locked.user` | `seed-pass-1` | Operator | Auto Stamping | `failed_login_count >= 5` → locked-out state |
| `inactive.user` | `seed-pass-1` | Operator | Pharma Fill | `is_active=false` → deactivated state for Users page |
| `multi.role` | `seed-pass-1` | Engineer (Aerospace) + Supervisor (Auto) | Two plants | Demonstrates role-per-plant |

---

## 3. Equipment hierarchy per plant — ISA-95 shape

Each plant has a 4-level hierarchy: **Site → Area → Line → Cell → Equipment** (the Cassini levels are Enterprise/Site/Area/Line/Cell/Equipment; we use 4 levels per plant).

### Aerospace Forge

```
AERO-FORGE Site
├── Forge Area
│   ├── Press Line A
│   │   ├── Station 1: Turbine Housing
│   │   │   ├── Bore Diameter OD-A          (variable, Xbar-R, n=5)
│   │   │   ├── Wall Thickness               (variable, I-MR)
│   │   │   └── Mating Surface Flatness     (variable, CUSUM)
│   │   └── Station 2: Compressor Shaft
│   │       ├── Shaft OD                    (variable, Xbar-S, n=5)
│   │       └── Surface Roughness Ra        (variable, EWMA)
│   └── Heat Treat Line
│       └── Furnace 1
│           └── Coolant Temp                (variable, I-MR — paired with Shaft OD for multivariate)
└── Inspection Area
    └── CMM Station
        └── Hole Position True Position     (variable, short-run deviation mode)
```

### Pharma Fill

```
PHARMA-FILL Site
└── Aseptic Fill Area
    ├── Fill Line 1
    │   ├── Filler 1
    │   │   ├── Fill Volume                  (variable, Xbar-R, n=5)
    │   │   └── Particulate Count            (attribute, c)
    │   ├── Sealing Station
    │   │   └── Seal Defects                 (attribute, np, sample_size=100)
    │   └── Visual Inspection
    │       └── Reject Rate                  (attribute, p, variable sample_size)
    └── Fill Line 2 (idle / for compare-plants symmetry)
        └── Filler 2
            └── Fill Volume                  (variable, Xbar-R — same name as Line 1 for compare-plants)
```

### Auto Stamping

```
AUTO-STAMP Site
└── Stamping Area
    ├── Press Line 1
    │   ├── Press 1
    │   │   ├── Blank Hole Position OD       (variable, Xbar-R, n=5)
    │   │   ├── Trim Length                  (variable, I-MR)
    │   │   └── Spring Force                 (variable, Xbar-R)
    │   └── Press 2
    │       ├── Punch Wear                   (variable, EWMA — for predictions)
    │       └── Defect Count                 (attribute, c)
    └── Final Inspection
        ├── Surface Defect Rate              (attribute, u, units_inspected variable)
        └── Box-Whisker Demo Char            (variable — explicit chart_type=box-whisker)
```

**Total characteristics: ~17 across 3 plants.** Variable: 12 · Attribute: 5 · Special chart types: CUSUM, EWMA, Box-Whisker, Short-run-deviation each represented at least once.

---

## 4. Sample data — 90-day history per characteristic

For every characteristic above, generate **120-160 samples** spanning the last **90 days** (so time-travel replay has real history and prediction models have enough training data).

Per characteristic:

| Phase | Days | Samples | Behavior |
|-------|-----:|--------:|----------|
| Phase I (in control) | 0-60 | ~80 | Normal distribution centered on target, ~ ±0.5σ |
| Phase II (subtle drift) | 60-75 | ~25 | Mean drift of +1.5σ over the period (catches Nelson rule 2) |
| Phase III (visible problem) | 75-90 | ~25 | Out-of-spec excursion with 3+ Nelson rule violations |

This shape ensures:
- Capability indices are meaningful (not trivially Cpk=10)
- Time-travel at any past timestamp shows different limits and rule state
- Prediction models train on a real time series, not synthetic noise
- Multivariate Hotelling T² works (Phase I baseline + Phase II shifts)

For attribute charts, equivalent shape: stable defect rate → small drift → defect spike.

---

## 5. Violations — every Nelson rule represented

Across the 17 characteristics + 90-day history, ensure at least **one violation per Nelson rule** (1-8). Aim for **20-25 total violations** in mixed states:

| State | Count | Notes |
|-------|------:|-------|
| Pending acknowledgement (informational) | 8 | The default after detection |
| Pending acknowledgement (required) | 4 | Severity=high; can't be dismissed without reason |
| Acknowledged with reason | 6 | Has `ack_user`, `ack_reason`, `ack_timestamp` |
| Acknowledged with corrective action | 4 | Linked to a corrective action |
| Recently re-occurred | 3 | Same rule, same characteristic, different sample → "repeat offender" pattern |

Distribute across plants: ~10 in Aerospace Forge (Bore Diameter + Wall Thickness), ~7 in Auto Stamping (Trim Length + Punch Wear), ~6 in Pharma Fill (Particulate Count, Seal Defects).

---

## 6. Annotations — point + period

| Type | Count | Where |
|------|------:|-------|
| Point annotations | 6 | On Bore Diameter OD-A samples — categories: "Tool change", "Operator handoff", "Material lot change" |
| Period annotations | 3 | On Trim Length — "Maintenance window", "PM scheduled", "Tooling worn — replaced" |

Each must have a category, description, and (for period) start/end timestamps. Annotations show on dashboards and in reports — they need real text.

---

## 7. Capability — snapshots + non-normal cases

| Characteristic | USL | LSL | Target | Cpk regime | Snapshots |
|----------------|----:|----:|-------:|-----------|-----------|
| Bore Diameter OD-A | 12.0 | 8.0 | 10.0 | Cpk ~1.0 (Marginal) | 6 monthly snapshots |
| Wall Thickness | 5.5 | 4.5 | 5.0 | Cpk ~1.67 (Acceptable) | 4 snapshots |
| Shaft OD | 25.05 | 24.95 | 25.00 | Cpk ~0.9 (Below) | 3 snapshots |
| Fill Volume | 10.5 | 9.5 | 10.0 | Cpk ~1.33 (Acceptable) | 6 monthly snapshots |
| Punch Wear | 2.0 | 0 | 1.0 | Skewed → triggers non-normal Box-Cox path | 3 snapshots |

Snapshot history must span the 90-day period to demonstrate the trend chart.

---

## 8. MSA studies — all four types, mixed statuses

| Study | Type | Plant | Status | Operators | Parts | Reps | Tolerance | Result classification |
|-------|------|-------|--------|----------:|------:|-----:|----------:|----------------------|
| Bore Diameter Gage R&R | crossed_anova | Aerospace | complete | 3 | 10 | 3 | 4.0 | %GRR ~13% Marginal |
| Shaft OD Gage R&R | crossed_anova | Aerospace | complete | 3 | 10 | 3 | 0.10 | %GRR ~28% Unacceptable |
| Wall Thickness Range | range_method | Aerospace | data_collection | 2 | 5 | 2 | 1.0 | (incomplete) |
| Fill Volume Nested | nested_anova | Pharma | complete | 3 | 8 | 3 | 1.0 | %GRR ~9% Acceptable |
| Particulate Attribute | attribute_agreement | Pharma | complete | 3 | 30 | 2 | — | Cohen's κ ~0.85 Substantial |
| Caliper Linearity | linearity | Aerospace | complete | 1 | 5 | 5 | — | Linearity bias ~5%, R²=0.99 |
| Trim Length Bias | bias | Auto | draft | 1 | 1 | 10 | — | (incomplete) |

Every study type from the catalog has at least one example.

---

## 9. DOE studies

| Study | Design | Plant | Factors | Runs | Status | Result |
|-------|--------|-------|---------|-----:|--------|--------|
| Press Force Optimization | full_factorial 2³ | Aerospace | Force / Temperature / Time | 8 | analyzed | Main effect Force significant |
| Punch Geometry | fractional_factorial 2^(5-2) | Auto | 5 factors | 8 | data_collection | partial |
| Coolant Mix Plackett-Burman | plackett_burman | Aerospace | 7 factors | 12 | designed | not started |
| Fill Speed CCD | central_composite | Pharma | 3 factors + axial points | 20 | analyzed | quadratic Speed² significant |

---

## 10. FAI reports — full lifecycle

| Report | Plant | Part Number | Status | Forms filled | Signatures |
|--------|-------|-------------|--------|--------------|-----------|
| Turbine Housing FAI #001 | Aerospace | PN-2026-001 | approved | 1, 2, 3 complete | engineer + supervisor signed |
| Compressor Shaft FAI #002 | Aerospace | PN-2026-002 | submitted | 1, 2, 3 complete | engineer signed, awaiting supervisor |
| Hole Position FAI #003 | Aerospace | PN-2026-003 | draft | 1 partial | none |
| Fill Volume FAI #004 | Pharma | PN-2026-FILL-A | rejected | 1, 2, 3 complete | engineer signed, supervisor rejected with reason |

---

## 11. Materials + collection plans

**Material classes** (per Aerospace):
- "AISI 4340 Steel" with subtypes "4340 Lot A", "4340 Lot B" — different spec limit overrides on Bore Diameter
- "Inconel 718" — tighter limits on Surface Roughness Ra

**Collection plans**:
- "Press Line A — Hourly" — covers Bore Diameter + Wall Thickness on Aerospace, every hour
- "Pharma Fill — Per-Batch" — covers Fill Volume + Particulate Count, per fill batch
- "End-of-shift inspection" — assigned to operator.auto on Auto Stamping

---

## 12. Connectivity

| Type | Where | Status | Notes |
|------|-------|--------|-------|
| MQTT broker | Aerospace | configured + connected | Simulated broker; tags published every 5s |
| MQTT broker | Auto Stamping | configured + disconnected | Demonstrates disconnected state in connectivity hub |
| OPC-UA server | Aerospace | configured + connected | Two nodes mapped to characteristics |
| Gage bridge | Aerospace | registered | One Mitutoyo gage attached |
| ERP connector | Aerospace | configured | SAP-style stub; cron-scheduled sync |

Tag mappings: at least 2 per active broker so the Mapping tab is non-trivial.

---

## 13. Audit log — 50+ events

The seed must produce a diverse audit log: user logins, characteristic creations, sample submissions, violation acknowledgements, FAI signatures, signature workflow modifications, retention purge runs, scheduled-report executions, OIDC config changes, API-key creations. Mixed across all 3 plants and the global scope.

Why 50+ instead of 20: the audit-log viewer's filter UI needs enough rows to demonstrate filtering by user, resource type, action, plant, and date range.

---

## 14. Electronic signatures

- **Workflows configured**: 2 (one for FAI approval — engineer + supervisor; one for retention purge — admin only)
- **Completed signatures**: 4 (Turbine Housing FAI #001 has both, Compressor FAI #002 has one, retention purge from 30 days ago)
- **Pending signatures**: 1 (Compressor FAI #002 awaiting supervisor)

---

## 15. Retention policies

- **Global default**: 7 years
- **Aerospace plant override**: 10 years (regulated)
- **Pharma plant override**: 25 years (lot history)
- **Auto Stamping line override**: 90 days (high-volume rotation)

Plus 1 purge run executed 30 days ago with audit trail (purged X samples, retained Y, ratio shown).

---

## 16. Analytics — populated states

### Multivariate
- **Group**: "Shaft Geometry" — Shaft OD + Surface Roughness Ra (Aerospace), Phase II with 70 samples, 2 OOC points → T² > UCL
- **Group**: "Press Coupling" — Coolant Temp + Shaft OD, Phase I baseline frozen
- **MCD covariance** computed for "Shaft Geometry" so MCD vs sample-cov toggle is non-trivial

### Predictions
- **Punch Wear** — model `exponential_smoothing` trained, AIC=-220.8, 160 samples, forecast 10 steps with intervals
- **Fill Volume** — model `arima(1,0,1)` trained, forecast 5 steps, "All in control"

### AI Insights
- AI provider configured (Ollama or mocked Claude — see Skill spec; the seed configures the provider, the skill mocks the response when capturing)
- Plant-level insight payload pre-cached for Aerospace so the cards display without an API call
- Insight states represented: "summary ready", "stale (>24h old)", "in progress" (mocked stream)

### Correlation
- Pre-computed pairwise Pearson correlations for Aerospace's 3 Bore Line characteristics
- Spearman rank pre-computed for non-normal pair (Punch Wear + Defect Count)
- Saved correlation study with custom name "Press Line A correlations"

### Anomaly detection
- PELT changepoints detected on Punch Wear (3 changepoints over 90 days)
- KS drift detected on Trim Length
- Isolation Forest outliers on Bore Diameter (5 outliers flagged)

### Ishikawa
- 1 saved Ishikawa for Bore Diameter violations with branches across the 6M categories (Personnel/Method/Material/Machine/Measurement/Environment) and 3 sub-causes per branch
- Pareto pre-computed showing "Operator handoff" as the dominant factor

---

## 17. Enterprise features — fully populated

### CEP rules (3)
1. **`cross-station-drift`** (enabled) — multi-stream: Bore Diameter trending up + Wall Thickness trending down inside 5min window → severity high
2. **`coolant-and-shaft`** (enabled) — Coolant Temp drift > 2σ + Shaft OD nelson_2 → severity medium
3. **`legacy-rule`** (disabled) — single-stream demo for the disabled state

### SOP-RAG corpus
- **Aerospace plant**:
  - "Press Line A — Operating Procedures" (PDF, 12 pages, status=ready, 47 chunks)
  - "Tool Change SOP" (DOCX, 4 pages, status=ready, 8 chunks)
  - "Quality Sampling Plan" (TXT, 3 pages, status=indexing, partial chunks)
- **Budget**: $0.32 spent, $50 cap (this month)
- **Question history**: 5 successful queries with cited answers, 1 refusal ("Hallucinated claim, no chunk match")

### Lakehouse
- Tables auto-available (no setup): samples, measurements, violations, characteristics, plants
- 1 audited export run 7 days ago: 50K rows, format=parquet, plant=Aerospace, columns=[char_id, value, timestamp]

### Cluster status
- Skipped in single-node seed by default; the skill's cluster-status capture reads from a fixture or mocks the `/api/v1/cluster/status` response.

---

## 18. Reports

- **Scheduled report**: "Weekly Capability — Aerospace" — every Monday 06:00, recipients: engineer.aero
- **Report run history**: 4 past runs (2 success, 1 failed with error message visible, 1 skipped)
- **Templates available** (built-in, no seed):
  - Characteristic Summary (default)
  - Capability Evidence
  - DOE Residuals
  - MSA Resolution
  - Risk Ranking
  - Probability Plot

---

## 19. API + integration surface

| Item | Count | Notes |
|------|------:|-------|
| API keys | 3 | One read-only (plant-restricted to Aerospace), one read-write (global), one expired |
| OIDC providers | 2 | "Corp SSO" (mock), "Test IdP" (disabled) |
| Push webhook subscriptions | 2 | One for violation events, one for FAI status changes |
| Email notification config | 1 | SMTP configured; recipients pre-set |

---

## 20. Plant-level licensing showcase

Each plant has its license edition simulated via dev-tier override:
- **Aerospace Forge** displays as **Enterprise** — all Pro+Enterprise features unlocked
- **Pharma Fill** displays as **Pro** — Enterprise features hidden (FAI shows tier-gate, not the editor)
- **Auto Stamping** displays as **Open** — Pro+Enterprise features show upgrade prompts

In implementation, the dev-tier override is global (the user is logged in as admin which bypasses plant-level tier). The tier-gate UX is captured by **navigating with a non-admin user** whose plant is set to a different tier in the seed metadata.

---

## 21. What this seed deliberately does NOT do

- Does not configure SMTP to actually send mail (notifications captured via mocking).
- Does not start a real MQTT broker (uses a stubbed `BrokerSimulator` that publishes synthetic frames).
- Does not configure a real ArangoDB / CouchDB / external ERP system (Cassini connectors are stubbed).
- Does not seed predictive AI insights via real Anthropic API call (skill mocks via `page.route` like SOP-RAG).
- Does not create JWT license files (dev-tier override handles tier display).

---

## 22. Idempotency contract

- Re-running the seed must NOT duplicate plants, hierarchies, characteristics, users, studies, FAI reports, CEP rules, SOP docs, materials, or collection plans (check by natural key, skip on existing).
- Sample-level rows (samples, measurements, violations, audit log) accumulate — that is acceptable because the playground's `playground-manifest.json` gates re-seeding (single-shot semantics for the playground).
- For the screenshot harness, the global-setup deletes the test database before re-seeding, so duplication is never observed in CI.

---

## 23. Implementation notes

- Build on top of `apps/cassini/backend/scripts/seed_e2e_unified.py`. That script already has the multi-dialect plumbing, idempotent helpers, and entity-creation primitives. Add a new entrypoint or flag (`--profile feature-tour`) that produces this richer dataset.
- All quantities above are minimums. The seed can produce more if it makes the visuals more compelling, but should not produce less.
- Realistic names everywhere. Never ship "Test Char". Names from the hierarchy section above are the canonical set.
- All sample timestamps must use UTC ISO-8601 with explicit tz (SQLite quirks documented in CLAUDE.md).
- The seed must accept the postgres URL produced by the docker playground (`docker-compose.playground.yml`) so the playground and the screenshot harness use the same dataset.

---

## 24. What gets built next

1. This SEED_SPEC.md is reviewed and trimmed.
2. `seed_e2e_unified.py` extended (or new `seed_feature_tour.py` co-located) implements the spec.
3. `docker-compose.playground.yml` set to use this profile by default so `pnpm playground:up` produces the full visual showcase.
4. Feature-highlight Playwright skill walks the catalog against this seed.
