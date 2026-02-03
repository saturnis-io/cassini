# OpenSPC Responsive Design Specification

## Document Information
- **Project:** OpenSPC - Event-Driven Statistical Process Control System
- **Author:** UI/UX Designer, Virtual Engineering Co.
- **Date:** 2026-02-02
- **Status:** Design Specification

---

## 1. Design Philosophy

### 1.1 Desktop-First Approach

OpenSPC is designed for **factory floor environments** where operators primarily use:
- Large desktop monitors (1920x1080+)
- Mounted displays near machines
- Engineering workstations

The design prioritizes **information density** and **at-a-glance readability** over mobile optimization.

### 1.2 Tablet as Secondary

Tablets (iPad, Surface, industrial tablets) are supported for:
- Supervisor walkarounds
- Quick data entry at remote stations
- Review meetings

### 1.3 Mobile Consideration

Mobile phones are **not the primary target** but should provide:
- Alert notifications
- View-only access to charts
- Quick acknowledgment capability

---

## 2. Breakpoint System

### 2.1 Breakpoint Definitions

| Name | Width | Tailwind | Primary Use Case |
|------|-------|----------|------------------|
| Mobile | < 640px | `sm:` | Phone (view-only, alerts) |
| Tablet | 640-1023px | `md:` | Tablet (portrait) |
| Desktop | 1024-1279px | `lg:` | Small desktop, tablet landscape |
| Wide | 1280-1535px | `xl:` | Standard desktop (1920x1080) |
| Ultra | >= 1536px | `2xl:` | Large monitors, multi-display |

### 2.2 Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
  },
}
```

---

## 3. Layout Behavior by Breakpoint

### 3.1 Operator Dashboard

#### Desktop (xl+): Split Screen

```
+------------------+------------------------------------------+
|    TODO LIST     |              VISUALIZATION               |
|    (320px)       |              (flex-1)                    |
|                  |                                          |
|  [Card]          |  +----------------------------------+    |
|  [Card]          |  |        Control Chart             |    |
|  [Card]          |  |        (60% height)              |    |
|  [Card]          |  +----------------------------------+    |
|  [Card]          |                                          |
|  (scrollable)    |  +----------------------------------+    |
|                  |  |        Histogram                 |    |
|                  |  |        (40% height)              |    |
|                  |  +----------------------------------+    |
+------------------+------------------------------------------+
```

**CSS:**
```css
.dashboard-layout {
  display: flex;
  gap: 1.5rem; /* gap-6 */
}

.todo-panel {
  width: 320px;
  flex-shrink: 0;
}

.viz-panel {
  flex: 1;
  min-width: 0; /* Prevent flex overflow */
}
```

#### Tablet (md-lg): Collapsible Sidebar

```
+------------------------------------------------------+
|  [=] TODO (4)    |    VISUALIZATION                  |
+------------------------------------------------------+
|                                                      |
|  +----------------------------------------------+   |
|  |              Control Chart                    |   |
|  |              (Full width)                     |   |
|  +----------------------------------------------+   |
|                                                      |
|  +----------------------------------------------+   |
|  |              Histogram                        |   |
|  +----------------------------------------------+   |
|                                                      |
+------------------------------------------------------+

