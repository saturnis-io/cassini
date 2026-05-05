# AGENTS.md — Cassini for AI agents and integrators

This file is a single-page brief for AI agents (Claude Code, Cursor, Claude Desktop, custom MCP clients) and developers building automation against Cassini's API. It covers the agent-facing surface area, auth, what's safe to call read-only, and what requires explicit write opt-in.

## Surface area

| Surface | Transport | Auth | Default |
|---------|-----------|------|---------|
| **MCP server** (`cassini mcp-server`) | stdio (default) or SSE | API key in env | Read-only |
| **REST API** (`/api/v1/...`) | HTTPS | JWT or API key | All endpoints active |
| **CLI** (`cassini ...`) | HTTPS to a remote server | API key in `~/.cassini/credentials.json` | All commands |

## Quickstart for Claude Code

```json
// ~/.claude/mcp_servers.json
{
  "cassini": {
    "command": "cassini",
    "args": ["mcp-server", "--allow-writes"],
    "env": {
      "CASSINI_SERVER_URL": "https://cassini.example.com",
      "CASSINI_API_KEY": "cassini_..."
    }
  }
}
```

Drop `--allow-writes` for read-only access. The MCP server exposes only a curated subset of operations — designed for agentic workflows, not as a thin wrapper around every endpoint.

## Authentication

Two mechanisms; choose based on the workload:

**Scoped API key (recommended for agents)** — issued via the web UI under Settings → API Keys. Supports:
- Read-only or read-write scope
- Plant restrictions (key only sees plants 1, 3 — never 2, 4, 5)
- Expiration
- Per-key rate limits
- Revocation

```bash
cassini login --server https://cassini.example.com   # interactive password flow → API key
# or
export CASSINI_API_KEY=cassini_abc123...
```

**JWT** — short-lived (15 min) access token from `POST /api/v1/auth/login`. Use refresh cookie to renew. Better for human-in-the-loop sessions; API keys are better for unattended agents.

## Tools available via MCP

### Read tools (always exposed, even without `--allow-writes`)

| Tool | Description |
|------|-------------|
| `cassini_plants_list` | List plants the calling identity can access. |
| `cassini_characteristics_list` | List characteristics, filtered by plant or hierarchy. |
| `cassini_capability_get` | Capability metrics (Cp / Cpk / Pp / Ppk / Cpm) for a characteristic. |
| `cassini_violations_list` | Active or historical violations, filtered by characteristic / severity / status. |
| `cassini_samples_query` | Sample query with timestamp window and limit. |
| `cassini_audit_search` | Audit log search with filters and CSV export. |
| `cassini_health` | Backend health, broker reachability, queue depth. |
| `cassini_license_status` | Current edition, entitled features, plant count. |
| `cassini_replay_get` | **(Pro)** Time-travel SPC snapshot at an `at` timestamp. |
| `cassini_lakehouse_list` | **(Pro)** List the available data product tables. |
| `cassini_lakehouse_export` | **(Pro)** Export a table as JSON / CSV / Parquet / Arrow. |
| `cassini_cep_rules_list` | **(Enterprise)** List CEP rules for a plant. |
| `cassini_cep_rules_validate` | **(Enterprise)** Validate a YAML rule without persisting. |

### Write tools (require `--allow-writes`)

| Tool | Description |
|------|-------------|
| `cassini_samples_submit` | Submit a sample with full SPC evaluation. |
| `cassini_plants_create` | Create a plant. |
| `cassini_users_create` | Create a user. |
| `cassini_characteristics_create` | Create a characteristic. *(stub — not yet wired; the API does not yet support single-call characteristic creation. Calls return an error.)* |
| `cassini_cep_rules_create` | **(Enterprise)** Create a CEP rule (engineer role required). |
| `cassini_cep_rules_update` | **(Enterprise)** Update an existing CEP rule. |

### Resources (read-only data attachments)

- `cassini://plants` — full plant tree
- `cassini://health` — current backend health JSON

## REST endpoints agents commonly call

