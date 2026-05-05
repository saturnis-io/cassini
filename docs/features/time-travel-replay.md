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

The response is a flat `ReplaySnapshot` object — no `snapshot.{...}` wrapper. The shape mirrors `cassini.api.schemas.replay.ReplaySnapshot`:

```json
{
  "resource_type": "characteristic",
  "resource_id": 42,
  "requested_at": "2026-03-14T14:00:00Z",
  "generated_at": "2026-05-05T17:42:11.183Z",
  "plant_id": 1,
  "characteristic": {
    "id": 42,
    "name": "Bore Diameter",
    "description": "Inner bore diameter, post-grind",
    "chart_type": "xbar_r",
    "subgroup_size": 5,
    "subgroup_mode": "fixed",
    "target_value": 10.00,
    "usl": 10.05,
    "lsl": 9.95,
    "ucl": 10.034,
    "lcl": 9.966,
    "stored_sigma": 0.0114,
    "stored_center_line": 10.001,
    "decimal_precision": 4,
    "data_type": "variable",
    "attribute_chart_type": null,
    "use_laney_correction": false,
    "short_run_mode": null,
    "sigma_method": "rbar_d2",
    "limits_frozen": false,
    "limits_frozen_at": null
  },
  "rules": [
    { "rule_id": 1, "is_enabled": true, "require_acknowledgement": true, "parameters": null },
    { "rule_id": 2, "is_enabled": true, "require_acknowledgement": false, "parameters": "{\"k\":9}" }
  ],
  "samples": [
    {
      "id": 10412,
      "timestamp": "2026-03-14T13:55:12Z",
      "batch_number": "B-2024-074",
      "operator_id": "op17",
      "is_excluded": false,
      "actual_n": 5
    }
  ],
  "signatures": [
    {
      "id": 91,
      "timestamp": "2026-03-12T08:30:00Z",
      "username": "qa.engineer",
      "full_name": "QA Engineer",
      "meaning_code": "approved",
      "meaning_display": "Approved",
      "resource_hash": "9c4b...e1",
      "is_valid_at_replay": true,
      "invalidated_at": null,
      "invalidated_reason": null
    }
  ],
  "audit_event_count": 487,
  "earliest_known_state_at": "2025-11-01T08:00:00Z"
}
```

> **What is and isn't historical (Phase 1 scope).** Sprint 15 ships the snapshot's UCL, LCL, center line, and signature validity reconstructed at the requested timestamp — those values are walked from the audit log. The remaining characteristic configuration fields (name, target, USL/LSL, sigma method, rule parameters, etc.) and per-sample fields reflect the **current** row state. Per-field reconstruction of every column from `audit_log.detail.body` is documented as Phase 2 in the design note. For audit / regulatory use today, treat limits, center line, and signature state as historical; treat config metadata as the row's present value.

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