[Drawer opens from left when [=] clicked]
+---------------+
| TODO LIST     |
| (280px)       |
|               |
| [Card]        |
| [Card]        |
| [Card]        |
+---------------+
```

**Behavior:**
- Todo list becomes a slide-out drawer (Sheet component)
- Header shows badge with due/OOC count
- Tapping notification icon opens drawer

#### Mobile (< md): Stacked Views

```
+------------------------+
|  OpenSPC    [3] [User] |
+------------------------+
|                        |
|  [Control Chart]       |
|  (Full width)          |
|  (Swipeable)           |
|                        |
+------------------------+
|                        |
|  [Histogram]           |
|  (Collapsible)         |
|                        |
+------------------------+
|  [ Enter Measurement ] |
|  (Fixed bottom button) |
+------------------------+
```

**Behavior:**
- Charts stack vertically
- Histogram collapsed by default (tap to expand)
- Fixed bottom action button for measurement entry
- Todo list accessed via bottom sheet

---

### 3.2 Configuration View

#### Desktop (xl+): Tree + Detail

```
+------------------+------------------------------------------+
|    HIERARCHY     |          CHARACTERISTIC FORM             |
|    TREE          |                                          |
|    (280px)       |  +----------------------------------+    |
|                  |  |   Provider Section               |    |
|  v Site          |  +----------------------------------+    |
|    v Area        |  |   Spec Limits                    |    |
|      > Line      |  +----------------------------------+    |
|                  |  |   Control Limits                 |    |
|                  |  +----------------------------------+    |
|                  |  |   Nelson Rules Grid              |    |
|                  |  +----------------------------------+    |
|                  |                                          |
+------------------+------------------------------------------+
```

#### Tablet (md-lg): Switchable Panels

```
+------------------------------------------------------+
|  [Tree] [Form]        Configuration                  |
+------------------------------------------------------+
|                                                      |
|  (Shows either tree OR form based on tab selection)  |
|                                                      |
|  When Tree selected:                                 |
|  +----------------------------------------------+   |
|  |  v Site                                       |   |
|  |    v Area                                     |   |
|  |      > Line -> [opens form]                   |   |
|  +----------------------------------------------+   |
|                                                      |
+------------------------------------------------------+
```

**Behavior:**
- Tabs switch between tree and form
- Selecting item in tree switches to form tab
- Back button returns to tree

#### Mobile (< md): Full-Screen Navigation

```
Screen 1: Hierarchy        Screen 2: Form
+----------------------+   +----------------------+
| Configuration        |   | < Back               |
+----------------------+   +----------------------+
|                      |   |                      |
| v Site               |   | Shaft Diameter       |
|   v Area             |   |                      |
|     > Line 1    [>]  |   | [Provider Section]   |
|     > Line 2    [>]  |   | [Spec Limits]        |
|                      |   | [Control Limits]     |
|                      |   | [Nelson Rules]       |
|                      |   |                      |
+----------------------+   +----------------------+
```

**Behavior:**
- Full-screen tree navigation
- Selecting item pushes form screen
- Back navigation returns to tree

---

### 3.3 Input Modal

#### Desktop/Tablet: Centered Modal

```
+------------------------------------------------------------------+
|                                                                   |
|         +-----------------------------------------------+         |
|         |              ENTER MEASUREMENT                |         |
|         |                                               |         |
|         |  Specification: 25.00 +/- 0.15 mm            |         |
|         |                                               |         |
|         |         +---------------------+               |         |
|         |         |      [ 25.08 ]      |               |         |
|         |         +---------------------+               |         |
|         |                                               |         |
|         |  [Spec Position Indicator]                    |         |
|         |                                               |         |
|         |  Comment: [___________________]               |         |
|         |                                               |         |
|         |      [ Cancel ]    [ Submit ]                 |         |
|         +-----------------------------------------------+         |
|                                                                   |
+------------------------------------------------------------------+
```

**Width:** `max-w-[500px]`

#### Mobile: Bottom Sheet

```
+------------------------+
|                        |
|  (Page content dimmed) |
|                        |
+========================+
|  ENTER MEASUREMENT     |
|                        |
|  Shaft Diameter        |
|  Spec: 25.00 +/- 0.15  |
|                        |
|  +------------------+  |
|  |    [ 25.08 ]     |  |
|  +------------------+  |
|                        |
|  [Spec Indicator]      |
|                        |
|  Comment: [________]   |
|                        |
|  [Cancel] [Submit]     |
+------------------------+
```

**Behavior:**
- Full-width bottom sheet
- Swipe down to dismiss
- Keyboard-aware positioning

---

## 4. Component Responsive Behavior

### 4.1 TodoCard

| Breakpoint | Behavior |
|------------|----------|
| Desktop | Fixed 320px width, full content |
| Tablet | Full width in drawer, condensed |
| Mobile | Full width, tap for details |

**Condensed mode (tablet/mobile):**
```tsx
<div className="flex items-center justify-between p-3">
  <div className="flex items-center gap-2">
    <StatusIcon status={status} />
    <span className="font-medium truncate">{name}</span>
  </div>
  <Badge>{formatDue(nextDue)}</Badge>
