# Phase 2 Medium Priority - Research

## Implementation Approach Analysis

### 1. Chart Styling Improvements

#### Current Implementation Analysis

**File:** `frontend/src/components/ControlChart.tsx`

The current chart implementation uses:
- `ComposedChart` from Recharts with `Line` component
- `ReferenceArea` for zone backgrounds with `fillOpacity={0.2}`
- `ReferenceLine` for UCL/LCL/CL lines with `strokeDasharray`
- Custom `dot` function rendering circles for points
- Violation points have larger radius (6 vs 4) and red color
- Undersized samples show dashed ring around point

**Enhancement Points:**

1. **Gradient Line** - Add SVG `<defs>` with `<linearGradient>` inside the `ComposedChart`, reference via `stroke="url(#gradient-id)"`

2. **Point Markers** - Current dot function already supports custom shapes. Enhance to use:
   - Diamond path for violations
   - Triangle path for undersized
   - Circle (current) for normal
   - Add subtle drop-shadow filter for violations

3. **Zone Areas** - Add gradient to `ReferenceArea`:
   - Use `<defs>` with `<linearGradient>` oriented vertically
   - Reference in `fill` attribute
   - Increase opacity slightly in center, fade at edges

4. **Control Lines** - Enhance `ReferenceLine`:
   - Increase center line strokeWidth to 2.5
   - Add subtle glow using filter or shadow effect

5. **Entry Animation** - Add CSS animation class for newest point

#### CSS Variables to Add

```css
--chart-line-gradient-start: hsl(212 100% 40%);
--chart-line-gradient-end: hsl(179 50% 59%);
--chart-point-radius: 4;
--chart-point-radius-violation: 6;
--chart-zone-opacity: 0.15;
--chart-line-width: 2.5;
--chart-center-line-width: 2.5;
--chart-limit-line-width: 1.5;
```

### 2. Dark Mode

#### Current Implementation Analysis

**File:** `frontend/src/index.css`

The current theme uses:
- CSS `@theme` block with HSL-based color variables
- Sepasoft brand colors already defined
- No dark mode class or system preference detection

**Implementation Pattern:**

1. **Add `.dark` class to `:root`/`html`** - Override all color variables

2. **ThemeProvider Pattern:**
```tsx
// ThemeProvider.tsx
const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')

  useEffect(() => {
    const root = document.documentElement
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'system' && systemDark)
    root.classList.toggle('dark', isDark)
  }, [theme])

  // Listen for system preference changes
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => {
      document.documentElement.classList.toggle('dark', e.matches)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
```

3. **localStorage Persistence:**
   - Key: `openspc-theme`
   - Values: `"light"`, `"dark"`, `"system"`

4. **Header Toggle:**
   - Use dropdown or button cycle (light -> dark -> system)
   - Icons: Sun (light), Moon (dark), Monitor (system)

#### Dark Theme Color Palette

Based on Sepasoft brand, adapted for dark backgrounds:

```css
.dark {
  --color-background: hsl(220 15% 10%);
  --color-foreground: hsl(0 0% 95%);
  --color-card: hsl(220 15% 13%);
  --color-card-foreground: hsl(0 0% 95%);
  --color-primary: hsl(212 100% 50%);  /* Brightened blue */
  --color-secondary: hsl(220 10% 18%);
  --color-muted: hsl(220 10% 20%);
  --color-muted-foreground: hsl(220 5% 60%);
  --color-accent: hsl(179 50% 65%);    /* Brightened teal */
  --color-border: hsl(220 10% 20%);
  --color-input: hsl(220 10% 18%);
  --color-destructive: hsl(357 85% 60%);  /* Brighter red */
  --color-warning: hsl(32 70% 55%);
  --color-success: hsl(104 60% 50%);

  /* Zone colors - brighter for dark mode */
  --color-zone-c: hsl(104 60% 50%);
  --color-zone-b: hsl(48 100% 55%);
  --color-zone-a: hsl(32 70% 55%);
  --color-violation: hsl(357 85% 60%);

  /* Chart colors */
  --color-chart-primary: hsl(212 100% 55%);
  --color-chart-secondary: hsl(179 55% 65%);
}
```

### Technical Considerations

1. **Recharts and Dark Mode:**
   - Recharts uses inline styles, but respects CSS variables
   - Current code already uses `hsl(var(--...))` pattern
   - Dark mode will work automatically for most elements

2. **Body Background:**
   - Current: `linear-gradient(145deg, ...)` in body CSS
   - Dark mode needs override in `.dark body` selector

3. **Transition Smoothness:**
   - Add `transition: background-color 200ms, color 200ms` to root
   - Prevent flash on page load by setting theme before render

4. **Chart Gradient Adaptation:**
   - Gradients should use CSS variables so they adapt to theme
   - May need separate gradient definitions for light/dark

### File Structure

```
frontend/src/
├── providers/
│   ├── WebSocketProvider.tsx (existing)
│   └── ThemeProvider.tsx (new)
├── hooks/
│   └── useTheme.ts (new, optional - can export from provider)
├── components/
│   ├── ControlChart.tsx (modify)
│   └── Layout.tsx (modify)
├── index.css (modify)
└── App.tsx (modify)
```

### Plan Breakdown

**Plan 1: Chart Styling Foundation** (Wave 1)
- Add chart CSS variables to index.css
- Add SVG gradient definitions to ControlChart
- Enhance point markers with shapes

**Plan 2: Dark Mode Infrastructure** (Wave 1, parallel)
- Add dark theme CSS variables
- Create ThemeProvider component
- Add toggle to Layout header
- Wrap App with ThemeProvider

**Plan 3: Chart Visual Polish** (Wave 2, depends on Plan 1)
- Add zone gradient backgrounds
- Enhance control lines
- Add entry animation for new points
- Test both themes
