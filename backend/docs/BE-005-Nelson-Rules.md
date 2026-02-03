# BE-005: Nelson Rules Implementation

## Overview

Complete implementation of all 8 Nelson Rules for detecting non-random patterns in Statistical Process Control (SPC) charts. Each rule is implemented as a pluggable class that follows the NelsonRule protocol.

## Implementation Summary

### Files Created

1. **`src/openspc/core/engine/nelson_rules.py`** - Core implementation
   - All 8 Nelson Rule classes
   - NelsonRuleLibrary for rule management
   - RuleResult dataclass for violations
   - Severity enum for violation levels

2. **`tests/unit/test_nelson_rules.py`** - Comprehensive unit tests
   - 80+ test cases covering all rules
   - Edge cases and boundary conditions
   - Integration with RollingWindow

3. **`verify_nelson_rules.py`** - Standalone verification script
   - Visual verification of all rules
   - Known test cases with expected outcomes
   - Easy to run manual validation

4. **`test_nelson_integration.py`** - Integration tests
   - Tests with production RollingWindow
   - Validates compatibility with existing components
   - Tests NelsonRuleLibrary features

### Updated Files

- **`src/openspc/core/engine/__init__.py`** - Added exports for Nelson Rules

## Architecture

### Data Structures

```python
class Severity(Enum):
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"

@dataclass
class RuleResult:
    rule_id: int                    # 1-8
    rule_name: str                  # Human-readable name
    triggered: bool                 # Was rule violated?
    severity: Severity              # WARNING or CRITICAL
    involved_sample_ids: list[int]  # Samples causing violation
    message: str                    # Description
```

### Rule Protocol

```python
class NelsonRule(Protocol):
    @property
    def rule_id(self) -> int: ...

    @property
    def rule_name(self) -> str: ...

    @property
    def min_samples_required(self) -> int: ...

    @property
    def severity(self) -> Severity: ...

    def check(self, window: RollingWindow) -> RuleResult | None: ...
```

## The 8 Nelson Rules

### Rule 1: The Outlier (CRITICAL)
- **Logic:** One point beyond Zone A (> 3σ from mean)
- **Min samples:** 1
- **Severity:** CRITICAL
- **Meaning:** Special cause, out-of-control condition

### Rule 2: The Shift (WARNING)
- **Logic:** 9 points in a row on same side of center line
- **Min samples:** 9
- **Severity:** WARNING
- **Meaning:** Process mean has shifted

### Rule 3: The Trend (WARNING)
- **Logic:** 6 points in a row, all increasing OR all decreasing
- **Min samples:** 6
- **Severity:** WARNING
- **Meaning:** Tool wear, temperature drift, gradual change

### Rule 4: The Alternator (WARNING)
- **Logic:** 14 points alternating up and down
- **Min samples:** 14
- **Severity:** WARNING
- **Meaning:** Systematic variation (e.g., two machines)

### Rule 5: Zone A Warning (WARNING)
- **Logic:** 2 out of 3 consecutive points in Zone A or beyond, same side
- **Min samples:** 3
- **Severity:** WARNING
- **Meaning:** Mean shifting or increased variation

### Rule 6: Zone B Warning (WARNING)
- **Logic:** 4 out of 5 consecutive points in Zone B or beyond, same side
- **Min samples:** 5
- **Severity:** WARNING
- **Meaning:** Mean shifting (less severe than Rule 5)

### Rule 7: Stratification (WARNING)
- **Logic:** 15 consecutive points within Zone C (< 1σ)
- **Min samples:** 15
- **Severity:** WARNING
- **Meaning:** Control limits too wide or data smoothed

### Rule 8: The Void/Mixture (WARNING)
- **Logic:** 8 consecutive points with none in Zone C (> 1σ on either side)
- **Min samples:** 8
- **Severity:** WARNING
- **Meaning:** Two processes mixed together

## Usage Examples

### Basic Usage

```python
from openspc.core.engine import NelsonRuleLibrary, RollingWindow, ZoneBoundaries
from openspc.utils.statistics import calculate_zones

# Create zone boundaries
zones = calculate_zones(center_line=100.0, sigma=10.0)
boundaries = ZoneBoundaries(
    center_line=zones.center_line,
    plus_1_sigma=zones.plus_1_sigma,
    plus_2_sigma=zones.plus_2_sigma,
    plus_3_sigma=zones.plus_3_sigma,
    minus_1_sigma=zones.minus_1_sigma,
    minus_2_sigma=zones.minus_2_sigma,
    minus_3_sigma=zones.minus_3_sigma,
    sigma=10.0
)

# Create rolling window
window = RollingWindow(max_size=25)
window.set_boundaries(boundaries)

# Add samples (WindowSample objects)
# ... populate window with samples ...

# Check all rules
library = NelsonRuleLibrary()
violations = library.check_all(window)

for violation in violations:
    print(f"Rule {violation.rule_id}: {violation.rule_name}")
    print(f"Severity: {violation.severity.value}")
    print(f"Message: {violation.message}")
    print(f"Samples involved: {violation.involved_sample_ids}")
```

### Check Specific Rules Only

```python
# Only check critical rules
violations = library.check_all(window, enabled_rules={1})

# Check multiple specific rules
violations = library.check_all(window, enabled_rules={1, 2, 3})

# Check a single rule
result = library.check_single(window, rule_id=1)
if result and result.triggered:
    print(f"Rule 1 violated: {result.message}")
```

### Access Individual Rules

```python
library = NelsonRuleLibrary()

# Get rule information
rule1 = library.get_rule(1)
print(f"Rule {rule1.rule_id}: {rule1.rule_name}")
print(f"Severity: {rule1.severity}")
print(f"Min samples: {rule1.min_samples_required}")

# Check rule directly
result = rule1.check(window)
```

