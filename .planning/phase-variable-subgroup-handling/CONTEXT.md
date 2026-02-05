# Phase: Variable Subgroup Size Handling - Context

## Phase Overview
Implement flexible subgroup size handling in OpenSPC with three selectable modes:
- **Mode A: Standardized (Z-Score)** - Plot normalized Z-scores with fixed +/-3 control limits
- **Mode B: Variable Control Limits** - Recalculate UCL/LCL per point based on actual sample size
- **Mode C: Nominal with Tolerance (Default)** - Use nominal subgroup size with minimum threshold enforcement

## Source Design Document
`.company/artifacts/architect/variable-subgroup-design.md`

## Dependencies
- Existing SPC engine infrastructure
- Database schema must be extended via Alembic migration
- Frontend must support mode-aware chart rendering

## Success Criteria

### Truths (Observable Behaviors)
1. User can configure a characteristic with one of three subgroup handling modes
2. User can set minimum measurements required (1 to subgroup_size)
3. User can set warning threshold for undersized samples
4. System accepts samples with fewer measurements than nominal subgroup size (respecting minimum)
5. Control chart displays mode-appropriate visualization (Z-scores or actual values with variable limits)
6. Undersized samples are visually indicated on the chart
7. Mode A displays fixed +/-3 control limits with Z-score Y-axis
8. Mode B displays funnel-shaped variable control limits

### Artifacts (Required Files)
1. Database migration for new columns
2. Updated Characteristic and Sample models
3. Updated API schemas (request/response)
4. Mode-aware SPC engine processing
5. Updated frontend types and components
6. Comprehensive unit tests for all three modes

### Key Links (Critical Connections)
- CharacteristicCreate schema -> Characteristic model -> SPC Engine validation
- Sample submission -> Mode-aware statistics calculation -> WindowSample
- ChartDataResponse -> ControlChart component rendering

## Constraints
- Default mode must be NOMINAL_TOLERANCE for backward compatibility
- Mode A and B require stored_sigma and stored_center_line (from recalculate-limits)
- API changes must be additive (non-breaking)
- Maintain existing test coverage while adding mode-specific tests
