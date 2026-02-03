# OpenSPC Design System

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** UI/UX Designer, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Design Specification

---

## 1. Color Palette

### 1.1 Brand Colors

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Primary | `#2563EB` | `blue-600` | Primary actions, active states, links |
| Primary Hover | `#1D4ED8` | `blue-700` | Button hover states |
| Primary Light | `#DBEAFE` | `blue-100` | Selected backgrounds, highlights |

### 1.2 Semantic Colors

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Success | `#16A34A` | `green-600` | Valid inputs, success states |
| Success Light | `#DCFCE7` | `green-100` | Success backgrounds |
| Warning | `#CA8A04` | `yellow-600` | Warnings, sample due states |
| Warning Light | `#FEF9C3` | `yellow-100` | Warning backgrounds |
| Error | `#DC2626` | `red-600` | Errors, violations, OOC states |
| Error Light | `#FEE2E2` | `red-100` | Error backgrounds |

### 1.3 Neutral Colors

| Name | Hex | Tailwind | Usage |
|------|-----|----------|-------|
| Text Primary | `#111827` | `gray-900` | Headings, primary text |
| Text Secondary | `#4B5563` | `gray-600` | Secondary text, labels |
| Text Muted | `#9CA3AF` | `gray-400` | Placeholder, disabled text |
| Border | `#E5E7EB` | `gray-200` | Card borders, dividers |
| Border Hover | `#D1D5DB` | `gray-300` | Border hover states |
| Background | `#F9FAFB` | `gray-50` | Page background |
| Surface | `#FFFFFF` | `white` | Cards, modals |

### 1.4 Control Chart Zone Colors

These colors are specifically designed for SPC control charts with visual hierarchy indicating statistical significance.

| Zone | Background | Border | Opacity | Tailwind Config |
|------|------------|--------|---------|-----------------|
| +/-3 Sigma (Critical) | `#FEE2E2` | `#EF4444` | 40% | `red-100/40`, `red-500` |
| +/-2 Sigma (Warning) | `#FEF3C7` | `#F59E0B` | 40% | `amber-100/40`, `amber-500` |
| +/-1 Sigma (Normal) | `#DCFCE7` | `#22C55E` | 30% | `green-100/30`, `green-500` |
| Center Line | - | `#2563EB` | 100% | `blue-600` |
| Spec Limits (USL/LSL) | `#FEE2E2` | `#DC2626` | 20% | `red-100/20`, `red-600` |

### 1.5 Todo Card Status Colors

| Status | Background | Border | Icon Color | Tailwind Classes |
|--------|------------|--------|------------|------------------|
| Grey (No Sample Due) | `#F9FAFB` | `#E5E7EB` | `#9CA3AF` | `bg-gray-50 border-gray-200` |
| Yellow (Sample Due) | `#FEF9C3` | `#CA8A04` | `#CA8A04` | `bg-yellow-100 border-yellow-600` |
| Red (Last OOC) | `#FEE2E2` | `#DC2626` | `#DC2626` | `bg-red-100 border-red-600` |

### 1.6 Chart Data Point Colors

| State | Fill | Stroke | Tailwind |
|-------|------|--------|----------|
| Normal Point | `#2563EB` | `#1D4ED8` | `fill-blue-600 stroke-blue-700` |
| Warning Point | `#F59E0B` | `#D97706` | `fill-amber-500 stroke-amber-600` |
| Violation Point | `#EF4444` | `#DC2626` | `fill-red-500 stroke-red-600` |
| Selected Point | `#7C3AED` | `#6D28D9` | `fill-violet-500 stroke-violet-600` |

### 1.7 Dark Mode Palette (Factory Floor Consideration)

For factory environments with varying lighting conditions:

| Element | Light Mode | Dark Mode |
|---------|------------|-----------|
| Background | `gray-50` | `gray-900` |
| Surface | `white` | `gray-800` |
| Text Primary | `gray-900` | `gray-100` |
| Text Secondary | `gray-600` | `gray-400` |
| Border | `gray-200` | `gray-700` |
| Primary | `blue-600` | `blue-500` |

