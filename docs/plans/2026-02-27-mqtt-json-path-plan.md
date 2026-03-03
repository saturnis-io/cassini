# MQTT JSON Path Mapping — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add JSONPath extraction to MQTT data sources so characteristics can map to nested properties within JSON payloads.

**Architecture:** Add a nullable `json_path` column to `MQTTDataSource`. The TagProvider checks this field per-characteristic: if set, parse payload as JSON and evaluate the JSONPath expression; if null, preserve current raw-float behavior. Validation at save time, graceful error handling at runtime.

**Tech Stack:** SQLAlchemy (model + migration), jsonpath-ng (already installed), FastAPI/Pydantic (API), React/TypeScript (frontend)

**Design doc:** `docs/plans/2026-02-27-mqtt-json-path-design.md`

---

### Task 1: Alembic Migration — Add `json_path` Column

**Files:**
- Create: `backend/alembic/versions/XXXX_add_json_path_to_mqtt_data_source.py`

**Step 1: Generate the migration**

```bash
cd backend && alembic revision --autogenerate -m "add json_path to mqtt_data_source"
```

This will fail to detect changes until the model is updated (Task 2), so create it manually instead:

```bash
cd backend && alembic revision -m "add json_path to mqtt_data_source"
```

**Step 2: Write the migration**

Open the generated file and set the upgrade/downgrade:

```python
"""add json_path to mqtt_data_source"""

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '<generated>'
down_revision = 'b24419b54417'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('mqtt_data_source', sa.Column('json_path', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('mqtt_data_source', 'json_path')
```

**Step 3: Run the migration**

```bash
cd backend && alembic upgrade head
```

Expected: Migration applies cleanly. Verify with:

```bash
cd backend && python -c "import sqlite3; conn = sqlite3.connect('spc.db'); print([col[1] for col in conn.execute('PRAGMA table_info(mqtt_data_source)').fetchall()])"
```

Expected output should include `json_path`.

**Step 4: Commit**

```bash
git add backend/alembic/versions/*add_json_path*
git commit -m "migration: add json_path column to mqtt_data_source"
```

---

### Task 2: Model + Repository — Add `json_path` to MQTTDataSource

**Files:**
- Modify: `backend/src/cassini/db/models/data_source.py:91` (after `metric_name`)
- Modify: `backend/src/cassini/db/repositories/data_source.py:66-88` (`create_mqtt_source`)

**Step 1: Add column to MQTTDataSource model**

In `backend/src/cassini/db/models/data_source.py`, add after line 91 (`metric_name`):

```python
json_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
```

**Step 2: Add `json_path` param to `create_mqtt_source()`**

In `backend/src/cassini/db/repositories/data_source.py`, update `create_mqtt_source`:

```python
async def create_mqtt_source(
    self,
    characteristic_id: int,
    topic: str,
    broker_id: int | None = None,
    metric_name: str | None = None,
    trigger_tag: str | None = None,
    trigger_strategy: str = "on_change",
    json_path: str | None = None,
) -> MQTTDataSource:
    source = MQTTDataSource(
        type="mqtt",
        characteristic_id=characteristic_id,
        trigger_strategy=trigger_strategy,
        is_active=True,
        broker_id=broker_id,
        topic=topic,
        metric_name=metric_name,
        trigger_tag=trigger_tag,
        json_path=json_path,
    )
    self.session.add(source)
    await self.session.flush()
    await self.session.refresh(source)
    return source
```

**Step 3: Verify**

```bash
cd backend && python -c "from cassini.db.models.data_source import MQTTDataSource; print('json_path' in MQTTDataSource.__table__.columns)"
```

Expected: `True`

**Step 4: Commit**

```bash
git add backend/src/cassini/db/models/data_source.py backend/src/cassini/db/repositories/data_source.py
git commit -m "feat: add json_path field to MQTTDataSource model and repository"
```

---

### Task 3: API Schema + Router — Wire `json_path` Through the API

**Files:**
- Modify: `backend/src/cassini/api/schemas/tag.py` (3 schemas)
- Modify: `backend/src/cassini/api/v1/tags.py` (create_mapping, list_mappings, preview_topic)

