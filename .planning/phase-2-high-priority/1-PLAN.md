---
phase: 2-high-priority
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - frontend/src/components/HelpTooltip.tsx
  - frontend/src/lib/help-content.ts
autonomous: true
must_haves:
  truths:
    - "User sees '?' help icons next to labels"
    - "Hovering/clicking help icon shows tooltip with title, description, details"
    - "Help content for all 8 Nelson rules is available"
  artifacts:
    - "frontend/src/components/HelpTooltip.tsx exists with HelpTooltip component"
    - "frontend/src/lib/help-content.ts exists with typed helpContent registry"
    - "TypeScript compiles without errors"
  key_links:
    - "HelpTooltip uses helpContent registry via helpKey prop"
    - "Component uses Tailwind for styling with Sepasoft brand colors"
---

# Phase 2 High Priority - Plan 1: Help Tooltip Framework

## Objective

Create a reusable HelpTooltip component with a content registry containing contextual help for Nelson rules, statistical terms, and SPC concepts.

## Tasks

<task type="auto">
  <name>Task 1: Create help content registry</name>
  <files>frontend/src/lib/help-content.ts</files>
  <action>
    Create the help content TypeScript module:

    1. Define `HelpContent` interface with fields:
       - `title: string` (required)
       - `description: string` (required)
       - `details?: string` (optional longer explanation)
       - `severity?: 'CRITICAL' | 'WARNING' | 'INFO'` (for rule severity)
       - `learnMoreUrl?: string` (optional external link)

    2. Create `helpContent` constant as `Record<string, HelpContent>` with entries:

       Nelson Rules (nelson-rule-1 through nelson-rule-8):
       - Rule 1: "One point beyond 3 sigma" - CRITICAL
       - Rule 2: "9 consecutive points on same side of center line" - WARNING
       - Rule 3: "6 consecutive points increasing or decreasing" - WARNING
       - Rule 4: "14 consecutive points alternating up and down" - WARNING
       - Rule 5: "2 of 3 consecutive points in Zone A or beyond" - WARNING
       - Rule 6: "4 of 5 consecutive points in Zone B or beyond" - WARNING
       - Rule 7: "15 consecutive points in Zone C" - INFO
       - Rule 8: "8 consecutive points outside Zone C" - WARNING

       Statistical terms:
       - ucl-explanation: "Upper Control Limit"
       - lcl-explanation: "Lower Control Limit"
       - center-line: "Process center (mean of subgroup means)"
       - sigma-estimation: "Standard deviation estimation methods"

       Subgroup modes:
       - subgroup-mode-nominal: "Nominal with Tolerance mode"
       - subgroup-mode-variable: "Variable Control Limits mode"
       - subgroup-mode-standardized: "Standardized (Z-Score) mode"

       Zone definitions:
       - zone-a: "Zone A (2-3 sigma from center)"
       - zone-b: "Zone B (1-2 sigma from center)"
       - zone-c: "Zone C (within 1 sigma of center)"

    3. Export `HelpContent` type and `helpContent` registry

    Constraints:
    - Use descriptive, SPC-accurate content
    - Keep descriptions concise (1-2 sentences)
    - Include practical "when this happens" explanations in details
    - Follow existing TypeScript patterns in the codebase
  </action>
  <verify>
    ```powershell
    # File exists
    Test-Path "frontend/src/lib/help-content.ts"

    # Contains required exports
    Select-String -Path "frontend/src/lib/help-content.ts" -Pattern "export.*HelpContent"
    Select-String -Path "frontend/src/lib/help-content.ts" -Pattern "export.*helpContent"

    # Contains Nelson rules
    Select-String -Path "frontend/src/lib/help-content.ts" -Pattern "nelson-rule-1"
    ```
  </verify>
  <done>
    - File exists at frontend/src/lib/help-content.ts
    - Exports HelpContent interface
    - Exports helpContent registry with 20+ entries
    - All 8 Nelson rules have content
  </done>
</task>

<task type="auto">
  <name>Task 2: Create HelpTooltip component</name>
  <files>frontend/src/components/HelpTooltip.tsx</files>
  <action>
    Create the HelpTooltip React component:

    1. Define props interface:
       ```typescript
       interface HelpTooltipProps {
         helpKey: string          // Key to look up in helpContent
         placement?: 'top' | 'bottom' | 'left' | 'right'  // Default: 'top'
         children?: ReactNode     // Optional custom trigger (defaults to "?" icon)
         className?: string       // Additional classes for trigger
       }
       ```

    2. Implement component:
       - Import `helpContent` from `@/lib/help-content`
       - Look up content by `helpKey`
       - If key not found, show fallback "Help not available" message
       - Default trigger: HelpCircle icon from lucide-react (16x16, muted color)
       - Use native HTML tooltip approach with positioned div (no external lib needed)

    3. Tooltip content structure:
       ```tsx
       <div className="tooltip-content">
         <div className="font-semibold">{content.title}</div>
         <p className="text-sm text-muted-foreground">{content.description}</p>
         {content.details && (
           <p className="text-xs text-muted-foreground mt-2">{content.details}</p>
         )}
         {content.severity && (
           <span className="severity-badge">{content.severity}</span>
         )}
       </div>
       ```

    4. Styling:
       - Trigger: inline-flex, cursor-help, hover:text-primary transition
       - Tooltip: absolute positioned, z-50, bg-popover, border, shadow-lg, rounded-lg
       - Max width: 280px for readability
       - Use Sepasoft color variables

    5. Interaction:
       - Show on hover (desktop) with 200ms delay
       - Show on click (mobile/touch support)
       - Hide when mouse leaves or click elsewhere

    Constraints:
    - Do not use external tooltip library (keep bundle small)
    - Use existing Tailwind classes and CSS variables
    - Follow existing component patterns in codebase
    - Support both controlled and uncontrolled usage
  </action>
  <verify>
    ```powershell
    # File exists
    Test-Path "frontend/src/components/HelpTooltip.tsx"

    # Contains component export
    Select-String -Path "frontend/src/components/HelpTooltip.tsx" -Pattern "export.*HelpTooltip"

    # Imports help content
    Select-String -Path "frontend/src/components/HelpTooltip.tsx" -Pattern "import.*helpContent"

    # TypeScript compile check
    cd frontend && npx tsc --noEmit src/components/HelpTooltip.tsx 2>&1 | Select-String -Pattern "error" -NotMatch
    ```
  </verify>
  <done>
    - File exists at frontend/src/components/HelpTooltip.tsx
    - Exports HelpTooltip component
    - Renders help icon trigger by default
    - Shows tooltip with content from registry
    - Supports placement prop
    - Uses Sepasoft brand styling
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] TypeScript compiles without errors
- [ ] HelpTooltip component is importable and usable
- [ ] Atomic commit created with message: "feat: add help tooltip framework with content registry"
- [ ] SUMMARY.md updated