---

## 2. Typography Scale

### 2.1 Font Family

```css
/* Primary font stack */
font-family: 'Inter', system-ui, -apple-system, sans-serif;

/* Monospace for measurements */
font-family: 'JetBrains Mono', 'Fira Code', monospace;
```

**Tailwind Configuration:**
```javascript
fontFamily: {
  sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
  mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
}
```

### 2.2 Type Scale

| Name | Size | Line Height | Weight | Tailwind | Usage |
|------|------|-------------|--------|----------|-------|
| Display | 36px | 40px | 700 | `text-4xl font-bold` | Page titles |
| Heading 1 | 30px | 36px | 600 | `text-3xl font-semibold` | Section headers |
| Heading 2 | 24px | 32px | 600 | `text-2xl font-semibold` | Card titles |
| Heading 3 | 20px | 28px | 500 | `text-xl font-medium` | Subsection titles |
| Body Large | 18px | 28px | 400 | `text-lg` | Emphasized content |
| Body | 16px | 24px | 400 | `text-base` | Default text |
| Body Small | 14px | 20px | 400 | `text-sm` | Secondary text, captions |
| Caption | 12px | 16px | 400 | `text-xs` | Labels, timestamps |
| Overline | 12px | 16px | 600 | `text-xs font-semibold uppercase tracking-wider` | Section labels |

### 2.3 Numeric Display (Measurements)

For measurement inputs and displays, use monospace with larger sizes:

| Context | Size | Weight | Tailwind |
|---------|------|--------|----------|
| Large Input | 48px | 500 | `text-5xl font-mono font-medium` |
| Chart Value | 14px | 500 | `text-sm font-mono font-medium` |
| Axis Label | 12px | 400 | `text-xs font-mono` |
| Table Data | 14px | 400 | `text-sm font-mono` |

---

## 3. Spacing System

### 3.1 Base Unit

The spacing system uses 4px as the base unit.

| Name | Value | Tailwind | Usage |
|------|-------|----------|-------|
| 0 | 0px | `0` | Reset |
| 1 | 4px | `1` | Tight spacing |
| 2 | 8px | `2` | Icon gaps, dense layouts |
| 3 | 12px | `3` | Input padding |
| 4 | 16px | `4` | Card padding, standard gaps |
| 5 | 20px | `5` | Section spacing |
| 6 | 24px | `6` | Large gaps |
| 8 | 32px | `8` | Section margins |
| 10 | 40px | `10` | Large section margins |
| 12 | 48px | `12` | Page margins |
| 16 | 64px | `16` | Large page sections |

### 3.2 Component Spacing Guidelines

| Component | Padding | Gap | Margin |
|-----------|---------|-----|--------|
| Button | `px-4 py-2` | - | - |
| Card | `p-4` or `p-6` | - | `mb-4` |
| Modal | `p-6` | `gap-4` | - |
| Input | `px-3 py-2` | - | `mb-4` |
| List Item | `px-4 py-3` | - | - |
| Chart Container | `p-4` | - | - |
| Todo Card | `p-4` | `gap-2` | `mb-3` |
| Form Section | `p-4` | `gap-4` | `mb-6` |

### 3.3 Layout Grid

**Dashboard Split:**
- Left Panel (Todo List): 320px fixed width (desktop), 100% (mobile)
- Right Panel (Visualization): Flex 1 (remaining space)
- Gap: 24px (`gap-6`)

**Configuration Split:**
- Left Panel (Tree): 280px fixed width
- Right Panel (Form): Flex 1
- Gap: 24px (`gap-6`)

---

## 4. Border and Shadow System

### 4.1 Border Radius

| Name | Value | Tailwind | Usage |
|------|-------|----------|-------|
| None | 0px | `rounded-none` | Tables, full-width elements |
| Small | 4px | `rounded` | Badges, small elements |
| Default | 6px | `rounded-md` | Buttons, inputs |
| Medium | 8px | `rounded-lg` | Cards, modals |
| Large | 12px | `rounded-xl` | Large cards, panels |
| Full | 9999px | `rounded-full` | Avatars, pills |