**Step 1: Update Pydantic schemas**

In `backend/src/cassini/api/schemas/tag.py`:

Add to `TagMappingCreate` (after `metric_name`):
```python
json_path: str | None = Field(None, max_length=500)
```

Add to `TagMappingResponse` (after `metric_name`):
```python
json_path: str | None = None
```

Add to `TagPreviewRequest` (after `duration_seconds`):
```python
json_path: str | None = Field(None, max_length=500)
```

**Step 2: Update `create_mapping` endpoint**

In `backend/src/cassini/api/v1/tags.py`, in `create_mapping()`:

Add JSONPath validation before the `ds_repo.create_mqtt_source()` call:

```python
# Validate json_path syntax if provided
if data.json_path:
    try:
        from jsonpath_ng import parse as jsonpath_parse
        jsonpath_parse(data.json_path)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid JSONPath expression: {data.json_path}"
        )
```

Pass `json_path` to `create_mqtt_source`:

```python
source = await ds_repo.create_mqtt_source(
    characteristic_id=data.characteristic_id,
    topic=data.mqtt_topic,
    broker_id=data.broker_id,
    metric_name=data.metric_name,
    trigger_tag=data.trigger_tag,
    trigger_strategy=data.trigger_strategy,
    json_path=data.json_path,
)
```

Include `json_path` in the response construction:

```python
return TagMappingResponse(
    data_source_id=source.id,
    characteristic_id=char.id,
    characteristic_name=char.name,
    mqtt_topic=source.topic,
    trigger_strategy=source.trigger_strategy,
    trigger_tag=source.trigger_tag,
    broker_id=broker.id,
    broker_name=broker.name,
    metric_name=source.metric_name,
    json_path=source.json_path,
    is_active=source.is_active,
)
```

**Step 3: Update `list_mappings` endpoint**

In the `list_mappings` response builder loop, add `json_path`:

```python
mappings.append(
    TagMappingResponse(
        data_source_id=src.id,
        characteristic_id=char.id if char else 0,
        characteristic_name=char.name if char else "Unknown",
        mqtt_topic=src.topic,
        trigger_strategy=src.trigger_strategy,
        trigger_tag=src.trigger_tag,
        broker_id=src.broker_id,
        broker_name=broker.name if broker else None,
        metric_name=src.metric_name,
        json_path=src.json_path,
        is_active=src.is_active,
    )
)
```

**Step 4: Update `preview_topic` to apply json_path extraction**

In the `on_preview_message` callback inside `preview_topic`, after the non-Sparkplug section that parses raw values, add JSON path extraction. Replace the non-Sparkplug block:

```python
# Non-SparkplugB or fallback: decode as UTF-8 text
raw = payload.decode("utf-8", errors="replace")[:200]

# If json_path provided, extract from JSON
if data.json_path:
    try:
        import json
        from jsonpath_ng import parse as jsonpath_parse
        parsed = json.loads(raw)
        expr = jsonpath_parse(data.json_path)
        matches = expr.find(parsed)
        if matches:
            extracted = matches[0].value
            try:
                value = float(extracted)
            except (TypeError, ValueError):
                value = str(extracted)
        else:
            value = f"[no match for {data.json_path}]"
    except json.JSONDecodeError:
        value = f"[not valid JSON: {raw[:50]}]"
else:
    # Original behavior — try float, then bool, then string
    try:
        value = float(raw.strip())
    except ValueError:
        if raw.strip().lower() in ("true", "false"):
            value = raw.strip().lower() == "true"
        else:
            value = raw.strip()

collected_values.append(
    TagPreviewValue(
        value=value,
        timestamp=datetime.now(timezone.utc),
        raw_payload=raw,
    )
)
```

**Step 5: Verify the API starts**

```bash
cd backend && python -c "from cassini.api.v1.tags import router; print(f'{len(router.routes)} routes OK')"
```

**Step 6: Commit**

