# Proposal: Sepasoft Brand Styling Update

## Problem Statement

The current UI uses generic default colors and looks "boring" - no distinctive brand identity.

## Sepasoft Brand Guidelines

Source: https://www.sepasoft.com/sepasoft-brand-guidelines/

### Primary Colors
| Name | Hex | HSL (approx) | Usage |
|------|-----|--------------|-------|
| **Sepasoft Green** | #4C9C2E | 104 55% 40% | Primary actions, success states |
| **Sepasoft Blue** | #004A98 | 212 100% 30% | Headers, links, primary brand |
| **Dark Gray** | #2D2A26 | 30 9% 16% | Text, backgrounds |

### Secondary Colors
| Name | Hex | HSL (approx) | Usage |
|------|-----|--------------|-------|
| **Purple** | #7473C0 | 241 38% 60% | Accents |
| **Teal** | #62CBC9 | 179 50% 59% | Info states, charts |
| **Orange** | #D48232 | 32 63% 51% | Warnings |
| **Yellow** | #FFCD00 | 48 100% 50% | Alerts, Zone B |

### Typography
- **Primary**: Twentieth Century (or fallback: system sans-serif)
- **Accent**: Steiner (or fallback: system serif for headings)

## Proposed Theme

### CSS Variables Update (`index.css`)

```css
@theme {
  /* Base - Dark Gray */
  --color-background: hsl(30 9% 98%);
  --color-foreground: hsl(30 9% 16%);  /* #2D2A26 */

  /* Card surfaces */
  --color-card: hsl(0 0% 100%);
  --color-card-foreground: hsl(30 9% 16%);

  /* Primary - Sepasoft Blue */
  --color-primary: hsl(212 100% 30%);  /* #004A98 */
  --color-primary-foreground: hsl(0 0% 100%);

  /* Secondary - Light blue tint */
  --color-secondary: hsl(212 40% 95%);
  --color-secondary-foreground: hsl(212 100% 30%);

  /* Accent - Sepasoft Green */
  --color-accent: hsl(104 55% 40%);  /* #4C9C2E */
  --color-accent-foreground: hsl(0 0% 100%);

  /* Semantic colors */
  --color-destructive: hsl(0 84% 60%);
  --color-warning: hsl(32 63% 51%);  /* #D48232 Orange */
  --color-success: hsl(104 55% 40%);  /* #4C9C2E Green */

  /* Muted */
  --color-muted: hsl(210 20% 96%);
  --color-muted-foreground: hsl(215 16% 47%);

  /* Borders */
  --color-border: hsl(214 32% 91%);
  --color-input: hsl(214 32% 91%);
  --color-ring: hsl(212 100% 30%);

  /* SPC Zone colors (updated) */
  --color-zone-c: hsl(104 55% 40%);  /* Green - in control */
  --color-zone-b: hsl(48 100% 50%);  /* Yellow */
  --color-zone-a: hsl(32 63% 51%);   /* Orange - approaching limits */
  --color-violation: hsl(0 84% 60%);  /* Red - out of control */
}
```

### Dark Mode Support (Future)

```css
@media (prefers-color-scheme: dark) {
  @theme {
    --color-background: hsl(30 9% 10%);
    --color-foreground: hsl(30 9% 90%);
    --color-card: hsl(30 9% 14%);
    --color-primary: hsl(212 80% 50%);
    /* ... */
  }
}
```

## Visual Changes Summary

| Element | Before | After |
|---------|--------|-------|
| Primary buttons | Dark gray | Sepasoft Blue (#004A98) |
| Success indicators | Generic green | Sepasoft Green (#4C9C2E) |
| Warning states | Yellow | Sepasoft Orange (#D48232) |
| Chart data line | Dark gray | Sepasoft Blue |
| Zone C (in control) | Generic green | Sepasoft Green |
| Headers/Links | Generic | Sepasoft Blue |

## Implementation Scope

### Phase 1: Core Theme (This Proposal)
- Update `index.css` with Sepasoft colors
- Verify all components render correctly
- No structural changes

### Phase 2: Enhanced Polish (Future)
- Add Sepasoft logo to header
- Typography refinements
- Dark mode support
- Custom chart styling

## Files to Modify

1. `frontend/src/index.css` - Theme variables
2. `frontend/src/components/ControlChart.tsx` - Chart colors reference updated variables

## Acceptance Criteria

- [ ] Primary actions use Sepasoft Blue
- [ ] Success states use Sepasoft Green
- [ ] Warning states use Sepasoft Orange
- [ ] SPC zones use appropriate brand colors
- [ ] UI feels cohesive with Sepasoft brand identity
- [ ] No accessibility regressions (contrast ratios maintained)

## Decision Needed

Approve Phase 1 styling update for implementation?
