# MQTT JSON Path Mapping — Design

**Date**: 2026-02-27
**Status**: Approved
**Scope**: Add JSONPath extraction to MQTT data sources for nested JSON payloads

## Problem

The MQTT TagProvider currently handles two payload formats:
1. **SparkplugB** (protobuf) — extracts values by `metric_name`
2. **Plain MQTT** — parses the entire payload as a raw float

Many MQTT devices publish JSON objects (flat, nested, or array-based), where the measurement value lives at a nested property. There is no way to map a characteristic to a specific field within a JSON payload.

## Decision

Add a nullable `json_path` column to `MQTTDataSource`. When set, the TagProvider parses the payload as JSON and evaluates the JSONPath expression to extract the measurement value. When null, current raw-float behavior is preserved (fully backward-compatible).

**Syntax**: JSONPath (`$.foo.bar[0].value`) via the `jsonpath-ng` library (already installed as an ERP module dependency).

**Cardinality**: One `json_path` per `MQTTDataSource` row. Multiple characteristics on the same topic use separate mappings with different `json_path` expressions.

## Data Model

### New column on `mqtt_data_source`

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `json_path` | `VARCHAR(500)` | Yes | `NULL` | JSONPath expression to extract value from JSON payloads |

**Migration**: Add column only. No data migration — existing rows get `NULL` (current behavior preserved).

**Model change** (`db/models/data_source.py`):
```python
json_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
```

## Backend — TagProvider Changes

### Value extraction flow (`tag.py`)

The change is isolated to `_handle_plain_message()`:

```
For each char_id on this topic:
  config = self._configs[char_id]

  if config.json_path:
    → JSON-decode payload (once per message, cached across chars on same topic)
    → Evaluate json_path expression via jsonpath-ng
    → Extract first match, convert to float
  else:
    → float(payload.decode().strip())  [unchanged current behavior]
```

### TagConfig (`buffer.py`)

Add field:
```python
json_path: str | None = None
```

Populated in `_load_tag_characteristics()` from `src.json_path`, same pattern as `metric_name`.

### JSON parse caching

When multiple characteristics share the same topic (each with different `json_path` expressions), the JSON payload is decoded once per message and reused. This avoids redundant `json.loads()` calls on the hot path.

### Error handling (per-message, never crashes the provider)

| Condition | Behavior |
|-----------|----------|
| JSON decode failure | Log warning with topic + payload snippet, skip message |
| JSONPath no match | Log debug (may be expected for some messages), skip |
| JSONPath match not numeric | Log warning with path + matched value, skip |
| JSONPath compile failure | Caught at save time (API validation), never reaches runtime |

## Backend — API & Schema

### Schema changes (`api/schemas/tag.py`)

- `TagMappingCreate`: add `json_path: str | None = Field(None, max_length=500)`
- `TagMappingResponse`: add `json_path: str | None = None`
- `TagPreviewRequest`: add `json_path: str | None = None`

### Router changes (`api/v1/tags.py`)

- `create_mapping`: pass `json_path` to `ds_repo.create_mqtt_source()`. Validate JSONPath syntax with `jsonpath_ng.parse()` before saving — return 422 on invalid expression.
- `list_mappings`: include `json_path` in response
- `preview_topic`: when `json_path` provided, apply extraction to each collected message so users can verify before saving

### Repository changes (`db/repositories/data_source.py`)

- `create_mqtt_source()`: add `json_path` parameter, pass to `MQTTDataSource` constructor

## Frontend

### ProtocolSourceFields (`connectivity/ProtocolSourceFields.tsx`)

Add `json_path` input to the MQTT fields section:

```
Broker:       [dropdown]
Topic:        [text input]
JSON Path:    [text input]  ← NEW
Metric Name:  [text input]  (SparkplugB only)
Trigger Tag:  [text input]  (on_trigger only)
```

**Field details:**
- Placeholder: `e.g. $.sensor.readings.value`
- Helper text: `JSONPath expression to extract value from JSON payloads`
- Optional — empty means raw float parsing
- Visually deemphasize when topic starts with `spBv1.0/` (Sparkplug uses `metric_name` instead)

### TypeScript types

`MQTTFieldValues`: add `json_path: string`

Connectivity API types: add `json_path` to create/response types

## Files Changed

| File | Change |
|------|--------|
| `backend/src/cassini/db/models/data_source.py` | Add `json_path` column to `MQTTDataSource` |
| `backend/alembic/versions/XXX_add_json_path.py` | New migration |
| `backend/src/cassini/core/providers/buffer.py` | Add `json_path` field to `TagConfig` |
| `backend/src/cassini/core/providers/tag.py` | JSON extraction in `_handle_plain_message()`, load `json_path` in `_load_tag_characteristics()` |
| `backend/src/cassini/api/schemas/tag.py` | Add `json_path` to create/response/preview schemas |
| `backend/src/cassini/api/v1/tags.py` | Pass `json_path` through create, validate syntax, enhance preview |
| `backend/src/cassini/db/repositories/data_source.py` | Add `json_path` param to `create_mqtt_source()` |
| `frontend/src/components/connectivity/ProtocolSourceFields.tsx` | Add JSON Path input field |
| `frontend/src/api/connectivity.api.ts` | Add `json_path` to TypeScript types |

## Scope Boundaries

**This design does NOT include:**
- Fan-out routing (one message → multiple chars via array element matching). Use separate mappings with different paths.
- JSONPath on SparkplugB messages — Sparkplug has its own `metric_name` extraction.
- Transform expressions (math on extracted values). Extraction only.
- JSON schema validation of payloads.
- Payload format auto-detection — user must configure `json_path` explicitly for JSON payloads.

## Examples

### Flat JSON
```
Topic: machine/lathe-01/data
Payload: {"temperature": 23.5, "humidity": 45.2}
json_path: $.temperature
→ Extracts: 23.5
```

### Nested JSON
```
Topic: machine/lathe-01/data
Payload: {"sensor": {"readings": {"value": 23.5, "unit": "C"}}}
json_path: $.sensor.readings.value
→ Extracts: 23.5
```

### Array index
```
Topic: machine/lathe-01/measurements
Payload: {"measurements": [{"name": "diameter", "value": 25.01}, {"name": "length", "value": 100.3}]}
json_path: $.measurements[0].value
→ Extracts: 25.01 (first element)
```

### Array filter
```
Topic: machine/lathe-01/measurements
Payload: {"measurements": [{"name": "diameter", "value": 25.01}, {"name": "length", "value": 100.3}]}
json_path: $.measurements[?name='diameter'].value
→ Extracts: 25.01 (by name match)
```

### Raw float (unchanged)
```
Topic: machine/lathe-01/temperature
Payload: 23.5
json_path: NULL
→ Extracts: 23.5 (current behavior, no change)
```
