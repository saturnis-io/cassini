# Cassini Frontend Theme System Audit

**Date:** 2026-03-05
**Scope:** Visual style system (modern/retro/glass) -- readiness for adding ~6 new styles
**Verdict:** Feasibility Score **7/10** -- mostly token-driven with a contained set of fixable gaps

---

## 1. Architecture Summary

### Mechanism

The visual style system has a clean two-layer architecture:

1. **ThemeProvider** (`src/providers/ThemeProvider.tsx`) manages three orthogonal concerns:
   - **Light/Dark mode** -- adds/removes `.dark` class on `<html>`
   - **Visual style** -- adds `.retro` or `.glass` class on `<html>` (modern = no class, i.e., the default)
   - **Brand colors** -- resolves brand config into CSS custom properties on `:root` via `applyBrandColors()`

2. **CSS custom properties + class selectors** (`src/index.css`, the sole CSS file) define all style variations:
   - `@theme { ... }` block defines ~55 CSS custom properties (colors, shadows, radius, chart vars, fonts)
   - `.dark { ... }` overrides ~35 of those properties for dark mode
   - `.retro { ... }` and `.glass { ... }` blocks override a subset of properties and apply structural CSS (borders, pseudo-elements, backdrop-filter)

3. **Chart colors** have their own parallel system (`src/lib/theme-presets.ts`) stored in localStorage with 5 presets (classic, high-contrast, colorblind-safe, monochrome, dark-optimized). These are independent of visual style.

### File Locations

| File | Role |
|------|------|
| `src/index.css` | All CSS: theme tokens, dark overrides, retro/glass style rules, login styles, animations |
| `src/providers/ThemeProvider.tsx` | React context, class toggling, brand color application |
| `src/lib/brand-engine.ts` | Pure color math (hex/HSL, WCAG contrast, auto-adjust for light/dark) |
| `src/lib/brand-presets.ts` | 6 industry brand presets (each specifies a visualStyle) |
| `src/lib/theme-presets.ts` | Chart color presets (separate from visual style) |
| `src/hooks/useChartColors.ts` | Reactive hook for chart color changes |
| `src/components/AppearanceSettings.tsx` | UI for selecting theme, visual style, chart colors |
| `src/components/settings/BrandingSettings.tsx` | Admin branding UI (includes visual style selector) |

### How a New Style Gets Applied

1. User selects style in AppearanceSettings or BrandingSettings
2. `setVisualStyle()` persists to `localStorage('cassini-visual-style')`
3. `useEffect` in ThemeProvider removes `modern`/`retro`/`glass` from `<html>`, adds new class (unless `modern`)
4. CSS selectors in `index.css` activate: `.newstyle .bg-card { ... }`, etc.
5. Components use Tailwind utility classes that reference CSS custom properties -- they pick up new values automatically

---

## 2. Token Coverage Matrix

| Visual Property | Token-Driven? | Mechanism | Notes |
|----------------|---------------|-----------|-------|
| **Colors (semantic)** | YES | `--color-primary`, `--color-destructive`, etc. in `@theme` + `.dark` override | Brand engine can override at runtime |
| **Colors (chart SPC)** | PARTIAL | `--color-zone-c`, `--color-chart-primary`, etc. in `@theme` | Visual styles do NOT override chart colors; chart presets are a separate system |
| **Colors (ECharts canvas)** | NO | Hardcoded `isDark ? 'hsl(...)' : 'hsl(...)'` ternaries in ~12 chart components | ECharts canvas renderer cannot read CSS vars; colors duplicated in JS |
| **Typography (fonts)** | YES | `--font-heading`, `--font-body` in `@theme` | Brand engine overrides at runtime |
| **Typography (retro monospace)** | PARTIAL | `.retro label, .retro .text-xs` etc. in CSS | Applied via CSS selectors, but hardcodes `Courier New` rather than using a token |
| **Border radius** | YES | `--radius` token; retro sets to `0`, glass to `1rem` | Components use Tailwind `rounded-*` which references this token |
| **Border radius (hardcoded)** | RISK | Many components use `rounded-xl`, `rounded-lg`, `rounded-full` directly | Tailwind `rounded-*` utilities do NOT all reference `--radius`; only some do |
| **Shadows** | YES | `--shadow-xs` through `--shadow-xl` in `@theme` + `.dark` override | Well-structured, 5 tiers |
| **Card/popover surfaces** | MIXED | CSS class selectors `.bg-card`, `.bg-popover` with gradients and shadows | Hardcoded HSL values in selectors, not token-driven. Each style must redefine |
| **Effects (blur/backdrop)** | NO (contained) | Hardcoded in `.glass .bg-card::before { backdrop-filter: blur(16px) }` | Only in glass style CSS, but values are not tokens |
| **Effects (retro corners)** | NO (contained) | `::before`/`::after` pseudo-elements with hardcoded sizes and borders | Structural CSS, not tokenizable |
| **Animations** | YES | CSS `@keyframes` with class hooks (`.violation-pulse`, `.point-enter`, etc.) | Style-agnostic, work across all styles |
| **Spacing** | N/A | Uses Tailwind spacing scale directly | Not style-specific, no tokenization needed |
| **Button behavior** | MIXED | Base `button:hover` transform in CSS; retro/glass override with their own | Each style must re-declare button hover/active behavior |
| **Input styling** | MIXED | Base in `@layer base`, retro/glass override separately | Each style needs its own `@layer base` input block |
| **Scrollbar** | PARTIAL | Hardcoded HSL in `::-webkit-scrollbar-thumb` + `.dark` override | Not tokenized, not style-aware |

