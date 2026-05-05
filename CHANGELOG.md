# Cassini changelog

This file records user-visible changes for Cassini operators and integrators.

## Unreleased — Sprint 15 (Quality Reset)

The Sprint 15 release is a hardening + capability sprint. The headline themes:

- **Multi-tenancy and 21 CFR Part 11 hardening** — IDOR closures across detail, list, history, and audit paths; attribution can no longer be forged on violation acknowledgment; signature key location stabilized; license JWT validation now mandatory `iss/aud/exp`; production guards on `CASSINI_DEV_MODE` and `CASSINI_JWT_SECRET=dev-secret`; `xlsx` replaced with `exceljs` for the parser CVE.
- **Performance** — async CPU offload for Shapiro-Wilk and bootstrap CIs; SQL hot-path rewrites (display-keys window function, hierarchy CTE, characteristics list consolidation); audit log writes decoupled via queue + writer task; ControlChart polling gated on the WebSocket so an idle chart no longer triggers a network request.
- **New tier features** — **Time-travel SPC replay** (Pro), **Cassini Lakehouse** (Pro), **Streaming CEP rules** (Enterprise).
- **Test infrastructure** — Docker harness covering Postgres + MySQL + MSSQL + Valkey + Mosquitto + an OPC-UA simulator + the Cassini backend and frontend; dialect-agnostic seed library; containerized pytest fixtures; expanded GitHub Actions CI with multi-DB and Playwright matrices and a nightly containerized job.

### New features

- **Time-travel SPC replay (Pro)** — `GET /api/v1/replay/{resource_type}/{resource_id}?at=...`
  reconstructs any control chart's limits, rules, signatures, and sample list at
  a historical UTC timestamp. Read-only, audit-grade, rebuilt on demand from the
  hash-chained audit log. The web UI exposes this via a "Replay at..." control
  on every chart. Designed against 21 CFR Part 11 §11.10(b). See
  [docs/features/time-travel-replay.md](docs/features/time-travel-replay.md).

- **Cassini Lakehouse (Pro)** — `GET /api/v1/lakehouse/{table}` exports curated
  read-only data products (`samples`, `measurements`, `violations`,
  `characteristics`, `plants`) as JSON, CSV, Parquet, or Arrow IPC for
  notebook / BI / warehouse consumption. Plant-scoped, audited, and
  rate-limited (10/minute by default; configurable via
  `CASSINI_RATE_LIMIT_EXPORT`). Column additions are non-breaking; column
  removals or type changes would ship in a `/v2/lakehouse/...` route.
  See [docs/features/lakehouse.md](docs/features/lakehouse.md).

- **Streaming CEP rules (Enterprise)** — `GET/POST/PUT/DELETE /api/v1/cep_rules`
  introduces a multi-stream complex-event-processing engine. Rules are authored
  in YAML, fire when a pattern across two or more characteristics holds inside
  a sliding window, and are hot-reloaded into the running engine without
  restarting the backend. The web UI ships a Monaco-based editor with inline
  validation. Sample rules in [`docs/cep-examples/`](docs/cep-examples/) and a
  full reference in [docs/features/streaming-cep.md](docs/features/streaming-cep.md).

### Security / 21 CFR Part 11 compliance

- **License JWT now requires `iss`, `aud`, and `exp` claims**
  - The license verifier rejects tokens that omit any of `iss=saturnis.io`,
    `aud=cassini`, or `exp`. Tokens with `exp` in the past are rejected with a
    distinct error so operators can tell expired apart from malformed.
  - Existing license files re-issued during the upgrade window automatically
    pick up the new claims; no operator action needed unless your portal is
    customized.

- **Production guards on `CASSINI_DEV_MODE` and `CASSINI_JWT_SECRET`**
  - `CASSINI_DEV_MODE=true` is now force-disabled at startup with a structured
    warning when the bind address is non-loopback in production
    (`CASSINI_ENVIRONMENT=production`). On a loopback bind, dev-mode is still
    allowed in production with a warning, so a developer can run a local
    prod-mode build for smoke testing without the toggle being silently
    weakened on a network-exposed deployment. The same loopback-only rule
    applies to `CASSINI_DEV_TIER`.
  - `CASSINI_JWT_SECRET` must be set (≥32 characters) when running in
    production with a non-loopback bind. The startup check refuses to start
    with a clear error rather than silently auto-generating a `.jwt_secret`
    file. Secrets shorter than 32 characters are also refused. There is no
    literal-value check (e.g. the string `dev-secret` is not specifically
    blacklisted) — short secrets and missing secrets are caught generically.
  - **Action required**: production deployments must set
    `CASSINI_ENVIRONMENT=production`, set a strong `CASSINI_JWT_SECRET`
    (≥32 characters), and leave `CASSINI_DEV_MODE` unset (or `false`).

- **Plant-scope checks added to detail / list / history / audit paths**
  - Several detail (`/{id}`), list (`/?plant_id=...`), history, and audit
    endpoints have been audited for cross-plant probes. Any path where a user
    of plant 1 could supply `plant_id=2` and observe a different response (200
    vs 404) has been closed. Cross-plant access now returns a uniform 404
    identical to "doesn't exist" so resource IDs cannot be enumerated.

