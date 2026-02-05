---
phase: variable-subgroup-handling
plan: 2
type: execute
wave: 2
depends_on: [1]
files_modified:
  - backend/src/openspc/core/engine/spc_engine.py
  - backend/src/openspc/core/engine/rolling_window.py
  - backend/src/openspc/core/engine/control_limits.py
autonomous: true
must_haves:
  truths:
    - "SPC engine accepts samples with measurements >= min_measurements"
    - "Z-score is calculated for Mode A samples"
    - "Effective UCL/LCL are calculated per-point for Mode B samples"
    - "Zone classification uses mode-appropriate boundaries"
    - "stored_sigma and stored_center_line are persisted on limit recalculation"
  artifacts:
    - "SPCEngine._validate_measurements() handles all three modes"
    - "SPCEngine._compute_sample_statistics() returns mode-specific values"
    - "WindowSample dataclass includes all mode-specific fields"
    - "RollingWindow.classify_value_for_mode() performs mode-aware classification"
  key_links:
    - "SPCEngine uses Characteristic.subgroup_mode to determine validation and computation"
    - "ControlLimitService stores sigma and center_line on characteristic"
    - "WindowSample carries z_score, effective_ucl, effective_lcl to chart response"
---

# Phase Variable Subgroup Handling - Plan 2: SPC Engine Logic

## Objective
Implement mode-aware sample processing in the SPC engine, including validation, statistics computation, zone classification, and control limit persistence.

## Tasks

<task type="auto">
  <name>Task 1: Update SPC Engine for Mode-Aware Processing</name>
  <files>backend/src/openspc/core/engine/spc_engine.py</files>
  <action>
    Update SPCEngine to handle variable subgroup sizes based on mode:

    1. Add helper method `_validate_measurements(self, char, measurements) -> tuple[bool, bool]`:
       - Check actual_n >= char.min_measurements (raise ValueError if not)
       - For NOMINAL_TOLERANCE mode: enforce actual_n <= char.subgroup_size
       - Return (is_valid=True, is_undersized) where is_undersized = actual_n < (char.warn_below_count or char.subgroup_size)

    2. Add helper method `_compute_sample_statistics(self, char, measurements, actual_n) -> dict`:
       - Calculate mean and range_value (existing logic)
       - For STANDARDIZED mode:
         - Validate stored_sigma and stored_center_line exist (raise ValueError if not)
         - Calculate z_score = (mean - stored_center_line) / (stored_sigma / sqrt(actual_n))
       - For VARIABLE_LIMITS mode:
         - Validate stored_sigma and stored_center_line exist
         - Calculate effective_ucl = stored_center_line + 3 * (stored_sigma / sqrt(actual_n))
         - Calculate effective_lcl = stored_center_line - 3 * (stored_sigma / sqrt(actual_n))
       - Return dict with mean, range_value, z_score, effective_ucl, effective_lcl

    3. Update `process_sample()` method:
       - Replace strict subgroup_size check with call to _validate_measurements
       - Call _compute_sample_statistics for mode-specific values
       - Pass actual_n, is_undersized, and computed values to sample creation
       - Update WindowSample creation with new fields

    Constraints:
    - Import math.sqrt for calculations
    - Add SubgroupMode import from models
    - Maintain backward compatibility (Mode C should behave like current implementation)
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\backend
    python -c "
from openspc.core.engine.spc_engine import SPCEngine
import inspect
# Check new methods exist
print('_validate_measurements:', '_validate_measurements' in dir(SPCEngine))
print('_compute_sample_statistics:', '_compute_sample_statistics' in dir(SPCEngine))
# Check imports
source = inspect.getsource(SPCEngine)
print('math imported:', 'import math' in source or 'from math' in source)
"
    ```
  </verify>
  <done>
    - _validate_measurements method validates against min_measurements
    - _compute_sample_statistics computes z_score for Mode A
    - _compute_sample_statistics computes effective limits for Mode B
    - process_sample uses new validation and computation methods
  </done>
</task>

<task type="auto">
  <name>Task 2: Update Rolling Window for Mode-Aware Classification</name>
  <files>backend/src/openspc/core/engine/rolling_window.py</files>
  <action>
    Update rolling window module for variable subgroup handling:

    1. Update WindowSample dataclass:
       - Add actual_n: int field
       - Add is_undersized: bool field
       - Add effective_ucl: float | None = None field
       - Add effective_lcl: float | None = None field
       - Add z_score: float | None = None field

    2. Add method `classify_value_for_mode()` to RollingWindow class:
       ```python
       def classify_value_for_mode(
           self,
           value: float,
           mode: str,
           actual_n: int,
           stored_sigma: float | None = None,
           stored_center_line: float | None = None,
           effective_ucl: float | None = None,
           effective_lcl: float | None = None,
       ) -> tuple[Zone, bool, float]:
       ```
       - For STANDARDIZED mode: value IS the z_score, classify into fixed zones at +/-1, +/-2, +/-3
       - For VARIABLE_LIMITS mode: Use effective_ucl/lcl for zone boundaries, calculate sigma_distance
       - For NOMINAL_TOLERANCE mode: Call existing classify_value()

    3. Update `add_sample()` in RollingWindowManager:
       - Accept optional mode-specific parameters (actual_n, is_undersized, z_score, effective_ucl, effective_lcl)
       - Pass these to WindowSample creation
       - Use classify_value_for_mode when mode is provided

    Constraints:
    - Maintain backward compatibility with existing callers
    - Default values allow existing code to work unchanged
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\backend
    python -c "
from openspc.core.engine.rolling_window import WindowSample, RollingWindow
import dataclasses
fields = [f.name for f in dataclasses.fields(WindowSample)]
print('WindowSample fields:', fields)
print('Has actual_n:', 'actual_n' in fields)
print('Has z_score:', 'z_score' in fields)
print('classify_value_for_mode exists:', hasattr(RollingWindow, 'classify_value_for_mode'))
"
    ```
  </verify>
  <done>
    - WindowSample has actual_n, is_undersized, effective_ucl, effective_lcl, z_score fields
    - classify_value_for_mode handles all three modes
    - add_sample accepts and passes mode-specific parameters
  </done>
</task>

<task type="auto">
  <name>Task 3: Update Control Limit Service to Persist Sigma</name>
  <files>backend/src/openspc/core/engine/control_limits.py</files>
  <action>
    Update ControlLimitService to store sigma and center_line:

    1. Update `recalculate_and_persist()` method:
       - After calculating limits, also store:
         - characteristic.stored_sigma = result.sigma
         - characteristic.stored_center_line = result.center_line
       - For Mode A & B, also update characteristic.ucl and characteristic.lcl using nominal subgroup_size

    2. Update CalculationResult dataclass if needed to ensure sigma is always returned

    3. Ensure the event published includes sigma information

    Constraints:
    - stored_sigma and stored_center_line must be set before Mode A or B can be used
    - This becomes a prerequisite for using standardized or variable limit modes
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\backend
    python -c "
from openspc.core.engine.control_limits import ControlLimitService
import inspect
source = inspect.getsource(ControlLimitService.recalculate_and_persist)
print('stores stored_sigma:', 'stored_sigma' in source)
print('stores stored_center_line:', 'stored_center_line' in source)
"
    ```
  </verify>
  <done>
    - recalculate_and_persist stores stored_sigma on characteristic
    - recalculate_and_persist stores stored_center_line on characteristic
    - Both values are committed to database
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] SPC engine can process samples with all three modes
- [ ] Atomic commit created with message: "feat(vssh-2): implement mode-aware SPC engine processing"
- [ ] SUMMARY.md updated with Plan 2 completion status
