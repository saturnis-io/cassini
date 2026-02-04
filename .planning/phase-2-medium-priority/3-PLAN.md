---
phase: 2-medium-priority
plan: 3
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - frontend/src/index.css
  - frontend/src/components/ControlChart.tsx
autonomous: true
must_haves:
  truths:
    - "Zone backgrounds display subtle vertical gradient fades"
    - "Control limit lines (UCL/LCL) have subtle glow in dark mode"
    - "Center line is visually prominent with increased stroke width"
    - "Chart styling looks polished in both light and dark themes"
  artifacts:
    - "frontend/src/index.css contains zone gradient variables"
    - "frontend/src/components/ControlChart.tsx contains zone gradient definitions"
    - "TypeScript compiles without errors"
  key_links:
    - "Zone gradients adapt to theme via CSS variables"
    - "Control line styling consistent across themes"
---

# Phase 2 Medium Priority - Plan 3: Chart Visual Polish

## Objective
Complete chart styling enhancements with zone gradient backgrounds, enhanced control lines, and ensure visual polish in both light and dark themes.

## Tasks

<task type="auto">
  <name>Task 1: Add Zone Gradient CSS Variables</name>
  <files>frontend/src/index.css</files>
  <action>
    Add zone gradient opacity variables to support gradient fades. Update both light and dark theme sections.

    In the @theme block, after the existing chart colors (around line 60), add:
    ```css
    /* Zone gradient styling */
    --chart-zone-gradient-opacity-top: 0.08;
    --chart-zone-gradient-opacity-bottom: 0.2;
    --chart-control-line-glow: 0 0 4px hsl(357 80% 52% / 0.3);
    --chart-center-line-glow: none;
    ```

    In the .dark section, add after the chart colors:
    ```css
    /* Dark mode zone gradients - slightly higher opacity for visibility */
    --chart-zone-gradient-opacity-top: 0.1;
    --chart-zone-gradient-opacity-bottom: 0.25;
    --chart-control-line-glow: 0 0 6px hsl(357 85% 60% / 0.4);
    --chart-center-line-glow: 0 0 4px hsl(212 100% 50% / 0.3);
    ```

    Also add updated chart gradient colors for dark mode (adjust if not already present):
    ```css
    /* Dark mode chart line gradient */
    --chart-line-gradient-start: hsl(212 100% 50%);
    --chart-line-gradient-end: hsl(179 55% 60%);
    ```

    Constraints:
    - Keep opacity values subtle to avoid visual clutter
    - Ensure zones remain distinguishable but not overwhelming
  </action>
  <verify>
    ```powershell
    # Check gradient opacity variables exist
    Select-String -Path "frontend/src/index.css" -Pattern "--chart-zone-gradient-opacity"
    Select-String -Path "frontend/src/index.css" -Pattern "--chart-control-line-glow"
    ```
  </verify>
  <done>
    - Zone gradient opacity variables added for light theme
    - Zone gradient opacity variables added for dark theme
    - Control line glow variables defined
  </done>
</task>

