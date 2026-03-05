# Chart Color Light/Dark Variants Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make chart color presets mode-aware so each preset looks good in both light and dark mode.

**Architecture:** Each `ChartColorPreset` stores `light` and `dark` color sets instead of a single `colors`. The system resolves the correct set based on `resolvedTheme`. CSS var application moves from AppearanceSettings to ThemeProvider so it reacts to mode changes. Duplicate local hooks are consolidated.

**Tech Stack:** TypeScript, React hooks, Zustand (ThemeProvider), localStorage

---

### Task 1: Update ChartColorPreset interface and preset data

**Files:**
- Modify: `frontend/src/lib/theme-presets.ts`

**Step 1: Update interface**

Change:
```typescript
export interface ChartColorPreset {
  id: string
  name: string
  description: string
  colors: ChartColors
}
```
To:
```typescript
export interface ChartColorPreset {
  id: string
  name: string
  description: string
  light: ChartColors
  dark: ChartColors
}
```

**Step 2: Update `defaultChartColors` to `defaultChartColorsLight` and add `defaultChartColorsDark`**

Keep existing `defaultChartColors` values as `defaultChartColorsLight`. Create `defaultChartColorsDark` with boosted lightness/saturation for dark backgrounds. Export both plus a convenience `defaultChartColors` that maps to light (for backward compat in `getStoredChartColors` custom fallback).

Dark variant principles:
- Data lines: boost lightness to 58-65% range, saturation +5-10%
- Control/limit lines: boost lightness to 60-65%
- Zone fills: boost lightness to 55-60%
- Points: boost lightness to 58-65%
- Excluded points: lighten to 55-60%
- Secondary lines: boost lightness significantly (Navy on dark = invisible)

**Step 3: Convert all 9 presets to light/dark format, remove dark-optimized**

For each preset, current `colors` becomes `light`. Create `dark` variant with appropriate adjustments:

- **Classic**: light = current. Dark = boosted gold/cream, brighter red limits, lighter secondaries
- **High Contrast**: light = current (black center line → white for dark). Dark = high-sat bright colors
- **Colorblind Safe**: light = current. Dark = boost all lightness +15-20%
- **Monochrome**: light = current. Dark = invert lightness (25% → 75%, etc.)
- **Blueprint**: light = current. Dark = boost blue lightness, brighter red limits
- **Mission Control**: light = current. Dark = boost cyan brightness, already fairly vivid
- **E-Ink**: light = current. Dark = boost lightness significantly (25% → 70%), add saturation
- **Bento Box**: light = current. Dark = boost slightly, already fairly bright
- **Synthwave**: light = current. Dark = boost slightly, already designed for dark aesthetics
- **dark-optimized**: REMOVE entirely

**Step 4: Update `getStoredChartColors` to accept mode**

```typescript
export function getStoredChartColors(mode: 'light' | 'dark' = 'light'): ChartColors {
  if (typeof window === 'undefined') return mode === 'dark' ? defaultChartColorsDark : defaultChartColorsLight

  const presetId = localStorage.getItem(PRESET_STORAGE_KEY)

  // Custom colors: return as-is regardless of mode
  if (presetId === 'custom') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        return { ...defaultChartColorsLight, ...JSON.parse(stored) }
      } catch {
        return mode === 'dark' ? defaultChartColorsDark : defaultChartColorsLight
      }
    }
  }

  // Preset colors: resolve by mode
  if (presetId) {
    const preset = chartPresets.find((p) => p.id === presetId)
    if (preset) return preset[mode]
  }

  return mode === 'dark' ? defaultChartColorsDark : defaultChartColorsLight
}
```

**Step 5: Update `saveChartColors`**

No signature change needed — it still saves a flat `ChartColors` for custom. When a preset is selected, only the preset ID is needed (colors resolve from the preset data at read time). Update `handlePresetChange` in AppearanceSettings to NOT save full colors to localStorage when selecting a preset — just save the preset ID.