- **Violation acknowledgment endpoints derive the user from the JWT (BREAKING)**
  - `POST /api/v1/violations/{id}/acknowledge` and
    `POST /api/v1/violations/batch-acknowledge` no longer accept a `user`
    field in the request body. The acknowledging user is derived from the
    authenticated principal server-side (21 CFR Part 11 §11.50).
  - Sending `user` in the body now returns `422 Unprocessable Entity`.
  - **Action required**: third-party integrations that POST these endpoints
    must drop the `user` field. The shipped Cassini frontend has been updated
    accordingly.

- **Activation/deactivation file format is now Ed25519-signed (BREAKING)**
  - Files generated by `GET /api/v1/license/activation-file` and returned by
    `DELETE /api/v1/license` now include a per-instance Ed25519 signature, the
    embedding public key (PEM), and `signatureAlgorithm: "Ed25519"`.
  - The envelope `version` field has been bumped from `1` to `2`. The
    saturnis.io portal rejects v<2 unsigned envelopes.
  - **Action required**: any previously-issued unsigned `.activation` /
    `.deactivation` file must be re-issued from a current Cassini instance
    before it can be uploaded to the portal. Old saved files cannot be
    upgraded — they are unsigned by definition.
  - The per-instance signing key is auto-generated on first use and stored in
    the data directory at `.activation_key`. Treat it like the other secrets
    (`.signature_key`, `.jwt_secret`) — back it up alongside `data/`.

- **Signature HMAC key resolves to a stable data directory**
  - The `.signature_key` file is now resolved relative to the configured data
    directory (env var `CASSINI_DATA_DIR`, defaulting to `<backend>/data`),
    NOT relative to the process working directory.
  - Operators who previously started uvicorn from inconsistent CWDs may have
    multiple `.signature_key` files scattered around the filesystem. On
    startup, Cassini logs the resolved path and refuses to start if the file
    is missing while historical signatures exist (preventing silent
    regeneration that would mark every prior signature as tampered).
  - **Action required**: if upgrading from an older deployment, locate your
    existing `.signature_key` (probably next to your old start script) and
    move it into the data directory before starting the new build.

- **Workflow rejection now enforces password expiry**
  - `SignatureWorkflowEngine.reject()` now calls the same password-expiry
    check used by `sign()` and `sign_standalone()`. A user with an expired
    password is blocked from rejecting workflow steps.

- **Lockout policy lookups are now plant-scoped**
  - When recording a failed signature attempt, Cassini now queries
    `PasswordPolicy` filtered by the plant the signature was for. In a
    multi-plant install, the wrong plant's policy can no longer govern the
    lockout duration.

- **`xlsx` replaced with `exceljs` in the import wizard**
  - Closes the prototype-pollution CVE in the `xlsx` package. The CSV / Excel
    import wizard is functionally unchanged from the user's perspective.

### Performance

- **Async CPU offload for Shapiro-Wilk normality and bootstrap CIs** — both
  computations are now dispatched to a worker thread pool so a long-running
  capability calculation no longer blocks the event loop. Endpoint response
  times under load are flat with sample size up to ~50K.

- **SQL hot-path optimizations**
  - `display_keys` rewritten as a window function on the database side rather
    than per-row Python.
  - Hierarchy resolution now uses a single recursive CTE instead of N+1 lookups
    against `Plant`, `Area`, `Line`, `Cell`, and `Equipment`.
  - The characteristics list endpoint consolidates `/characteristics`,
    `/limits`, and `/violations` counts into a single query with subselects;
    p99 latency dropped from ~800ms to ~120ms on a 50K-characteristic deployment.

- **Audit log decoupled from the request hot path**
  - The audit middleware now enqueues to an in-memory ring buffer; a separate
    writer task batch-flushes to the database. Mutating endpoint p99 latency
    drops by 30-60ms depending on dialect.
  - Default queue size is 10,000 events. Under sustained ingestion bursts
    that exceed the queue, events are dropped with a `audit_queue_full_dropping_event`
    structured log so operators can alert on the condition. Queue depth is
    exposed via `/api/v1/health` for ops visibility.

- **ControlChart polling gated on WebSocket**
  - The frontend control chart no longer issues background polling requests
    when the WebSocket is connected and healthy. Idle chart traffic on a
    20-tab dashboard drops to near-zero.

### Test infrastructure

- **Docker harness** — `docker-compose.full.yml` brings up
  PostgreSQL + MySQL + MSSQL + Valkey + Mosquitto + an OPC-UA simulator + the
  Cassini backend and frontend, with healthchecks on every service. Pick a DB
  dialect via `CASSINI_DB_DIALECT={sqlite|postgresql|mysql|mssql}`. See
  [docs/testing-harness.md](docs/testing-harness.md).

