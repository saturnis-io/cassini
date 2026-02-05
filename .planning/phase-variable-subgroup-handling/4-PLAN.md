---
phase: variable-subgroup-handling
plan: 4
type: execute
wave: 3
depends_on: [1, 2]
files_modified:
  - frontend/src/types/index.ts
  - frontend/src/components/CharacteristicForm.tsx
  - frontend/src/components/ControlChart.tsx
autonomous: true
must_haves:
  truths:
    - "User can select subgroup mode from dropdown in CharacteristicForm"
    - "User can configure min_measurements and warn_below_count"
    - "Control chart renders Z-scores for Mode A with fixed +/-3 limits"
    - "Control chart renders variable limit lines for Mode B (funnel effect)"
    - "Undersized samples are visually indicated with dashed ring"
    - "Tooltip shows actual_n and mode-specific information"
  artifacts:
    - "SubgroupMode type exists in frontend/src/types/index.ts"
    - "Characteristic interface includes all subgroup mode fields"
    - "ChartDataPoint interface includes display_value and mode fields"
    - "ControlChart component handles all three modes"
  key_links:
    - "CharacteristicForm uses SubgroupMode type for dropdown"
    - "ControlChart reads subgroup_mode from ChartData to determine rendering"
---

# Phase Variable Subgroup Handling - Plan 4: Frontend Implementation

## Objective
Implement the frontend UI for configuring subgroup modes and rendering mode-aware control charts, including visual indicators for undersized samples and variable control limits.

## Tasks

