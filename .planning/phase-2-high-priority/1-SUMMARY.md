---
plan: 1
completed: 2026-02-04T00:00:00Z
commit: pending
tasks_completed: 2
verification: passed
---

# Plan 1 Summary: Help Tooltip Framework

## Tasks Completed
- [x] Task 1: Create help content registry
- [x] Task 2: Create HelpTooltip component

## Artifacts Created
- `frontend/src/lib/help-content.ts` - Help content registry with HelpContent interface
- `frontend/src/components/HelpTooltip.tsx` - Reusable tooltip component

## Implementation Details

### help-content.ts
- Defines `HelpContent` interface with title, description, details, severity, learnMoreUrl
- Exports `helpContent` registry with 20+ entries:
  - 8 Nelson rules (nelson-rule-1 through nelson-rule-8)
  - 4 statistical terms (ucl, lcl, center-line, sigma)
  - 3 subgroup modes
  - 3 zone definitions
  - 1 overview entry (nelson-rules-overview)
- Exports `getHelpContent()` helper with fallback

### HelpTooltip.tsx
- Props: helpKey, placement (top/bottom/left/right), children, className
- Features:
  - Hover (200ms delay) and click triggers
  - Auto-positioning with viewport bounds checking
  - Severity badge display
  - Keyboard (Escape) and click-outside dismissal
  - Accessible with ARIA attributes
- Uses Sepasoft brand colors via Tailwind CSS variables

## Verification Results
- TypeScript compiles without errors
- Files exist at expected paths
- Component is importable and usable

## Commit
`pending` - feat: add help tooltip framework with content registry
