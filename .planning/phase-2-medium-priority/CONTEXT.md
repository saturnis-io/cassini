# Phase 2 Medium Priority Features - Context

## Overview

This phase implements two medium-priority UX features from Phase 2:

1. **Chart Styling Improvements** - Gradient lines, enhanced point markers, zone area improvements, visual hierarchy
2. **Dark Mode** - CSS variable dark theme, ThemeProvider context, toggle in header, auto-detect system preference

## Architecture Reference

Full design in `.company/artifacts/architect/phase-2-design.md`

## Feature Details

### Feature 1: Chart Styling Improvements

**Purpose:** Make X-bar charts more visually appealing with better color differentiation and visual hierarchy.

**Current State:**
- Using Recharts with basic styling
- Zone areas use semi-transparent fills
- Data line is single color (primary)
- Points show violation state via color/size

**Enhancements:**

1. **Gradient Data Line:**
   - Use SVG `linearGradient` definition
   - Apply gradient from `chart-primary` to `chart-secondary`
   - Increase stroke width to 2.5px

2. **Enhanced Point Markers:**
   - Different shapes for different states (diamond for violation, triangle for undersized, circle for normal)
   - Subtle glow effect on violation points
   - Recent points slightly larger (recency emphasis)

3. **Zone Area Improvements:**
   - Add subtle gradient fills (top to bottom fade)
   - Improve zone boundary lines
   - Use Sepasoft palette colors consistently

4. **Visual Hierarchy:**
   - Center line thicker and more prominent
   - UCL/LCL dashed with subtle glow effect
   - Animation for new points entering chart

**CSS Variables:**
```css
--chart-line-width: 2.5px;
--chart-point-radius: 4px;
--chart-point-radius-violation: 6px;
--chart-zone-opacity: 0.15;
--chart-animation-duration: 300ms;
```

### Feature 2: Dark Mode

**Purpose:** Theme toggle with Sepasoft-compatible dark palette.

**Implementation Strategy:**

1. **CSS Variables Approach:**
   - Add `.dark` class with dark theme variables
   - All colors using HSL format for easy manipulation
   - Brighten colors appropriately for dark backgrounds

2. **ThemeProvider Component:**
   - React Context for theme state
   - Support for "light", "dark", "system" preferences
   - Persist to localStorage
   - Auto-detect system preference via `prefers-color-scheme` media query

3. **Theme Toggle UI:**
   - Add toggle button in Layout header
   - Use `Sun`/`Moon` icons from lucide-react
   - Smooth transition between themes

4. **Chart Colors for Dark Mode:**
   - Brighten line colors for contrast
   - Adjust zone fill opacities
   - Ensure text remains readable

## Codebase Patterns

### Frontend Patterns

- **Components:** Functional React with TypeScript
- **State:** Zustand stores (`configStore`, `dashboardStore`)
- **Styling:** Tailwind CSS with Sepasoft brand colors in `index.css`
- **Types:** Centralized in `types/index.ts`

### Key Files

- `frontend/src/components/ControlChart.tsx` - Chart component to enhance
- `frontend/src/index.css` - CSS variables and theme definitions
- `frontend/src/components/Layout.tsx` - Header where toggle goes
- `frontend/src/App.tsx` - Provider wrapping location

## Files to Create

**Frontend:**
- `frontend/src/providers/ThemeProvider.tsx` - Theme context and provider
- `frontend/src/hooks/useTheme.ts` - Hook for consuming theme context (optional, can be in provider)

## Files to Modify

- `frontend/src/index.css` - Add dark theme variables and chart styling variables
- `frontend/src/components/ControlChart.tsx` - Enhance with gradients, markers, animations
- `frontend/src/components/Layout.tsx` - Add theme toggle button
- `frontend/src/App.tsx` - Wrap with ThemeProvider

## Dependencies

### Frontend Dependencies (Already Available)
- `lucide-react` - Icons (Sun, Moon) already in use
- Recharts - Chart library already in use

## Technical Constraints

1. **Sepasoft Branding:** Use established brand colors, adapt for dark mode
2. **No Breaking Changes:** Existing chart functionality must remain intact
3. **Performance:** Animations should be smooth, use CSS transitions where possible
4. **Accessibility:** Ensure sufficient contrast in both themes
5. **Progressive Enhancement:** System preference detection as fallback
