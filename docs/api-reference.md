# API Reference

Complete REST API and WebSocket reference for OpenSPC v0.3.0.

---

## Overview

| Property | Value |
|----------|-------|
| **Base URL** | `http://localhost:8000/api/v1/` |
| **Authentication** | Bearer token in `Authorization` header |
| **Content type** | `application/json` |
| **Interactive docs** | Swagger UI at `/docs`, ReDoc at `/redoc` |

### Typical API Workflow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant SPC Engine
    participant WebSocket

    Client->>API: POST /auth/login
    API-->>Client: access_token + refresh cookie

    Client->>API: GET /hierarchy (Bearer token)
    API-->>Client: Equipment tree

    Client->>API: POST /samples (measurements)
    API->>SPC Engine: Process sample
    SPC Engine-->>API: Result + violations
    API-->>Client: SampleProcessingResult
    SPC Engine->>WebSocket: Broadcast to subscribers

    Client->>API: POST /auth/refresh (cookie)
    API-->>Client: New access_token
```

### Role Hierarchy

Endpoints require a minimum role. Roles are granted per-plant.

| Role | Level | Description |
|------|-------|-------------|
| `operator` | 1 | Submit samples, view data |
| `supervisor` | 2 | Acknowledge violations, manage annotations, exclude samples |
| `engineer` | 3 | Configure characteristics, limits, rules, brokers, tags |
| `admin` | 4 | Manage users, plants, delete resources |

A higher role implicitly satisfies a lower-role requirement (e.g., an engineer can do everything a supervisor can).

---

## 1. Authentication

### `POST /auth/login`

Authenticate with username and password.

**Auth**: None

**Request body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | Username |
| `password` | string | Yes | Password |
| `remember_me` | boolean | No | Extend refresh token to 30 days (default: 7 days) |

**Response** (`LoginResponse`):

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | JWT access token (15 min expiry) |
| `token_type` | string | Always `"bearer"` |
| `user` | object | User profile with plant roles |

**Side effects**: Sets `refresh_token` httpOnly cookie with `path=/api/v1/auth`.

---

### `POST /auth/refresh`

Rotate access and refresh tokens using the refresh cookie.

**Auth**: Refresh token cookie

**Request**: No body. The `refresh_token` cookie is sent automatically.

**Response** (`TokenResponse`):

| Field | Type | Description |
|-------|------|-------------|
| `access_token` | string | New JWT access token |
| `token_type` | string | Always `"bearer"` |

**Side effects**: Sets new `refresh_token` cookie, clears old one.

**Errors**: `401` if cookie is missing, expired, or user is inactive.

---

### `POST /auth/logout`

Clear the refresh token cookie.

**Auth**: None

**Response**: `{"message": "Logged out successfully"}`

---

### `GET /auth/me`

Get the current authenticated user with all plant roles.

**Auth**: JWT (any role)

**Response** (`UserWithRolesResponse`):

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | User ID |
| `username` | string | Username |
| `email` | string | Email (nullable) |
| `is_active` | boolean | Account status |
| `plant_roles` | array | `[{plant_id, plant_name, plant_code, role}]` |
| `created_at` | datetime | Account creation time |
| `updated_at` | datetime | Last update time |

---

### Token Details

| Property | Value |
|----------|-------|
| Algorithm | HS256 |
| Access token expiry | 15 minutes |
| Refresh token expiry | 7 days (30 days with `remember_me`) |
| Refresh cookie path | `/api/v1/auth` |
| Refresh cookie flags | `httpOnly`, `SameSite=Lax` |
| Token payload | `{"sub": "<username>", "exp": <timestamp>, "type": "access"|"refresh"}` |

---

## 2. Plants

### `GET /plants`

List all plants.

**Auth**: JWT (any role)

**Query parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `active_only` | boolean | `false` | Only return active plants |

**Response**: `PlantResponse[]`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Plant ID |
| `name` | string | Plant name |
| `code` | string | Unique short code (uppercased) |
| `is_active` | boolean | Active status |
| `settings` | object | Plant-specific settings (nullable) |
| `created_at` | datetime | Creation time |

---

### `POST /plants`

Create a new plant. Auto-assigns admin role for all existing admin users.

**Auth**: Admin

**Request body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Plant name |
| `code` | string | Yes | Unique short code |
| `is_active` | boolean | No | Default `true` |
| `settings` | object | No | Plant-specific settings |

**Response**: `PlantResponse` (201 Created)

**Errors**: `409` if name or code already exists.

---

### `GET /plants/{plant_id}`

Get a plant by ID.

**Auth**: JWT (any role)

**Response**: `PlantResponse`

**Errors**: `404` if not found.

---

### `PUT /plants/{plant_id}`

Update a plant. Only provided fields are updated.

**Auth**: Admin

**Request body**: Same fields as create (all optional).

**Response**: `PlantResponse`

**Errors**: `404` if not found. `409` if name/code conflict.

---

### `DELETE /plants/{plant_id}`

Delete a plant. The DEFAULT plant cannot be deleted.

**Auth**: Admin

**Response**: 204 No Content

**Errors**: `400` if DEFAULT plant. `404` if not found.

---

## 3. Equipment Hierarchy

Hierarchy follows the ISA-95 equipment model. Node types: `Folder`, `Enterprise`, `Site`, `Area`, `Line`, `Cell`, `Equipment`, `Tag`.

### `GET /hierarchy`

Get the full hierarchy as a nested tree.

**Auth**: JWT (any role)

**Response**: `HierarchyTreeNode[]`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Node ID |
| `name` | string | Node name |
| `type` | string | ISA-95 type |
| `children` | array | Nested child nodes |
| `characteristic_count` | integer | Number of characteristics on this node |

---

### `POST /hierarchy`

Create a hierarchy node.

**Auth**: Engineer+

**Request body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Node name |
| `type` | string | Yes | ISA-95 type |
| `parent_id` | integer | No | Parent node ID (null for root) |

**Response**: `HierarchyResponse` (201 Created)

**Errors**: `404` if parent not found. `422` if integrity constraint violated.

---

### `GET /hierarchy/{node_id}`

Get a single hierarchy node.

**Auth**: JWT (any role)

**Response**: `HierarchyResponse` -- `{id, parent_id, name, type}`

---

### `PATCH /hierarchy/{node_id}`

Update a hierarchy node (partial update).

**Auth**: Engineer+

**Request body**: `{name?, type?, parent_id?}`

**Response**: `HierarchyResponse`

---

### `DELETE /hierarchy/{node_id}`

Delete a leaf hierarchy node. Nodes with children cannot be deleted.

**Auth**: Engineer+

**Response**: 204 No Content

**Errors**: `404` if not found. `409` if node has children.

---

### `GET /hierarchy/{node_id}/characteristics`

List characteristics under a hierarchy node.

**Auth**: JWT (any role)

**Query parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `include_descendants` | boolean | `false` | Include characteristics from child nodes |

**Response**: `CharacteristicResponse[]`

---

### Plant-Scoped Hierarchy

These endpoints are identical in behavior but scoped to a specific plant.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/plants/{plant_id}/hierarchies` | Get tree for a plant |
| `POST` | `/plants/{plant_id}/hierarchies` | Create node in a plant |

