---
type: feature
status: active
tags:
  - architecture
  - active
---

# Design System

Cassini's frontend uses Tailwind CSS v4 with semantic theme tokens, two visual styles, and factory-floor accessibility considerations.

## Visual Styles

Two independent visual modes (orthogonal to light/dark):

- **Retro** (default): Sharp corners, monospace accents, industrial feel
- **Glass**: Frosted backgrounds, rounded corners, modern aesthetic

Light/dark mode is separate — any combination of visual style + color mode works.

## Color Tokens

> **Rule**: Always use semantic theme tokens (`text-success`, `bg-warning/10`, `text-chart-tertiary`). Never hardcode Tailwind palette colors (`emerald-*`, `amber-*`) or raw HSL values in JSX.

### Semantic Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| Primary | `blue-600` | `blue-500` | Actions, active states, links |
| Success | `green-600` | — | Valid inputs, in-control |
| Warning | `yellow-600` | — | Sample due, cautions |
| Error | `red-600` | — | Violations, OOC, errors |

### Chart Zone Colors

| Zone | Background | Border |
|------|------------|--------|
| +/-3 sigma (Critical) | `red-100/40` | `red-500` |
| +/-2 sigma (Warning) | `amber-100/40` | `amber-500` |
| +/-1 sigma (Normal) | `green-100/30` | `green-500` |
| Center line | — | `blue-600` |
| Spec limits (USL/LSL) | `red-100/20` | `red-600` |

### Data Point Colors

| State | Fill | Stroke |
|-------|------|--------|
| Normal | `blue-600` | `blue-700` |
| Warning | `amber-500` | `amber-600` |
| Violation | `red-500` | `red-600` |
| Selected | `violet-500` | `violet-600` |

### Dark Mode

Designed for factory environments with variable lighting. Key swaps: `gray-900` background, `gray-800` surface, `gray-100` text, `gray-700` borders.

## Typography

### Font Families

- **Sans**: Inter, system-ui, -apple-system, sans-serif
- **Mono**: JetBrains Mono, Fira Code, monospace (measurements, chart values)

### Scale

| Name | Size | Tailwind | Usage |
|------|------|----------|-------|
| Display | 36px | `text-4xl font-bold` | Page titles |
| H1 | 30px | `text-3xl font-semibold` | Section headers |
| H2 | 24px | `text-2xl font-semibold` | Card titles |
| H3 | 20px | `text-xl font-medium` | Subsection titles |
| Body | 16px | `text-base` | Default text |
| Small | 14px | `text-sm` | Secondary text |
| Caption | 12px | `text-xs` | Labels, timestamps |

Measurement displays use monospace at larger sizes (`text-5xl font-mono` for large inputs, `text-sm font-mono` for chart values).

## Spacing

4px base unit. Key patterns:

| Component | Padding | Gap |
|-----------|---------|-----|
| Button | `px-4 py-2` | — |
| Card | `p-4` or `p-6` | — |
| Modal | `p-6` | `gap-4` |
| Input | `px-3 py-2` | — |
| Chart container | `p-4` | — |

Dashboard layout: left panel 320px fixed (todo list), right panel flex-1 (chart), 24px gap.

## Borders & Shadows

- Border radius: `rounded-md` (buttons/inputs), `rounded-lg` (cards/modals), `rounded-xl` (large panels)
- Default border: `border border-gray-200`
- Focus: `focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2`
- Card shadow: `shadow` (default), `shadow-md` (modals), `shadow-lg` (floating)

## Component Conventions

- Function components with named exports, one per file
- Icons: Lucide React
- Custom hooks in `hooks/`, React Query hooks in `api/hooks/`
- Imports use `@/` alias, never relative paths crossing directories
- `localStorage` keys use `cassini-` prefix
- Characteristic names are not unique — always show hierarchy breadcrumb path

### Key Custom Components

| Component | Purpose |
|-----------|---------|
| TodoCard | Status-colored measurement card on dashboard |
| ControlChart / AttributeChart | ECharts-based SPC charts |
| HierarchyTree | ISA-95 tree navigator |
| MeasurementInput | Large numeric input for data entry |
| ExplanationPanel | Show Your Work slide-out (KaTeX formulas) |
| SignatureDialog | 21 CFR Part 11 e-signature modal |
| AnomalyOverlay | ECharts markPoint/markArea for ML detections |

## Animation

- Violation pulse: 1.5s scale/opacity cycle on OOC points
- Toast slide: 300ms ease-out from right
- Standard transitions: 150ms (hover), 200ms (default), 300ms (modals)

## Accessibility

- WCAG 2.1 AA contrast ratios (4.5:1 normal text, 3:1 large/UI)
- Minimum 44x44px touch targets (factory floor tablet use)
- `aria-live` regions for status changes
- `aria-describedby` for chart summaries

## Related Notes

- [[System Overview]] — Architecture context
