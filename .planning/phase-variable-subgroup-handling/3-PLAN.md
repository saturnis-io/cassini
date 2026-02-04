---
phase: variable-subgroup-handling
plan: 3
type: execute
wave: 2
depends_on: [1]
files_modified:
  - backend/tests/unit/test_spc_engine.py
  - backend/tests/unit/test_rolling_window.py
  - backend/tests/unit/test_control_limits.py
autonomous: true
must_haves:
  truths:
    - "All three subgroup modes have dedicated unit tests"
    - "Validation logic is tested for edge cases"
    - "Z-score calculation is verified mathematically"
    - "Variable limit calculation is verified mathematically"
    - "Zone classification is tested for all modes"
  artifacts:
    - "Test class TestSubgroupModeValidation in test_spc_engine.py"
    - "Test class TestModeAwareClassification in test_rolling_window.py"
    - "Test class TestStoredParameters in test_control_limits.py"
  key_links:
    - "Tests use pytest fixtures and async patterns from existing tests"
    - "Tests verify integration between engine, window, and limits"
---

# Phase Variable Subgroup Handling - Plan 3: Backend Unit Tests

## Objective
Create comprehensive unit tests for the variable subgroup handling feature, covering validation, statistics computation, zone classification, and control limit persistence.

## Tasks

<task type="auto">
  <name>Task 1: Add SPC Engine Mode Tests</name>
  <files>backend/tests/unit/test_spc_engine.py</files>
  <action>
    Add new test class and test methods for subgroup mode handling:

    1. Create test class `TestSubgroupModeValidation`:
       - test_mode_c_accepts_exact_subgroup_size()
       - test_mode_c_rejects_measurements_exceeding_subgroup_size()
       - test_mode_c_accepts_undersized_above_min_measurements()
       - test_mode_c_rejects_below_min_measurements()
       - test_mode_a_requires_stored_sigma()
       - test_mode_b_requires_stored_sigma()

    2. Create test class `TestModeSpecificComputation`:
       - test_mode_a_computes_z_score():
         - Given: mean=105, stored_center_line=100, stored_sigma=10, actual_n=4
         - Expected: z_score = (105-100) / (10/sqrt(4)) = 5/5 = 1.0
       - test_mode_b_computes_effective_limits():
         - Given: stored_center_line=100, stored_sigma=10, actual_n=4
         - Expected: effective_ucl = 100 + 3*(10/2) = 115
         - Expected: effective_lcl = 100 - 3*(10/2) = 85
       - test_mode_c_uses_nominal_limits():
         - Verify existing UCL/LCL are used, no z_score computed

    3. Create test class `TestUndersizedFlagging`:
       - test_sample_flagged_as_undersized()
       - test_sample_not_flagged_when_at_threshold()
       - test_undersized_flag_persisted_to_database()

    Constraints:
    - Use existing test patterns and fixtures from the file
    - Mock repositories appropriately
    - Use pytest.mark.asyncio for async tests
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\backend
    python -m pytest tests/unit/test_spc_engine.py -v --collect-only 2>&1 | findstr /i "test_mode"
    ```
  </verify>
  <done>
    - TestSubgroupModeValidation class exists with validation tests
    - TestModeSpecificComputation class exists with computation tests
    - TestUndersizedFlagging class exists with flag tests
    - All tests are collected by pytest
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Rolling Window Mode Tests</name>
  <files>backend/tests/unit/test_rolling_window.py</files>
  <action>
    Add tests for mode-aware zone classification:

    1. Create test class `TestModeAwareClassification`:
       - test_mode_a_zone_c_upper(): z=0.5 -> ZONE_C_UPPER
       - test_mode_a_zone_b_upper(): z=1.5 -> ZONE_B_UPPER
       - test_mode_a_zone_a_upper(): z=2.5 -> ZONE_A_UPPER
       - test_mode_a_beyond_ucl(): z=3.5 -> BEYOND_UCL
       - test_mode_a_zone_c_lower(): z=-0.5 -> ZONE_C_LOWER
       - test_mode_a_beyond_lcl(): z=-3.5 -> BEYOND_LCL

       - test_mode_b_zone_with_variable_limits():
         - Given: value=112, effective_ucl=115, effective_lcl=85, center=100, sigma=10, n=4
         - sigma_xbar = 10/2 = 5
         - Boundaries: C(100-105), B(105-110), A(110-115)
         - 112 is in Zone A upper (between 110 and 115)

       - test_mode_c_uses_stored_boundaries():
         - Verify existing classify_value behavior unchanged

    2. Create test class `TestWindowSampleWithModeFields`:
       - test_window_sample_stores_actual_n()
       - test_window_sample_stores_is_undersized()
       - test_window_sample_stores_z_score_for_mode_a()
       - test_window_sample_stores_effective_limits_for_mode_b()

    Constraints:
    - Use existing RollingWindow fixture patterns
    - Test boundary conditions (exactly at zone boundaries)
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\backend
    python -m pytest tests/unit/test_rolling_window.py -v --collect-only 2>&1 | findstr /i "mode"
    ```
  </verify>
  <done>
    - TestModeAwareClassification tests all zone boundaries for Mode A
    - TestModeAwareClassification tests variable limit zones for Mode B
    - TestWindowSampleWithModeFields tests all new dataclass fields
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Control Limits Persistence Tests</name>
  <files>backend/tests/unit/test_control_limits.py</files>
  <action>
    Add tests for stored sigma and center_line persistence:

    1. Create test class `TestStoredParametersPersistence`:
       - test_recalculate_stores_sigma():
         - Call recalculate_and_persist
         - Verify characteristic.stored_sigma is set
       - test_recalculate_stores_center_line():
         - Call recalculate_and_persist
         - Verify characteristic.stored_center_line is set
       - test_stored_parameters_used_for_mode_a():
         - Set up characteristic with stored_sigma/center_line
         - Verify Mode A processing uses these values
       - test_mode_requires_stored_parameters():
         - Attempt Mode A processing without stored parameters
         - Verify ValueError is raised

    2. Create test class `TestModeSpecificLimitCalculation`:
       - test_mode_a_nominal_limits_calculated():
         - After recalculate, UCL/LCL should be based on nominal subgroup_size
       - test_mode_b_nominal_limits_calculated():
         - Similar to above for Mode B

    Constraints:
    - Use existing mock patterns from the file
    - Verify database commits occur
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\backend
    python -m pytest tests/unit/test_control_limits.py -v --collect-only 2>&1 | findstr /i "stored\|mode"
    ```
  </verify>
  <done>
    - TestStoredParametersPersistence tests sigma storage
    - TestStoredParametersPersistence tests center_line storage
    - TestModeSpecificLimitCalculation tests nominal limit calculation
    - All tests are collected by pytest
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] All new tests pass: `pytest tests/unit/ -v -k "mode or stored or undersized"`
- [ ] Test coverage for new code >= 80%
- [ ] Atomic commit created with message: "test(vssh-3): add unit tests for variable subgroup handling"
- [ ] SUMMARY.md updated with Plan 3 completion status
