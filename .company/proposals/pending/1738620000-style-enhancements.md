# Proposal: Sepasoft Brand Style Enhancements

**ID**: 1738620000-style-enhancements
**Type**: Scope Change (UI/UX Enhancement)
**From**: CEO
**Date**: 2026-02-03
**Status**: Pending Implementation

---

## Summary

Align OpenSPC UI styling with official Sepasoft brand guidelines and color palette.

## Source References

- **Brand Guidelines**: https://www.sepasoft.com/sepasoft-brand-guidelines/
- **Gradient Tool**: https://s3.amazonaws.com/files.sepasoft.com/internal/tools/gradient.html

---

## Sepasoft Brand Color Palette

### Primary Colors
| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Sepasoft Green** | `#4C9C2E` | rgb(76,156,46) | Primary actions, success states, brand identity |
| **Sepasoft Blue** | `#004A98` | rgb(0,74,152) | Headers, links, primary brand color |

### Secondary Colors
| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Purple** | `#7473C0` | rgb(116,115,192) | Accents, highlights |
| **Teal** | `#62CBC9` | rgb(98,203,201) | Info states, secondary actions |
| **Orange** | `#D48232` | rgb(212,130,50) | Warnings, attention |
| **Yellow** | `#FFCD00` | rgb(255,205,0) | Caution, alerts |
| **Dark Gray** | `#2D2A26` | rgb(45,42,38) | Text, backgrounds |
| **Red** | `#EC1C24` | rgb(236,28,36) | Errors, violations |

### Tertiary Colors (Extended Palette)
| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Slate Blue** | `#516C8E` | rgb(81,108,142) | Muted UI elements |
| **Lime** | `#779800` | rgb(119,152,0) | Alternative success |
| **Navy** | `#23415D` | rgb(35,65,93) | Deep backgrounds |
| **Cerulean** | `#1673A2` | rgb(22,115,162) | Links, interactive |
| **Gold** | `#D3BB2A` | rgb(211,187,42) | Premium indicators |

---

## Proposed Implementation

### Phase 1: Core Theme Colors

Update `frontend/src/index.css` to use Sepasoft brand colors:

```css
@theme {
  /* Primary - Sepasoft Blue */
  --color-primary: hsl(212 100% 30%);           /* #004A98 */
  --color-primary-foreground: hsl(0 0% 100%);

  /* Success - Sepasoft Green */
  --color-success: hsl(104 55% 40%);            /* #4C9C2E */

  /* Warning - Sepasoft Orange */
  --color-warning: hsl(32 63% 51%);             /* #D48232 */

  /* Destructive - Sepasoft Red */
  --color-destructive: hsl(357 80% 52%);        /* #EC1C24 */

  /* Accent - Sepasoft Teal */
  --color-accent: hsl(179 50% 59%);             /* #62CBC9 */

  /* Text - Sepasoft Dark Gray */
  --color-foreground: hsl(30 9% 16%);           /* #2D2A26 */
}
```

### Phase 2: SPC Zone Colors

Map zone colors to Sepasoft palette:

| Zone | Current | Proposed Sepasoft Color |
|------|---------|------------------------|
| Zone C (In Control) | Generic green | Sepasoft Green `#4C9C2E` |
| Zone B (Caution) | Generic yellow | Sepasoft Yellow `#FFCD00` |
| Zone A (Warning) | Generic orange | Sepasoft Orange `#D48232` |
| Violation | Generic red | Sepasoft Red `#EC1C24` |

### Phase 3: Chart Colors

Update chart data visualization to use harmonious Sepasoft colors:

| Element | Color |
|---------|-------|
| Data Line/Bars | Sepasoft Blue `#004A98` |
| Normal Curve | Sepasoft Purple `#7473C0` |
| UCL/LCL Lines | Sepasoft Teal `#62CBC9` |
| USL/LSL Lines | Sepasoft Red `#EC1C24` |
| Center Line | Sepasoft Green `#4C9C2E` |
| Sample Mean (x̄) | Sepasoft Blue `#004A98` |

---

## Typography

Per Sepasoft guidelines:
- **Primary Font**: Twentieth Century (or system sans-serif fallback)
- **Accent Font**: Steiner (for headings, optional)

Since these are proprietary fonts, we'll use:
- **Inter** as primary (modern, clean, similar aesthetic)
- **System fonts** as fallback

---

## Decision

**APPROVED and IMPLEMENTED** - 2026-02-03

CEO approved implementation of Sepasoft brand alignment.

---

## Files to Modify

1. `frontend/src/index.css` - Theme variables and colors
2. `frontend/src/components/ControlChart.tsx` - Chart line colors
3. `frontend/src/components/DistributionHistogram.tsx` - Histogram/curve colors

---

## Notes

The current implementation already uses a modern aesthetic with violet/pink accents (inspired by Linear/Vercel). This proposal would shift to the official Sepasoft industrial palette for brand consistency with the MES ecosystem.