---

## 4. Characteristics

### `GET /characteristics`

List characteristics with filtering and pagination.

**Auth**: JWT (any role)

**Query parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `hierarchy_id` | integer | -- | Filter by hierarchy node |
| `provider_type` | string | -- | Filter by `MANUAL` or `TAG` |
| `plant_id` | integer | -- | Filter by plant |
| `in_control` | boolean | -- | Filter by control status of latest sample |
| `offset` | integer | `0` | Pagination offset |
| `limit` | integer | `100` | Items per page (max 1000) |
| `page` | integer | -- | Page number (1-indexed, alternative to offset) |
| `per_page` | integer | -- | Items per page (alternative to limit) |

**Response**: `PaginatedResponse<CharacteristicResponse>`

```json
{
  "items": [...],
  "total": 42,
  "offset": 0,
  "limit": 100
}
```

**`CharacteristicResponse` fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Characteristic ID |
| `hierarchy_id` | integer | Parent hierarchy node |
| `name` | string | Characteristic name |
| `description` | string | Description (nullable) |
| `subgroup_size` | integer | Nominal subgroup size (default 1) |
| `target_value` | float | Nominal target (nullable) |
| `usl` | float | Upper spec limit (nullable) |
| `lsl` | float | Lower spec limit (nullable) |
| `ucl` | float | Upper control limit (nullable) |
| `lcl` | float | Lower control limit (nullable) |
| `provider_type` | string | `MANUAL` or `TAG` |
| `mqtt_topic` | string | Bound MQTT topic (nullable) |
| `subgroup_mode` | string | `NOMINAL_TOLERANCE`, `STANDARDIZED`, or `VARIABLE_LIMITS` |
| `decimal_precision` | integer | Display precision (default 4) |
| `stored_sigma` | float | Persisted process sigma (nullable) |
| `stored_center_line` | float | Persisted center line (nullable) |

---

### `POST /characteristics`

Create a characteristic. Auto-initializes all 8 Nelson rules (enabled).

**Auth**: Engineer+ (at the owning plant)