---

## 3. Style-Conditional Code Inventory

### 3.1 Components That Check `visualStyle` Directly

**ZERO components branch on `visualStyle` in their JSX/TSX logic.** This is excellent -- the system is purely CSS-driven for visual style differentiation. The only files that reference `visualStyle` are:

| File | What It Does | Style-Conditional? |
|------|-------------|-------------------|
| `providers/ThemeProvider.tsx` | Stores/applies the CSS class | Infrastructure only |
| `components/AppearanceSettings.tsx` | Renders style picker UI | Selection UI only |
| `components/settings/BrandingSettings.tsx` | Renders style picker in admin branding | Selection UI only |
| `lib/brand-presets.ts` | Each preset suggests a `visualStyle` | Data only |
| `lib/brand-engine.ts` | Type definition includes `visualStyle` | Type only |

**Finding: No component renders different JSX based on the active visual style.** All differentiation happens through CSS class selectors.

### 3.2 Components That Check `resolvedTheme` (Light/Dark)

This is a separate concern from visual style, but relevant because the pattern could bleed into style-specific code. **13 components** read `resolvedTheme` and derive `isDark`:

| File | What It Uses `isDark` For |
|------|--------------------------|
| `ControlChart.tsx` | ECharts axis colors, tooltip bg, split lines (~8 ternaries) |
| `AttributeChart.tsx` | ECharts axis colors, split lines (~5 ternaries) |
| `ViolationParetoChart.tsx` | ECharts label/axis colors (~3 ternaries) |
| `ReportPreview.tsx` | ECharts axis/split/bar colors (~12 ternaries) |
| `capability/DistributionAnalysis.tsx` | ECharts axis/tooltip/bar colors (~14 ternaries) |
| `analytics/T2Chart.tsx` | ECharts text/grid/tooltip colors (~5 ternaries) |
| `analytics/PCABiplot.tsx` | ECharts scatter/loading/tooltip colors (~7 ternaries) |
| `analytics/PredictionOverlay.tsx` | ECharts prediction/axis/tooltip colors (~9 ternaries) |
| `analytics/CorrelationHeatmap.tsx` | ECharts axis/tooltip/cell colors (~7 ternaries) |
| `doe/MainEffectsPlot.tsx` | ECharts axis/tooltip colors (~7 ternaries) |
| `doe/InteractionPlot.tsx` | ECharts axis/tooltip colors (~6 ternaries) |
| `doe/EffectsParetoChart.tsx` | ECharts axis/tooltip colors (~6 ternaries) |

**Total: ~89 hardcoded `isDark ?` color ternaries across 12 chart components.**

These are light/dark only -- they do NOT branch on visual style. The comment in `AttributeChart.tsx` explains why: "ECharts canvas renderer cannot resolve CSS custom properties (L-001 exception)."

### 3.3 Components That Use `brandConfig` or `fullBrandConfig`

| File | What It Uses |
|------|-------------|
| `Header.tsx` | `brandConfig.appName`, `fullBrandConfig` for logo colors |
| `KioskLayout.tsx` | `brandConfig.logoUrl`, `brandConfig.appName` |
| `WallDashboard.tsx` | `brandConfig.appName` |
| `LoginPage.tsx` | `fullBrandConfig` for logo colors and login mode |
| `AnnotationDialog.tsx` | `brandConfig.primaryColor` for annotation color picker default |
| `ReportPreview.tsx` | `brandConfig.appName`, `resolvedTheme` for chart colors |
| `ThemeCustomizer.tsx` | `brandConfig`, `setBrandConfig`, `resetBrandConfig` for color picker UI |

None of these branch on visual style.

---

## 4. Gaps & Risks