```typescript
export function saveChartPreset(presetId: string): void {
  localStorage.setItem(PRESET_STORAGE_KEY, presetId)
  localStorage.removeItem(STORAGE_KEY) // clear custom colors
  window.dispatchEvent(new CustomEvent('chart-colors-changed'))
}

export function saveCustomChartColors(colors: ChartColors): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
  localStorage.setItem(PRESET_STORAGE_KEY, 'custom')
  window.dispatchEvent(new CustomEvent('chart-colors-changed'))
}
```

Keep `saveChartColors` as a compat wrapper that calls the appropriate one.

**Step 6: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: Errors in consumers referencing `.colors` — these are fixed in subsequent tasks.

**Step 7: Commit**

```
feat: add light/dark variants to chart color presets
```

---

### Task 2: Update useChartColors hook to be mode-aware

**Files:**
- Modify: `frontend/src/hooks/useChartColors.ts`

**Step 1: Add resolvedTheme dependency**

```typescript
import { useState, useCallback, useEffect } from 'react'
import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'
import { useTheme } from '@/providers/ThemeProvider'

export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState<ChartColors>(() => getStoredChartColors(resolvedTheme))

  const updateColors = useCallback(() => {
    setColors(getStoredChartColors(resolvedTheme))
  }, [resolvedTheme])

  // Re-resolve when mode changes
  useEffect(() => {
    updateColors()
  }, [updateColors])

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'cassini-chart-colors' || e.key === 'cassini-chart-preset') {
        updateColors()
      }
    }
    const handleColorChange = () => updateColors()

    window.addEventListener('storage', handleStorage)
    window.addEventListener('chart-colors-changed', handleColorChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('chart-colors-changed', handleColorChange)
    }
  }, [updateColors])

  return colors
}
```

**Step 2: Commit**

```
feat: make useChartColors hook mode-aware
```

---

### Task 3: Move chart color CSS var application to ThemeProvider

**Files:**
- Modify: `frontend/src/providers/ThemeProvider.tsx`
- Modify: `frontend/src/components/AppearanceSettings.tsx`

**Step 1: Add chart color application to ThemeProvider**

In ThemeProvider, add an effect that applies chart colors whenever `resolvedTheme` changes or a `chart-colors-changed` event fires:

```typescript
import { getStoredChartColors, applyChartColors } from '@/lib/theme-presets'

// Inside ThemeProvider component, after existing effects:
useEffect(() => {
  const colors = getStoredChartColors(resolvedTheme)
  applyChartColors(colors)

  const handleColorChange = () => {
    const updated = getStoredChartColors(resolvedTheme)
    applyChartColors(updated)
  }

  window.addEventListener('chart-colors-changed', handleColorChange)
  return () => window.removeEventListener('chart-colors-changed', handleColorChange)
}, [resolvedTheme])
```

**Step 2: Remove mount-time applyChartColors from AppearanceSettings**

Remove the `useEffect(() => { applyChartColors(colors) }, [])` on line 156-158.

Update `handlePresetChange` to use `saveChartPreset(presetId)` instead of `saveChartColors(preset.colors, presetId)`. The ThemeProvider effect will pick up the change via the custom event.

Update `handleColorChange` (individual color edit) to still call `applyChartColors` for instant preview, plus save.

Update `handleReset` similarly.

**Step 3: Update AppearanceSettings preset preview swatches to be mode-aware**

The preset cards show `preset.colors.lineGradientStart` and `preset.colors.violationPoint` as swatches. Change to `preset[resolvedTheme].lineGradientStart` etc:

```typescript
const { resolvedTheme } = useTheme()
// ...
<div style={{ backgroundColor: preset[resolvedTheme].lineGradientStart }} />
<div style={{ backgroundColor: preset[resolvedTheme].violationPoint }} />
```

Also update the `handlePresetChange` to set local `colors` state from the preset's mode-specific colors:
```typescript
const handlePresetChange = (presetId: string) => {
  const preset = chartPresets.find((p) => p.id === presetId)
  if (preset) {
    setSelectedPreset(presetId)
    const modeColors = preset[resolvedTheme]
    setColors(modeColors)
    applyChartColors(modeColors)
    saveChartPreset(presetId)
    setHasChanges(false)
    toast.success(`Applied "${preset.name}" theme`)
  }
}
```

**Step 4: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 5: Commit**

