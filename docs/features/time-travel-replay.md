# Time-travel SPC replay

**Tier:** Pro · **API:** `GET /api/v1/replay/{resource_type}/{resource_id}`

Reconstruct any control chart's state at any historical moment from the hash-chained audit log. Limits, rule configuration, signatures, and the contributing sample list are all rebuilt on demand from immutable history — never persisted as new artifacts. Designed to satisfy 21 CFR Part 11 §11.10(b) ("ability to generate accurate and complete copies of records in both human readable and electronic form").

## When to use it

- **Audit response.** A regulator asks "what did this chart look like on March 14, 2026 at 2pm?" — replay returns exactly that snapshot.
- **Investigation.** Engineering wants to see the limits, rules, and sample distribution that were active when a violation fired — not the current state, which may have been re-baselined since.
- **Validation.** Confirm that a signed report's underlying chart matches the values it reported on the day it was signed.

## How it works

The replay engine walks the audit log forward from the resource's creation timestamp, applying every recorded mutation (limit recalculation, rule preset change, signature event, sample insertion) up to the requested `at` timestamp. The result is a deterministic, byte-stable reconstruction:

1. Tier check (`time_travel_replay` feature) — runs before any DB read so unentitled callers can't probe for resource IDs.
2. Resource-type allowlist (currently `characteristic` only).
3. Plant scope check — cross-plant probes return 404, identical to "doesn't exist".
4. Snapshot reconstruction from the audit log.
5. The replay request itself is audit-logged (read-but-protected access).

## Request

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://cassini.example.com/api/v1/replay/characteristic/42?at=2026-03-14T14:00:00Z"
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `resource_type` | path | Currently must be `characteristic`. |
| `resource_id` | path | Numeric ID. |
| `at` | query | ISO-8601 UTC timestamp. |

## Response

```json
{
  "resource_type": "characteristic",
  "resource_id": 42,
  "plant_id": 1,
  "requested_at": "2026-03-14T14:00:00Z",
  "audit_event_count": 487,
  "snapshot": {
    "characteristic": {
      "name": "Bore Diameter",
      "lsl": 9.95,
      "usl": 10.05,
      "target": 10.00,
      "subgroup_size": 5,
      "chart_type": "xbar_r"
    },
    "limits": {
      "ucl": 10.034,
      "lcl": 9.966,
      "centerline": 10.001,
      "stored_sigma": 0.0114,
      "calculated_at": "2026-03-12T08:00:00Z"
    },
    "rule_config": {
      "rules": ["nelson_1", "nelson_2", "nelson_3", "nelson_4"],
      "preset_name": "Nelson Strict"
    },
    "signatures": [
      {
        "id": 91,
        "user": "qa.engineer",
        "meaning": "Approved",
        "signed_at": "2026-03-12T08:30:00Z",
        "verified": true
      }
    ],
    "samples": [
      { "id": 10412, "timestamp": "2026-03-14T13:55:12Z", "values": [10.01, 10.02, 9.99, 10.00, 10.01] }
    ]
  }
}
```

## Error responses

| Status | Reason |
|--------|--------|
| 400 | Unsupported `resource_type` or unparseable `at`. |
| 403 | License tier doesn't include `time_travel_replay`. |
| 404 | Resource missing, cross-plant probe, or no reconstructable history at `at`. |
| 422 | `at` failed datetime parsing. |

## UI

The Cassini web UI exposes time-travel replay through a "Replay at..." control on every chart. Pick a date and time, the chart re-renders with the historical limits, rules, and sample list. A banner indicates the chart is in replay mode, and all interactive controls (limit recalculation, rule edits) are disabled until you exit replay mode.

## Audit trail

Every replay call is itself recorded in the audit log with the requested timestamp and the count of audit events that contributed to the snapshot. This satisfies §11.10(e): the act of viewing protected history is itself part of the record.
