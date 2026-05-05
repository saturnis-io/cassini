# Cassini Lakehouse

**Tier:** Pro · **API:** `GET /api/v1/lakehouse/...`

A read-only data product API that exposes Cassini's curated tables as Arrow IPC, Parquet, JSON, or CSV. Designed for analytics workloads — Pandas / Polars / DuckDB notebooks, BI tools, data warehouse ingestion — without touching the operational database directly.

Every export is plant-scoped, audited, and rate-limited. The wire formats are columnar so a 1M-row export downloads as a single ~10 MB Arrow file rather than a 200 MB JSON blob.

## Why a separate read API?

The transactional API (`/api/v1/samples/`, `/api/v1/violations/`) is tuned for low-latency operator UX: small responses, JSON, immediate consistency. Analytics workloads want the opposite: large columnar batches, schema stability, no surprise row-count caps. The lakehouse API gives those workloads a stable contract that won't shift when the operational schema evolves.

## Available tables

```bash
curl -H "Authorization: Bearer $TOKEN" \
  https://cassini.example.com/api/v1/lakehouse/tables
```

```json
{
  "tables": [
    { "name": "samples", "description": "Subgroups with timestamps, batch numbers, and operator metadata." },
    { "name": "measurements", "description": "Individual measurement values, joinable to samples by sample_id." },
    { "name": "violations", "description": "Nelson rule violations with characteristic, sample, and rule context." },
    { "name": "characteristics", "description": "Characteristic configuration — limits, chart type, sigma method, current state." },
    { "name": "plants", "description": "Plant metadata for the plants the calling identity can access." }
  ],
  "formats": ["json", "csv", "parquet", "arrow"],
  "rate_limit": "10/minute"
}
```

The whitelist is enforced server-side — any table name outside this set returns 404. Column-level changes are additive (new columns appended); column removals or type changes would be a contract break and would ship in a `/v2/lakehouse/...` route.

## Export format selection

```bash
# Arrow IPC (default for analytics — columnar, ~10x smaller than JSON)
curl -H "Authorization: Bearer $TOKEN" \
  "https://cassini.example.com/api/v1/lakehouse/samples?format=arrow&from=2026-01-01&to=2026-04-01" \
  -o samples.arrow

# Parquet (for warehouse ingestion)
curl -H "Authorization: Bearer $TOKEN" \
  "https://cassini.example.com/api/v1/lakehouse/samples?format=parquet&plant_id=1" \
  -o samples.parquet

# JSON (default — for ad-hoc inspection)
curl -H "Authorization: Bearer $TOKEN" \
  "https://cassini.example.com/api/v1/lakehouse/violations?format=json&limit=1000"

# CSV (for Excel / SQL Server BULK INSERT)
curl -H "Authorization: Bearer $TOKEN" \
  "https://cassini.example.com/api/v1/lakehouse/measurements?format=csv&from=2026-03-01" \
  -o measurements.csv
```

## Query parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | enum | `json` | One of `json`, `csv`, `parquet`, `arrow`. |
| `plant_id` | int | (all accessible) | Restrict to a single plant. Cross-plant access is enforced. |
| `columns` | string | (all) | Comma-separated subset; unknown names are silently dropped. |
| `from` | datetime | (none) | Inclusive start of the timestamp window. |
| `to` | datetime | (none) | Inclusive end. |
| `limit` | int | (no cap, 1M ceiling) | Maximum rows to return. |

## Response headers

```text
X-Lakehouse-Row-Count: 142357
X-Lakehouse-Truncated: false
```

`X-Lakehouse-Truncated: true` means the result hit the `limit` parameter or the 1,000,000-row safety ceiling — paginate by narrowing the timestamp window.

## Python example (Pandas via Arrow)

```python
import io
import pyarrow.ipc as ipc
import pandas as pd
import requests

resp = requests.get(
    "https://cassini.example.com/api/v1/lakehouse/samples",
    params={
        "format": "arrow",
        "plant_id": 1,
        "from": "2026-01-01T00:00:00Z",
        "to":   "2026-04-01T00:00:00Z",
    },
    headers={"Authorization": f"Bearer {token}"},
)
resp.raise_for_status()

with ipc.open_stream(io.BytesIO(resp.content)) as reader:
    df = reader.read_all().to_pandas()

print(df.head())
print(f"Rows: {len(df):,}  Truncated: {resp.headers['X-Lakehouse-Truncated']}")
```

## Polars example

```python
import polars as pl
import requests

resp = requests.get(
    "https://cassini.example.com/api/v1/lakehouse/samples?format=parquet&plant_id=1",
    headers={"Authorization": f"Bearer {token}"},
    stream=True,
)
df = pl.read_parquet(resp.raw)
df.group_by("characteristic_id").agg(
    pl.col("value").mean().alias("mean"),
    pl.col("value").std().alias("std"),
    pl.col("id").count().alias("n"),
).sort("characteristic_id")
```

## DuckDB example (read directly from a URL with HTTP extension)

```sql
INSTALL httpfs;
LOAD httpfs;

-- Token in the request via the SDK / connection string in real use.
SELECT plant_id, COUNT(*) AS n_samples, AVG(value) AS mean_value
FROM read_parquet('https://cassini.example.com/api/v1/lakehouse/samples?format=parquet')
GROUP BY plant_id
ORDER BY n_samples DESC;
```

## Auth & RBAC

Lakehouse exports use the same JWT or scoped API key as the rest of the REST API. RBAC honors plant scoping: a user with access to plants `[1, 3]` only ever sees rows from those plants, even with no `plant_id` parameter set. Global admins see everything.

A scoped API key with `lakehouse:read` is the recommended way to grant a BI tool or notebook read-only access without sharing operator credentials.

## Audit trail

Every export is recorded in the audit log with the table name, format, row count, plant filter, column subset, and truncation flag. The `lakehouse_export` action is searchable from the audit viewer.

## Rate limit

Default: 10 exports per minute per identity. Configure via `CASSINI_RATE_LIMIT_EXPORT` (e.g. `30/minute`). Hitting the limit returns 429 with `Retry-After`.