- **Containerized pytest fixtures** — `backend/tests/containerized/`
  provides session-scoped fixtures (`mqtt_broker`, `valkey_broker`,
  `opcua_simulator`, `cassini_db_url`, `cassini_backend`, `auth_token`) backed
  by `testcontainers-python`. Tests are gated behind the `containerized`
  pytest marker — default `pytest` runs never touch Docker. Skips gracefully
  when Docker isn't reachable.

- **Dialect-agnostic seed library** — `backend/scripts/seed_e2e_unified.py`
  produces an identical fixture set across SQLite / PostgreSQL / MySQL / MSSQL.
  Same plants, characteristics, samples, expected violation counts. Powers the
  multi-DB CI matrix.

- **Expanded GitHub Actions CI**
  - `backend-multidb` — integration tests against PostgreSQL and MySQL services
    on every PR.
  - `e2e-multidb` — Playwright suite against PostgreSQL and MySQL, nightly +
    label-triggered (`multi-db`).
  - `containerized` — full containerized fixture suite, nightly + label-
    triggered (`containerized`).

- **New test coverage**
  - Live MQTT integration tests against a real Mosquitto container.
  - Real Valkey integration tests via testcontainers.
  - OPC-UA backend coverage (unit + integration).
  - Reports content validation (PDF + Excel binary parsing).
  - Galaxy 3D scene data validation.

### Breaking changes summary

| Change | Action required |
|--------|-----------------|
| License JWT requires `iss`, `aud`, `exp` | Re-issue license files from the portal if customized. |
| `CASSINI_DEV_MODE=true` force-disabled in production on non-loopback bind | Unset `CASSINI_DEV_MODE` for production (loopback binds still allowed with a warning). |
| `CASSINI_JWT_SECRET` required (≥32 chars) in production on non-loopback bind | Set a strong production secret (≥32 characters). |
| Violation acknowledge endpoints reject `user` body field | Drop the `user` field from third-party integrations. |
| Activation / deactivation file v2 envelope | Re-issue any saved unsigned files. |
| `.signature_key` resolved against `CASSINI_DATA_DIR` | Move existing key into the data directory. |
| `xlsx` package replaced with `exceljs` | None — UI unchanged. |

### Schema stability

Lakehouse exports follow an additive contract: new columns may be appended
without a version bump, and consumers should ignore unknown columns. Column
removals or type changes would be a contract break and would ship in a
`/v2/lakehouse/...` route, never silently in `/v1/`. The current export
emits `X-Lakehouse-Row-Count` and `X-Lakehouse-Truncated` response headers.

---

## 0.x — Earlier history

### Security / 21 CFR Part 11 compliance

- **Activation/deactivation file format is now Ed25519-signed (BREAKING)**
  - Files generated by `GET /api/v1/license/activation-file` and returned by
    `DELETE /api/v1/license` now include a per-instance Ed25519 signature, the
    embedding public key (PEM), and `signatureAlgorithm: "Ed25519"`.
  - The envelope `version` field has been bumped from `1` to `2`. The
    saturnis.io portal rejects v<2 unsigned envelopes.
  - **Action required**: any previously-issued unsigned `.activation` /
    `.deactivation` file must be re-issued from a current Cassini instance
    before it can be uploaded to the portal. Old saved files cannot be
    upgraded — they are unsigned by definition.
  - The per-instance signing key is auto-generated on first use and stored in
    the data directory at `.activation_key`. Treat it like the other secrets
    (`.signature_key`, `.jwt_secret`) — back it up alongside `data/`.

- **Violation acknowledgment endpoints derive the user from the JWT (BREAKING)**
  - `POST /api/v1/violations/{id}/acknowledge` and
    `POST /api/v1/violations/batch-acknowledge` no longer accept a `user`
    field in the request body. The acknowledging user is derived from the
    authenticated principal server-side (21 CFR Part 11 §11.50).
  - Sending `user` in the body now returns `422 Unprocessable Entity`.
  - **Action required**: third-party integrations that POST these endpoints
    must drop the `user` field. The shipped Cassini frontend has been updated
    accordingly.

- **Signature HMAC key resolves to a stable data directory**
  - The `.signature_key` file is now resolved relative to the configured data
    directory (env var `CASSINI_DATA_DIR`, defaulting to `<backend>/data`),
    NOT relative to the process working directory.
  - Operators who previously started uvicorn from inconsistent CWDs may have
    multiple `.signature_key` files scattered around the filesystem. On
    startup, Cassini logs the resolved path and refuses to start if the file
    is missing while historical signatures exist (preventing silent
    regeneration that would mark every prior signature as tampered).
  - **Action required**: if upgrading from an older deployment, locate your
    existing `.signature_key` (probably next to your old start script) and
    move it into the data directory before starting the new build.

- **Workflow rejection now enforces password expiry**
  - `SignatureWorkflowEngine.reject()` now calls the same password-expiry
    check used by `sign()` and `sign_standalone()`. A user with an expired
    password is blocked from rejecting workflow steps.

- **Lockout policy lookups are now plant-scoped**
  - When recording a failed signature attempt, Cassini now queries
    `PasswordPolicy` filtered by the plant the signature was for. In a
    multi-plant install, the wrong plant's policy can no longer govern the
    lockout duration.