<task type="auto">
  <name>Task 2: Implement Zone Gradient Backgrounds</name>
  <files>frontend/src/components/ControlChart.tsx</files>
  <action>
    Update the zone ReferenceArea components to use vertical gradients instead of flat colors.

    1. Add zone gradient definitions in the `<defs>` block (extend the existing defs):
    ```tsx
    {/* Zone gradient definitions */}
    <linearGradient id="zoneGradientC" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="hsl(var(--zone-c))" stopOpacity="0.08" />
      <stop offset="50%" stopColor="hsl(var(--zone-c))" stopOpacity="0.18" />
      <stop offset="100%" stopColor="hsl(var(--zone-c))" stopOpacity="0.08" />
    </linearGradient>
    <linearGradient id="zoneGradientB" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="hsl(var(--zone-b))" stopOpacity="0.08" />
      <stop offset="50%" stopColor="hsl(var(--zone-b))" stopOpacity="0.18" />
      <stop offset="100%" stopColor="hsl(var(--zone-b))" stopOpacity="0.08" />
    </linearGradient>
    <linearGradient id="zoneGradientA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="hsl(var(--zone-a))" stopOpacity="0.08" />
      <stop offset="50%" stopColor="hsl(var(--zone-a))" stopOpacity="0.18" />
      <stop offset="100%" stopColor="hsl(var(--zone-a))" stopOpacity="0.08" />
    </linearGradient>
    ```

    2. Update the ReferenceArea components to use gradients:

    Replace existing ReferenceArea zone backgrounds:
    - Zone C (center, +/-1 sigma): `fill="url(#zoneGradientC)"` and remove `fillOpacity`
    - Zone B (+/-1 to +/-2 sigma): `fill="url(#zoneGradientB)"` and remove `fillOpacity`
    - Zone A (+/-2 to +/-3 sigma): `fill="url(#zoneGradientA)"` and remove `fillOpacity`

    Example for Zone C:
    ```tsx
    {zone_boundaries.plus_1_sigma && zone_boundaries.minus_1_sigma && (
      <ReferenceArea
        y1={zone_boundaries.minus_1_sigma}
        y2={zone_boundaries.plus_1_sigma}
        fill="url(#zoneGradientC)"
      />
    )}
    ```

    Constraints:
    - Remove fillOpacity from ReferenceArea (opacity is in gradient)
    - Keep all zone boundary logic intact
  </action>
  <verify>
    ```powershell
    # Check zone gradients are defined
    Select-String -Path "frontend/src/components/ControlChart.tsx" -Pattern "zoneGradientC"
    Select-String -Path "frontend/src/components/ControlChart.tsx" -Pattern "zoneGradientB"
    Select-String -Path "frontend/src/components/ControlChart.tsx" -Pattern "zoneGradientA"
    # Check gradients are used
    Select-String -Path "frontend/src/components/ControlChart.tsx" -Pattern 'fill="url\(#zoneGradient'
    # TypeScript check
    cd C:/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - Zone gradient definitions added to defs block
    - ReferenceArea components updated to use gradients
    - Zones display subtle vertical fade effect
  </done>
</task>

<task type="auto">
  <name>Task 3: Enhance Control Lines and Final Polish</name>
  <files>frontend/src/components/ControlChart.tsx</files>
  <action>
    Enhance the control lines (UCL, LCL, CL) with improved visual styling.

    1. Update the center line (CL) ReferenceLine to be more prominent:
    ```tsx
    {control_limits.center_line && (
      <ReferenceLine
        y={control_limits.center_line}
        stroke="hsl(var(--primary))"
        strokeWidth={2.5}
        label={{
          value: 'CL',
          position: 'right',
          fill: 'hsl(var(--primary))',
          fontSize: 12,
          fontWeight: 600,
        }}
      />
    )}
    ```

    2. Add filter definition for control line glow effect (in defs block):
    ```tsx
    <filter id="controlLineGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.5" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    ```

    3. Update UCL and LCL lines with subtle enhancements:
    ```tsx
    {control_limits.ucl && (
      <ReferenceLine
        y={control_limits.ucl}
        stroke="hsl(var(--destructive))"
        strokeDasharray="5 5"
        strokeWidth={1.5}
        label={{
          value: 'UCL',
          position: 'right',
          fill: 'hsl(var(--destructive))',
          fontSize: 12,
          fontWeight: 500,
        }}
      />
    )}
    {control_limits.lcl && (
      <ReferenceLine
        y={control_limits.lcl}
        stroke="hsl(var(--destructive))"
        strokeDasharray="5 5"
        strokeWidth={1.5}
        label={{
          value: 'LCL',
          position: 'right',
          fill: 'hsl(var(--destructive))',
          fontSize: 12,
          fontWeight: 500,
        }}
      />
    )}
    ```

    4. Similarly update Mode A lines (+/-3, +/-2, +/-1, 0) with consistent styling:
    - +/-3 sigma lines: strokeWidth={1.5}, fontWeight: 500
    - Center (0) line: strokeWidth={2.5}, fontWeight: 600
    - +/-2 and +/-1 sigma lines: keep as-is (lighter weight)

    Constraints:
    - Maintain Mode A and Mode B/C distinction
    - Keep label positions unchanged
    - Ensure control lines visible in both themes
  </action>
  <verify>
    ```powershell
    # Check center line has increased strokeWidth
    Select-String -Path "frontend/src/components/ControlChart.tsx" -Pattern "strokeWidth=\{2\.5\}"
    # Check fontWeight on labels
    Select-String -Path "frontend/src/components/ControlChart.tsx" -Pattern "fontWeight: 600"
    # TypeScript check
    cd C:/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - Center line is visually prominent with increased stroke
    - UCL/LCL have consistent styling
    - Control line glow filter defined
    - Label font weights adjusted for hierarchy
    - TypeScript compiles successfully
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Zone backgrounds show gradient fade effect
- [ ] Control lines have improved visual hierarchy
- [ ] Chart looks polished in light theme
- [ ] Chart looks polished in dark theme
- [ ] Atomic commit created
- [ ] SUMMARY.md updated

## Visual Verification Checklist

After implementation, manually verify:
- [ ] Zone C (green) has subtle gradient in center
- [ ] Zone B (yellow) has subtle gradient above/below Zone C
- [ ] Zone A (orange) has subtle gradient at edges
- [ ] Center line is thicker than limit lines
- [ ] Violation diamonds have glow effect
- [ ] Undersized triangles have warning stroke
- [ ] All elements visible in dark mode
- [ ] Gradient line flows from blue to teal