```bash
git add backend/src/cassini/api/schemas/tag.py backend/src/cassini/api/v1/tags.py
git commit -m "feat: wire json_path through tag mapping API (create, list, preview)"
```

---

### Task 4: TagProvider — JSON Extraction in Message Handler

**Files:**
- Modify: `backend/src/cassini/core/providers/buffer.py:30` (TagConfig)
- Modify: `backend/src/cassini/core/providers/tag.py:138-160,278-300` (_load_tag_characteristics, _handle_plain_message)

**Step 1: Add `json_path` to TagConfig**

In `backend/src/cassini/core/providers/buffer.py`, add after `metric_name` (line 30):

```python
json_path: str | None = None
```

**Step 2: Load `json_path` in `_load_tag_characteristics`**

In `backend/src/cassini/core/providers/tag.py`, in `_load_tag_characteristics()`, update the `TagConfig` construction (around line 152):

```python
config = TagConfig(
    characteristic_id=char.id,
    mqtt_topic=src.topic,
    subgroup_size=char.subgroup_size,
    trigger_strategy=src.trigger_strategy,
    trigger_tag=src.trigger_tag,
    metric_name=src.metric_name,
    json_path=src.json_path,
)
```

**Step 3: Rewrite `_handle_plain_message` with JSON extraction**

Replace the entire `_handle_plain_message` method:

```python
async def _handle_plain_message(
    self, topic: str, payload: bytes, char_ids: list[int]
) -> None:
    """Handle a plain (non-SparkplugB) message.

    If any characteristic on this topic has a json_path configured,
    the payload is parsed as JSON once and reused. Otherwise falls
    back to raw float parsing.
    """
    raw = payload.decode("utf-8", errors="replace").strip()

    # Check if any char on this topic needs JSON parsing
    needs_json = any(
        self._configs.get(cid) and self._configs[cid].json_path
        for cid in char_ids
    )

    parsed_json = None
    if needs_json:
        import json
        try:
            parsed_json = json.loads(raw)
        except (json.JSONDecodeError, ValueError) as e:
            logger.warning(
                "json_parse_failed",
                topic=topic,
                payload=raw[:200],
                error=str(e),
            )
            # Fall through — chars without json_path can still try raw float

    for char_id in char_ids:
        config = self._configs.get(char_id)
        buffer = self._buffers.get(char_id)
        if not config or not buffer:
            continue

        value: float | None = None

        if config.json_path:
            # JSON path extraction
            if parsed_json is None:
                logger.debug(
                    "skipping_json_path_no_json",
                    characteristic_id=char_id,
                    topic=topic,
                )
                continue

            try:
                from jsonpath_ng import parse as jsonpath_parse
                expr = jsonpath_parse(config.json_path)
                matches = expr.find(parsed_json)
                if not matches:
                    logger.debug(
                        "json_path_no_match",
                        characteristic_id=char_id,
                        json_path=config.json_path,
                        topic=topic,
                    )
                    continue
                value = float(matches[0].value)
            except (TypeError, ValueError) as e:
                logger.warning(
                    "json_path_not_numeric",
                    characteristic_id=char_id,
                    json_path=config.json_path,
                    matched_value=repr(matches[0].value) if matches else None,
                    error=str(e),
                )
                continue
            except Exception as e:
                logger.warning(
                    "json_path_eval_failed",
                    characteristic_id=char_id,
                    json_path=config.json_path,
                    error=str(e),
                )
                continue
        else:
            # Raw float parsing (original behavior)
            try:
                value = float(raw)
            except ValueError as e:
                logger.error(
                    "payload_parse_failed",
                    topic=topic,
                    payload=repr(payload),
                    error=str(e),
                )
                return  # No point trying other chars — same raw payload

        if value is not None:
            logger.debug(
                "received_value",
                value=value,
                topic=topic,
                characteristic_id=char_id,
                json_path=config.json_path,
            )
            await self._dispatch_value(char_id, config, buffer, value)
```

**Important:** The `jsonpath_parse` call is inside the loop per-char. For a hot path optimization, we could cache compiled expressions, but this is fine for now — `jsonpath_ng.parse()` is fast and this runs at MQTT message frequency (typically 1-10 Hz), not microsecond scale.

