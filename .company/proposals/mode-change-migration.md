# Proposal: Subgroup Mode Change with Historical Sample Migration

## Problem Statement

Currently, when a user changes the `subgroup_mode` on a characteristic that already has samples, the historical samples may display incorrectly because they lack the computed values for the new mode:

| Mode Change | Missing Data on Historical Samples |
|-------------|-----------------------------------|
| NOMINAL_TOLERANCE → STANDARDIZED | `z_score` not computed |
| NOMINAL_TOLERANCE → VARIABLE_LIMITS | `effective_ucl`, `effective_lcl` not computed |
| STANDARDIZED → VARIABLE_LIMITS | `effective_ucl`, `effective_lcl` not computed |
| VARIABLE_LIMITS → STANDARDIZED | `z_score` not computed |

This leads to charts showing incomplete data or missing points.

## Proposed Solution

**Allow mode changes with automatic recalculation of historical samples.**

### Implementation Overview

1. **New API endpoint**: `POST /api/v1/characteristics/{id}/change-mode`
   - Accepts: `{ "new_mode": "STANDARDIZED" | "VARIABLE_LIMITS" | "NOMINAL_TOLERANCE" }`
   - Validates `stored_sigma` and `stored_center_line` exist for Mode A/B
   - Batch-updates all existing samples with new computed values

2. **Sample recalculation logic**:
   ```python
   for sample in characteristic.samples:
       if new_mode == "STANDARDIZED":
           sample.z_score = (sample.mean - stored_center_line) / (stored_sigma / sqrt(sample.actual_n))
       elif new_mode == "VARIABLE_LIMITS":
           factor = stored_sigma / sqrt(sample.actual_n)
           sample.effective_ucl = stored_center_line + 3 * factor
           sample.effective_lcl = stored_center_line - 3 * factor
       # NOMINAL_TOLERANCE needs no per-sample computation
   ```

3. **Frontend UX**:
   - Show confirmation dialog when changing mode
   - Display progress indicator during migration
   - Toast notification on completion

### Acceptance Criteria

- [ ] Mode dropdown triggers confirmation dialog when samples exist
- [ ] API endpoint validates prerequisites (stored_sigma for Mode A/B)
- [ ] All historical samples are recalculated in a single transaction
- [ ] Chart correctly displays historical data after mode change
- [ ] Rollback on failure (atomic transaction)

### Estimated Scope

- Backend: 1 new endpoint, ~50 lines
- Frontend: Modal component, ~30 lines
- Tests: 5-8 new test cases

## Alternatives Considered

1. **Block mode changes** - Simpler but limits flexibility
2. **Lazy recalculation** - Compute on read instead of write (adds chart latency)

## Decision Needed

Approve this approach for implementation in the next phase?