<task type="auto">
  <name>Task 1: Update Frontend Type Definitions</name>
  <files>frontend/src/types/index.ts</files>
  <action>
    Add type definitions for variable subgroup handling:

    1. Add SubgroupMode type:
       ```typescript
       export type SubgroupMode = 'STANDARDIZED' | 'VARIABLE_LIMITS' | 'NOMINAL_TOLERANCE'
       ```

    2. Update Characteristic interface - add after trigger_tag:
       ```typescript
       subgroup_mode: SubgroupMode
       min_measurements: number
       warn_below_count: number | null
       stored_sigma: number | null
       stored_center_line: number | null
       ```

    3. Update ChartDataPoint interface - add after zone:
       ```typescript
       actual_n: number
       is_undersized: boolean
       effective_ucl: number | null
       effective_lcl: number | null
       z_score: number | null
       display_value: number
       ```

    4. Update ChartData interface - add after characteristic_name:
       ```typescript
       subgroup_mode: SubgroupMode
       nominal_subgroup_size: number
       ```

    Constraints:
    - Maintain existing field order where possible
    - Use consistent naming with backend schemas
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\frontend
    npx tsc --noEmit src/types/index.ts 2>&1
    ```
  </verify>
  <done>
    - SubgroupMode type exported
    - Characteristic interface has subgroup mode fields
    - ChartDataPoint interface has mode-specific fields
    - ChartData interface has subgroup_mode and nominal_subgroup_size
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Subgroup Mode Configuration UI</name>
  <files>frontend/src/components/CharacteristicForm.tsx</files>
  <action>
    Add subgroup mode configuration section to CharacteristicForm:

    1. Add state for new form fields:
       ```typescript
       const [formData, setFormData] = useState({
         // ... existing fields
         subgroup_mode: 'NOMINAL_TOLERANCE' as SubgroupMode,
         min_measurements: 1,
         warn_below_count: null as number | null,
       })
       ```

    2. Add useEffect to populate from characteristic data

    3. Add new section "Subgroup Size Handling" after "Sampling Configuration":
       - Mode dropdown with three options and descriptions:
         - "Nominal with Tolerance (Default)" - Uses nominal subgroup size for limits
         - "Variable Control Limits" - Recalculates control limits per point
         - "Standardized (Z-Score)" - Plots Z-scores with fixed +/-3 limits
       - Minimum Measurements input (number, 1 to subgroup_size)
       - Warn Below input (number, min_measurements to subgroup_size)
       - Helper text explaining each option

    4. Add validation to handleSave:
       - min_measurements must be >= 1 and <= subgroup_size
       - warn_below_count must be >= min_measurements (if set)

    5. Update handleSave to include new fields in API call

    Constraints:
    - Use existing form styling patterns
    - Disable Mode A/B options if stored_sigma is null (with tooltip explaining why)
    - Show info message when changing to Mode A/B about needing to recalculate limits
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\frontend
    npx tsc --noEmit src/components/CharacteristicForm.tsx 2>&1
    ```
  </verify>
  <done>
    - Subgroup mode dropdown renders with three options
    - Min measurements and warn below inputs render
    - Form validation prevents invalid configurations
    - Mode A/B disabled when stored_sigma is null
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Implement Mode-Aware Control Chart Rendering</name>
  <files>frontend/src/components/ControlChart.tsx</files>
  <action>
    Update ControlChart for mode-aware rendering:

    1. Extract subgroup_mode from chartData:
       ```typescript
       const { control_limits, spec_limits, zone_boundaries, data_points, subgroup_mode } = chartData
       ```

    2. Update data preparation:
       - For Mode A: Use z_score (or display_value) as the plotted value
       - For Mode B/C: Use mean as the plotted value
       - Include actual_n and is_undersized in chart data

    3. Update Y-axis configuration:
       - Mode A: Fixed domain [-4, 4] for Z-scores, label "Z-Score"
       - Mode B/C: Dynamic domain based on values and limits

    4. Update control limit reference lines:
       - Mode A: Fixed lines at +3, +2, +1, 0, -1, -2, -3
       - Mode B: Render variable limit lines (create array of effective_ucl/lcl values)
       - Mode C: Current behavior (fixed UCL/LCL)

    5. For Mode B variable limits, add funnel effect:
       - Create SVG path or multiple line segments connecting effective_ucl points
       - Create SVG path connecting effective_lcl points
       - Use dashed stroke for variable limits

    6. Update dot rendering for undersized samples:
       - If is_undersized: Add dashed ring around the point (strokeDasharray="2 2")
       - Different stroke color for undersized indication

    7. Update Tooltip content:
       - Show actual_n: "n = {actual_n}"
       - Mode A: Show "Z-Score: {z_score.toFixed(3)}"
       - Mode B: Show "Effective UCL: {effective_ucl.toFixed(3)}"
       - Show "Undersized" warning if is_undersized

    8. Update chart title:
       - Mode A: "{name} - Z-Score Chart"
       - Mode B: "{name} - Variable Limits Chart"
       - Mode C: "{name} - X-Bar Chart"

    Constraints:
    - Maintain existing visual styling
    - Mode C should look identical to current implementation
    - Variable limits should be visually distinct from fixed limits
  </action>
  <verify>
    ```bash
    cd C:\Users\djbra\Projects\SPC-client\frontend
    npx tsc --noEmit src/components/ControlChart.tsx 2>&1
    ```
  </verify>
  <done>
    - Chart renders Z-scores for Mode A with fixed limits
    - Chart renders variable limit lines for Mode B
    - Undersized samples have visual indicator (dashed ring)
    - Tooltip shows actual_n and mode-specific info
    - Chart title reflects the mode
    - TypeScript compiles without errors
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Frontend builds without TypeScript errors: `npm run build`
- [ ] Visual inspection confirms:
  - [ ] Mode dropdown works in CharacteristicForm
  - [ ] Mode A chart shows Z-scores with fixed limits
  - [ ] Mode B chart shows funnel-shaped variable limits
  - [ ] Undersized samples have dashed ring indicator
- [ ] Atomic commit created with message: "feat(vssh-4): implement frontend subgroup mode UI and chart rendering"
- [ ] SUMMARY.md updated with Plan 4 completion status