These are the high-leverage endpoints to know about. Full reference at `/docs` (Swagger UI on a running server).

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/plants/` | GET | List accessible plants. |
| `/api/v1/characteristics/` | GET | List characteristics. |
| `/api/v1/characteristics/{id}/chart-data` | GET | Sample list with limits + violations for a chart. |
| `/api/v1/capability/{char_id}` | GET | Current capability metrics. |
| `/api/v1/explain/capability/{char_id}` | GET | **Show Your Work** — full computation trace with formulas. |
| `/api/v1/data-entry/submit` | POST | Submit a sample (machine-friendly auth path). |
| `/api/v1/samples/batch` | POST | Up to 10K samples in a single request. |
| `/api/v1/violations/` | GET | List violations. |
| `/api/v1/violations/{id}/acknowledge` | POST | Acknowledge a violation (acknowledging user is taken from JWT). |
| `/api/v1/audit/search` | GET | Audit log query with hash-chain verification. |
| `/api/v1/replay/{type}/{id}?at=...` | GET | **(Pro)** Time-travel snapshot. |
| `/api/v1/lakehouse/{table}` | GET | **(Pro)** Read-only data product export. |
| `/api/v1/cep_rules` | GET, POST, PUT, DELETE | **(Enterprise)** Multi-stream CEP rule CRUD. |
| `/api/v1/cep_rules/validate` | POST | **(Enterprise)** YAML validation without persistence. |
| `/api/v1/health` | GET | Liveness probe. |
| `/api/v1/health/ready` | GET | Readiness probe (returns 503 when draining). |

## Show Your Work (explain endpoints)

Cassini's defining feature for regulated industries: every statistical value is reproducible. The explain API returns the formula, the inputs, the step-by-step computation, and the AIAG citation for any number the chart shows.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://cassini.example.com/api/v1/explain/capability/42?metric=cpk&start_date=2026-01-01&end_date=2026-04-01"
```

The response includes:
- `formula_latex` — KaTeX-renderable formula
- `steps` — ordered list of intermediate values (mean, sigma, USL-LSL, etc.)
- `inputs` — the actual sample values used
- `citation` — AIAG section reference
- `value` — the final computed value (must match what the chart displays)

**Caller must pass the same `chartOptions` the UI passed**, or the value won't match. There are two computation modes: with `start_date`/`end_date`/`limit`, the engine uses subgroup means + sigma of means (matches the dashboard); without, it uses individual measurements + stored sigma (matches the capability detail card).

## Rate limits

Defaults (configurable in TOML / env):

| Endpoint class | Default |
|----------------|---------|
| Auth (`/auth/login`, refresh) | 10 / minute |
| Sample submit | 600 / minute |
| Lakehouse export | 10 / minute |
| Default for everything else | 300 / minute |

Hitting a limit returns 429 with a `Retry-After` header. Scoped API keys can override the default per key.

## Audit trail

Every mutating call writes to the audit log via fire-and-forget middleware. The log is hash-chained (each entry references the previous entry's SHA-256), so any tampering breaks the chain and is caught by `/api/v1/audit/verify`.

Reads of protected history (e.g. time-travel replay, lakehouse export) are also explicitly logged — viewing immutable history is itself part of the record.

## Safety guidance for agentic workflows

1. **Default read-only.** Don't pass `--allow-writes` unless the workflow truly needs to mutate state.
2. **Plant-scope your API keys.** A key that only needs to read plant 1 should not be allowed to read plant 2.
3. **Don't paste passwords into MCP env vars.** Use API keys; they're revocable.
4. **Validate before submitting.** For CEP rules, always call `/cep_rules/validate` before `POST`. For sample submission, use the schemas exported from the OpenAPI document.
5. **Honor `Retry-After` on 429.** Don't hammer a rate-limited endpoint.
6. **Show Your Work matches the UI.** If your agent reports a Cpk to a user, fetch the explain endpoint with the same parameters as the UI so the displayed number is reproducible.
7. **Cross-plant access returns 404, not 403.** This is intentional — to prevent ID enumeration. If your agent gets 404 on a resource it expects to exist, check plant scoping first.

## Common errors

| Status | Meaning | Likely cause |
|--------|---------|--------------|
| 401 | Auth missing / invalid | Token expired, key revoked, or `Authorization` header missing. |
| 403 | Tier or RBAC block | Endpoint requires a higher license tier or role. |
| 404 | Not found *or* cross-plant probe | Either the resource really doesn't exist or your identity can't see it. |
| 422 | Schema validation failure | Pydantic body validation failed; response body lists the field errors. |
| 429 | Rate limited | Honor `Retry-After`. |
| 503 | Draining or broker down | Node is in graceful shutdown or the broker isn't reachable. |

## Versioning

The API is `/api/v1/...`. Backwards-incompatible changes get a `/v2/...` route, never an in-place change. Field additions are not breaking; field removals or type changes are. Watch the [CHANGELOG](CHANGELOG.md) for deprecation notices.

## Further reading

- [Time-travel SPC replay](docs/features/time-travel-replay.md)
- [Cassini Lakehouse](docs/features/lakehouse.md)
- [Streaming CEP rules](docs/features/streaming-cep.md)
- [Testing harness](docs/testing-harness.md)
- [CLI reference](docs/cli.md)
- [Configuration](docs/configuration.md)
- [Production deployment](docs/deployment.md)
