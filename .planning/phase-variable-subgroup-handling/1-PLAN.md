---
phase: variable-subgroup-handling
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/openspc/db/models/characteristic.py
  - backend/src/openspc/db/models/sample.py
  - backend/alembic/versions/20260203_add_subgroup_modes.py
  - backend/src/openspc/api/schemas/characteristic.py
  - backend/src/openspc/api/schemas/sample.py
autonomous: true
must_haves:
  truths:
    - "SubgroupMode enum exists with STANDARDIZED, VARIABLE_LIMITS, NOMINAL_TOLERANCE values"
    - "Characteristic model has subgroup_mode, min_measurements, warn_below_count, stored_sigma, stored_center_line fields"
    - "Sample model has actual_n, is_undersized, effective_ucl, effective_lcl, z_score fields"
    - "API schemas reflect all new fields with proper validation"
  artifacts:
    - "backend/alembic/versions/20260203_add_subgroup_modes.py exists with upgrade/downgrade"
    - "CharacteristicCreate schema validates subgroup configuration"
    - "ChartSample schema includes all mode-specific fields"
  key_links:
    - "SubgroupMode enum used consistently in model and schemas"
    - "Migration adds columns with appropriate defaults"
---

# Phase Variable Subgroup Handling - Plan 1: Database & Schema Foundation

## Objective
Establish the database schema and API schema foundation for variable subgroup size handling, including the SubgroupMode enum, model field additions, and database migration.

## Tasks

<task type="auto">
  <name>Task 1: Add SubgroupMode Enum and Update Characteristic Model</name>
  <files>backend/src/openspc/db/models/characteristic.py</files>
  <action>
    Update the Characteristic model to add:
    1. Create SubgroupMode enum class with three values:
       - STANDARDIZED = "STANDARDIZED"
       - VARIABLE_LIMITS = "VARIABLE_LIMITS"
       - NOMINAL_TOLERANCE = "NOMINAL_TOLERANCE"
    2. Add new fields to Characteristic class:
       - subgroup_mode: Mapped[str] = mapped_column(String, default="NOMINAL_TOLERANCE", nullable=False)
       - min_measurements: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
       - warn_below_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
       - stored_sigma: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
       - stored_center_line: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    Constraints:
    - Follow existing enum pattern from ProviderType
    - Place SubgroupMode enum after ProviderType class
    - Add new fields after trigger_tag in Characteristic class
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\backend
    python -c "from openspc.db.models.characteristic import SubgroupMode, Characteristic; print('SubgroupMode:', list(SubgroupMode)); c = Characteristic.__table__.columns; print('New columns:', [col.name for col in c if col.name in ['subgroup_mode', 'min_measurements', 'warn_below_count', 'stored_sigma', 'stored_center_line']])"
    ```
  </verify>
  <done>
    - SubgroupMode enum exists with three values
    - Characteristic model has all five new fields
    - Default values are set correctly
  </done>
</task>

<task type="auto">
  <name>Task 2: Update Sample Model with Tracking Fields</name>
  <files>backend/src/openspc/db/models/sample.py</files>
  <action>
    Update the Sample model to add variable subgroup tracking fields:
    1. Add after is_excluded field:
       - actual_n: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
       - is_undersized: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    2. Add mode-specific computed fields:
       - effective_ucl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
       - effective_lcl: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
       - z_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    Constraints:
    - Follow existing field patterns in Sample class
    - Group new fields logically with comments
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\backend
    python -c "from openspc.db.models.sample import Sample; c = Sample.__table__.columns; print('New columns:', [col.name for col in c if col.name in ['actual_n', 'is_undersized', 'effective_ucl', 'effective_lcl', 'z_score']])"
    ```
  </verify>
  <done>
    - Sample model has actual_n and is_undersized fields
    - Sample model has effective_ucl, effective_lcl, z_score fields
    - All fields have appropriate defaults and nullability
  </done>
</task>

<task type="auto">
  <name>Task 3: Create Database Migration and Update API Schemas</name>
  <files>
    backend/alembic/versions/20260203_add_subgroup_modes.py
    backend/src/openspc/api/schemas/characteristic.py
    backend/src/openspc/api/schemas/sample.py
  </files>
  <action>
    Create Alembic migration and update Pydantic schemas:

    1. Create migration file `backend/alembic/versions/20260203_add_subgroup_modes.py`:
       - revision = "002"
       - down_revision = "001"
       - upgrade(): Add all new columns to characteristic and sample tables with server_defaults
       - downgrade(): Remove columns in reverse order
       - Include backfill SQL for actual_n from measurement count

    2. Update `backend/src/openspc/api/schemas/characteristic.py`:
       - Add SubgroupModeEnum(str, Enum) class
       - Add to CharacteristicCreate: subgroup_mode, min_measurements, warn_below_count with model_validator
       - Add to CharacteristicResponse: subgroup_mode, min_measurements, warn_below_count, stored_sigma, stored_center_line
       - Update ChartSample: add actual_n, is_undersized, effective_ucl, effective_lcl, z_score, display_value
       - Update ChartDataResponse: add subgroup_mode, nominal_subgroup_size

    3. Update `backend/src/openspc/api/schemas/sample.py`:
       - Add to SampleResponse: actual_n, is_undersized, effective_ucl, effective_lcl, z_score

    Constraints:
    - Migration must be reversible
    - All new schema fields must have appropriate types and descriptions
    - model_validator for CharacteristicCreate must enforce: min_measurements <= subgroup_size, warn_below_count >= min_measurements
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\backend
    python -c "
from openspc.api.schemas.characteristic import SubgroupModeEnum, CharacteristicCreate, CharacteristicResponse, ChartSample, ChartDataResponse
from openspc.api.schemas.sample import SampleResponse
print('SubgroupModeEnum values:', list(SubgroupModeEnum))
print('CharacteristicCreate fields:', list(CharacteristicCreate.model_fields.keys()))
print('ChartSample fields:', list(ChartSample.model_fields.keys()))
print('SampleResponse fields:', list(SampleResponse.model_fields.keys()))
"
    ```
  </verify>
  <done>
    - Migration file exists with correct revision chain
    - SubgroupModeEnum added to schemas
    - All schema classes have new fields
    - Validation logic is implemented in CharacteristicCreate
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Python can import all updated modules without errors
- [ ] Atomic commit created with message: "feat(vssh-1): add subgroup mode database schema and API schemas"
- [ ] SUMMARY.md updated with Plan 1 completion status