### GAP 1: Retro/Glass CSS blocks are structural, not just token swaps (MEDIUM)

Adding a new style requires writing ~80-120 lines of CSS for:
- `.newstyle .bg-card` and `.bg-popover` (background, border, shadow, radius)
- `.newstyle .bg-card::before` / `::after` (decorative pseudo-elements, if any)
- `.dark.newstyle .bg-card` etc. (dark mode variants)
- `@layer base { .newstyle input, select, textarea { ... } }` (input styling)
- `.newstyle button:hover` / `:active` behavior
- `.newstyle h1..h6` typography adjustments
- `.newstyle nav a, nav button` navigation styling (if different)

This is manageable but not zero-effort. The CSS is concentrated in one file though.

### GAP 2: Card/popover surfaces use hardcoded HSL, not tokens (MEDIUM)

The base `.bg-card` rule uses:
```css
background: linear-gradient(180deg, hsl(0 0% 100%) 0%, hsl(240 10% 98%) 100%);
border: 1px solid hsl(240 6% 90%);
```

These hardcoded HSL values are NOT CSS custom properties. They should be tokenized so styles can override them cleanly via `--card-gradient-start`, `--card-gradient-end`, `--card-border-color`, etc.

### GAP 3: ECharts hardcoded colors (~89 ternaries) (LOW for visual styles)

The `isDark ?` ternaries in chart components are a light/dark concern, not a visual style concern. ECharts renders to `<canvas>` and cannot read CSS custom properties. These would NOT block adding new visual styles, but they do mean chart styling is not theme-responsive.

The chart colors system (`theme-presets.ts`) is already a separate concern and works independently.

### GAP 4: `--radius` token vs Tailwind `rounded-*` utilities (LOW)

The `--radius` token is set per style (0 for retro, 0.75rem for modern, 1rem for glass). However, many components use Tailwind utilities like `rounded-xl`, `rounded-lg`, `rounded-full` which resolve to fixed values (1rem, 0.5rem, 9999px) and do NOT reference `--radius`. Only `rounded` (no suffix) maps to `--radius`.

In practice, retro's `border-radius: 0` overrides on `.bg-card` and `button` handle the major surfaces. Individual `rounded-xl` on internal elements (like settings panels) remain rounded even in retro mode. This is mostly fine aesthetically but is a leak.

### GAP 5: Login page has its own hardcoded CSS (LOW)

The `.cassini-login` block (~70 lines in `index.css`) has hardcoded colors (`#D4AF37`, `#4B5563`, `#080C16`, etc.) and its own input/button styling. It's always "retro dark" regardless of the active visual style. This is intentional branding but is not style-responsive.

### GAP 6: Scrollbar and stat-badge colors are hardcoded (LOW)

Scrollbar thumb colors and `.stat-badge-*` background/text colors use raw HSL values rather than tokens. They don't change with visual style.

### GAP 7: VisualStyle type is a string union, not extensible without code changes (LOW)

```typescript
export type VisualStyle = 'modern' | 'retro' | 'glass'
```

Adding new styles requires updating:
- `VisualStyle` type in `ThemeProvider.tsx`
- `getStoredVisualStyle()` validation in `ThemeProvider.tsx`
- `root.classList.remove(...)` in the useEffect
- `VISUAL_STYLE_OPTIONS` array in `AppearanceSettings.tsx`
- `BrandingSettings.tsx` style picker options
- CSS rules in `index.css`

This is ~6 touch points per new style (beyond the CSS itself).

---

## 5. Recommendations

### R1: Create a style registry (eliminates GAP 7)

Replace the hardcoded `VisualStyle` union and scattered option arrays with a single registry:

```typescript
// lib/visual-styles.ts
export const VISUAL_STYLES = {
  modern: { label: 'Modern', desc: 'Clean, rounded, standard look', cssClass: null },
  retro: { label: 'Retro', desc: 'Sharp edges, monospace accents', cssClass: 'retro' },
  glass: { label: 'Glass', desc: 'Frosted panels, blur effects', cssClass: 'glass' },
  // New styles just add entries here:
  brutalist: { label: 'Brutalist', desc: 'Raw concrete, bold type', cssClass: 'brutalist' },
} as const

export type VisualStyle = keyof typeof VISUAL_STYLES
```

ThemeProvider, AppearanceSettings, and BrandingSettings all read from this registry. Adding a style = add one registry entry + write CSS.

**Effort: ~2 hours. Eliminates 5 of the 6 code touch points.**

### R2: Tokenize card/popover surface values (eliminates GAP 2)

Add CSS custom properties for the values currently hardcoded in `.bg-card`/`.bg-popover`:

