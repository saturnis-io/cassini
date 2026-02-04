# Phase: Variable Subgroup Size Handling - Research

## Implementation Analysis

### Current Codebase Architecture

#### Database Layer
- **Characteristic Model** (`backend/src/openspc/db/models/characteristic.py`):
  - Currently has: `id`, `hierarchy_id`, `name`, `description`, `subgroup_size`, `target_value`, `usl`, `lsl`, `ucl`, `lcl`, `provider_type`, `mqtt_topic`, `trigger_tag`
  - Missing: `subgroup_mode`, `min_measurements`, `warn_below_count`, `stored_sigma`, `stored_center_line`

- **Sample Model** (`backend/src/openspc/db/models/sample.py`):
  - Currently has: `id`, `char_id`, `timestamp`, `batch_number`, `operator_id`, `is_excluded`, `measurements`, `violations`
  - Missing: `actual_n`, `is_undersized`, `effective_ucl`, `effective_lcl`, `z_score`

#### SPC Engine Layer
- **SPCEngine** (`backend/src/openspc/core/engine/spc_engine.py`):
  - Current validation: Strict `len(measurements) != char.subgroup_size` check (line 181-185)
  - Needs: Mode-aware validation allowing variable sizes with configurable minimum
  - Needs: Mode-specific statistics computation (z-score for Mode A, effective limits for Mode B)

- **RollingWindow** (`backend/src/openspc/core/engine/rolling_window.py`):
  - `WindowSample` dataclass needs: `actual_n`, `is_undersized`, `effective_ucl`, `effective_lcl`, `z_score`
  - `classify_value()` method needs mode-aware zone classification

- **ControlLimitService** (`backend/src/openspc/core/engine/control_limits.py`):
  - `recalculate_and_persist()` needs to store `stored_sigma` and `stored_center_line`
  - Needs mode-aware limit calculation

#### API Layer
- **Characteristic Schemas** (`backend/src/openspc/api/schemas/characteristic.py`):
  - `CharacteristicCreate`: Add subgroup mode fields
  - `CharacteristicResponse`: Add subgroup mode fields
  - `ChartSample`: Add `actual_n`, `is_undersized`, `effective_ucl`, `effective_lcl`, `z_score`, `display_value`
  - `ChartDataResponse`: Add `subgroup_mode`, `nominal_subgroup_size`

- **Sample Schemas** (`backend/src/openspc/api/schemas/sample.py`):
  - `SampleResponse`: Add `actual_n`, `is_undersized`, `effective_ucl`, `effective_lcl`, `z_score`

#### Frontend Layer
- **Types** (`frontend/src/types/index.ts`):
  - Add `SubgroupMode` type
  - Extend `Characteristic` interface with subgroup mode fields
  - Extend `ChartDataPoint` interface with mode-specific fields
  - Extend `ChartData` interface with mode indicator

- **CharacteristicForm** (`frontend/src/components/CharacteristicForm.tsx`):
  - Add subgroup mode selector dropdown
  - Add min_measurements and warn_below_count inputs
  - Add validation for the configuration constraints

- **ControlChart** (`frontend/src/components/ControlChart.tsx`):
  - Mode-aware rendering (Z-score vs actual values)
  - Variable limit lines for Mode B (funnel effect)
  - Undersized sample visual indicator

### Database Migration Strategy
- New migration file: `backend/alembic/versions/20260203_add_subgroup_modes.py`
- Add columns with appropriate defaults:
  - `subgroup_mode`: Default "NOMINAL_TOLERANCE" (backward compatible)
  - `min_measurements`: Default 1 (permissive)
  - `warn_below_count`: NULL (defaults to subgroup_size behavior)
  - Sample columns with server defaults for backfill compatibility

### Key Implementation Decisions

1. **Enum vs String for SubgroupMode**: Use String with validation (matching existing `provider_type` pattern)

2. **Validation Flow**:
   - Validate at API schema level (Pydantic model_validator)
   - Re-validate at SPC engine level for business rules

3. **Mode C as Default**: Maintains backward compatibility with existing characteristics

4. **Stored Sigma Requirement**: Modes A and B require pre-calculated sigma/center_line, which means `recalculate_limits` must be called before using these modes

5. **Frontend Rendering Strategy**:
   - Mode A: Fixed Y-axis scale (-4 to +4 for Z-scores)
   - Mode B: Dynamic limit lines per point (funnel chart appearance)
   - Mode C: Current behavior (unchanged)

### File Modification Summary

**Backend - Database/Models (Plan 1)**:
1. `backend/src/openspc/db/models/characteristic.py` - Add SubgroupMode enum and new fields
2. `backend/src/openspc/db/models/sample.py` - Add tracking fields
3. `backend/alembic/versions/20260203_add_subgroup_modes.py` - Migration

**Backend - API Schemas (Plan 1)**:
4. `backend/src/openspc/api/schemas/characteristic.py` - Update schemas
5. `backend/src/openspc/api/schemas/sample.py` - Update SampleResponse

**Backend - SPC Engine (Plan 2)**:
6. `backend/src/openspc/core/engine/spc_engine.py` - Mode-aware validation and processing
7. `backend/src/openspc/core/engine/rolling_window.py` - Updated WindowSample and classification
8. `backend/src/openspc/core/engine/control_limits.py` - Store sigma/center_line

**Backend - Tests (Plan 3)**:
9. `backend/tests/unit/test_spc_engine.py` - Mode-specific tests
10. `backend/tests/unit/test_rolling_window.py` - Zone classification tests
11. `backend/tests/unit/test_control_limits.py` - Stored parameter tests

**Frontend (Plan 4)**:
12. `frontend/src/types/index.ts` - Type definitions
13. `frontend/src/components/CharacteristicForm.tsx` - Mode configuration UI
14. `frontend/src/components/ControlChart.tsx` - Mode-aware rendering

### Risk Assessment

1. **Migration Risk**: Low - All new columns have safe defaults
2. **API Breaking Changes**: Low - All new fields are additive
3. **Performance Impact**: Low - Z-score calculation is O(1), variable limits are O(n) per sample
4. **Test Coverage Gap**: Medium - Need comprehensive tests for all three modes