**Request body** (`CharacteristicCreate`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hierarchy_id` | integer | Yes | Parent hierarchy node |
| `name` | string | Yes | Characteristic name |
| `description` | string | No | Description |
| `subgroup_size` | integer | No | Default 1 |
| `target_value` | float | No | Nominal target |
| `usl` | float | No | Upper spec limit |
| `lsl` | float | No | Lower spec limit |
| `provider_type` | string | No | `MANUAL` (default) or `TAG` |
| `decimal_precision` | integer | No | Default 4 |

**Response**: `CharacteristicResponse` (201 Created)

**Errors**: `404` if hierarchy node not found.

---

### `GET /characteristics/{char_id}`

Get characteristic details.

**Auth**: JWT (any role)

**Response**: `CharacteristicResponse`

---

### `PATCH /characteristics/{char_id}`

Update characteristic configuration (partial update).

**Auth**: Engineer+ (at the owning plant)

**Request body**: Any `CharacteristicResponse` fields (all optional).

**Response**: `CharacteristicResponse`

---

### `DELETE /characteristics/{char_id}`

Delete a characteristic. Blocked if the characteristic has samples.

**Auth**: Engineer+ (at the owning plant)

**Response**: 204 No Content

**Errors**: `404` if not found. `409` if characteristic has samples.

---

### `GET /characteristics/{char_id}/chart-data`

Get SPC chart rendering data with samples, control limits, and zone boundaries.

**Auth**: JWT (any role)

**Query parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | `100` | Number of recent samples (max 1000) |
| `start_date` | datetime | -- | Start date filter |
| `end_date` | datetime | -- | End date filter |

**Response** (`ChartDataResponse`):

| Field | Type | Description |
|-------|------|-------------|
| `characteristic_id` | integer | Characteristic ID |
| `characteristic_name` | string | Characteristic name |
| `data_points` | array | Array of `ChartSample` |
| `control_limits` | object | `{center_line, ucl, lcl}` |
| `spec_limits` | object | `{usl, lsl, target}` |
| `zone_boundaries` | object | `{plus_1_sigma, plus_2_sigma, plus_3_sigma, minus_*}` |
| `subgroup_mode` | string | Current subgroup mode |
| `nominal_subgroup_size` | integer | Configured subgroup size |
| `decimal_precision` | integer | Display precision |
| `stored_sigma` | float | Process sigma (nullable) |

Each `ChartSample`:

| Field | Type | Description |
|-------|------|-------------|
| `sample_id` | integer | Sample ID |
| `timestamp` | string | ISO 8601 timestamp |
| `mean` | float | Sample mean |
| `range` | float | Sample range (nullable) |
| `std_dev` | float | Sample std dev (nullable, n>=2) |
| `excluded` | boolean | Excluded from calculations |
| `violation_ids` | integer[] | Violation IDs on this sample |
| `violation_rules` | integer[] | Nelson rule IDs triggered |
| `zone` | string | Zone classification |
| `actual_n` | integer | Actual measurement count |
| `is_undersized` | boolean | Below nominal subgroup size |
| `display_value` | float | Value to plot (z-score in STANDARDIZED mode) |

---

### `POST /characteristics/{char_id}/recalculate-limits`

Recalculate control limits from historical data.

**Auth**: Engineer+ (at the owning plant)

**Query parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `exclude_ooc` | boolean | `false` | Exclude out-of-control samples |
| `min_samples` | integer | `25` | Minimum samples required |
| `start_date` | datetime | -- | Baseline period start |
| `end_date` | datetime | -- | Baseline period end |
| `last_n` | integer | -- | Use only the most recent N samples |

**Response**:

```json
{
  "before": {"ucl": 10.5, "lcl": 9.5, "center_line": 10.0},
  "after": {"ucl": 10.3, "lcl": 9.7, "center_line": 10.0},
  "calculation": {
    "method": "moving_range",
    "sigma": 0.1,
    "sample_count": 100,
    "excluded_count": 3,
    "calculated_at": "2025-01-15T10:30:00Z"
  }
}
```

Method selection is automatic based on subgroup size:

| Subgroup Size | Method | Description |
|---------------|--------|-------------|
| n = 1 | `moving_range` | Individual measurements |
| 2 <= n <= 10 | `r_bar_d2` | Range-based |
| n > 10 | `s_bar_c4` | Standard deviation-based |

---

### `POST /characteristics/{char_id}/set-limits`

Manually set control limits from an external capability study.

**Auth**: Engineer+ (at the owning plant)

**Request body** (`SetLimitsRequest`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ucl` | float | Yes | Upper control limit |
| `lcl` | float | Yes | Lower control limit |
| `center_line` | float | Yes | Center line |
| `sigma` | float | Yes | Process sigma |

**Response**: `ControlLimitsResponse` with before/after values.

---

### `GET /characteristics/{char_id}/rules`

Get Nelson rule configuration for a characteristic.

**Auth**: JWT (any role)

**Response**: `NelsonRuleConfig[]`

| Field | Type | Description |
|-------|------|-------------|
| `rule_id` | integer | Rule number (1-8) |
| `is_enabled` | boolean | Whether rule is active |
| `require_acknowledgement` | boolean | Violations require ack |

---

### `PUT /characteristics/{char_id}/rules`

Replace Nelson rule configuration.

**Auth**: Engineer+

**Request body**: `NelsonRuleConfig[]` (same schema as response)

**Response**: Updated `NelsonRuleConfig[]`

**Errors**: `400` if rule_id is not 1-8.

---

### `POST /characteristics/{char_id}/change-mode`

Change subgroup mode with historical sample migration.

**Auth**: Engineer+ (at the owning plant)

**Request body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `new_mode` | string | Yes | `NOMINAL_TOLERANCE`, `STANDARDIZED`, or `VARIABLE_LIMITS` |

**Response**: `{previous_mode, new_mode, samples_migrated, characteristic}`

**Errors**: `400` if `stored_sigma`/`stored_center_line` not set (required for STANDARDIZED and VARIABLE_LIMITS when samples exist).

---

### Characteristic Configuration

Configuration is polymorphic: `ManualConfig` or `TagConfig` based on the characteristic's `provider_type`.

### `GET /characteristics/{char_id}/config`

Get characteristic configuration.

**Auth**: JWT (any role)

**Response**: `CharacteristicConfigResponse` or `null`

---

### `PUT /characteristics/{char_id}/config`

Create or update characteristic configuration.

**Auth**: Engineer+

**Request body**: `{config: ManualConfig | TagConfig}`

**Response**: `CharacteristicConfigResponse`

**Errors**: `400` if `config_type` does not match `provider_type`.

---

### `DELETE /characteristics/{char_id}/config`

Delete characteristic configuration.

**Auth**: Engineer+

**Response**: 204 No Content

---

## 5. Samples

### `GET /samples`

List samples with filtering and pagination.

**Auth**: JWT (any role)

**Query parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `characteristic_id` | integer | -- | Filter by characteristic |
| `start_date` | datetime | -- | Start date (inclusive) |
| `end_date` | datetime | -- | End date (inclusive) |
| `include_excluded` | boolean | `false` | Include excluded samples |
| `offset` | integer | `0` | Pagination offset |
| `limit` | integer | `100` | Items per page (max 1000) |
| `sort_dir` | string | `desc` | Sort by timestamp: `asc` or `desc` |

**Response**: `PaginatedResponse<SampleResponse>`

**`SampleResponse` fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Sample ID |
| `char_id` | integer | Characteristic ID |
| `timestamp` | datetime | Collection time |
| `batch_number` | string | Production batch (nullable) |
| `operator_id` | string | Operator (nullable) |
| `is_excluded` | boolean | Excluded from calculations |
| `measurements` | float[] | Individual measurement values |
| `mean` | float | Sample mean |
| `range_value` | float | Sample range (nullable) |
| `actual_n` | integer | Actual measurement count |
| `is_undersized` | boolean | Below nominal subgroup size |
| `z_score` | float | Z-score (STANDARDIZED mode, nullable) |
| `is_modified` | boolean | Has been edited |
| `edit_count` | integer | Number of edits |

---

### `POST /samples`

Submit a sample for SPC processing. Runs through the full SPC engine pipeline.

**Auth**: Operator+ (at the owning plant)

**Request body** (`SampleCreate`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `characteristic_id` | integer | Yes | Target characteristic |
| `measurements` | float[] | Yes | Measurement values |
| `batch_number` | string | No | Production batch reference |
| `operator_id` | string | No | Operator identifier |

**Response** (`SampleProcessingResult`, 201 Created):

| Field | Type | Description |
|-------|------|-------------|
| `sample_id` | integer | Created sample ID |
| `timestamp` | datetime | Sample timestamp |
| `mean` | float | Sample mean |
| `range_value` | float | Sample range (nullable) |
| `zone` | string | Zone classification |
| `in_control` | boolean | No violations triggered |
| `violations` | array | `[{violation_id, rule_id, rule_name, severity}]` |
| `processing_time_ms` | float | Processing duration |

---

### `GET /samples/{sample_id}`

Get a sample with measurements and statistics.

**Auth**: JWT (any role)

**Response**: `SampleResponse`

---

### `PUT /samples/{sample_id}`

Update sample measurements. Re-evaluates Nelson rules and creates an audit trail.

**Auth**: Supervisor+ (at the owning plant)

**Request body** (`SampleUpdate`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `measurements` | float[] | Yes | New measurement values |
| `reason` | string | No | Edit justification |

**Response**: `SampleProcessingResult`

---

### `PATCH /samples/{sample_id}/exclude`

Toggle sample exclusion from calculations.

**Auth**: Supervisor+ (at the owning plant)

**Request body**: `{is_excluded: boolean}`

**Response**: `SampleResponse`

---

### `DELETE /samples/{sample_id}`

Permanently delete a sample and its measurements.

**Auth**: Supervisor+ (at the owning plant)

**Response**: 204 No Content

---

### `GET /samples/{sample_id}/history`

Get edit history for a sample.

**Auth**: JWT (any role)

**Response**: `SampleEditHistoryResponse[]`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | History entry ID |
| `sample_id` | integer | Sample ID |
| `edited_at` | datetime | When the edit occurred |
| `edited_by` | string | Username of editor |
| `reason` | string | Edit reason (nullable) |
| `previous_values` | float[] | Measurements before edit |
| `new_values` | float[] | Measurements after edit |
| `previous_mean` | float | Mean before edit |
| `new_mean` | float | Mean after edit |

---

### `POST /samples/batch`

Batch import samples for historical data migration.

**Auth**: Operator+ (at the owning plant)

**Request body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `characteristic_id` | integer | Yes | Target characteristic |
| `samples` | array | Yes | `[{measurements, batch_number?, operator_id?}]` (max 1000) |
| `skip_rule_evaluation` | boolean | No | Skip Nelson rules for performance |

**Response** (`BatchImportResult`):

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer | Total samples submitted |
| `imported` | integer | Successfully processed |
| `failed` | integer | Failed count |
| `errors` | string[] | Error messages for failures |

---

## 6. Data Entry (External Systems)

These endpoints support dual authentication: JWT Bearer token or API key via `X-API-Key` header.

### `POST /data-entry/submit`

Submit a single sample from an external system.

**Auth**: JWT or API Key

**Request body** (`DataEntryRequest`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `characteristic_id` | integer | Yes | Target characteristic |
| `measurements` | float[] | Yes | Measurement values |
| `batch_number` | string | No | Batch reference |
| `operator_id` | string | No | Operator identifier |
| `metadata` | object | No | Arbitrary metadata |

**Response** (`DataEntryResponse`, 201 Created):

| Field | Type | Description |
|-------|------|-------------|
| `sample_id` | integer | Created sample ID |
| `characteristic_id` | integer | Characteristic ID |
| `timestamp` | datetime | Sample timestamp |
| `mean` | float | Sample mean |
| `zone` | string | Zone classification |
| `in_control` | boolean | No violations |
| `violations` | array | `[{rule_id, rule_name, severity}]` |

**Errors**: `403` if API key lacks permission for the characteristic.

---

### `POST /data-entry/batch`

Submit multiple samples in a single request. Each sample is processed independently.

**Auth**: JWT or API Key

**Request body**: `{samples: DataEntryRequest[]}`

**Response** (`BatchEntryResponse`, 201 Created):

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer | Total submitted |
| `successful` | integer | Successfully processed |
| `failed` | integer | Failed count |
| `results` | array | `DataEntryResponse[]` for successes |
| `errors` | string[] | Error messages for failures |

---

### `GET /data-entry/schema`

Get the expected request/response JSON schemas for integration discovery.

**Auth**: None (public endpoint)

**Response**: JSON schema definitions for single and batch endpoints plus authentication info.

---

## 7. Violations

### `GET /violations`

List violations with filtering and pagination.

**Auth**: JWT (any role)

**Query parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `characteristic_id` | integer | -- | Filter by characteristic |
| `sample_id` | integer | -- | Filter by sample |
| `acknowledged` | boolean | -- | Filter by ack status |
| `severity` | string | -- | `WARNING` or `CRITICAL` |
| `rule_id` | integer | -- | Nelson rule number (1-8) |
| `start_date` | datetime | -- | Start date filter |
| `end_date` | datetime | -- | End date filter |
| `offset` | integer | `0` | Pagination offset |
| `limit` | integer | `100` | Items per page |

**Response**: `PaginatedResponse<ViolationResponse>`

**`ViolationResponse` fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Violation ID |
| `sample_id` | integer | Associated sample |
| `rule_id` | integer | Nelson rule number (1-8) |
| `rule_name` | string | Human-readable rule name |
| `severity` | string | `WARNING` or `CRITICAL` |
| `acknowledged` | boolean | Has been acknowledged |
| `requires_acknowledgement` | boolean | Must be acknowledged |
| `ack_user` | string | Who acknowledged (nullable) |
| `ack_reason` | string | Acknowledgment reason (nullable) |
| `ack_timestamp` | datetime | When acknowledged (nullable) |
| `created_at` | datetime | When violation was detected |
| `characteristic_id` | integer | Characteristic ID |
| `characteristic_name` | string | Characteristic name |
| `hierarchy_path` | string | Full path like "Plant > Area > Line" |

---

### `GET /violations/stats`

Get aggregated violation statistics.

**Auth**: JWT (any role)

**Query parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `characteristic_id` | integer | Optional filter |
| `start_date` | datetime | Optional start date |
| `end_date` | datetime | Optional end date |

**Response** (`ViolationStats`):

```json
{
  "total": 15,
  "unacknowledged": 3,
  "informational": 2,
  "by_rule": {"1": 5, "2": 3, "3": 7},
  "by_severity": {"WARNING": 10, "CRITICAL": 5}
}
```

---

### `GET /violations/reason-codes`

Get standard acknowledgment reason codes.

**Auth**: JWT (any role)

**Response**: `string[]`

```json
[
  "Tool Change", "Raw Material Change", "Setup Adjustment",
  "Measurement Error", "Process Adjustment", "Environmental Factor",
  "Operator Error", "Equipment Malfunction", "False Alarm",
  "Under Investigation", "Other"
]
```

---

### `GET /violations/{violation_id}`

Get violation details.

**Auth**: JWT (any role)

**Response**: `ViolationResponse`

---

### `POST /violations/{violation_id}/acknowledge`

Acknowledge a violation.

**Auth**: Supervisor+ (at the owning plant)

**Request body** (`ViolationAcknowledge`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user` | string | Yes | Acknowledging user |
| `reason` | string | No | Reason code or free text |
| `exclude_sample` | boolean | No | Also exclude the associated sample |

**Response**: Updated `ViolationResponse`

**Errors**: `404` if not found. `409` if already acknowledged.

---

### `POST /violations/batch-acknowledge`

Acknowledge multiple violations at once.

**Auth**: Supervisor+

**Request body** (`BatchAcknowledgeRequest`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `violation_ids` | integer[] | Yes | Violation IDs to acknowledge |
| `user` | string | Yes | Acknowledging user |
| `reason` | string | No | Reason code |
| `exclude_sample` | boolean | No | Exclude associated samples |

**Response** (`BatchAcknowledgeResult`):

| Field | Type | Description |
|-------|------|-------------|
| `total` | integer | Total attempted |
| `successful` | integer | Successfully acknowledged |
| `failed` | integer | Failed count |
| `results` | array | `[{violation_id, success, error}]` |
| `acknowledged` | integer[] | IDs that were acknowledged |
| `errors` | object | `{violation_id: error_message}` |

---

## 8. Annotations

Annotations are scoped under characteristics. Two types: `point` (linked to a sample) and `period` (time range).

### `GET /characteristics/{char_id}/annotations`

List annotations for a characteristic.

**Auth**: JWT (any role)

**Query parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `annotation_type` | string | Filter by `point` or `period` |

**Response**: `AnnotationResponse[]`

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Annotation ID |
| `characteristic_id` | integer | Parent characteristic |
| `annotation_type` | string | `point` or `period` |
| `text` | string | Annotation content |
| `color` | string | Display color (nullable) |
| `sample_id` | integer | Linked sample (point type, nullable) |
| `start_time` | datetime | Period start (nullable) |
| `end_time` | datetime | Period end (nullable) |
| `created_by` | string | Username |
| `created_at` | datetime | Creation time |

---

### `POST /characteristics/{char_id}/annotations`

Create an annotation. Point annotations use upsert semantics -- one annotation per sample.

**Auth**: Supervisor+

**Request body** (`AnnotationCreate`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `annotation_type` | string | Yes | `point` or `period` |
| `text` | string | Yes | Annotation content |
| `color` | string | No | Display color |
| `sample_id` | integer | No | For point annotations |
| `start_time` | datetime | No | For period annotations |
| `end_time` | datetime | No | For period annotations |

**Response**: `AnnotationResponse` (201 Created)

**Notes**: If a point annotation already exists for the same sample, its text is updated and the previous text is saved to `AnnotationHistory`.

---

### `PUT /characteristics/{char_id}/annotations/{annotation_id}`

Update an annotation's text or color. Text changes are tracked in history.

**Auth**: Supervisor+

**Request body**: `{text?, color?}`

**Response**: `AnnotationResponse`

---

### `DELETE /characteristics/{char_id}/annotations/{annotation_id}`

Delete an annotation.

**Auth**: Supervisor+

**Response**: 204 No Content

---

## 9. Users

All user management endpoints require **Admin** role.

### `GET /users`

List users with optional search.

**Auth**: Admin

**Query parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | -- | Search by username or email |
| `active_only` | boolean | `false` | Only active users |

**Response**: `UserWithRolesResponse[]`

---

### `POST /users`

Create a new user.

**Auth**: Admin

**Request body** (`UserCreate`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | Unique username |
| `email` | string | No | Email address |
| `password` | string | Yes | Password (hashed with argon2id) |

**Response**: `UserResponse` (201 Created)

**Errors**: `409` if username or email already exists.

---

### `GET /users/{user_id}`

Get a user by ID with plant roles.

**Auth**: Admin

**Response**: `UserWithRolesResponse`

---

### `PATCH /users/{user_id}`

Update a user. Supports partial updates.

**Auth**: Admin

**Request body** (`UserUpdate`): `{username?, email?, password?}`

**Response**: `UserResponse`

---

### `DELETE /users/{user_id}`

Soft-deactivate a user. Cannot deactivate yourself.

**Auth**: Admin

**Response**: 204 No Content

---

### `DELETE /users/{user_id}/permanent`

Permanently delete a deactivated user. User must be deactivated first. Cannot delete yourself.

**Auth**: Admin

**Response**: 204 No Content

**Errors**: `400` if user is still active or deleting self.

---

### `POST /users/{user_id}/roles`

Assign or update a user's role at a plant.

**Auth**: Admin

**Request body** (`PlantRoleAssign`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plant_id` | integer | Yes | Plant to assign role for |
| `role` | string | Yes | `operator`, `supervisor`, `engineer`, or `admin` |

**Response**: `UserWithRolesResponse`

---

### `DELETE /users/{user_id}/roles/{plant_id}`

Remove a user's role at a plant. Cannot remove your own admin role.

**Auth**: Admin

**Response**: 204 No Content

---

## 10. MQTT Brokers

### `GET /brokers`

List MQTT broker configurations.

**Auth**: JWT (any role)

**Query parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `active_only` | boolean | `false` | Only active brokers |
| `plant_id` | integer | -- | Filter by plant |
| `offset` | integer | `0` | Pagination offset |
| `limit` | integer | `100` | Items per page |

**Response**: `PaginatedResponse<BrokerResponse>`

**`BrokerResponse` fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | integer | Broker ID |
| `plant_id` | integer | Owning plant |
| `name` | string | Broker name (unique) |
| `host` | string | Hostname or IP |
| `port` | integer | MQTT port (default 1883) |
| `username` | string | MQTT username (nullable) |
| `client_id` | string | Client ID (nullable) |
| `keepalive` | integer | Keepalive seconds |
| `use_tls` | boolean | TLS enabled |
| `is_active` | boolean | Is the active broker |
| `payload_format` | string | `json` or `sparkplugb` |

Note: Passwords are never returned in responses.

---

### `POST /brokers`

Create a new MQTT broker configuration.

**Auth**: Engineer+

**Request body** (`BrokerCreate`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `plant_id` | integer | Yes | Owning plant |
| `name` | string | Yes | Unique name |
| `host` | string | Yes | Hostname or IP |
| `port` | integer | No | Default 1883 |
| `username` | string | No | MQTT auth |
| `password` | string | No | MQTT auth |
| `client_id` | string | No | Client identifier |
| `keepalive` | integer | No | Default 60 |
| `use_tls` | boolean | No | Default false |
| `payload_format` | string | No | `json` (default) or `sparkplugb` |

**Response**: `BrokerResponse` (201 Created)

**Errors**: `409` if name already exists.

---

### `GET /brokers/all/status`

Get connection status of all configured brokers.

**Auth**: JWT (any role)

**Query parameters**: `plant_id` (optional filter)

**Response** (`BrokerAllStatesResponse`):

```json
{
  "states": [
    {
      "broker_id": 1,
      "broker_name": "Production MQTT",
      "is_connected": true,
      "last_connected": "2025-01-15T10:00:00Z",
      "error_message": null,
      "subscribed_topics": ["sensors/temp", "sensors/pressure"]
    }
  ]
}
```

---

### `GET /brokers/current/status`

Get status of the currently connected broker.

**Auth**: JWT (any role)

**Response**: `BrokerConnectionStatus`

---

### `POST /brokers/disconnect`

Disconnect from the current MQTT broker.

**Auth**: Engineer+

**Response**: `{"message": "Disconnected from MQTT broker"}`

---

### `POST /brokers/test`

Test connection to an MQTT broker without persisting configuration.

**Auth**: Engineer+

**Request body** (`BrokerTestRequest`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | Yes | Hostname |
| `port` | integer | Yes | Port |
| `username` | string | No | MQTT auth |
| `password` | string | No | MQTT auth |

**Response** (`BrokerTestResponse`):

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Connection succeeded |
| `message` | string | Status message |
| `latency_ms` | float | Connection latency (nullable) |

---

### `GET /brokers/{broker_id}`

Get broker configuration by ID.

**Auth**: JWT (any role)

**Response**: `BrokerResponse`

---

### `PATCH /brokers/{broker_id}`

Update broker configuration (partial update).

**Auth**: Engineer+

**Response**: `BrokerResponse`

---

### `DELETE /brokers/{broker_id}`

Delete a broker configuration.

**Auth**: Admin

**Response**: 204 No Content

---

### `POST /brokers/{broker_id}/activate`

Set a broker as the active connection. Deactivates other brokers.

**Auth**: Engineer+

**Response**: `BrokerResponse`

---

### `GET /brokers/{broker_id}/status`

Get connection status for a specific broker.

**Auth**: JWT (any role)

**Response**: `BrokerConnectionStatus`

---

### `POST /brokers/{broker_id}/connect`

Connect to a specific broker (disconnects from current if any).

**Auth**: Engineer+

**Response**: `BrokerConnectionStatus`

---

### `POST /brokers/{broker_id}/discover`

Start topic discovery (subscribes to wildcard `#`).

**Auth**: Engineer+

**Response**: `{"message": "Discovery started on broker ..."}` (202 Accepted)

**Errors**: `400` if broker is not connected.

---

### `DELETE /brokers/{broker_id}/discover`

Stop topic discovery.

**Auth**: Engineer+

**Response**: `{"message": "Discovery stopped on broker ..."}`

---

### `GET /brokers/{broker_id}/topics`

Get discovered topics.

**Auth**: Engineer+

**Query parameters**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `flat` | `flat` (list) or `tree` (hierarchical) |
| `search` | string | -- | Filter topics by substring |

**Response (flat)**: `DiscoveredTopicResponse[]`

| Field | Type | Description |
|-------|------|-------------|
| `topic` | string | MQTT topic path |
| `message_count` | integer | Messages received |
| `last_seen` | datetime | Last message time |
| `is_sparkplug` | boolean | SparkplugB topic |
| `sparkplug_group` | string | SparkplugB group (nullable) |
| `sparkplug_node` | string | SparkplugB node (nullable) |
| `sparkplug_metrics` | array | `[{name, data_type}]` |

**Response (tree)**: `TopicTreeNodeResponse` -- hierarchical tree grouped by `/` separators.

---

## 11. Tags

### `GET /tags/mappings`

List all tag-to-characteristic mappings.

**Auth**: Engineer+

**Query parameters**:

| Parameter | Type | Description |
|-----------|------|-------------|
| `plant_id` | integer | Filter by plant |
| `broker_id` | integer | Filter by broker |

**Response**: `TagMappingResponse[]`

| Field | Type | Description |
|-------|------|-------------|
| `characteristic_id` | integer | Mapped characteristic |
| `characteristic_name` | string | Characteristic name |
| `mqtt_topic` | string | Subscribed topic |
| `trigger_strategy` | string | `on_change` or `on_trigger` |
| `trigger_tag` | string | Trigger metric name (nullable) |
| `broker_id` | integer | Associated broker |
| `broker_name` | string | Broker name |
| `metric_name` | string | SparkplugB metric (nullable) |

---

### `POST /tags/map`

Create or update a tag-to-characteristic mapping. Refreshes TAG provider subscriptions.

**Auth**: Engineer+

**Request body** (`TagMappingCreate`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `characteristic_id` | integer | Yes | Target characteristic |
| `broker_id` | integer | Yes | Broker to use |
| `mqtt_topic` | string | Yes | Topic to subscribe to |
| `trigger_strategy` | string | No | `on_change` (default) or `on_trigger` |
| `trigger_tag` | string | No | SparkplugB trigger metric |
| `metric_name` | string | No | SparkplugB metric to extract |

**Response**: `TagMappingResponse`

---

### `DELETE /tags/map/{characteristic_id}`

Remove a tag mapping from a characteristic. Clears MQTT fields and refreshes subscriptions.

**Auth**: Engineer+

**Response**: 204 No Content

---

### `POST /tags/preview`

Preview live values on an MQTT topic. Subscribes temporarily and collects values.

**Auth**: Engineer+

**Request body** (`TagPreviewRequest`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `broker_id` | integer | Yes | Connected broker |
| `topic` | string | Yes | Topic to preview |
| `duration_seconds` | integer | No | Collection duration (max 30s) |

**Response** (`TagPreviewResponse`):

| Field | Type | Description |
|-------|------|-------------|
| `topic` | string | Previewed topic |
| `values` | array | `[{value, timestamp, raw_payload, metric_name?}]` |
| `sample_count` | integer | Number of values collected |
| `started_at` | datetime | Preview start time |
| `duration_seconds` | float | Actual duration |

**Errors**: `400` if broker is not connected.

---

## 12. API Keys

Key format: `openspc_{base64url_32_bytes}`. The full key is only returned once at creation.

### `GET /api-keys`

List all API keys (without exposing actual keys).

**Auth**: Engineer+

**Response**: `APIKeyResponse[]`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID |
| `name` | string | Human-readable label |
| `created_at` | datetime | Creation time |
| `expires_at` | datetime | Expiry (nullable) |
| `rate_limit_per_minute` | integer | Rate limit |
| `is_active` | boolean | Active status |
| `last_used_at` | datetime | Last usage time (nullable) |

---

### `POST /api-keys`

Create a new API key. The key is returned **only once** -- store it securely.

**Auth**: Engineer+

**Request body** (`APIKeyCreate`):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Label (1-255 chars) |
| `expires_at` | datetime | No | Optional expiration |
| `rate_limit_per_minute` | integer | No | Default 60 (max 1000) |

**Response** (`APIKeyCreateResponse`, 201 Created):

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UUID |
| `name` | string | Label |
| `key` | string | Full API key (only shown once) |
| `created_at` | datetime | Creation time |
| `expires_at` | datetime | Expiry (nullable) |
| `rate_limit_per_minute` | integer | Rate limit |
| `is_active` | boolean | Active status |

---

### `GET /api-keys/{key_id}`

Get API key details by ID.

**Auth**: Engineer+

**Response**: `APIKeyResponse`

---

### `PATCH /api-keys/{key_id}`

Update API key settings.

**Auth**: Engineer+

**Request body**: `{name?, is_active?, rate_limit_per_minute?}`

**Response**: `APIKeyResponse`

---

### `DELETE /api-keys/{key_id}`

Permanently delete an API key.

**Auth**: Admin

**Response**: 204 No Content

---

### `POST /api-keys/{key_id}/revoke`

Revoke an API key (set `is_active=false`) without deleting it.

**Auth**: Admin

**Response**: `APIKeyResponse`

---

## 13. Providers

### `GET /providers/status`

Get combined MQTT and TAG provider status.

**Auth**: JWT (any role)

**Response** (`ProviderStatusResponse`):

```json
{
  "mqtt": {
    "is_connected": true,
    "broker_id": 1,
    "broker_name": "Production",
    "last_connected": "2025-01-15T10:00:00Z",
    "error_message": null,
    "subscribed_topics": ["sensors/+"]
  },
  "tag_provider": {
    "is_running": true,
    "subscribed_topics": ["sensors/temp"],
    "characteristics_count": 5,
    "samples_processed": 1234,
    "last_sample_time": "2025-01-15T10:30:00Z",
    "error_message": null
  }
}
```

---

### `POST /providers/tag/restart`

Restart the TAG provider with fresh configuration.

**Auth**: Engineer+

**Response**: `TagProviderStatusResponse`

**Errors**: `503` if MQTT is not connected.

---

### `POST /providers/tag/refresh`

Refresh TAG provider subscriptions based on current characteristic mappings.

**Auth**: Engineer+

**Response**: `{"message": "Refreshed subscriptions for N characteristics", "characteristics_count": N}`

**Errors**: `503` if TAG provider is not running.

---

## 14. WebSocket Protocol

### Connection

```
ws://localhost:8000/ws/samples?token=<JWT_ACCESS_TOKEN>
```

Authentication is via the `token` query parameter. If the token is missing or invalid, the server sends an error message and closes the connection with code `4001`.

### Client-to-Server Messages

**Subscribe to characteristics**:
```json
{"type": "subscribe", "characteristic_ids": [1, 2, 3]}
```
Also accepts single ID: `{"type": "subscribe", "characteristic_id": 1}`

**Unsubscribe**:
```json
{"type": "unsubscribe", "characteristic_ids": [1]}
```

**Keepalive ping**:
```json
{"type": "ping"}
```

### Server-to-Client Messages

**Subscription confirmed**:
```json
{"type": "subscribed", "characteristic_ids": [1, 2, 3]}
```

**New sample processed**:
```json
{
  "type": "sample",
  "characteristic_id": 1,
  "sample": {
    "id": 42,
    "characteristic_id": 1,
    "timestamp": "2025-01-15T10:30:00Z",
    "mean": 10.05,
    "zone": "zone_c_upper",
    "in_control": true
  },
  "violations": []
}
```

**New violation detected**:
```json
{
  "type": "violation",
  "violation": {
    "id": 7,
    "characteristic_id": 1,
    "sample_id": 42,
    "rule_id": 1,
    "rule_name": "Outlier",
    "severity": "CRITICAL"
  }
}
```

**Violation acknowledged**:
```json
{
  "type": "ack_update",
  "characteristic_id": 1,
  "violation_id": 7,
  "acknowledged": true,
  "ack_user": "john.doe",
  "ack_reason": "Tool Change"
}
```

**Control limits updated**:
```json
{
  "type": "limits_update",
  "characteristic_id": 1,
  ...
}
```

**Keepalive response**:
```json
{"type": "pong"}
```

**Error**:
```json
{"type": "error", "message": "Unknown message type: foo"}
```

### Connection Lifecycle

- **Heartbeat**: The server runs a cleanup loop every 30 seconds
- **Timeout**: Connections idle for more than 90 seconds (no ping) are disconnected
- **Dead connections**: Automatically cleaned up when a broadcast fails to send

---

## 15. Error Handling

### Standard Error Response

All errors return a JSON body:

```json
{
  "detail": "Human-readable error message"
}
```

### Common HTTP Status Codes

| Code | Meaning | Typical Cause |
|------|---------|---------------|
| `400` | Bad Request | Validation failure, invalid input |
| `401` | Unauthorized | Missing or expired token |
| `403` | Forbidden | Insufficient role / API key lacks permission |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | Duplicate resource, already acknowledged |
| `422` | Unprocessable Entity | Schema validation error (FastAPI automatic) |
| `500` | Internal Server Error | Unexpected server error |
| `503` | Service Unavailable | Dependent service not ready (MQTT not connected) |

### Pagination Response Format

All paginated endpoints return:

```json
{
  "items": [...],
  "total": 42,
  "offset": 0,
  "limit": 100
}
```

Where `total` is the unfiltered count matching the query, and `items` contains the current page of results.