```css
@theme {
  --card-bg-start: hsl(0 0% 100%);
  --card-bg-end: hsl(240 10% 98%);
  --card-border: hsl(240 6% 90%);
  --card-shadow-inset: hsl(0 0% 100%);
  --popover-bg-start: hsl(0 0% 100%);
  --popover-bg-end: hsl(240 8% 99%);
  --popover-border: hsl(240 6% 88%);
  --input-bg: hsl(240 10% 98%);
  --input-border: hsl(240 6% 88%);
  --input-shadow: hsl(240 10% 80% / 0.15);
}
```

Then each style block just overrides these tokens instead of re-declaring entire rule blocks. This would reduce each new style's CSS from ~100 lines to ~20 lines of token overrides.

**Effort: ~4 hours. Biggest bang-for-buck refactor.**

### R3: Extract ECharts theme colors into a shared helper (addresses GAP 3)

Create a `useEChartsThemeColors()` hook that returns the common axis/tooltip/grid colors based on `resolvedTheme`, eliminating the ~89 duplicated ternaries:

```typescript
export function useEChartsThemeColors() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  return {
    axisLabel: isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)',
    axisLine: isDark ? 'hsl(220, 10%, 30%)' : 'hsl(210, 15%, 80%)',
    splitLine: isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 90%)',
    axisName: isDark ? 'hsl(220, 5%, 65%)' : 'hsl(220, 15%, 40%)',
    tooltipBg: isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    tooltipText: isDark ? '#e5e5e5' : '#333',
    tooltipBorder: isDark ? 'hsl(220, 12%, 26%)' : 'hsl(210, 15%, 88%)',
    cardBg: isDark ? 'hsl(220, 25%, 13%)' : '#fff',
  }
}
```

This doesn't make charts style-aware (canvas limitation) but eliminates massive duplication and creates a single place to adjust.

**Effort: ~3 hours. Code quality improvement, not strictly needed for new styles.**

### R4: No action needed for visual-style-specific component branching

The current architecture is already clean here. Zero components branch on `visualStyle`. All differentiation is CSS-only. This is the ideal state -- preserve it.

### R5: Consider a CSS-in-CSS template for new styles

Document the "anatomy of a visual style" as a CSS template that style authors fill in. Something like:

```css
/* ========== Visual Style: {Name} ========== */
.{name} {
  --radius: ???;
  /* Override any @theme tokens here */
}
.{name} .bg-card { /* card surface */ }
.{name} .bg-popover { /* popover surface */ }
.dark.{name} .bg-card { /* dark card surface */ }
/* ... etc */
```

This is a documentation exercise, not code. Takes 30 minutes.

---

## 6. Feasibility Score: 7/10

**What "7/10" means:** Adding a new visual style today requires:
- Writing ~80-120 lines of CSS in `index.css` (the structural overrides for card, popover, inputs, buttons, typography)
- Adding the style name to ~6 code locations (type, validation, classList.remove, two option arrays, CSS)
- NO component changes -- zero JSX branching needed

**What would make it 9/10:**
- R1 (style registry) reduces the 6 code locations to 1 (+CSS)
- R2 (tokenize surfaces) reduces the CSS per style from ~100 lines to ~20 lines of token overrides

**What prevents 10/10:**
- Some styles fundamentally need structural CSS (pseudo-elements for retro corners, `::before` backdrop-filter for glass). These can't be tokenized -- they're inherently structural. But this is fine; not every style needs pseudo-elements. Simple styles (just token overrides) would need only ~20 lines of CSS after R2.

**Bottom line:** The architecture is sound. The visual style system is CSS-class-driven with no component branching -- the cleanest possible pattern. The main work for R1+R2 is ~6 hours of refactoring, after which adding a new style is genuinely "write 20 lines of CSS tokens + add one registry entry."

---

## Appendix: Files Referenced

| File | Absolute Path |
|------|--------------|
| ThemeProvider | `frontend/src/providers/ThemeProvider.tsx` |
| Global CSS | `frontend/src/index.css` |
| Brand engine | `frontend/src/lib/brand-engine.ts` |
| Brand presets | `frontend/src/lib/brand-presets.ts` |
| Chart color presets | `frontend/src/lib/theme-presets.ts` |
| Chart colors hook | `frontend/src/hooks/useChartColors.ts` |
| Appearance settings | `frontend/src/components/AppearanceSettings.tsx` |
| Branding settings | `frontend/src/components/settings/BrandingSettings.tsx` |
| ECharts registration | `frontend/src/lib/echarts.ts` |
| ControlChart | `frontend/src/components/ControlChart.tsx` |
| AttributeChart | `frontend/src/components/AttributeChart.tsx` |
