# Data Retention & Purge Engine

## Data Flow
```
RetentionSettings.tsx → useRetentionDefault(plantId) + useRetentionOverrides(plantId)
  → GET /api/v1/retention/default?plant_id=N
  → GET /api/v1/retention/overrides?plant_id=N
  → PUT /api/v1/retention/default (set global default)
  → PUT /api/v1/retention/hierarchy/{id} (set hierarchy override)
  → PUT /api/v1/retention/characteristic/{id} (set characteristic override)

PurgeEngine (background service) runs on interval (default 24h):
  → for each active plant:
    → for each characteristic:
      → resolve_effective_policy() walks inheritance chain:
        characteristic → parent hierarchy → ... → global default → implicit "forever"
      → if retention_type is "sample_count" or "time_delta":
        → delete expired samples in BATCH_SIZE (1000) batches
        → CASCADE FKs handle measurements, violations, edit history
      → record PurgeHistory (samples_deleted, violations_deleted, characteristics_processed)

Manual trigger: POST /api/v1/retention/purge?plant_id=N (admin only)
```

## Backend

### Models
| Model | File | Key Columns/Relations | Migration |
|-------|------|-----------------------|-----------|
| RetentionPolicy | db/models/retention_policy.py | id, plant_id(FK), scope(global/hierarchy/characteristic), hierarchy_id(FK nullable), characteristic_id(FK nullable), retention_type(forever/sample_count/time_delta), retention_value(nullable), retention_unit(days/weeks/months/years nullable), created_at, updated_at; CHECK: scope-target consistency, type-value consistency; UNIQUE: (plant_id, scope, hierarchy_id, characteristic_id) | 021 |
| PurgeHistory | db/models/purge_history.py | id, plant_id(FK), started_at, completed_at, status(running/completed/failed), samples_deleted, violations_deleted, characteristics_processed, error_message | 021 |

### Endpoints
| Method | Path | Params | Response Shape | Auth |
|--------|------|--------|----------------|------|
| GET | /api/v1/retention/default | plant_id | RetentionPolicyResponse or null | get_current_user |
| PUT | /api/v1/retention/default | plant_id, body: RetentionPolicySet | RetentionPolicyResponse | get_current_engineer |
| GET | /api/v1/retention/hierarchy/{hierarchy_id} | - | RetentionPolicyResponse or null | get_current_user |
| PUT | /api/v1/retention/hierarchy/{hierarchy_id} | body: RetentionPolicySet | RetentionPolicyResponse | get_current_engineer |
| DELETE | /api/v1/retention/hierarchy/{hierarchy_id} | - | 204 | get_current_engineer |
| GET | /api/v1/retention/characteristic/{characteristic_id} | - | RetentionPolicyResponse or null | get_current_user |
| PUT | /api/v1/retention/characteristic/{characteristic_id} | body: RetentionPolicySet | RetentionPolicyResponse | get_current_engineer |
| DELETE | /api/v1/retention/characteristic/{characteristic_id} | - | 204 | get_current_engineer |
| GET | /api/v1/retention/characteristic/{characteristic_id}/effective | - | EffectiveRetentionResponse | get_current_user |
| GET | /api/v1/retention/overrides | plant_id | list[RetentionOverrideResponse] | get_current_user |
| GET | /api/v1/retention/activity | plant_id, limit | list[PurgeHistoryResponse] | get_current_user |
| GET | /api/v1/retention/next-purge | plant_id | NextPurgeResponse | get_current_user |
| POST | /api/v1/retention/purge | plant_id | PurgeHistoryResponse | get_current_admin |

### Services
| Module | File | Key Functions |
|--------|------|---------------|
| PurgeEngine | core/purge_engine.py | start(), stop(), run_purge(plant_id), _purge_characteristic(), _purge_by_sample_count(), _purge_by_time_delta() |

### Repositories
| Class | File | Key Methods |
|-------|------|-------------|
| RetentionRepository | db/repositories/retention.py | get_global_default, set_global_default, get_hierarchy_policy, set_hierarchy_policy, get_characteristic_policy, set_characteristic_policy, delete_hierarchy_policy, delete_characteristic_policy, resolve_effective_policy, list_overrides |
| PurgeHistoryRepository | db/repositories/purge_history.py | create_run, complete_run, fail_run, list_history, get_latest |

## Frontend

### Components
| Component | File | Key Props | Hooks Used |
|-----------|------|-----------|------------|
| RetentionSettings | components/RetentionSettings.tsx | - | useRetentionDefault, useSetRetentionDefault, useRetentionOverrides, useSetHierarchyRetention, useDeleteHierarchyRetention, useSetCharacteristicRetention, useDeleteCharacteristicRetention, usePurgeActivity, useNextPurge, useTriggerPurge |

### Hooks / API
| Hook/Method | Namespace | Endpoint | Cache Key |
|-------------|-----------|----------|-----------|
| useRetentionDefault | retentionApi.getDefault | GET /retention/default | ['retention', 'default', plantId] |
| useSetRetentionDefault | retentionApi.setDefault | PUT /retention/default | invalidates default |
| useRetentionOverrides | retentionApi.getOverrides | GET /retention/overrides | ['retention', 'overrides', plantId] |
| useHierarchyRetention | retentionApi.getHierarchyPolicy | GET /retention/hierarchy/{id} | ['retention', 'hierarchy', id] |
| useSetHierarchyRetention | retentionApi.setHierarchyPolicy | PUT /retention/hierarchy/{id} | invalidates overrides |
| useDeleteHierarchyRetention | retentionApi.deleteHierarchyPolicy | DELETE /retention/hierarchy/{id} | invalidates overrides |
| useCharacteristicRetention | retentionApi.getCharacteristicPolicy | GET /retention/characteristic/{id} | ['retention', 'characteristic', id] |
| useSetCharacteristicRetention | retentionApi.setCharacteristicPolicy | PUT /retention/characteristic/{id} | invalidates overrides |
| useDeleteCharacteristicRetention | retentionApi.deleteCharacteristicPolicy | DELETE /retention/characteristic/{id} | invalidates overrides |
| useEffectiveRetention | retentionApi.getEffectivePolicy | GET /retention/characteristic/{id}/effective | ['retention', 'effective', id] |
| usePurgeActivity | retentionApi.getPurgeActivity | GET /retention/activity | ['retention', 'activity', plantId] |
| useNextPurge | retentionApi.getNextPurge | GET /retention/next-purge | ['retention', 'next-purge', plantId] |
| useTriggerPurge | retentionApi.triggerPurge | POST /retention/purge | invalidates activity |

### Pages / Routes
| Route | Page | Key Components |
|-------|------|----------------|
| /settings | SettingsView.tsx | RetentionSettings (tab) with hierarchy tree browser |

## Migrations
- 021 (retention_policy): retention_policy table with CHECK constraints, purge_history table

## Known Issues / Gotchas
- Inheritance resolution walks: characteristic -> parent hierarchy ancestors -> global default -> implicit "forever"
- PurgeEngine deletes in batches of 1000 to avoid long-running transactions
- CASCADE FKs handle measurements, violations, and edit history automatically on sample deletion
- Time delta units: days, weeks, months (30d), years (365d) — approximate for months/years
- PurgeEngine runs as asyncio background task, started/stopped in app lifespan
- Manual purge trigger requires admin role (more restrictive than policy management which needs engineer+)