### 4.2 Borders

| Variant | Tailwind | Usage |
|---------|----------|-------|
| Default | `border border-gray-200` | Cards, inputs |
| Focused | `border-2 border-blue-500` | Focus states |
| Error | `border-2 border-red-500` | Validation errors |
| Warning | `border-2 border-yellow-500` | Warning states |
| Success | `border-2 border-green-500` | Valid inputs |

### 4.3 Shadows

| Name | Tailwind | Usage |
|------|----------|-------|
| None | `shadow-none` | Flat elements |
| Small | `shadow-sm` | Subtle elevation |
| Default | `shadow` | Cards, dropdowns |
| Medium | `shadow-md` | Modals, popovers |
| Large | `shadow-lg` | Floating elements |
| XL | `shadow-xl` | Overlays, dialogs |

---

## 5. Component Inventory

### 5.1 shadcn/ui Components Required

| Component | shadcn/ui Name | OpenSPC Usage |
|-----------|----------------|---------------|
| Button | `button` | All actions |
| Input | `input` | Text and numeric inputs |
| Select | `select` | Dropdowns, reason codes |
| Checkbox | `checkbox` | Nelson rule toggles |
| Radio Group | `radio-group` | Provider selection |
| Card | `card` | Todo cards, panels |
| Dialog | `dialog` | Input modal, acknowledgment |
| Sheet | `sheet` | Alert history drawer |
| Toast | `toast` (sonner) | Violation notifications |
| Tooltip | `tooltip` | Chart point details |
| Popover | `popover` | Quick info panels |
| Tabs | `tabs` | Chart type selection |
| Accordion | `accordion` | Hierarchy tree (or custom) |
| Badge | `badge` | Status indicators |
| Separator | `separator` | Visual dividers |
| Skeleton | `skeleton` | Loading states |
| Alert | `alert` | Inline warnings |
| Label | `label` | Form labels |
| Textarea | `textarea` | Comments, corrective actions |
| ScrollArea | `scroll-area` | Todo list, tree scrolling |
| Command | `command` | Tag browser search |
| Table | `table` | Data displays |

### 5.2 Custom Components Needed

| Component | Description | Base |
|-----------|-------------|------|
| TodoCard | Status-colored measurement card | Card variant |
| ControlChart | X-Bar/I-MR with zones | Recharts + custom |
| ChartZone | Zone band rendering | Recharts ReferenceArea |
| HierarchyTree | ISA-95 tree navigator | Custom or Accordion |
| MeasurementInput | Large numeric input | Input variant |
| ZoneIndicator | Visual spec position | Custom SVG |
| ViolationPulse | Pulsing point animation | CSS animation |
| StatusBadge | Card status indicator | Badge variant |

### 5.3 Icon Library

Use **Lucide React** (included with shadcn/ui):

| Icon | Name | Usage |
|------|------|-------|
| AlertTriangle | `alert-triangle` | Warnings, violations |
| AlertCircle | `alert-circle` | Errors |
| CheckCircle | `check-circle` | Success, acknowledged |
| Clock | `clock` | Time indicators |
| Settings | `settings` | Configuration |
| ChevronRight | `chevron-right` | Tree expansion |
| ChevronDown | `chevron-down` | Tree collapse |
| Plus | `plus` | Add actions |
| X | `x` | Close, cancel |
| BarChart3 | `bar-chart-3` | Charts |
| LineChart | `line-chart` | Control chart |
| Bell | `bell` | Notifications |
| Search | `search` | Tag browser |
| Filter | `filter` | List filtering |
| Download | `download` | Export |
| RefreshCw | `refresh-cw` | Recalculate |
| Eye | `eye` | View details |
| Edit | `edit` | Edit mode |
| Trash2 | `trash-2` | Delete |
| Folder | `folder` | Hierarchy node |
| FolderOpen | `folder-open` | Expanded node |
| CircleDot | `circle-dot` | Characteristic |
| Activity | `activity` | Real-time indicator |