```
refactor: move chart color CSS var init to ThemeProvider for mode reactivity
```

---

### Task 4: Deduplicate local useChartColors hooks

**Files:**
- Modify: `frontend/src/components/charts/RangeChart.tsx`
- Modify: `frontend/src/components/charts/BoxWhiskerChart.tsx`
- Modify: `frontend/src/components/DistributionHistogram.tsx`

**Step 1: Replace local hooks with shared import**

In each file:
1. Remove the local `function useChartColors()` definition (and its `useState`/`useCallback`/`useEffect` imports if no longer needed)
2. Remove the `import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'` if only used by the local hook
3. Add `import { useChartColors } from '@/hooks/useChartColors'`
4. Add `import type { ChartColors } from '@/lib/theme-presets'` if ChartColors type is still used elsewhere in the file

**Step 2: Replace direct getStoredChartColors callers with hook**

These components call `getStoredChartColors()` directly (not reactive, not mode-aware):

- `frontend/src/components/AttributeChart.tsx` — replace `const chartColors = getStoredChartColors()` with `const chartColors = useChartColors()`
- `frontend/src/components/CUSUMChart.tsx` — same
- `frontend/src/components/EWMAChart.tsx` — same
- `frontend/src/components/ViolationParetoChart.tsx` — same

Add `import { useChartColors } from '@/hooks/useChartColors'` to each, remove unused `getStoredChartColors` import.

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 4: Commit**

```
refactor: consolidate chart color hooks — remove 3 duplicates, convert 4 direct callers
```

---

### Task 5: Create dark variant color values

**Files:**
- Modify: `frontend/src/lib/theme-presets.ts`

This is the creative/design task — actually writing the dark-mode HSL values for all 9 presets. Guidelines per preset:

**Classic (dark):**
- Gold line: 55% → 62% lightness
- Cream gradient end: 85% → keep but boost saturation
- Red limits: 52% → 62%
- Zone fills: boost all +12-15% lightness
- Navy secondary: 20% → 60% lightness (critical — navy is invisible on dark)

**High Contrast (dark):**
- Blue line: keep 50% sat, boost to 65%
- Black center line → white `hsl(0, 0%, 100%)`
- Red limits: 40% → 60%
- All zones: boost +10-15%

**Colorblind Safe (dark):**
- All colors: boost lightness +15%
- Orange limits/violations: 45% → 60%

**Monochrome (dark):**
- Invert: light grays become the data, dark grays become excluded
- Line: 25% → 75%, violation: 0% → 100% (white), excluded: 75% → 45%

**Blueprint (dark):**
- Steel blues: 45% → 62%
- Red limits: 50% → 62%

**Mission Control (dark):**
- Cyan: 42% → 58%, already fairly vivid
- Red: 55% → 65%

**E-Ink (dark):**
- This is the preset that prompted the whole feature
- Dark ink → light ink: 25% → 72% lightness, boost saturation 15% → 40%
- Muted zones: boost significantly to 60-65%
- Red accents: 40% → 62%

**Bento Box (dark):**
- Apple blue: 56% → 65%
- Already fairly bright, modest boost

**Synthwave (dark):**
- Neon colors are already bright — minimal changes
- Boost lightness 3-5% across the board

**Step 1: Write all dark variant color objects**

Add them directly to the preset definitions alongside the existing light values.

**Step 2: Build and verify**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```
feat: hand-tune dark mode colors for all 9 chart presets
```

---

### Task 6: Final verification and type check

**Files:** None (verification only)

**Step 1: Full type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 errors

**Step 2: Verify no remaining references to `.colors` on presets**

Search: `preset.colors` or `preset\.colors` — should find 0 matches.

**Step 3: Verify no remaining references to `dark-optimized` preset**

Search: `dark-optimized` — should find 0 matches (except possibly in design docs).

**Step 4: Dev server smoke test**

Run: `cd frontend && npm run dev`
- Switch between light/dark mode — chart colors should change
- Select e-ink preset in dark mode — should be readable
- Select custom colors — should persist across mode switches unchanged

**Step 5: Commit (if any fixes needed)**

```
fix: address type/lint issues from chart color light/dark migration
```
