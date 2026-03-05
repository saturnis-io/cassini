# Chart Color Light/Dark Variants

**Date**: 2026-03-05
**Status**: Approved

## Problem

Chart color presets use static HSL values that don't adapt to light/dark mode. Style-matched presets (e-ink, blueprint, etc.) are tuned for light backgrounds and become unreadable in dark mode (e.g., dark grey data line on dark background).

The combinatorial explosion of 8 visual styles x 2 modes x 10 presets = 160 combinations makes it impractical to hand-tune every combination without mode awareness in the preset data model.

## Solution

Each chart color preset stores two complete `ChartColors` sets — one for light mode, one for dark mode. The system automatically selects the correct set based on `resolvedTheme`.

## Data Model

```typescript
export interface ChartColorPreset {
  id: string
  name: string
  description: string
  light: ChartColors   // replaces: colors: ChartColors
  dark: ChartColors
}
```

## Preset Changes

- **Remove**: `dark-optimized` preset (redundant — every preset now has a dark variant)
- **Add dark variants**: All 9 remaining presets get a `dark` color set with boosted lightness/saturation for `#080C16` backgrounds
- **Light variants**: Current color values (already tuned for light backgrounds)

## Resolution Flow

1. User picks a preset (stored in localStorage as `cassini-chart-preset`)
2. `getStoredChartColors(mode)` resolves the active color set
3. If a preset is selected: return `preset.light` or `preset.dark` based on mode
4. If custom: return stored custom colors as-is (no mode branching)
5. `applyChartColors()` unchanged — sets CSS vars from whatever `ChartColors` it receives

## Hook Change

`useChartColors` consumes `resolvedTheme` from `useTheme()` and re-resolves when mode changes.

## UI Changes

- Preset swatches show colors for the active mode
- Advanced Color Customization panel edits a single custom color set (no mode branching)
- "Dark Mode Optimized" preset removed from the list

## What Doesn't Change

- `applyChartColors()` function signature
- CSS custom property names
- Chart component consumption (CSS vars or hook)
- `saveChartColors()` for custom colors (flat `ChartColors`)