---

## 6. Animation and Motion

### 6.1 Timing Functions

| Name | Easing | Tailwind | Usage |
|------|--------|----------|-------|
| Default | `ease-in-out` | `ease-in-out` | General transitions |
| Enter | `ease-out` | `ease-out` | Elements appearing |
| Exit | `ease-in` | `ease-in` | Elements disappearing |
| Bounce | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` | Custom | Attention-grabbing |

### 6.2 Duration

| Name | Value | Tailwind | Usage |
|------|-------|----------|-------|
| Fast | 150ms | `duration-150` | Hover states |
| Default | 200ms | `duration-200` | Standard transitions |
| Medium | 300ms | `duration-300` | Modals, panels |
| Slow | 500ms | `duration-500` | Page transitions |

### 6.3 Key Animations

**Violation Pulse (CSS Keyframes):**
```css
@keyframes violation-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.8;
  }
}

.violation-point {
  animation: violation-pulse 1.5s ease-in-out infinite;
}
```

**Toast Slide-In:**
```css
@keyframes toast-slide {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

**Skeleton Loading:**
```css
@keyframes skeleton-pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
```

### 6.4 Tailwind Animation Classes

```javascript
// tailwind.config.js
extend: {
  animation: {
    'violation-pulse': 'violation-pulse 1.5s ease-in-out infinite',
    'toast-slide': 'toast-slide 0.3s ease-out',
    'skeleton': 'skeleton-pulse 2s ease-in-out infinite',
  },
  keyframes: {
    'violation-pulse': {
      '0%, 100%': { transform: 'scale(1)', opacity: '1' },
      '50%': { transform: 'scale(1.3)', opacity: '0.8' },
    },
    'toast-slide': {
      from: { transform: 'translateX(100%)', opacity: '0' },
      to: { transform: 'translateX(0)', opacity: '1' },
    },
    'skeleton-pulse': {
      '0%, 100%': { opacity: '1' },
      '50%': { opacity: '0.5' },
    },
  },
}
```

---

## 7. Accessibility Guidelines

### 7.1 Color Contrast

All color combinations must meet WCAG 2.1 AA standards:
- Normal text: 4.5:1 minimum contrast ratio
- Large text (18px+): 3:1 minimum contrast ratio
- UI components: 3:1 minimum contrast ratio

### 7.2 Focus States

All interactive elements must have visible focus indicators:
```css
.focus-visible:focus {
  outline: 2px solid #2563EB;
  outline-offset: 2px;
}
```

Tailwind: `focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2`

### 7.3 Touch Targets

Minimum touch target size: 44x44 pixels for factory floor tablet use.

### 7.4 Screen Reader Support

- All images have alt text
- Form inputs have associated labels
- Charts have aria-describedby for summary text
- Status changes announced via aria-live regions

---

## 8. Tailwind Configuration Summary

```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Zone colors for charts
        zone: {
          green: {
            bg: 'rgba(220, 252, 231, 0.3)',
            border: '#22C55E',
          },
          yellow: {
            bg: 'rgba(254, 243, 199, 0.4)',
            border: '#F59E0B',
          },
          red: {
            bg: 'rgba(254, 226, 226, 0.4)',
            border: '#EF4444',
          },
        },
        // Card status colors
        status: {
          due: {
            bg: '#FEF9C3',
            border: '#CA8A04',
          },
          ooc: {
            bg: '#FEE2E2',
            border: '#DC2626',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'violation-pulse': 'violation-pulse 1.5s ease-in-out infinite',
        'toast-slide': 'toast-slide 0.3s ease-out',
      },
      keyframes: {
        'violation-pulse': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.3)', opacity: '0.8' },
        },
        'toast-slide': {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('tailwindcss-animate'),
  ],
}
```

---

*End of Design System Document*