**Step 4: Verify import works**

```bash
cd backend && python -c "from jsonpath_ng import parse; expr = parse('$.sensor.value'); print('jsonpath_ng OK')"
```

**Step 5: Commit**

```bash
git add backend/src/cassini/core/providers/buffer.py backend/src/cassini/core/providers/tag.py
git commit -m "feat: TagProvider JSON extraction via json_path on plain MQTT messages"
```

---

### Task 5: Frontend Types + API — Add `json_path`

**Files:**
- Modify: `frontend/src/types/index.ts:477-511` (TagMappingCreate, TagMappingResponse, TagPreviewValue)
- Modify: `frontend/src/api/connectivity.api.ts:199` (tagApi.preview)

**Step 1: Update TypeScript types**

In `frontend/src/types/index.ts`:

Add `json_path` to `TagMappingCreate` (after `metric_name`):
```typescript
json_path: string | null
```

Add `json_path` to `TagMappingResponse` (after `metric_name`):
```typescript
json_path: string | null
```

**Step 2: Update `tagApi.preview` to accept `json_path`**

In `frontend/src/api/connectivity.api.ts`, update the preview method signature:

```typescript
preview: (data: { broker_id: number; topic: string; duration_seconds?: number; json_path?: string | null }) =>
    fetchApi<TagPreviewResponse>('/tags/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
```

**Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Clean or only pre-existing errors.

**Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/connectivity.api.ts
git commit -m "feat: add json_path to frontend TypeScript types and tag API"
```

---

### Task 6: Frontend UI — JSON Path Input in ProtocolSourceFields

**Files:**
- Modify: `frontend/src/components/connectivity/ProtocolSourceFields.tsx:6-12,55-136` (MQTTFieldValues, MQTTFields)
- Modify: `frontend/src/components/connectivity/MappingDialog.tsx:64-71,76-99,152-163` (field init, mutation, protocol reset)

**Step 1: Add `json_path` to MQTTFieldValues**

In `frontend/src/components/connectivity/ProtocolSourceFields.tsx`, update `MQTTFieldValues`:

```typescript
interface MQTTFieldValues {
  protocol: 'mqtt'
  topic: string
  broker_id: number | null
  metric_name: string
  trigger_tag: string
  json_path: string
}
```

**Step 2: Add JSON Path input field to MQTTFields**

In the `MQTTFields` component, add a new field between the Topic and Metric Name inputs (after the Topic `</div>` around line 106, before the Metric Name `<div>` around line 109):

```tsx
{/* JSON Path (optional, for JSON payloads) */}
<div>
  <label className="text-muted-foreground text-[11px]">
    JSON Path <span className="opacity-60">(optional, for JSON payloads)</span>
  </label>
  <input
    type="text"
    value={values.json_path}
    onChange={(e) => update({ json_path: e.target.value })}
    placeholder="e.g. $.sensor.readings.value"
    className="bg-background border-border text-foreground placeholder-muted-foreground focus:border-primary/50 mt-0.5 w-full rounded border px-2 py-1.5 font-mono text-sm focus:outline-none"
  />
  {values.json_path && (
    <p className="text-muted-foreground mt-1 text-[10px]">
      Extracts a numeric value from JSON payloads using JSONPath syntax
    </p>
  )}
</div>
```

**Step 3: Update MappingDialog — initial state, mutation, and reset**

In `frontend/src/components/connectivity/MappingDialog.tsx`:

a) Update `editData` interface to include `jsonPath`:
```typescript
editData?: {
    dataSourceId: number
    characteristicId: number
    protocol: 'mqtt' | 'opcua'
    triggerStrategy: string
    // MQTT-specific
    topic?: string
    brokerId?: number
    metricName?: string
    triggerTag?: string
    jsonPath?: string
    // OPC-UA-specific
    nodeId?: string
    serverId?: number
  } | null
