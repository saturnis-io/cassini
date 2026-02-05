---
phase: 2-medium-priority
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/index.css
  - frontend/src/components/ControlChart.tsx
autonomous: true
must_haves:
  truths:
    - "Chart data line displays with smooth gradient from blue to teal"
    - "Violation points display as diamond shapes with glow effect"
    - "Undersized sample points display as triangle shapes"
    - "Normal points display as circles"
  artifacts:
    - "frontend/src/index.css contains chart-specific CSS variables"
    - "frontend/src/components/ControlChart.tsx contains SVG gradient definitions"
    - "TypeScript compiles without errors"
  key_links:
    - "ControlChart uses CSS variables from index.css via hsl(var(--...)) pattern"
    - "Gradient IDs referenced correctly in Line stroke attribute"
---

# Phase 2 Medium Priority - Plan 1: Chart Styling Foundation

## Objective
Enhance the ControlChart component with gradient data lines and improved point markers for better visual differentiation of sample states.

## Tasks

<task type="auto">
  <name>Task 1: Add Chart CSS Variables</name>
  <files>frontend/src/index.css</files>
  <action>
    Add chart-specific CSS variables to the @theme block in index.css:

    After the existing chart colors section (around line 60), add:
    ```css
    /* Chart styling variables */
    --chart-line-width: 2.5;
    --chart-point-radius: 4;
    --chart-point-radius-violation: 6;
    --chart-point-radius-undersized: 5;
    --chart-zone-opacity: 0.15;
    --chart-center-line-width: 2.5;
    --chart-limit-line-width: 1.5;
    --chart-line-gradient-start: hsl(212 100% 35%);
    --chart-line-gradient-end: hsl(179 50% 55%);
    ```

    Also add a new CSS class for point glow effect after the violation-pulse animation:
    ```css
    /* Chart point glow effect for violations */
    .point-glow-violation {
      filter: drop-shadow(0 0 4px hsl(357 80% 52% / 0.6));
    }

    /* Chart entry animation for new points */
    @keyframes point-enter {
      0% {
        opacity: 0;
        transform: scale(0.5);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }

    .point-enter {
      animation: point-enter 300ms ease-out;
    }
    ```

    Constraints:
    - Preserve all existing styles
    - Use HSL format consistent with existing color variables
    - Place new variables logically grouped with chart colors
  </action>
  <verify>
    ```powershell
    # Check that variables exist in file
    Select-String -Path "frontend/src/index.css" -Pattern "--chart-line-width"
    Select-String -Path "frontend/src/index.css" -Pattern "--chart-line-gradient-start"
    Select-String -Path "frontend/src/index.css" -Pattern "point-glow-violation"
    ```
  </verify>
  <done>
    - Chart CSS variables added to @theme block
    - Point glow class defined
    - Entry animation keyframes defined
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Gradient Definitions to ControlChart</name>
  <files>frontend/src/components/ControlChart.tsx</files>
  <action>
    Modify ControlChart.tsx to add SVG gradient definitions and apply to the data line.

    1. Inside the ComposedChart component, add a `<defs>` block as the first child:
    ```tsx
    <ComposedChart data={data} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
      {/* Gradient definitions */}
      <defs>
        <linearGradient id="chartLineGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(212 100% 35%)" />
          <stop offset="100%" stopColor="hsl(179 50% 55%)" />
        </linearGradient>
        <filter id="violationGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <CartesianGrid ... />
    ```

    2. Update the Line component to use the gradient:
    Change `stroke="hsl(var(--primary))"` to `stroke="url(#chartLineGradient)"`

    3. Update the center line ReferenceLine to be thicker:
    Add `strokeWidth={2.5}` to the center line ReferenceLine

    Constraints:
    - Maintain all existing functionality
    - Keep both Mode A and Mode B/C support
    - Preserve existing dot rendering logic (will be enhanced in next task)
  </action>
  <verify>
    ```powershell
    # Check gradient definition exists
    Select-String -Path "frontend/src/components/ControlChart.tsx" -Pattern "chartLineGradient"
    # Check gradient is used
    Select-String -Path "frontend/src/components/ControlChart.tsx" -Pattern 'stroke="url\(#chartLineGradient\)"'
    # TypeScript check
    cd C:/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - SVG gradient definition added to ComposedChart
    - Line component uses gradient stroke
    - Violation glow filter defined
    - TypeScript compiles successfully
  </done>
</task>

<task type="auto">
  <name>Task 3: Implement Enhanced Point Markers</name>
  <files>frontend/src/components/ControlChart.tsx</files>
  <action>
    Enhance the dot rendering function to use different shapes based on point state.

    Replace the current dot function with an enhanced version that renders:
    - **Diamond** for violation points (rotated square)
    - **Triangle** for undersized samples
    - **Circle** for normal points (current behavior)

    Update the dot prop in the Line component:
    ```tsx
    dot={({ cx, cy, payload }) => {
      const isViolation = payload.hasViolation
      const isUndersized = payload.is_undersized
      const isExcluded = payload.excluded

      // Determine fill color
      const fillColor = isExcluded
        ? 'hsl(var(--muted))'
        : isViolation
          ? 'hsl(var(--destructive))'
          : 'hsl(var(--primary))'

      // Base radius
      const baseRadius = isViolation ? 6 : isUndersized ? 5 : 4

      return (
        <g key={payload.index}>
          {isViolation ? (
            // Diamond shape for violations
            <path
              d={`M ${cx} ${cy - baseRadius} L ${cx + baseRadius} ${cy} L ${cx} ${cy + baseRadius} L ${cx - baseRadius} ${cy} Z`}
              fill={fillColor}
              filter="url(#violationGlow)"
              className="violation-pulse"
            />
          ) : isUndersized ? (
            // Triangle shape for undersized
            <path
              d={`M ${cx} ${cy - baseRadius} L ${cx + baseRadius} ${cy + baseRadius * 0.7} L ${cx - baseRadius} ${cy + baseRadius * 0.7} Z`}
              fill={fillColor}
              stroke="hsl(var(--warning))"
              strokeWidth={1.5}
            />
          ) : (
            // Circle for normal points
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius}
              fill={fillColor}
            />
          )}
          {/* Undersized indicator ring (additional for non-undersized shape) */}
          {isUndersized && !isViolation && (
            <circle
              cx={cx}
              cy={cy}
              r={baseRadius + 3}
              fill="none"
              stroke="hsl(var(--warning))"
              strokeWidth={1.5}
              strokeDasharray="2 2"
            />
          )}
        </g>
      )
    }}
    ```

    Constraints:
    - Remove the old undersized ring that was around circles
    - Maintain tooltip/activeDot functionality
    - Keep existing color scheme (destructive for violation, warning for undersized)
  </action>
  <verify>
    ```powershell
    # Check diamond path exists for violations
    Select-String -Path "frontend/src/components/ControlChart.tsx" -Pattern "Diamond shape for violations"
    # Check triangle path exists for undersized
    Select-String -Path "frontend/src/components/ControlChart.tsx" -Pattern "Triangle shape for undersized"
    # TypeScript check
    cd C:/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit
    ```
  </verify>
  <done>
    - Violation points render as diamonds with glow
    - Undersized points render as triangles with warning stroke
    - Normal points render as circles
    - TypeScript compiles successfully
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Chart displays gradient line from blue to teal
- [ ] Point shapes differentiate sample states visually
- [ ] Atomic commit created
- [ ] SUMMARY.md updated