</div>
```

### 4.2 ControlChart

| Breakpoint | Height | Behavior |
|------------|--------|----------|
| Desktop | 400px | Full features, hover tooltips |
| Tablet | 350px | Full features |
| Mobile | 250px | Simplified, tap tooltips |

**Responsive props:**
```tsx
const chartHeight = {
  default: 250,
  md: 350,
  xl: 400,
};

// In component
<ResponsiveContainer
  width="100%"
  height={useBreakpointValue(chartHeight)}
>
```

**Mobile simplifications:**
- Hide axis labels
- Reduce tick count
- Larger touch targets for points (12px radius)
- Tap-to-show tooltip instead of hover

### 4.3 NelsonRulesGrid

| Breakpoint | Layout |
|------------|--------|
| Desktop | 2 columns |
| Tablet | 2 columns |
| Mobile | 1 column |

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
  {/* Rule checkboxes */}
</div>
```

### 4.4 CharacteristicForm

| Breakpoint | Layout |
|------------|--------|
| Desktop | Sections in cards, 3-col inputs |
| Tablet | Sections in cards, 2-col inputs |
| Mobile | Accordion sections, stacked inputs |

**Mobile accordion pattern:**
```tsx
<Accordion type="single" collapsible>
  <AccordionItem value="provider">
    <AccordionTrigger>Data Provider</AccordionTrigger>
    <AccordionContent>{/* Provider fields */}</AccordionContent>
  </AccordionItem>
  <AccordionItem value="specs">
    <AccordionTrigger>Specification Limits</AccordionTrigger>
    <AccordionContent>{/* Spec fields */}</AccordionContent>
  </AccordionItem>
  {/* ... */}
</Accordion>
```

---

## 5. Touch Target Guidelines

### 5.1 Minimum Sizes

For factory floor tablet use with gloves:

| Element | Desktop | Tablet/Mobile |
|---------|---------|---------------|
| Button | 32px | 44px min |
| Checkbox | 16px | 24px + 44px touch area |
| List item | 40px | 52px |
| Chart point | 8px | 12px + 24px touch area |
| Tree node | 28px | 44px |

### 5.2 Implementation

```css
/* Ensure touch targets */
@media (hover: none) and (pointer: coarse) {
  .button {
    min-height: 44px;
    min-width: 44px;
  }

  .checkbox-wrapper {
    padding: 12px;
  }

  .list-item {
    padding-block: 14px;
  }
}
```

**Tailwind utility classes:**
```tsx
<Button className="h-8 md:h-11">
<Checkbox className="h-4 w-4 md:h-6 md:w-6" />
<div className="py-2 md:py-3.5">
```

---

## 6. Typography Scaling

### 6.1 Responsive Type Scale

| Element | Mobile | Tablet | Desktop |
|---------|--------|--------|---------|
| Page title | 24px | 30px | 36px |
| Section heading | 18px | 20px | 24px |
| Card title | 16px | 16px | 18px |
| Body text | 14px | 14px | 16px |
| Caption | 12px | 12px | 12px |
| Measurement input | 36px | 42px | 48px |

**Tailwind classes:**
```tsx
<h1 className="text-2xl md:text-3xl xl:text-4xl font-bold">
<h2 className="text-lg md:text-xl xl:text-2xl font-semibold">
<p className="text-sm md:text-base">
<input className="text-4xl md:text-5xl xl:text-6xl font-mono">
```

---

## 7. Navigation Patterns

### 7.1 Desktop Navigation

```
+-----------------------------------------------------------------------------------+
|  [Logo]  OpenSPC     [Dashboard]  [Configuration]  [Alerts (3)]     [User v]     |
+-----------------------------------------------------------------------------------+
```

- Horizontal top navigation
- All items visible
- Badge counts inline

### 7.2 Tablet Navigation

```
+------------------------------------------+
|  [Logo]  OpenSPC         [Alerts] [User] |
+------------------------------------------+
|  [Dashboard]  [Configuration]            |
+------------------------------------------+
```

- Two-row header
- Primary nav in second row
- Condensed user menu