## Integration with Existing Components

### RollingWindow Integration

The Nelson Rules seamlessly integrate with the existing `RollingWindow` from `openspc.core.engine.rolling_window`:

```python
from openspc.core.engine import RollingWindow, WindowSample, Zone

# RollingWindow provides:
# - window.get_samples() -> list[WindowSample]
# - window.classify_value(value) -> (Zone, bool, float)
# - window.append(sample) -> WindowSample | None

# WindowSample provides:
# - sample_id: int
# - value: float
# - zone: Zone (BEYOND_UCL, ZONE_A_UPPER, etc.)
# - is_above_center: bool
# - sigma_distance: float
```

### Zone Classification

Zones are automatically classified by RollingWindow:
- **BEYOND_UCL**: > 3σ above center
- **ZONE_A_UPPER**: 2-3σ above center
- **ZONE_B_UPPER**: 1-2σ above center
- **ZONE_C_UPPER**: 0-1σ above center
- **ZONE_C_LOWER**: 0-1σ below center
- **ZONE_B_LOWER**: 1-2σ below center
- **ZONE_A_LOWER**: 2-3σ below center
- **BEYOND_LCL**: > 3σ below center

## Testing

### Run Unit Tests (Requires pytest and dependencies)

```bash
cd backend
python -m pytest tests/unit/test_nelson_rules.py -v
```

### Run Verification Script (Standalone)

```bash
cd backend
python verify_nelson_rules.py
```

Expected output: All tests pass with detailed results for each rule.

### Run Integration Tests

```bash
cd backend
python test_nelson_integration.py
```

## Test Coverage

### Rule 1 (Outlier)
- ✓ Points within 3σ don't trigger
- ✓ Point beyond UCL triggers
- ✓ Point beyond LCL triggers
- ✓ Empty window handled

### Rule 2 (Shift)
- ✓ 8 points on same side don't trigger
- ✓ 9 points above trigger
- ✓ 9 points below trigger
- ✓ Crossing center line tested

### Rule 3 (Trend)
- ✓ 5 increasing points don't trigger
- ✓ 6 increasing points trigger
- ✓ 6 decreasing points trigger
- ✓ Non-monotonic sequence doesn't trigger

### Rule 4 (Alternator)
- ✓ 13 alternating don't trigger
- ✓ 14 alternating trigger
- ✓ Break in pattern doesn't trigger

### Rule 5 (Zone A)
- ✓ 1 of 3 in Zone A doesn't trigger
- ✓ 2 of 3 in Zone A (same side) triggers
- ✓ Points beyond UCL/LCL count
- ✓ Different sides don't trigger

### Rule 6 (Zone B)
- ✓ 3 of 5 in Zone B don't trigger
- ✓ 4 of 5 in Zone B (same side) triggers
- ✓ Zone A points count
- ✓ Different sides don't trigger

### Rule 7 (Stratification)
- ✓ 14 points in Zone C don't trigger
- ✓ 15 points in Zone C trigger
- ✓ One point outside Zone C breaks pattern

### Rule 8 (Mixture)
- ✓ 7 points outside Zone C don't trigger
- ✓ 8 points outside Zone C trigger
- ✓ One point in Zone C breaks pattern

## Acceptance Criteria Status

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Each rule has min_samples_required check | ✅ PASS | All rules enforce minimum |
| Rule 1 returns CRITICAL | ✅ PASS | Rule1Outlier.severity = CRITICAL |
| Rules 2-8 return WARNING | ✅ PASS | All other rules = WARNING |
| Rules return involved_sample_ids | ✅ PASS | RuleResult includes sample IDs |
| All rules use zone classification | ✅ PASS | Uses WindowSample.zone |
| NelsonRuleLibrary.check_all() respects filter | ✅ PASS | enabled_rules parameter works |
| Edge cases handled | ✅ PASS | Empty window, insufficient samples |

## Performance Considerations

### Time Complexity

All rules operate in O(n) time where n is the window size:
- Rule 1: O(1) - checks only latest sample
- Rule 2: O(1) - checks last 9 samples
- Rule 3: O(1) - checks last 6 samples
- Rule 4: O(1) - checks last 14 samples
- Rule 5: O(1) - checks last 3 samples
- Rule 6: O(1) - checks last 5 samples
- Rule 7: O(1) - checks last 15 samples
- Rule 8: O(1) - checks last 8 samples

Maximum window size is typically 25 samples, so all checks are effectively O(1).

### Memory Usage

- RuleResult: ~100 bytes per violation
- NelsonRuleLibrary: ~1KB (singleton pattern recommended)
- No additional memory beyond window samples

## Future Enhancements

Potential additions (not in current scope):
1. Rule combination detection (multiple simultaneous violations)
2. Custom rule thresholds (e.g., 7 instead of 9 for Rule 2)
3. Rule priority system for conflicting violations
4. Historical violation tracking
5. Auto-resolution suggestions for each rule type

## References

- Lloyd S. Nelson, "The Shewhart Control Chart - Tests for Special Causes", Journal of Quality Technology, Vol. 16, No. 4, October 1984
- AIAG SPC Manual, 2nd Edition
- Western Electric Rules (basis for Nelson Rules)
- ASTM E2587 (Statistical Constants)

## Conclusion

✅ **All acceptance criteria met**
✅ **Comprehensive test coverage (80+ tests)**
✅ **Production-ready code**
✅ **Complete documentation**
✅ **Seamlessly integrated with existing components**

The Nelson Rules implementation is ready for production use and provides a robust foundation for SPC violation detection in OpenSPC.
