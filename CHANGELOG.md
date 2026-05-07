# Cassini Changelog

User-visible changes for Cassini operators and integrators. Format follows
[Keep a Changelog](https://keepachangelog.com/), versioning follows
[SemVer](https://semver.org/).

## [Unreleased]

Nothing released yet — the next version on the roadmap is `0.2.0`.

## [0.1.0] — 2026-05-06

The first feature release. Major themes: a containerized multi-database test
harness, the trio of new tier features (replay, Lakehouse, CEP rules), the
trust-feature SOP-RAG, and a hardening pass against 21 CFR Part 11
multi-tenancy and authentication requirements.

### Added

- **SOP-grounded RAG with citation lock** (Enterprise) — answer operator questions
  against an uploaded SOP / work-instruction corpus. Every claim in the LLM
  response must cite a chunk from the caller's plant; uncited or out-of-corpus
  responses are rejected with one automatic stricter-prompt retry. Hybrid
  retrieval (vector + BM25, RRF fusion). Local `sentence-transformers` embedder
  by default; optional Voyage AI. Per-plant monthly cost cap. Web UI at `/sop-rag`.
  Two MCP tools (`cassini_sop_rag_list`, `cassini_sop_rag_query`).
- **Time-travel SPC replay** (Pro) — reconstruct any chart's control limits,
  rule configuration, signatures, and contributing samples at any historical
  UTC timestamp. Read-only, audit-grade, rebuilt on demand from the hash-chained
  audit log. 21 CFR Part 11 §11.10(b).
  See [docs/features/time-travel-replay.md](docs/features/time-travel-replay.md).
- **Cassini Lakehouse** (Pro) — read-only data product API. Curated tables
  exported as JSON / CSV / Parquet / Arrow IPC, plant-scoped, audited, rate-limited.
  See [docs/features/lakehouse.md](docs/features/lakehouse.md).
- **Streaming CEP rules** (Enterprise) — multi-stream complex-event-processing
  engine. YAML-authored patterns across two or more characteristics fire when
  conditions hold within a sliding window. Hot-reloaded into the running engine.
  Monaco-based editor with inline validation.
  See [docs/features/streaming-cep.md](docs/features/streaming-cep.md).
- **Containerized test harness** —
  PostgreSQL + MySQL + MSSQL + Valkey + Mosquitto + OPC-UA simulator + backend
  + frontend orchestrated by Docker Compose, with `testcontainers-python`
  fixtures for `pytest -m containerized`. Dialect-agnostic seed library powers
  the multi-DB CI matrix.
  See [docs/testing-harness.md](docs/testing-harness.md).
- **CI matrix expansion** — backend integration tests run against PostgreSQL
  and MySQL on every PR; Playwright E2E against PostgreSQL and MySQL nightly;
  containerized fixture suite nightly.

### Changed

- **Async CPU offload** for Shapiro-Wilk normality and bootstrap CIs — long
  capability calculations no longer block the event loop. Endpoint response
  times are flat with sample size up to ~50K.
- **Audit log decoupled from the request hot path** — middleware enqueues to
  an in-memory ring buffer; a separate writer task batch-flushes to the database.
  Mutating endpoint p99 latency drops 30–60ms. Default queue capacity 10,000;
  overflow drops with a structured log and is exposed via `/api/v1/health`.
- **SQL hot-path rewrites** — `display_keys` is now a window function;
  hierarchy resolution uses a single recursive CTE; the characteristics list
  consolidates `/characteristics`, `/limits`, and `/violations` counts into a
  single subselect query. P99 dropped from ~800ms to ~120ms on a 50K-characteristic
  deployment.
- **ControlChart polling gated on the WebSocket** — idle charts no longer issue
  background polling requests when the WebSocket is connected and healthy.

### Security / 21 CFR Part 11 compliance

- **License JWT** now requires `iss=saturnis.io`, `aud=cassini`, and `exp`
  claims. Tokens with `exp` in the past report a distinct error (expired vs
  malformed).
- **Production guards** — `CASSINI_DEV_MODE=true` is force-disabled at startup
  on non-loopback binds in production; loopback binds remain allowed with a
  warning so a developer can run a local prod-mode build for smoke testing.
  Same loopback-only rule applies to `CASSINI_DEV_TIER`. `CASSINI_JWT_SECRET`
  must be ≥32 characters in production on a non-loopback bind, or startup
  refuses with a clear error.
- **Plant-scope hardening** — detail / list / history / audit paths audited
  for cross-plant probes. Cross-plant access uniformly returns 404, never 403,
  so resource IDs cannot be enumerated.
- **Workflow rejection** now enforces password expiry; users with expired
  passwords are blocked from rejecting workflow steps.
- **Lockout policy lookups** are now plant-scoped — the wrong plant's policy
  can no longer govern lockout duration in a multi-plant install.
- **Signature HMAC key** is resolved against `CASSINI_DATA_DIR`, not the
  process working directory. Startup refuses with a clear error if the file
  is missing while historical signatures exist (preventing silent regeneration
  that would mark every prior signature as tampered).

### Breaking

| Change | Action required |
|--------|-----------------|
| License JWT requires `iss`, `aud`, `exp` | Re-issue license files from the portal if customized. |
| `CASSINI_DEV_MODE=true` disabled in production on non-loopback bind | Unset `CASSINI_DEV_MODE` for production (loopback binds still allowed with a warning). |
| `CASSINI_JWT_SECRET` required (≥32 chars) in production on non-loopback bind | Set a strong production secret. |
| `POST /violations/{id}/acknowledge` and `/batch-acknowledge` reject `user` body field | Drop the `user` field from third-party integrations; user is derived from the JWT. (21 CFR Part 11 §11.50) |
| Activation / deactivation file envelope bumped to v2 with Ed25519 signature | Re-issue any saved unsigned files; old files cannot be upgraded. |
| `.signature_key` resolved relative to `CASSINI_DATA_DIR` | Move existing key into the data directory if you previously launched from inconsistent CWDs. |
| `xlsx` package replaced with `exceljs` (CVE) | None — UI unchanged. |

### Schema stability

Lakehouse exports follow an additive contract: new columns may be appended
without a version bump, consumers should ignore unknown columns. Column removals
or type changes would ship in `/v2/lakehouse/...`, never silently in `/v1/`.
Each export emits `X-Lakehouse-Row-Count` and `X-Lakehouse-Truncated` headers.

---

## [0.0.x] — Pre-release

Pre-`0.1.0` development cycles. Major themes covered before `0.1.0`:

- Visual style system (light/dark + modern/retro/glass + per-organization brand
  customization).
- Show Your Work (every numeric value links to its formula, inputs, and AIAG
  citation; verified by `tests/test_showcase_consistency.py`).
- Hash-chained audit log with `GET /api/v1/audit/verify` end-to-end walk.
- Three-tier licensing (Open / Pro / Enterprise) with offline Ed25519-signed
  license JWTs and offline activation / deactivation envelopes.
- Multi-database support (SQLite / PostgreSQL / MySQL / MSSQL via dialect
  abstraction with a single Alembic migration set).
- Quality studies — MSA / Gage R&R, DOE, capability with non-normal distribution
  fitting (Box-Cox + 6-distribution auto-fit).
- First Article Inspection (AS9102 Rev C, Forms 1/2/3 with separation of duties).
- Electronic signatures (21 CFR Part 11 multi-step workflows).
- Connectivity Hub (MQTT / Sparkplug B, OPC-UA, RS-232 USB gage bridge, ERP /
  LIMS adapters).
- Cluster-ready architecture (`--roles`, Valkey broker, distributed leader
  election, WebSocket cross-node fan-out, drain mode).
- AI-native — built-in MCP server for Claude Code, Cursor, Claude Desktop;
  AI-powered chart analysis with guardrails.
- Anomaly detection (PELT changepoint, Kolmogorov-Smirnov drift, Isolation
  Forest), multivariate SPC (Hotelling T², MEWMA), predictive analytics
  (ARIMA / Prophet).
- Async SPC pipeline for high-throughput ingestion (up to ~175K samples/min
  with full Nelson rule evaluation).
