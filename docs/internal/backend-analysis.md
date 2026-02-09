# OpenSPC Backend Analysis

> Generated from source code review of `backend/src/openspc/`.
> Application version: 0.3.0

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [API Endpoints](#2-api-endpoints)
3. [Database Models](#3-database-models)
4. [Core Systems](#4-core-systems)
5. [Configuration](#5-configuration)
6. [TODO Items and Gaps](#6-todo-items-and-gaps)

---

## 1. Architecture Overview

OpenSPC is a **FastAPI** application using **async SQLAlchemy** (aiosqlite) with an event-driven architecture for real-time Statistical Process Control.

**Key architectural patterns:**

- **Layered architecture**: API routes -> Dependencies/Auth -> Core engine -> Database models
- **Event bus**: Decoupled communication between SPC engine, WebSocket broadcaster, and alert manager
- **Multi-provider data ingestion**: Manual entry, API keys (external systems), and MQTT/SparkplugB (industrial)
- **Plant-scoped multi-tenancy**: Data isolation via `plant_id` foreign keys and per-plant RBAC
- **Real-time updates**: WebSocket subscriptions per characteristic, fed by event bus

**Entry point**: `backend/src/openspc/main.py` -- FastAPI app with lifespan handler managing startup/shutdown of DB, WebSocket manager, MQTT manager, TAG provider, and event bus.

**Startup sequence**:
1. Initialize database connection (SQLite async)
2. Bootstrap admin user if no users exist
3. Start WebSocket connection manager
4. Wire WebSocketBroadcaster to event bus
5. Initialize MQTT manager (connect to configured brokers)
6. Initialize TAG provider (if MQTT connected)

**Shutdown sequence**:
1. Shutdown TAG provider
2. Shutdown MQTT manager
3. Drain event bus pending handlers
4. Stop WebSocket manager
5. Dispose database connection

---

## 2. API Endpoints

### 2.1 Authentication (`api/v1/auth.py`)

Prefix: `/api/v1/auth`

| Method | Path       | Purpose                           | Auth     | Request Schema       | Response Schema       |
|--------|------------|-----------------------------------|----------|----------------------|-----------------------|
| POST   | `/login`   | Authenticate and issue tokens     | None     | `LoginRequest`       | `TokenResponse`       |
| POST   | `/refresh` | Rotate access + refresh tokens    | Cookie   | (refresh cookie)     | `TokenResponse`       |
| POST   | `/logout`  | Clear refresh cookie              | None     | --                   | `{"message": ...}`    |
| GET    | `/me`      | Get current user profile          | JWT      | --                   | `UserResponse`        |

**Notes:**
- Access token (JWT HS256, 15min) returned in response body.
- Refresh token (JWT, 7d or 30d with `remember_me`) set as httpOnly cookie with `path="/api/v1/auth"`.
- Refresh endpoint rotates both tokens and re-sets the cookie.
- Login returns user roles grouped by plant.

### 2.2 Users (`api/v1/users.py`)

Prefix: `/api/v1/users`

| Method | Path                        | Purpose                        | Auth         | Request Schema     | Response Schema    |
|--------|-----------------------------|--------------------------------|--------------|--------------------|--------------------|
| GET    | `/`                         | List users (with search)       | Admin        | Query: `search`    | `list[UserResponse]` |
| POST   | `/`                         | Create user                    | Admin        | `UserCreate`       | `UserResponse`     |
| GET    | `/{user_id}`                | Get user by ID                 | Admin        | --                 | `UserResponse`     |
| PATCH  | `/{user_id}`                | Update user                    | Admin        | `UserUpdate`       | `UserResponse`     |
| DELETE | `/{user_id}`                | Soft deactivate user           | Admin        | --                 | `{"message": ...}` |
| DELETE | `/{user_id}/permanent`      | Hard delete (must be inactive) | Admin        | --                 | `{"message": ...}` |
| POST   | `/{user_id}/roles`          | Assign plant role              | Admin        | `RoleAssignment`   | `UserResponse`     |
| DELETE | `/{user_id}/roles/{plant_id}` | Remove plant role            | Admin        | --                 | `UserResponse`     |

**Notes:**
- Self-deactivation is prevented.
- Cannot remove own admin role.
- Permanent delete requires user to be deactivated first.
- Password is hashed on create/update via argon2.

### 2.3 Plants (`api/v1/plants.py`)

Prefix: `/api/v1/plants`

| Method | Path       | Purpose          | Auth    | Request Schema  | Response Schema   |
|--------|------------|------------------|---------|-----------------|-------------------|
| GET    | `/`        | List plants      | JWT     | Query: `active_only` | `list[PlantResponse]` |
| POST   | `/`        | Create plant     | Admin   | `PlantCreate`   | `PlantResponse`   |
| GET    | `/{id}`    | Get plant        | JWT     | --              | `PlantResponse`   |
| PUT    | `/{id}`    | Update plant     | Admin   | `PlantUpdate`   | `PlantResponse`   |
| DELETE | `/{id}`    | Delete plant     | Admin   | --              | `{"message": ...}` |

**Notes:**
- Creating a plant auto-assigns admin role for all existing admin users.
- DEFAULT plant cannot be deleted.

### 2.4 Hierarchy (`api/v1/hierarchy.py`)

Two routers are exported from this file:

**Router 1 -- Global hierarchy** (prefix added at registration: `/api/v1/hierarchy`)

| Method | Path                          | Purpose                        | Auth       | Request Schema     | Response Schema          |
|--------|-------------------------------|--------------------------------|------------|--------------------|--------------------------|
| GET    | `/`                           | Get hierarchy tree             | JWT        | Query: `plant_id`  | Tree with char counts    |
| POST   | `/`                           | Create hierarchy node          | Engineer+  | `HierarchyCreate`  | `HierarchyResponse`     |
| GET    | `/{id}`                       | Get single node                | JWT        | --                 | `HierarchyResponse`     |
| PATCH  | `/{id}`                       | Update node                    | Engineer+  | `HierarchyUpdate`  | `HierarchyResponse`     |
| DELETE | `/{id}`                       | Delete node (leaf only)        | Engineer+  | --                 | `{"message": ...}`      |
| GET    | `/{id}/characteristics`       | List node's characteristics    | JWT        | --                 | `list[CharacteristicResponse]` |

**Router 2 -- Plant-scoped hierarchy** (prefix: `/api/v1/plants/{plant_id}/hierarchies`)

| Method | Path                          | Purpose                        | Auth       |
|--------|-------------------------------|--------------------------------|------------|
| GET    | `/`                           | Get tree for specific plant    | JWT        |
| POST   | `/`                           | Create node in plant           | Engineer+  |
| GET    | `/{id}`                       | Get node (plant-scoped)        | JWT        |

**Notes:**
- Hierarchy follows ISA-95 equipment model.
- `HierarchyType` enum: Folder, Enterprise, Site, Area, Line, Cell, Equipment, Tag.
- Delete is blocked if the node has children (must delete leaf-first).
- Tree endpoint returns `characteristic_count` per node via subquery.

### 2.5 Characteristics (`api/v1/characteristics.py`)

Prefix: `/api/v1/characteristics`

| Method | Path                               | Purpose                          | Auth       | Request Schema            | Response Schema              |
|--------|-------------------------------------|----------------------------------|------------|---------------------------|------------------------------|
| GET    | `/`                                 | List characteristics (paginated) | JWT        | Query filters             | `PaginatedCharacteristics`   |
| POST   | `/`                                 | Create characteristic            | Engineer+  | `CharacteristicCreate`    | `CharacteristicResponse`     |
| GET    | `/{id}`                             | Get characteristic               | JWT        | --                        | `CharacteristicResponse`     |
| PATCH  | `/{id}`                             | Update characteristic            | Engineer+  | `CharacteristicUpdate`    | `CharacteristicResponse`     |
| DELETE | `/{id}`                             | Delete characteristic            | Engineer+  | --                        | `{"message": ...}`           |
| GET    | `/{id}/chart-data`                  | Get SPC chart data               | JWT        | Query: `limit`, `offset`  | `ChartDataResponse`          |
| POST   | `/{id}/recalculate-limits`          | Recalculate control limits       | Engineer+  | --                        | `CharacteristicResponse`     |
| POST   | `/{id}/set-limits`                  | Set manual limits                | Engineer+  | `SetLimitsRequest`        | `CharacteristicResponse`     |
| GET    | `/{id}/rules`                       | Get Nelson rule config           | JWT        | --                        | `list[RuleResponse]`         |
| PUT    | `/{id}/rules`                       | Update Nelson rule config        | Engineer+  | `list[RuleUpdate]`        | `list[RuleResponse]`         |
| POST   | `/{id}/change-mode`                 | Change subgroup mode             | Engineer+  | `ChangeModeRequest`       | `CharacteristicResponse`     |

**Query filters for GET /:**
- `hierarchy_id`, `provider_type`, `plant_id`, `in_control` (bool), `search` (name match)
- Pagination: `skip`, `limit`

**Notes:**
- Creating a characteristic auto-initializes all 8 Nelson rules (enabled, acknowledgement not required).
- Delete is blocked if the characteristic has samples.
- `chart-data` endpoint returns samples with measurements, zone classification, violations, and control limit metadata. Violations are batch-loaded for the page.
- `change-mode` migrates historical samples in batches of 500 (recalculates z-scores or effective limits).
- `recalculate-limits` uses the last 100 in-control samples by default.

### 2.6 Characteristic Config (`api/v1/characteristic_config.py`)

Prefix: `/api/v1/characteristics`

| Method | Path                  | Purpose              | Auth       | Request Schema           | Response Schema         |
|--------|-----------------------|----------------------|------------|--------------------------|-------------------------|
| GET    | `/{id}/config`        | Get config           | JWT        | --                       | `ConfigResponse`        |
| PUT    | `/{id}/config`        | Create/update config | Engineer+  | `ManualConfig`/`TagConfig` | `ConfigResponse`      |
| DELETE | `/{id}/config`        | Delete config        | Engineer+  | --                       | `{"message": ...}`      |

**Notes:**
- Config is polymorphic: `ManualConfig` or `TagConfig` based on `config_type` field.
- Validates that `config_type` matches the characteristic's `provider_type`.
- Stored as JSON text in a single `CharacteristicConfig` row (one-to-one).

### 2.7 Samples (`api/v1/samples.py`)

Prefix: `/api/v1/samples`

| Method | Path                    | Purpose                    | Auth                   | Request Schema       | Response Schema        |
|--------|-------------------------|----------------------------|------------------------|----------------------|------------------------|
| GET    | `/`                     | List samples (paginated)   | JWT                    | Query filters        | `PaginatedSamples`     |
| POST   | `/`                     | Submit sample (SPC engine) | Operator+ (plant)      | `SampleCreate`       | `SampleResponse`       |
| GET    | `/{id}`                 | Get sample with details    | JWT                    | --                   | `SampleResponse`       |
| PATCH  | `/{id}/exclude`         | Toggle exclude flag        | Supervisor+ (plant)    | `ExcludeRequest`     | `SampleResponse`       |
| DELETE | `/{id}`                 | Delete sample              | Supervisor+ (plant)    | --                   | `{"message": ...}`     |
| PUT    | `/{id}`                 | Update measurements        | Supervisor+ (plant)    | `SampleUpdate`       | `SampleResponse`       |
| GET    | `/{id}/history`         | Get edit history           | JWT                    | --                   | `list[EditHistory]`    |
| POST   | `/batch`                | Batch import samples       | Supervisor+ (plant)    | `BatchImportRequest` | `BatchImportResponse`  |

**Query filters for GET /:**
- `characteristic_id`, `start_date`, `end_date`, `is_excluded`, `has_violations`
- Pagination: `skip`, `limit`

**Notes:**
- Submit runs the full SPC engine pipeline (validate -> persist -> calculate -> evaluate -> violations -> event).
- Update re-evaluates Nelson rules on the updated sample. Creates `SampleEditHistory` audit record.
- Batch import supports `skip_rules` flag for historical data loading.
- Exclude toggle uses plant-scoped RBAC (resolves plant from characteristic's hierarchy).

### 2.8 Violations (`api/v1/violations.py`)

Prefix: `/api/v1/violations`

| Method | Path                       | Purpose                      | Auth                | Request Schema        | Response Schema          |
|--------|----------------------------|------------------------------|---------------------|-----------------------|--------------------------|
| GET    | `/`                        | List violations (paginated)  | JWT                 | Query filters         | `PaginatedViolations`    |
| GET    | `/stats`                   | Aggregated violation stats   | JWT                 | Query: `plant_id`     | Stats object             |
| GET    | `/reason-codes`            | List standard reason codes   | JWT                 | --                    | `list[str]`              |
| GET    | `/{id}`                    | Get violation detail         | JWT                 | --                    | `ViolationResponse`      |
| POST   | `/{id}/acknowledge`        | Acknowledge violation        | Supervisor+ (plant) | `AckRequest`          | `ViolationResponse`      |
| POST   | `/batch-acknowledge`       | Batch acknowledge            | Supervisor+         | `BatchAckRequest`     | `BatchAckResponse`       |

**Query filters for GET /:**
- `characteristic_id`, `plant_id`, `rule_id`, `severity`, `acknowledged` (bool)
- `start_date`, `end_date`
- Pagination: `skip`, `limit`

**Notes:**
- Stats endpoint returns counts by severity, by rule, acknowledgement status, and time-series data.
- Acknowledgement includes optional `reason` and `exclude_sample` flag.
- Batch acknowledge processes multiple violation IDs in one request.
- 11 standard reason codes (e.g., "Measurement Error", "Raw Material Variation", "Tool Wear").

### 2.9 Annotations (`api/v1/annotations.py`)

Prefix: `/api/v1/characteristics` (shared with characteristics router)

| Method | Path                                              | Purpose              | Auth         | Request Schema       | Response Schema       |
|--------|---------------------------------------------------|----------------------|--------------|----------------------|-----------------------|
| GET    | `/{char_id}/annotations`                          | List annotations     | JWT          | Query: `annotation_type` | `list[AnnotationResponse]` |
| POST   | `/{char_id}/annotations`                          | Create annotation    | Supervisor+  | `AnnotationCreate`   | `AnnotationResponse`  |
| PUT    | `/{char_id}/annotations/{ann_id}`                 | Update annotation    | Supervisor+  | `AnnotationUpdate`   | `AnnotationResponse`  |
| DELETE | `/{char_id}/annotations/{ann_id}`                 | Delete annotation    | Supervisor+  | --                   | 204 No Content        |

**Notes:**
- Two annotation types: `point` (linked to sample) and `period` (time range).
- Point annotations use **upsert** semantics: one annotation per sample. Creating a second for the same sample updates the existing one.
- Text changes are tracked in `AnnotationHistory` for audit trail.

### 2.10 Brokers (`api/v1/brokers.py`)

Prefix: `/api/v1/brokers`

| Method | Path                       | Purpose                       | Auth       | Request Schema     | Response Schema        |
|--------|----------------------------|-------------------------------|------------|--------------------|------------------------|
| GET    | `/`                        | List brokers (paginated)      | Engineer+  | Query filters      | `PaginatedBrokers`     |
| POST   | `/`                        | Create broker                 | Admin      | `BrokerCreate`     | `BrokerResponse`       |
| GET    | `/all/status`              | All brokers status summary    | Engineer+  | --                 | Status summary         |
| GET    | `/current/status`          | Active broker detailed status | Engineer+  | --                 | Connection details     |
| POST   | `/disconnect`              | Disconnect all brokers        | Admin      | --                 | `{"message": ...}`     |
| POST   | `/test`                    | Test connection (ephemeral)   | Engineer+  | `BrokerTestRequest`| Test result            |
| GET    | `/{id}`                    | Get broker                    | Engineer+  | --                 | `BrokerResponse`       |
| PATCH  | `/{id}`                    | Update broker                 | Admin      | `BrokerUpdate`     | `BrokerResponse`       |
| DELETE | `/{id}`                    | Delete broker                 | Admin      | --                 | `{"message": ...}`     |
| POST   | `/{id}/activate`           | Set as active broker          | Admin      | --                 | `BrokerResponse`       |
| GET    | `/{id}/status`             | Get broker connection status  | Engineer+  | --                 | Status details         |
| POST   | `/{id}/connect`            | Connect to broker             | Admin      | --                 | `{"message": ...}`     |
| POST   | `/{id}/discover`           | Start topic discovery         | Engineer+  | --                 | `{"message": ...}`     |
| DELETE | `/{id}/discover`           | Stop topic discovery          | Engineer+  | --                 | `{"message": ...}`     |
| GET    | `/{id}/topics`             | Get discovered topics         | Engineer+  | Query: `format`    | Topics (flat or tree)  |

**Notes:**
- Static routes (`/all/status`, `/current/status`) are defined before `/{id}` to avoid shadowing.
- Topic discovery subscribes to `#` wildcard and collects messages for a configurable period.
- Topics endpoint supports `flat` and `tree` output formats. Tree format groups by `/` separators.
- SparkplugB topics include decoded metric names and values in the response.
- Test endpoint creates an ephemeral MQTT connection, verifies connectivity, then disconnects.

### 2.11 Tags (`api/v1/tags.py`)

Prefix: `/api/v1/tags`

| Method | Path              | Purpose                        | Auth       | Request Schema     | Response Schema       |
|--------|-------------------|--------------------------------|------------|--------------------|-----------------------|
| GET    | `/mappings`       | List tag-to-characteristic maps| Engineer+  | --                 | `list[MappingResponse]` |
| POST   | `/map`            | Create tag mapping             | Engineer+  | `MapRequest`       | `MappingResponse`     |
| DELETE | `/map/{id}`       | Remove tag mapping             | Engineer+  | --                 | `{"message": ...}`    |
| POST   | `/preview`        | Preview live topic values      | Engineer+  | `PreviewRequest`   | `PreviewResponse`     |

**Notes:**
- Mapping sets `mqtt_topic` (and optionally `trigger_tag`, `metric_name`) on a characteristic.
- After mapping, TAG provider subscriptions are refreshed to include the new topic.
- Preview temporarily subscribes to a topic for up to 30 seconds, collecting live values.
- Supports SparkplugB payload decoding in preview mode.

### 2.12 Data Entry (`api/v1/data_entry.py`)

Prefix: `/api/v1/data-entry`

| Method | Path        | Purpose                       | Auth             | Request Schema       | Response Schema       |
|--------|-------------|-------------------------------|------------------|----------------------|-----------------------|
| POST   | `/submit`   | Submit single sample          | JWT or API Key   | `DataEntrySubmit`    | `SampleResponse`      |
| POST   | `/batch`    | Submit multiple samples       | JWT or API Key   | `DataEntryBatch`     | `BatchResponse`       |
| GET    | `/schema`   | Get submission JSON schemas   | None             | --                   | Schema definitions    |

**Notes:**
- Dual authentication: accepts either JWT Bearer token or API key (`X-API-Key` header).
- API key auth checks `can_access_characteristic()` permission per characteristic.
- Schema endpoint is unauthenticated for external system integration discovery.

### 2.13 API Keys (`api/v1/api_keys.py`)

Prefix: `/api/v1/api-keys`

| Method | Path              | Purpose              | Auth       | Request Schema    | Response Schema     |
|--------|-------------------|----------------------|------------|-------------------|---------------------|
| GET    | `/`               | List API keys        | Engineer+  | --                | `list[KeyResponse]` |
| POST   | `/`               | Create API key       | Engineer+  | `KeyCreate`       | `KeyCreateResponse` |
| GET    | `/{id}`           | Get API key          | Engineer+  | --                | `KeyResponse`       |
| PATCH  | `/{id}`           | Update API key       | Engineer+  | `KeyUpdate`       | `KeyResponse`       |
| DELETE | `/{id}`           | Delete API key       | Admin      | --                | `{"message": ...}`  |
| POST   | `/{id}/revoke`    | Revoke API key       | Admin      | --                | `KeyResponse`       |

**Notes:**
- Key format: `openspc_{urlsafe_32bytes}`. Full key returned **only once** at creation.
- Key is bcrypt-hashed for storage. First 8 chars stored as `key_prefix` for O(1) candidate lookup.
- Keys have optional `expires_at`, `permissions` JSON (list of characteristic IDs), and `rate_limit_per_minute`.

### 2.14 Providers (`api/v1/providers.py`)

Prefix: `/api/v1/providers`

| Method | Path            | Purpose                    | Auth       |
|--------|-----------------|----------------------------|------------|
| GET    | `/status`       | Combined MQTT + TAG status | Engineer+  |
| POST   | `/tag/restart`  | Restart TAG provider       | Engineer+  |
| POST   | `/tag/refresh`  | Refresh TAG subscriptions  | Engineer+  |

**Notes:**
- Status returns MQTT connection state plus TAG provider state (running, topic count, samples processed).
- Restart requires MQTT to be connected first.

### 2.15 WebSocket (`api/v1/websocket.py`)

| Path            | Purpose                         | Auth               |
|-----------------|---------------------------------|--------------------|
| `/ws/samples`   | Real-time sample/violation feed | JWT (query param)  |

**Protocol (client -> server):**
- `{"type": "subscribe", "characteristic_id": N}` -- Subscribe to updates for a characteristic
- `{"type": "unsubscribe", "characteristic_id": N}` -- Unsubscribe
- `{"type": "ping"}` -- Keepalive

**Protocol (server -> client):**
- `{"type": "sample", ...}` -- New sample processed
- `{"type": "violation", ...}` -- New violation detected
- `{"type": "ack_update", ...}` -- Violation acknowledged
- `{"type": "limits_update", ...}` -- Control limits recalculated
- `{"type": "pong"}` -- Keepalive response
- `{"type": "error", ...}` -- Error message

**Notes:**
- JWT passed as `token` query parameter (WebSocket does not support headers).
- ConnectionManager runs heartbeat cleanup every 30 seconds, removing connections idle >90 seconds.
- Helper functions (`notify_sample`, `notify_violation`, `notify_acknowledgment`) are used by event bus handlers.

### 2.16 Dev Tools (`api/v1/devtools.py`)

Prefix: `/api/v1/devtools` (only registered when `OPENSPC_SANDBOX=true`)

| Method | Path               | Purpose                    | Auth   | Request Schema  | Response Schema  |
|--------|--------------------|----------------------------|--------|-----------------|------------------|
| GET    | `/status`          | Sandbox status + scripts   | Admin  | --              | Status object    |
| POST   | `/reset-and-seed`  | Wipe DB and re-seed        | Admin  | `SeedRequest`   | `SeedResponse`   |

**Available seed scripts:**
- `pharma` -- Pharmaceutical Demo: 3 sites, ~26 characteristics, ~37,000 samples
- `nelson_test` -- Nelson Rules Test: 2 plants, 10 characteristics, ~1,200 samples
- `chart_showcase` -- Chart Showcase: 1 plant, 4 characteristics, ~360 samples

**Notes:**
- Reset-and-seed disposes DB connection pool, resets singleton, then loads and runs seed script in-process.
- Seed script output is captured via logging handler and returned (last 4000 chars).

---

## 3. Database Models

### 3.1 Entity Relationship Summary

```
User ──< UserPlantRole >── Plant
                              │
                              ├──< Hierarchy (self-referential tree)
                              │       │
                              │       └──< Characteristic
                              │               ├──< Sample ──< Measurement
                              │               │      │
                              │               │      ├──< Violation
                              │               │      └──< SampleEditHistory
                              │               │
                              │               ├──< Annotation ──< AnnotationHistory
                              │               ├── CharacteristicRule
                              │               └── CharacteristicConfig
                              │
                              └──< MQTTBroker

APIKey (standalone)
```

### 3.2 User (`db/models/user.py`)

| Column          | Type              | Constraints            | Notes                           |
|-----------------|-------------------|------------------------|---------------------------------|
| id              | Integer           | PK, autoincrement      |                                 |
| username        | String(50)        | Unique, not null       |                                 |
| email           | String(255)       | Unique, nullable       |                                 |
| hashed_password | String(255)       | Not null               | Argon2id hash                   |
| is_active       | Boolean           | Default true           | Soft delete flag                |
| created_at      | DateTime          | Server default now     |                                 |
| updated_at      | DateTime          | Server default, onupdate |                               |

**Relationships:**
- `plant_roles` -> `UserPlantRole` (one-to-many, cascade delete-orphan)

### 3.3 UserPlantRole (`db/models/user.py`)

| Column   | Type           | Constraints          | Notes                        |
|----------|----------------|----------------------|------------------------------|
| id       | Integer        | PK, autoincrement    |                              |
| user_id  | Integer        | FK -> users.id       |                              |
| plant_id | Integer        | FK -> plants.id      |                              |
| role     | Enum(UserRole) | Not null             | operator/supervisor/engineer/admin |

**Unique constraint:** `(user_id, plant_id)` -- one role per user per plant.

**UserRole enum values:** `operator`, `supervisor`, `engineer`, `admin`

**Role hierarchy (lowest to highest):** operator < supervisor < engineer < admin

### 3.4 Plant (`db/models/plant.py`)

| Column     | Type         | Constraints           | Notes                     |
|------------|--------------|----------------------|---------------------------|
| id         | Integer      | PK, autoincrement    |                           |
| name       | String(100)  | Not null             |                           |
| code       | String(20)   | Unique, not null     | Short identifier          |
| is_active  | Boolean      | Default true         |                           |
| settings   | JSON         | Nullable             | Plant-specific config     |
| created_at | DateTime     | Server default now   |                           |
| updated_at | DateTime     | Server default, onupdate |                       |

**Relationships:**
- `hierarchies` -> Hierarchy (one-to-many, cascade)
- `brokers` -> MQTTBroker (one-to-many, cascade)

### 3.5 Hierarchy (`db/models/hierarchy.py`)

| Column    | Type               | Constraints           | Notes                    |
|-----------|--------------------|-----------------------|--------------------------|
| id        | Integer            | PK, autoincrement     |                          |
| parent_id | Integer            | FK -> hierarchies.id  | Self-referential, nullable |
| plant_id  | Integer            | FK -> plants.id       |                          |
| name      | String(100)        | Not null              |                          |
| type      | Enum(HierarchyType)| Not null              | ISA-95 level             |

**HierarchyType enum:** `Folder`, `Enterprise`, `Site`, `Area`, `Line`, `Cell`, `Equipment`, `Tag`

**Relationships:**
- `parent` -> Hierarchy (many-to-one, self-referential)
- `children` -> Hierarchy (one-to-many, cascade all + delete-orphan)
- `characteristics` -> Characteristic (one-to-many)

**Note:** This file also defines the `Base` (DeclarativeBase) used by all other models.

### 3.6 Characteristic (`db/models/characteristic.py`)

| Column              | Type                  | Constraints         | Notes                              |
|---------------------|-----------------------|---------------------|------------------------------------|
| id                  | Integer               | PK, autoincrement   |                                    |
| hierarchy_id        | Integer               | FK -> hierarchies.id|                                    |
| name                | String(100)           | Not null            |                                    |
| description         | Text                  | Nullable            |                                    |
| subgroup_size       | Integer               | Default 1           | n=1: individuals, n>1: subgroups   |
| target_value        | Float                 | Nullable            | Nominal target                     |
| usl                 | Float                 | Nullable            | Upper spec limit                   |
| lsl                 | Float                 | Nullable            | Lower spec limit                   |
| ucl                 | Float                 | Nullable            | Upper control limit (calculated)   |
| lcl                 | Float                 | Nullable            | Lower control limit (calculated)   |
| provider_type       | Enum(ProviderType)    | Default MANUAL      | MANUAL or TAG                      |
| mqtt_topic          | String                | Nullable            | Bound MQTT topic                   |
| trigger_tag         | String                | Nullable            | SparkplugB trigger metric          |
| metric_name         | String                | Nullable            | SparkplugB metric name             |
| subgroup_mode       | Enum(SubgroupMode)    | Default NOMINAL_TOLERANCE | How limits apply          |
| min_measurements    | Integer               | Nullable            | Minimum measurements for valid sample |
| warn_below_count    | Integer               | Nullable            | Warn if measurements below this    |
| stored_sigma        | Float                 | Nullable            | Persisted sigma for limit calc     |
| stored_center_line  | Float                 | Nullable            | Persisted center line              |
| decimal_precision   | Integer               | Default 4           | Display precision                  |

**ProviderType enum:** `MANUAL`, `TAG`

**SubgroupMode enum:**
- `NOMINAL_TOLERANCE` -- Uses target/USL/LSL for limit calculation
- `STANDARDIZED` -- Z-score normalization (for variable subgroup sizes)
- `VARIABLE_LIMITS` -- Per-sample limits based on actual subgroup size

**Relationships:**
- `rules` -> CharacteristicRule (one-to-many, cascade)
- `samples` -> Sample (one-to-many, cascade)

### 3.7 CharacteristicRule (`db/models/characteristic.py`)

| Column                    | Type    | Constraints                     | Notes                     |
|---------------------------|---------|---------------------------------|---------------------------|
| characteristic_id         | Integer | PK, FK -> characteristics.id   | Composite PK              |
| rule_id                   | Integer | PK                              | Nelson rule number (1-8)  |
| is_enabled                | Boolean | Default true                    |                           |
| require_acknowledgement   | Boolean | Default false                   |                           |

### 3.8 Sample (`db/models/sample.py`)

| Column         | Type     | Constraints                | Notes                           |
|----------------|----------|----------------------------|---------------------------------|
| id             | Integer  | PK, autoincrement          |                                 |
| char_id        | Integer  | FK -> characteristics.id   |                                 |
| timestamp      | DateTime | Not null                   | Sample collection time          |
| batch_number   | String   | Nullable                   | Production batch reference      |
| operator_id    | String   | Nullable                   | Who collected the sample        |
| is_excluded    | Boolean  | Default false              | Excluded from SPC calculations  |
| actual_n       | Integer  | Nullable                   | Actual measurement count        |
| is_undersized  | Boolean  | Default false              | actual_n < subgroup_size        |
| effective_ucl  | Float    | Nullable                   | Per-sample UCL (variable mode)  |
| effective_lcl  | Float    | Nullable                   | Per-sample LCL (variable mode)  |
| z_score        | Float    | Nullable                   | Standardized z-score            |
| is_modified    | Boolean  | Default false              | Has been edited post-creation   |

**Relationships:**
- `measurements` -> Measurement (one-to-many, cascade delete-orphan)
- `violations` -> Violation (one-to-many, cascade)
- `edit_history` -> SampleEditHistory (one-to-many, cascade)

### 3.9 Measurement (`db/models/sample.py`)

| Column    | Type    | Constraints           | Notes            |
|-----------|---------|-----------------------|------------------|
| id        | Integer | PK, autoincrement     |                  |
| sample_id | Integer | FK -> samples.id      |                  |
| value     | Float   | Not null              | Individual reading |

### 3.10 SampleEditHistory (`db/models/sample.py`)

| Column          | Type     | Constraints           | Notes                        |
|-----------------|----------|-----------------------|------------------------------|
| id              | Integer  | PK, autoincrement     |                              |
| sample_id       | Integer  | FK -> samples.id      |                              |
| edited_at       | DateTime | Server default now    |                              |
| edited_by       | String   | Not null              | Username of editor           |
| reason          | String   | Nullable              | Edit justification           |
| previous_values | JSON     | Not null              | Array of old measurement values |
| new_values      | JSON     | Not null              | Array of new measurement values |
| previous_mean   | Float    | Nullable              | Mean before edit             |
| new_mean        | Float    | Nullable              | Mean after edit              |

### 3.11 Violation (`db/models/violation.py`)

| Column                    | Type            | Constraints       | Notes                        |
|---------------------------|-----------------|-------------------|------------------------------|
| id                        | Integer         | PK, autoincrement |                              |
| sample_id                 | Integer         | FK -> samples.id  |                              |
| rule_id                   | Integer         | Not null          | Nelson rule number (1-8)     |
| rule_name                 | String          | Not null          | Human-readable rule name     |
| severity                  | Enum(Severity)  | Not null          | WARNING or CRITICAL          |
| acknowledged              | Boolean         | Default false     |                              |
| requires_acknowledgement  | Boolean         | Default true      |                              |
| ack_user                  | String          | Nullable          | Who acknowledged             |
| ack_reason                | String          | Nullable          | Acknowledgement reason       |
| ack_timestamp             | DateTime        | Nullable          | When acknowledged            |

**Severity enum:** `WARNING`, `CRITICAL`

### 3.12 MQTTBroker (`db/models/broker.py`)

| Column              | Type     | Constraints         | Notes                         |
|---------------------|----------|---------------------|-------------------------------|
| id                  | Integer  | PK, autoincrement   |                               |
| plant_id            | Integer  | FK -> plants.id     |                               |
| name                | String   | Unique, not null    |                               |
| host                | String   | Not null            | Broker hostname/IP            |
| port                | Integer  | Default 1883        |                               |
| username            | String   | Nullable            | MQTT auth                     |
| password            | String   | Nullable            | MQTT auth (stored plaintext)  |
| client_id           | String   | Nullable            | MQTT client identifier        |
| keepalive           | Integer  | Default 60          | Seconds                       |
| max_reconnect_delay | Integer  | Default 300         | Seconds, exponential backoff cap |
| use_tls             | Boolean  | Default false       |                               |
| is_active           | Boolean  | Default false       | Only one active per plant     |
| payload_format      | String   | Default "json"      | "json" or "sparkplugb"        |
| created_at          | DateTime | Server default now  |                               |
| updated_at          | DateTime | Server default, onupdate |                          |

### 3.13 APIKey (`db/models/api_key.py`)

| Column               | Type       | Constraints         | Notes                            |
|----------------------|------------|---------------------|----------------------------------|
| id                   | UUID       | PK, default uuid4   |                                  |
| name                 | String     | Not null            | Human-readable label             |
| key_hash             | String     | Not null            | bcrypt hash of full key          |
| key_prefix           | String(8)  | Not null, indexed   | First 8 chars for O(1) lookup    |
| created_at           | DateTime   | Server default now  |                                  |
| expires_at           | DateTime   | Nullable            | Optional expiry                  |
| permissions          | JSON       | Nullable            | `{"characteristics": [id, ...]}`  |
| rate_limit_per_minute| Integer    | Default 60          |                                  |
| is_active            | Boolean    | Default true        |                                  |
| last_used_at         | DateTime   | Nullable            | Updated on each use              |

**Methods:**
- `is_expired()` -- Checks `expires_at` against current time
- `can_access_characteristic(char_id)` -- Checks permissions JSON; null permissions = access all

### 3.14 Annotation (`db/models/annotation.py`)

| Column           | Type     | Constraints                | Notes                        |
|------------------|----------|----------------------------|------------------------------|
| id               | Integer  | PK, autoincrement          |                              |
| characteristic_id| Integer  | FK -> characteristics.id   |                              |
| annotation_type  | String   | Not null                   | "point" or "period"          |
| text             | Text     | Not null                   | Annotation content           |
| color            | String   | Nullable                   | Display color                |
| sample_id        | Integer  | FK -> samples.id, nullable | For point annotations        |
| start_sample_id  | Integer  | FK -> samples.id, nullable | Period start (unused?)       |
| end_sample_id    | Integer  | FK -> samples.id, nullable | Period end (unused?)         |
| start_time       | DateTime | Nullable                   | Period start time            |
| end_time         | DateTime | Nullable                   | Period end time              |
| created_by       | String   | Not null                   | Username                     |
| created_at       | DateTime | Server default now         |                              |
| updated_at       | DateTime | Server default, onupdate   |                              |

**Relationships:**
- `history` -> AnnotationHistory (one-to-many, cascade delete-orphan)

### 3.15 AnnotationHistory (`db/models/annotation.py`)

| Column        | Type     | Constraints              | Notes                   |
|---------------|----------|--------------------------|-------------------------|
| id            | Integer  | PK, autoincrement        |                         |
| annotation_id | Integer  | FK -> annotations.id     |                         |
| previous_text | Text     | Not null                 | Text before edit        |
| changed_by    | String   | Not null                 | Username of editor      |
| changed_at    | DateTime | Server default now       |                         |

### 3.16 CharacteristicConfig (`db/models/characteristic_config.py`)

| Column           | Type     | Constraints                       | Notes                     |
|------------------|----------|-----------------------------------|---------------------------|
| id               | Integer  | PK, autoincrement                 |                           |
| characteristic_id| Integer  | FK -> characteristics.id, unique  | One-to-one                |
| config_json      | Text     | Nullable                          | Polymorphic JSON blob     |
| is_active        | Boolean  | Default true                      |                           |
| created_at       | DateTime | Server default now                |                           |
| updated_at       | DateTime | Server default, onupdate          |                           |

---

## 4. Core Systems

### 4.1 Authentication and Authorization

**Location:** `core/auth/`

**JWT Authentication (`jwt.py`):**
- Algorithm: HS256
- Access token: 15 minute expiry, returned in response body
- Refresh token: 7 day expiry (30 days with `remember_me`), set as httpOnly cookie
- Secret: reads `OPENSPC_JWT_SECRET` env var; if unset, auto-generates and persists to `.jwt_secret` file in backend directory
- Token payload: `{"sub": username, "exp": expiry, "type": "access"|"refresh"}`

**Password Hashing (`passwords.py`):**
- Library: `argon2-cffi`
- Algorithm: argon2id
- Functions: `hash_password()`, `verify_password()`, `needs_rehash()` (for parameter upgrades)

**API Key Authentication (`api_key.py`):**
- Key format: `openspc_{base64url_32_bytes}`
- Storage: bcrypt hash of full key; first 8 chars stored as `key_prefix` for efficient lookup
- Lookup: query by prefix (O(1) candidate narrowing), then bcrypt verify against candidates
- Dependency: `verify_api_key` FastAPI dependency, reads `X-API-Key` header
- Updates `last_used_at` on successful verification

**Admin Bootstrap (`bootstrap.py`):**
- Runs at startup if user table is empty
- Creates admin user from `OPENSPC_ADMIN_USERNAME` / `OPENSPC_ADMIN_PASSWORD` env vars
- Assigns admin role for **all** active plants (not just DEFAULT)

**Dependency Injection (`api/deps.py`):**
- `get_current_user` -- JWT Bearer token validation
- `get_current_admin` -- Requires admin role on any plant
- `get_current_engineer` -- Requires engineer+ role on any plant
- `require_role(min_role)` -- Factory returning dependency that checks minimum role level
- `get_current_user_or_api_key` -- Dual auth: tries JWT first, falls back to API key
- `check_plant_role(user, plant_id, min_role)` -- Plant-scoped RBAC check
- `resolve_plant_id_for_characteristic(char_id)` -- Walks characteristic -> hierarchy -> plant

### 4.2 SPC Engine

**Location:** `core/engine/`

**SPCEngine (`spc_engine.py`):**

The engine processes samples through an 8-step pipeline:

1. **Validate characteristic** -- Load characteristic with rules, verify it exists
2. **Validate measurements** -- Check measurement count against subgroup_size
3. **Compute statistics** -- Calculate mean of measurements
4. **Persist sample** -- Create Sample + Measurement records in DB
5. **Get zone boundaries** -- Load control limits (UCL/LCL/center_line/sigma)
6. **Evaluate Nelson rules** -- Run enabled rules against rolling window
7. **Create violations** -- Persist any triggered rules as Violation records
8. **Publish event** -- Fire `SampleProcessedEvent` on event bus

**Subgroup mode handling:**
- `NOMINAL_TOLERANCE`: Standard UCL/LCL from characteristic
- `STANDARDIZED`: Converts sample mean to z-score using stored sigma/center_line, evaluates rules on z-scores
- `VARIABLE_LIMITS`: Calculates per-sample UCL/LCL based on actual subgroup size, stores on sample record

**Key constants:**
- `DEFAULT_LIMIT_WINDOW_SIZE = 100` (samples used for limit calculation)

**Nelson Rules (`nelson_rules.py`):**

All 8 Western Electric / Nelson rules implemented as pluggable classes:

| Rule | Name           | Condition                                    | Severity |
|------|----------------|----------------------------------------------|----------|
| 1    | Outlier        | 1 point beyond 3-sigma                       | CRITICAL |
| 2    | Shift          | 9 consecutive points on same side of center  | WARNING  |
| 3    | Trend          | 6 consecutive points monotonically inc/dec   | WARNING  |
| 4    | Alternator     | 14 consecutive alternating up/down           | WARNING  |
| 5    | Zone A         | 2 of 3 consecutive in Zone A or beyond       | WARNING  |
| 6    | Zone B         | 4 of 5 consecutive in Zone B or beyond       | WARNING  |
| 7    | Stratification | 15 consecutive in Zone C (too little variation) | WARNING |
| 8    | Mixture        | 8 consecutive outside Zone C                 | WARNING  |

`NelsonRuleLibrary` aggregates all rules and provides `evaluate(window, enabled_rules)`.

**Control Limits (`control_limits.py`):**

`ControlLimitService` auto-selects calculation method based on subgroup size:

| Subgroup Size | Method          | Description                              |
|---------------|-----------------|------------------------------------------|
| n = 1         | `moving_range`  | Individual measurements, moving range    |
| 2 <= n <= 10  | `r_bar_d2`      | Range-based (R-bar / d2)                 |
| n > 10        | `s_bar_c4`      | Standard deviation-based (S-bar / c4)    |

Features:
- OOC (out-of-control) sample exclusion during calculation
- Date range filtering for limit calculation window
- `recalculate_and_persist()` stores sigma and center_line on characteristic, invalidates rolling window cache, publishes `ControlLimitsUpdatedEvent`

**Rolling Window (`rolling_window.py`):**

`RollingWindowManager` maintains a per-characteristic sliding window of recent samples:

- **Cache**: LRU OrderedDict, max 1000 characteristics cached
- **Window size**: 25 samples per window (fixed FIFO)
- **Locking**: Per-characteristic async locks to prevent concurrent modification
- **Lazy loading**: Window is loaded from DB on first access, then maintained in memory
- **Zone classification**: Each sample is classified into zones (Beyond UCL/LCL, Zone A/B/C) based on control limits

Zone enum (8 values): `BEYOND_UCL`, `ZONE_A_UPPER`, `ZONE_B_UPPER`, `ZONE_C_UPPER`, `ZONE_C_LOWER`, `ZONE_B_LOWER`, `ZONE_A_LOWER`, `BEYOND_LCL`

### 4.3 Event System

**Location:** `core/events/`

**EventBus (`bus.py`):**
- Type-safe publish/subscribe pattern
- Async handlers with error isolation (one handler failure doesn't affect others)
- `publish()` -- Fire-and-forget (handlers run as background tasks)
- `publish_and_wait()` -- Synchronous, waits for all handlers to complete
- Background task tracking for graceful shutdown
- Global singleton: `event_bus`

**Event Types (`events.py`):**

| Event                          | Payload Fields                                          | Published By              |
|--------------------------------|---------------------------------------------------------|---------------------------|
| `SampleProcessedEvent`         | sample_id, characteristic_id, mean, violations, timestamp | SPC Engine               |
| `ViolationCreatedEvent`        | violation_id, sample_id, characteristic_id, rule_id, severity | Alert Manager        |
| `ViolationAcknowledgedEvent`   | violation_id, sample_id, characteristic_id, user, reason | Violations API           |
| `ControlLimitsUpdatedEvent`    | characteristic_id, ucl, lcl, center_line, sigma         | ControlLimitService       |
| `CharacteristicUpdatedEvent`   | characteristic_id                                       | Characteristics API       |
| `CharacteristicCreatedEvent`   | characteristic_id                                       | Characteristics API       |
| `CharacteristicDeletedEvent`   | characteristic_id                                       | Characteristics API       |
| `AlertThresholdExceededEvent`  | characteristic_id, threshold, count                     | Alert Manager             |

**WebSocketBroadcaster (`core/broadcast.py`):**
- Wired to event bus at startup
- Subscribes to `SampleProcessedEvent`, `ViolationCreatedEvent`, `ViolationAcknowledgedEvent`, `ControlLimitsUpdatedEvent`
- Broadcasts to WebSocket clients subscribed to the relevant characteristic_id

### 4.4 MQTT and Industrial Connectivity

**Location:** `mqtt/`

**MQTTManager (`mqtt/manager.py`):**
- Multi-broker concurrent connections
- Per-broker state tracking (connected, connecting, error, topics discovered)
- Backward-compatible single-broker API (operates on "active" broker)
- Topic discovery service: subscribes to `#` wildcard, collects and categorizes messages
- SparkplugB protobuf decoding for Sparkplug B payloads
- Subscribe/unsubscribe/publish with optional `broker_id` parameter
- Global singleton: `mqtt_manager`

**TagProviderManager (`core/providers/manager.py`):**
- Bridges MQTT messages to SPC engine
- Subscribes to topics for characteristics with `provider_type=TAG`
- On message receipt: extracts value(s), creates sample, runs through SPC engine
- Tracks state: running, subscribed topics, samples processed count
- Supports restart (full teardown + re-init) and refresh (re-subscribe based on current mappings)

### 4.5 Alert Management

**Location:** `core/alerts/manager.py`

**AlertManager:**
- Creates Violation records from Nelson rule evaluation results
- Sets `requires_acknowledgement` based on `CharacteristicRule` configuration
- Acknowledgement workflow: validates violation exists, sets ack fields, optionally excludes sample
- Notification broadcasting via `AlertNotifier` protocol (abstract interface)
- Violation statistics: counts by severity, by rule, acknowledgement rates

**Standard Reason Codes (11):**
1. Measurement Error
2. Equipment Malfunction
3. Raw Material Variation
4. Operator Error
5. Environmental Change
6. Process Adjustment
7. Tool Wear
8. Calibration Issue
9. Known Process Change
10. Under Investigation
11. Other

---

## 5. Configuration

**Location:** `core/config.py`

All settings use the `OPENSPC_` environment variable prefix via pydantic-settings.

| Environment Variable         | Type    | Default                             | Description                        |
|------------------------------|---------|-------------------------------------|------------------------------------|
| `OPENSPC_APP_VERSION`        | str     | `"0.3.0"`                          | Application version                |
| `OPENSPC_DATABASE_URL`       | str     | `"sqlite+aiosqlite:///./openspc.db"` | Database connection string        |
| `OPENSPC_JWT_SECRET`         | str     | `""` (auto-generated)              | JWT signing secret                 |
| `OPENSPC_COOKIE_SECURE`      | bool    | `false`                            | Secure flag on refresh cookie      |
| `OPENSPC_ADMIN_USERNAME`     | str     | `"admin"`                          | Bootstrap admin username           |
| `OPENSPC_ADMIN_PASSWORD`     | str     | `"admin"`                          | Bootstrap admin password           |
| `OPENSPC_CORS_ORIGINS`       | str     | `"http://localhost:5173"`           | Comma-separated CORS origins       |
| `OPENSPC_SANDBOX`            | bool    | `false`                            | Enable sandbox mode (devtools)     |

**Computed properties:**
- `cors_origin_list` -- Splits `CORS_ORIGINS` string into a list

**Notes:**
- Settings are LRU-cached via `get_settings()` singleton.
- JWT secret auto-generation writes to `.jwt_secret` file for persistence across restarts.
- `COOKIE_SECURE=false` is appropriate for development; should be `true` in production with HTTPS.

---

## 6. TODO Items and Gaps

### 6.1 Explicit TODOs in Source Code

| File | TODO | Description |
|------|------|-------------|
| `main.py:3-4` | Structured logging | Adopt structlog or python-json-logger for machine-parseable log output |
| `main.py:6-7` | Alembic migration check | Add startup check to warn when DB schema is out of date |
| `annotations.py:23-25` | Router prefix collision | Annotations share `/api/v1/characteristics` prefix with characteristics router; consider dedicated `/api/v1/annotations` prefix |

### 6.2 Security Gaps

| Area | Gap | Severity |
|------|-----|----------|
| MQTT broker passwords | Stored in plaintext in database (`broker.py` model) | Medium |
| Default admin credentials | `admin`/`admin` default is insecure if not overridden | Medium |
| Rate limiting | API key has `rate_limit_per_minute` field but no enforcement middleware | Low |
| CORS | Defaults to `localhost:5173` only; production requires explicit configuration | Low |

### 6.3 Architectural Gaps

| Area | Gap | Description |
|------|-----|-------------|
| Database migrations | No Alembic version check at startup | Application may run against stale schema silently |
| Pagination consistency | Some endpoints use skip/limit, others return all | Hierarchy tree, rules, and annotations return unbounded lists |
| Error handling | Seed scripts in devtools swallow exception details | Only "Seed script failed" returned to client on error |
| WebSocket auth | Token passed as query parameter | Visible in server logs and browser history; consider ticket-based auth |
| Annotation model | `start_sample_id` and `end_sample_id` columns exist but appear unused | Period annotations use `start_time`/`end_time` instead |
| Provider type | Only MANUAL and TAG implemented | OPC-UA (planned for phase `industrial-connectivity-2`) not yet present |
| Testing | No test files found in backend source tree | Unit and integration tests not present or in a separate location |
| Multi-database | SQLite only | `aiosqlite` driver hardcoded in default; PostgreSQL support may require driver changes |

### 6.4 Performance Considerations

| Area | Concern | Description |
|------|---------|-------------|
| Rolling window cache | Memory-bound | 1000 characteristics x 25 samples cached in memory; may need tuning for large deployments |
| Chart data endpoint | N+1 potential | Violations are batch-loaded per page, but each sample loads measurements via relationship |
| Batch import | Sequential processing | Samples processed one-at-a-time through SPC engine; no bulk optimization |
| Control limit recalculation | Full scan | Loads last 100 samples from DB each time; no incremental update |
| Topic discovery | Wildcard subscription | Subscribes to `#` which receives all messages; may overwhelm on busy brokers |

### 6.5 Missing Features (Referenced but Not Implemented)

| Feature | Reference | Status |
|---------|-----------|--------|
| OPC-UA provider | Memory notes, provider_type enum | Planned for industrial-connectivity-2 |
| Structured logging | `main.py` TODO | Not implemented |
| Migration version check | `main.py` TODO | Not implemented |
| Rate limiting enforcement | `APIKey.rate_limit_per_minute` field | Field exists, no middleware |
| Email notifications | No references found | Not implemented |
| Report generation | Frontend has reports UI | Backend has no dedicated report endpoints; likely client-side |

---

## Appendix: File Inventory

### API Endpoints (16 files)
```
backend/src/openspc/api/v1/
  annotations.py          auth.py               api_keys.py
  brokers.py              characteristic_config.py  characteristics.py
  data_entry.py           devtools.py           hierarchy.py
  plants.py               providers.py          samples.py
  tags.py                 users.py              violations.py
  websocket.py
```

### Database Models (11 files)
```
backend/src/openspc/db/models/
  annotation.py           api_key.py            broker.py
  characteristic.py       characteristic_config.py  hierarchy.py
  plant.py                sample.py             user.py
  violation.py
```

### Core Systems
```
backend/src/openspc/core/
  config.py
  broadcast.py
  auth/
    jwt.py                passwords.py          api_key.py
    bootstrap.py
  engine/
    spc_engine.py         nelson_rules.py       control_limits.py
    rolling_window.py
  events/
    events.py             bus.py
  alerts/
    manager.py
  providers/
    manager.py

backend/src/openspc/mqtt/
  manager.py

backend/src/openspc/api/
  deps.py
```