### 7.3 Mobile Navigation

```
+------------------------------------------+
|  [=]  OpenSPC              [3]  [Avatar] |
+------------------------------------------+
```

**Hamburger menu (Sheet):**
```
+------------------------------------------+
| [X] Menu                                 |
+------------------------------------------+
|                                          |
|  [Dashboard icon]   Dashboard            |
|  [Config icon]      Configuration        |
|  [Alert icon]       Alerts (3)           |
|                                          |
|  ---------------------------------       |
|                                          |
|  Plant: [Acme East v]                    |
|  Settings                                |
|  Help                                    |
|  Sign Out                                |
|                                          |
+------------------------------------------+
```

---

## 8. Landscape vs Portrait (Tablets)

### 8.1 iPad Landscape (1024x768+)

Behaves like **Desktop (lg)** breakpoint:
- Side-by-side layout
- Full feature set

### 8.2 iPad Portrait (768x1024)

Behaves like **Tablet (md)** breakpoint:
- Collapsible sidebar
- Stacked sections where needed

### 8.3 Orientation Change Handling

```typescript
// Hook to handle orientation
const useOrientation = () => {
  const [isLandscape, setIsLandscape] = useState(
    window.matchMedia('(orientation: landscape)').matches
  );

  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches);
    const mql = window.matchMedia('(orientation: landscape)');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isLandscape;
};
```

**Chart reflow on orientation change:**
```tsx
const isLandscape = useOrientation();

// Force chart reflow when orientation changes
useEffect(() => {
  // Trigger Recharts resize
  window.dispatchEvent(new Event('resize'));
}, [isLandscape]);
```

---

## 9. Performance Considerations

### 9.1 Chart Optimization for Mobile

- Reduce point count on mobile (downsample)
- Disable animations on low-power devices
- Lazy load histogram (collapsed by default)

```typescript
const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = window.matchMedia('(max-width: 768px)').matches;

<ControlChart
  animationDuration={shouldReduceMotion || isMobile ? 0 : 300}
  maxPoints={isMobile ? 50 : 100}
/>
```

### 9.2 Image and Asset Loading

- Use responsive images for any backgrounds
- Lazy load off-screen components
- Preload critical fonts

```tsx
// Lazy load non-critical components
const DistributionHistogram = lazy(() =>
  import('./components/charts/DistributionHistogram')
);

// In render
<Suspense fallback={<Skeleton className="h-48" />}>
  <DistributionHistogram />
</Suspense>
```

---

## 10. Testing Matrix

### 10.1 Required Test Devices/Viewports

| Device | Resolution | Breakpoint | Priority |
|--------|------------|------------|----------|
| Desktop Monitor | 1920x1080 | xl | P1 |
| Laptop | 1366x768 | lg | P1 |
| iPad Pro Landscape | 1366x1024 | lg | P2 |
| iPad Pro Portrait | 1024x1366 | md | P2 |
| iPad Mini | 768x1024 | md | P3 |
| iPhone 14 Pro | 393x852 | sm | P3 |

### 10.2 Playwright Viewport Tests

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    {
      name: 'Desktop',
      use: { viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'Tablet',
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'Mobile',
      use: { viewport: { width: 393, height: 852 } },
    },
  ],
});
```

---

## 11. CSS Media Query Reference

```css
/* Tailwind equivalents */

/* Mobile-first (default styles apply to smallest) */
.component {
  /* Mobile styles (< 640px) */
}

@media (min-width: 640px) {
  .component {
    /* sm: Small tablets */
  }
}

@media (min-width: 768px) {
  .component {
    /* md: Tablets */
  }
}

@media (min-width: 1024px) {
  .component {
    /* lg: Small desktops, tablet landscape */
  }
}

@media (min-width: 1280px) {
  .component {
    /* xl: Standard desktops */
  }
}

@media (min-width: 1536px) {
  .component {
    /* 2xl: Large monitors */
  }
}

/* Touch device detection */
@media (hover: none) and (pointer: coarse) {
  /* Touch-only styles */
}

/* High-density displays */
@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
  /* Retina styles */
}
```

---

*End of Responsive Design Specification*
