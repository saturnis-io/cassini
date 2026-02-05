---
phase: phase-4-polymorphic-config
plan: 2
type: execute
wave: 1
depends_on: [1]
files_modified:
  - backend/src/openspc/db/repositories/characteristic_config.py
  - backend/src/openspc/api/v1/characteristic_config.py
  - backend/src/openspc/main.py
autonomous: true
must_haves:
  truths:
    - "User can GET config for a characteristic"
    - "User can PUT config for a characteristic"
    - "User can DELETE config for a characteristic"
    - "Backend validates config_type matches provider_type"
  artifacts:
    - "backend/src/openspc/db/repositories/characteristic_config.py exists"
    - "backend/src/openspc/api/v1/characteristic_config.py exists"
    - "Router registered in main.py"
  key_links:
    - "API endpoints call repository methods"
    - "Repository serializes/deserializes JSON with Pydantic"
---

# Phase 4 - Plan 2: Backend Repository and API

## Objective
Create repository for database operations and REST API endpoints for characteristic configuration.

## Tasks

<task type="auto">
  <name>Task 1: Create Repository</name>
  <files>backend/src/openspc/db/repositories/characteristic_config.py</files>
  <action>
    Create CharacteristicConfigRepository:
    1. Inherit from BaseRepository[CharacteristicConfig]
    2. Constructor: __init__(self, session: AsyncSession)
       - Call super().__init__(session, CharacteristicConfig)
    3. get_by_characteristic(char_id: int) -> Optional[CharacteristicConfig]
       - Query by characteristic_id
    4. get_config_parsed(char_id: int) -> Optional[ConfigSchema]
       - Parse JSON to Pydantic model using config_type discriminator
    5. upsert(char_id: int, config: ConfigSchema) -> CharacteristicConfig
       - Create or update config, serialize with model_dump_json()
    6. get_all_active_manual() -> list[tuple[int, ManualConfig]]
       - For future scheduling service

    Match repository pattern from sample.py and characteristic.py.
    Note: BaseRepository takes (session, model) - session FIRST.
  </action>
  <verify>
    ```bash
    cd C:/Users/djbra/Projects/SPC-client/backend && python -c "from openspc.db.repositories.characteristic_config import CharacteristicConfigRepository; print('Repository OK')"
    ```
  </verify>
  <done>
    - Repository file exists
    - All CRUD methods implemented
    - JSON serialization/deserialization works
  </done>
</task>

<task type="auto">
  <name>Task 2: Create API Endpoints</name>
  <files>backend/src/openspc/api/v1/characteristic_config.py</files>
  <action>
    Create API router with endpoints:
    1. Router with prefix="/api/v1/characteristics", tags=["characteristic-config"]
    2. Dependency functions for repos (get_config_repo, get_char_repo)
    3. GET /{char_id}/config
       - Verify characteristic exists (404 if not)
       - Return CharacteristicConfigResponse or None
    4. PUT /{char_id}/config
       - Verify characteristic exists
       - Validate config_type matches provider_type (400 if mismatch)
       - Upsert config
       - Return CharacteristicConfigResponse
    5. DELETE /{char_id}/config
       - Verify config exists (404 if not)
       - Delete config
       - Return 204 No Content

    Follow implementation from POLYMORPHIC_CONFIG_IMPLEMENTATION.md section 1.5.
    Match API patterns from characteristics.py and samples.py.
  </action>
  <verify>
    ```bash
    cd C:/Users/djbra/Projects/SPC-client/backend && python -c "from openspc.api.v1.characteristic_config import router; print('Router OK')"
    ```
  </verify>
  <done>
    - API file exists with router
    - All three endpoints defined (GET/PUT/DELETE)
    - Validation logic for config_type/provider_type match
  </done>
</task>

<task type="auto">
  <name>Task 3: Register Router</name>
  <files>backend/src/openspc/main.py</files>
  <action>
    Update main.py:
    1. Add import: from openspc.api.v1.characteristic_config import router as config_router
    2. Add router registration: app.include_router(config_router)
       - Place after characteristics_router registration

    Follow existing pattern for other routers.
  </action>
  <verify>
    ```bash
    cd C:/Users/djbra/Projects/SPC-client/backend && python -c "from openspc.main import app; routes = [r.path for r in app.routes]; assert any('config' in str(r) for r in routes); print('Router registered')"
    ```
  </verify>
  <done>
    - Import added to main.py
    - Router registered with app.include_router()
    - No import errors
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] SUMMARY.md updated
