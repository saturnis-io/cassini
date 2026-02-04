# Phase 3.4 Decisions

## CEO Selections (2026-02-04)

### 1. Time Range Selection
**Choice: C) Hybrid**
- Point presets: "Last 50", "Last 100", "Last 200"
- Time presets: "Last hour", "Last 8h (shift)", "Last 24h", "Last 7 days"
- Custom date range picker for specific periods

### 2. Violation Annotations
**Choice: C) Legend markers**
- Numbered markers on violation points (1-8 corresponding to Nelson rules)
- Collapsible legend below chart showing triggered rules
- Legend items link to HelpTooltip content for rule explanations

### 3. Comparison Mode
**Choice: A) Split vertical**
- Two charts stacked vertically
- Independent characteristic selection per chart
- Synchronized time axis (when time ranges match)
- Toggle button to enter/exit comparison mode

### 4. Histogram Display
**Choice: C) Toggle panel**
- Button in chart toolbar to show/hide histogram
- Remembers preference in localStorage
- When visible, appears below chart (current position)
- Collapsed by default for cleaner initial view

---

## Implementation Priority

1. Time Range Selection (highest impact)
2. Violation Annotations (aids troubleshooting)
3. Toggle Histogram (quick win)
4. Comparison Mode (more complex)