```

b) Update initial MQTT field state (around line 64-71):
```typescript
return {
  protocol: 'mqtt',
  topic: editData?.topic ?? '',
  broker_id: editData?.brokerId ?? null,
  metric_name: editData?.metricName ?? '',
  trigger_tag: editData?.triggerTag ?? '',
  json_path: editData?.jsonPath ?? '',
}
```

c) Update `createMQTTMutation` to send `json_path` (around line 76-99):
```typescript
const createMQTTMutation = useMutation({
    mutationFn: () => {
      const fields = protocolFields as {
        protocol: 'mqtt'
        topic: string
        broker_id: number | null
        metric_name: string
        trigger_tag: string
        json_path: string
      }
      return tagApi.createMapping({
        characteristic_id: characteristicId!,
        mqtt_topic: fields.topic,
        trigger_strategy: triggerStrategy,
        trigger_tag: fields.trigger_tag || null,
        broker_id: fields.broker_id!,
        metric_name: fields.metric_name || null,
        json_path: fields.json_path || null,
      })
    },
    onSuccess: () => {
      toast.success('MQTT mapping created')
      invalidateAndClose()
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  })
```

d) Update protocol reset (around line 156-163):
```typescript
if (p === 'mqtt') {
  setProtocolFields({
    protocol: 'mqtt',
    topic: '',
    broker_id: null,
    metric_name: '',
    trigger_tag: '',
    json_path: '',
  })
}
```

**Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Clean pass.

**Step 5: Build check**

```bash
cd frontend && npm run build
```

Expected: Clean build.

**Step 6: Commit**

```bash
git add frontend/src/components/connectivity/ProtocolSourceFields.tsx frontend/src/components/connectivity/MappingDialog.tsx
git commit -m "feat: add JSON Path input to MQTT mapping dialog"
```

---

### Task 7: Update Remaining Frontend References

**Files:**
- Check: `frontend/src/components/connectivity/MappingRow.tsx` — if it renders mapping details, add `json_path` display
- Check: `frontend/src/components/connectivity/TagMappingPanel.tsx` — if it passes editData to MappingDialog, include `jsonPath`
- Check: `frontend/src/components/connectivity/QuickMapForm.tsx` — if it creates MQTT mappings, add `json_path`

**Step 1: Search for all references passing TagMappingCreate or TagMappingResponse**

Read each file listed above. For each one that constructs a `TagMappingCreate` or reads a `TagMappingResponse`, ensure `json_path` is included.

Common patterns to look for:
- `tagApi.createMapping({...})` — add `json_path: ... || null`
- `editData={{ ... }}` passed to MappingDialog — add `jsonPath: mapping.json_path`
- Display of mapping details (table rows) — optionally show json_path if set

**Step 2: Type-check after all updates**

```bash
cd frontend && npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add frontend/src/components/connectivity/
git commit -m "feat: propagate json_path through remaining connectivity components"
```

---

### Task 8: Final Verification

**Step 1: Full backend startup test**

```bash
cd backend && python -c "
from cassini.db.models.data_source import MQTTDataSource
from cassini.api.schemas.tag import TagMappingCreate, TagMappingResponse, TagPreviewRequest
# Verify json_path on model
assert 'json_path' in MQTTDataSource.__table__.columns
# Verify json_path on schemas
assert 'json_path' in TagMappingCreate.model_fields
assert 'json_path' in TagMappingResponse.model_fields
assert 'json_path' in TagPreviewRequest.model_fields
print('All backend checks passed')
"
```

**Step 2: Full frontend type check + build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

**Step 3: Manual smoke test (if backend is running)**

```bash
# Test JSONPath validation rejects bad syntax
curl -s -X POST http://localhost:8000/api/v1/tags/map \
  -H "Content-Type: application/json" \
  -d '{"characteristic_id":1,"mqtt_topic":"test","broker_id":1,"json_path":"$[invalid"}' \
  | python -m json.tool
```

Expected: 422 with "Invalid JSONPath expression" message.

**Step 4: Final commit (if any remaining changes)**

```bash
git add -A && git status
# Only commit if there are changes
git commit -m "feat: MQTT JSON Path mapping — complete implementation"
```
