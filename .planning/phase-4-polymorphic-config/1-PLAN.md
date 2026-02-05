---
phase: phase-4-polymorphic-config
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/openspc/api/schemas/characteristic_config.py
  - backend/src/openspc/db/models/characteristic_config.py
  - backend/src/openspc/db/models/characteristic.py
  - backend/alembic/versions/20260206_add_characteristic_config.py
autonomous: true
must_haves:
  truths:
    - "ManualConfig schema validates interval/shift/cron/batch schedules"
    - "TagConfig schema validates trigger configurations"
    - "CharacteristicConfig model stores JSON with characteristic relationship"
  artifacts:
    - "backend/src/openspc/api/schemas/characteristic_config.py exists"
    - "backend/src/openspc/db/models/characteristic_config.py exists"
    - "backend/alembic/versions/20260206_add_characteristic_config.py exists"
  key_links:
    - "CharacteristicConfig links to Characteristic via foreign key"
    - "Characteristic has optional config relationship"
---

# Phase 4 - Plan 1: Backend Schema and Model Foundation

## Objective
Create Pydantic schemas for polymorphic configuration and SQLAlchemy model with database migration.

## Tasks

<task type="auto">
  <name>Task 1: Create Pydantic Schemas</name>
  <files>backend/src/openspc/api/schemas/characteristic_config.py</files>
  <action>
    Create Pydantic schemas file with:
    1. Enums: ConfigType, ScheduleType, TriggerType, EdgeType
    2. Schedule models: IntervalSchedule, ShiftSchedule, CronSchedule, BatchStartSchedule
    3. Schedule discriminated union with schedule_type discriminator
    4. Trigger models: OnUpdateTrigger, OnEventTrigger, OnValueChangeTrigger
    5. TriggerStrategy discriminated union with trigger_type discriminator
    6. ManualConfig with config_type="MANUAL" literal, schedule union, grace_period
    7. TagConfig with config_type="TAG" literal, source_tag_path, trigger union
    8. CharacteristicConfig discriminated union with config_type discriminator
    9. Response/Update API models

    Follow implementation from POLYMORPHIC_CONFIG_IMPLEMENTATION.md section 1.1.
    Use Annotated[Union[...], Field(discriminator=...)] pattern.
  </action>
  <verify>
    ```bash
    cd C:/Users/djbra/Projects/SPC-client/backend && python -c "from openspc.api.schemas.characteristic_config import ManualConfig, TagConfig, CharacteristicConfig; print('Schemas OK')"
    ```
  </verify>
  <done>
    - File exists at backend/src/openspc/api/schemas/characteristic_config.py
    - All enums defined (ConfigType, ScheduleType, TriggerType, EdgeType)
    - ManualConfig/TagConfig discriminated union works
    - Schedule/Trigger nested discriminators work
  </done>
</task>

<task type="auto">
  <name>Task 2: Create Database Model and Update Characteristic</name>
  <files>backend/src/openspc/db/models/characteristic_config.py, backend/src/openspc/db/models/characteristic.py</files>
  <action>
    Create CharacteristicConfig SQLAlchemy model:
    1. id, characteristic_id (unique FK), config_json (Text), is_active (Boolean)
    2. created_at, updated_at timestamps
    3. Relationship to Characteristic with back_populates

    Update Characteristic model:
    1. Add TYPE_CHECKING import for CharacteristicConfig
    2. Add optional config relationship with cascade delete

    Follow implementation from POLYMORPHIC_CONFIG_IMPLEMENTATION.md section 1.2.
    Match existing model patterns from characteristic.py and sample.py.
  </action>
  <verify>
    ```bash
    cd C:/Users/djbra/Projects/SPC-client/backend && python -c "from openspc.db.models.characteristic_config import CharacteristicConfig; from openspc.db.models.characteristic import Characteristic; print('Models OK')"
    ```
  </verify>
  <done>
    - CharacteristicConfig model exists with all columns
    - Characteristic model has config relationship
    - No circular import errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Create Database Migration</name>
  <files>backend/alembic/versions/20260206_add_characteristic_config.py</files>
  <action>
    Create Alembic migration:
    1. Revision ID: "007"
    2. down_revision: "006"
    3. Create characteristic_config table with columns:
       - id (Integer, primary key, autoincrement)
       - characteristic_id (Integer, FK to characteristic.id, unique, CASCADE delete)
       - config_json (Text, not null)
       - is_active (Boolean, default True)
       - created_at, updated_at (DateTime, server_default now())
    4. Create index on characteristic_id
    5. Downgrade: drop index, drop table

    Follow implementation from POLYMORPHIC_CONFIG_IMPLEMENTATION.md section 1.3.
    Match migration pattern from 20260205_add_sample_edit_history.py.
  </action>
  <verify>
    ```bash
    cd C:/Users/djbra/Projects/SPC-client/backend && python -c "import backend.alembic.versions" && echo "Migration file exists"
    ```
  </verify>
  <done>
    - Migration file exists at backend/alembic/versions/20260206_add_characteristic_config.py
    - Revision chain is correct (007 -> 006)
    - Table schema matches model definition
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] SUMMARY.md updated
