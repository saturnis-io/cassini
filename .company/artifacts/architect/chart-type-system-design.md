# Architecture Design: Comprehensive SPC Chart Type Support System

## Executive Summary

This design document outlines the architecture for expanding OpenSPC to support multiple SPC chart types beyond the current X-bar chart. The approved scope includes: XBar-Range, XBar-S, Individual (I-MR), Pareto, p/np/c/u attribute charts, and Box & Whisker plots.

The design prioritizes UI discoverability, seamless navigation between chart types, and maintainable code architecture.

---

## 1. Component Architecture

### 1.1 System Overview

```
                    +------------------+
                    |  OperatorDashboard|
                    +--------+---------+
                             |
              +--------------+---------------+
              |                              |
   +----------v-----------+    +-------------v-----------+
   |  HierarchyTodoList   |    |     ChartContainer      |
   | (characteristic      |    | (orchestrates chart     |
   |  selection)          |    |  rendering)             |
   +----------------------+    +-------------+-----------+
                                             |
              +------------------------------+-------------------------------+
              |                              |                               |
   +----------v-----------+    +-------------v-----------+    +--------------v-----------+
   |   ChartToolbar       |    |     ChartTypeSelector   |    |    ChartConfigPanel      |
   | (time/histogram      |    | (chart type switching   |    | (type-specific config)   |
   |  controls)           |    |  dropdown/tabs)         |    |                          |
   +----------------------+    +-------------------------+    +--------------------------+
                                             |
              +------------------------------+-------------------------------+
              |                              |                               |
   +----------v-----------+    +-------------v-----------+    +--------------v-----------+
   |  DualChartPanel      |    |   SingleChartPanel      |    |   AnalysisChartPanel     |
   | (X-bar/Range,        |    | (p, np, c, u charts)    |    | (Pareto, Box-Whisker)    |
   |  X-bar/S, I-MR)      |    |                         |    |                          |
   +----------+-----------+    +-------------------------+    +--------------------------+
              |
   +----------+----------+
   |                     |
   v                     v
+------+            +-------+
|XBarChart|         |RangeChart|
+------+            +-------+
```

### 1.2 Design Patterns

| Layer | Pattern | Rationale |
|-------|---------|-----------|
| Chart Rendering | Strategy Pattern | Different chart types implement common interface |
| Chart Configuration | Factory Pattern | ChartConfigFactory creates type-specific config panels |
| State Management | Zustand Store | Centralized chart state, persisted preferences |
| Data Fetching | React Query + Custom Hooks | Consistent data loading with caching |
| UI Components | Composition Pattern | Build complex layouts from simple, reusable components |
| Chart Registration | Registry Pattern | Extensible chart type system for future additions |

### 1.3 File Organization

```
src/
  components/
    charts/
      ChartContainer.tsx          # Main orchestrator
      ChartTypeSelector.tsx       # Chart type dropdown/tabs
      ChartConfigPanel.tsx        # Type-specific configuration
      DualChartPanel.tsx          # Synchronized dual-chart layout
      SingleChartPanel.tsx        # Single chart layout
      AnalysisChartPanel.tsx      # Analysis charts container

      control/                    # Control charts
        XBarChart.tsx             # X-bar (averages) chart
        RangeChart.tsx            # Range chart
        SChart.tsx                # Standard deviation chart
        IndividualsChart.tsx      # Individuals chart
        MovingRangeChart.tsx      # Moving range chart
        PChart.tsx                # Proportion defective
        NPChart.tsx               # Number defective
        CChart.tsx                # Defects per unit
        UChart.tsx                # Defects per unit (variable sample)

      analysis/                   # Analysis charts
        ParetoChart.tsx           # Pareto analysis
        BoxWhiskerChart.tsx       # Box & whisker plot

      shared/                     # Shared chart components
        ControlLimits.tsx         # UCL/LCL/CL rendering
        SpecLimits.tsx            # USL/LSL rendering
        ZoneShading.tsx           # Zone A/B/C shading
        ViolationMarkers.tsx      # Violation point markers
        ChartTooltip.tsx          # Unified tooltip component

    config/
      AttributeDataEntry.tsx      # Pass/fail, defect count entry
      ChartTypeIcon.tsx           # Icons for each chart type

  stores/
    chartStore.ts                 # Chart-specific state

  types/
    charts.ts                     # Chart type definitions

  lib/
    chart-registry.ts             # Chart type registration
    chart-calculations.ts         # Statistical calculations per type
    control-limit-formulas.ts     # UCL/LCL formulas per chart type
```

---

## 2. Chart Type Registry

### 2.1 Chart Type Definition

```typescript
export type ChartCategory = 'variable' | 'attribute' | 'analysis'

export type ChartTypeId =
  | 'xbar-r'      // X-bar and Range
  | 'xbar-s'      // X-bar and S
  | 'i-mr'        // Individuals and Moving Range
  | 'p'           // Proportion defective
  | 'np'          // Number defective
  | 'c'           // Defects per unit
  | 'u'           // Defects per unit (variable)
  | 'pareto'      // Pareto analysis
  | 'box-whisker' // Box and whisker plot

export interface ChartTypeDefinition {
  id: ChartTypeId
  name: string
  shortName: string
  category: ChartCategory
  description: string
  icon: LucideIcon

  // Configuration
  requiresSubgroupSize: boolean
  minSubgroupSize: number
  maxSubgroupSize: number | null

  // Data requirements
  dataType: 'continuous' | 'attribute'
  attributeType?: 'defective' | 'defects'

  // Layout
  isDualChart: boolean
  primaryChartLabel?: string
  secondaryChartLabel?: string

  // Control limit formulas
  controlLimitMethod: 'rbar-d2' | 'sbar-c4' | 'mr-d2' | 'attribute-binomial' | 'attribute-poisson'

  // Compatibility check
  isCompatible: (characteristic: Characteristic) => boolean
}
```

### 2.2 Chart Types Configuration

| Chart | Category | Subgroup Size | Dual Chart | Control Limit Method |
|-------|----------|---------------|------------|---------------------|
| X-bar R | Variable | 2-10 | Yes (X-bar + Range) | R-bar/d2 |
| X-bar S | Variable | >10 | Yes (X-bar + S) | S-bar/c4 |
| I-MR | Variable | 1 | Yes (I + MR) | MR-bar/d2 |
| p | Attribute | Any | No | Binomial |
| np | Attribute | Constant | No | Binomial |
| c | Attribute | Constant area | No | Poisson |
| u | Attribute | Variable area | No | Poisson |
| Pareto | Analysis | N/A | No | N/A |
| Box-Whisker | Analysis | N/A | No | N/A |

---

## 3. UI/UX Wireframes

### 3.1 Chart Type Selector (Toolbar Integration)

```
+-----------------------------------------------------------------------+
|  ChartToolbar                                                          |
+-----------------------------------------------------------------------+
| [Time Range ▼] [Histogram ▼] | [Chart Type: X-bar R ▼] | [Spec][Compare]|
+-----------------------------------------------------------------------+
                                       |
                                       v
                        +---------------------------+
                        | Chart Type                |
                        +---------------------------+
                        | Variable Data             |
                        |   [*] X-bar R (n=2-10)    |
                        |   [ ] X-bar S (n>10)      |
                        |   [ ] I-MR (n=1)          |
                        +---------------------------+
                        | Attribute Data            |
                        |   [ ] p (proportion)      |
                        |   [ ] np (count)          |
                        |   [ ] c (defects/unit)    |
                        |   [ ] u (defects/area)    |
                        +---------------------------+
                        | Analysis                  |
                        |   [ ] Pareto              |
                        |   [ ] Box & Whisker       |
                        +---------------------------+
```

### 3.2 Dual Chart Layout (X-bar/Range)

```
+-----------------------------------------------------------------------+
| Site / Area / Line / Characteristic Name - X-bar Chart                 |
| UCL: 10.5   CL: 10.0   LCL: 9.5                    [Violation Legend]  |
+-----------------------------------------------------------------------+
|                                                                        |
|    UCL -------- * -------- * -------- * -------- * --------            |
|                   \       /           \         /                      |
|    CL  -------- * -------- * -------- * -------- * --------            |
|                                                                        |
|    LCL -------- * -------- * -------- * -------- * --------            |
|                                                                        |
+-----------------------------------------------------------------------+
| ═══════════════════ Drag handle to resize ═══════════════════════════ |
+-----------------------------------------------------------------------+
| Site / Area / Line / Characteristic Name - Range Chart                 |
| UCL: 1.2   CL: 0.5   LCL: 0                                            |
+-----------------------------------------------------------------------+
|                                                                        |
|    UCL -------- * -------- * -------- * -------- * --------            |
|                   \       /           \         /                      |
|    CL  -------- * -------- * -------- * -------- * --------            |
|                                                                        |
+-----------------------------------------------------------------------+
```

### 3.3 Attribute Data Entry Modal

```
+-----------------------------------------------------------------------+
| Enter Attribute Data - P Chart                                         |
+-----------------------------------------------------------------------+
|                                                                        |
| Sample Size (n):      [___100___]                                      |
| Defective Count:      [____3____]                                      |
|                                                                        |
| ─────────────────────────────────────────────────────────────────────  |
| Calculated Proportion: 0.030 (3.0%)                                    |
|                                                                        |
| [  Cancel  ]                              [  Submit Sample  ]          |
+-----------------------------------------------------------------------+
```

### 3.4 Pareto Chart Layout

```
+-----------------------------------------------------------------------+
| Analysis: Pareto - Defect Categories for [Characteristic Name]         |
+-----------------------------------------------------------------------+
| Count |                                           ┌─── Cumulative %    |
|   25  |  ████                                     │                    |
|   20  |  ████  ████                               ▼   ════════ 100%    |
|   15  |  ████  ████  ████                      ═══════════    80%      |
|   10  |  ████  ████  ████  ████           ════════            60%      |
|    5  |  ████  ████  ████  ████  ████  ═══                    40%      |
|    0  +──────┬──────┬──────┬──────┬──────                              |
|         Scratch Dent  Crack Color Other                                |
+-----------------------------------------------------------------------+
| Total Defects: 75  |  Top 3 account for 80%                            |
+-----------------------------------------------------------------------+
```

---

## 4. Data Model Extensions

### 4.1 Characteristic Extensions

```typescript
export interface Characteristic {
  // ... existing fields ...

  // Chart type configuration
  default_chart_type: ChartTypeId | null

  // Attribute data configuration
  data_type: 'continuous' | 'attribute'
  attribute_config?: {
    type: 'defective' | 'defects'  // p/np vs c/u
    default_sample_size?: number    // For consistent sample sizes
    defect_categories?: string[]    // For Pareto analysis
  }
}
```

### 4.2 Sample Extensions for Attribute Data

```typescript
export interface Sample {
  // ... existing fields ...

  // Attribute data fields
  inspected_count?: number          // n for p/np/u charts
  defective_count?: number          // np for p/np charts
  defect_count?: number             // c for c/u charts
  defect_categories?: Record<string, number>  // For Pareto
}
```

### 4.3 Chart Data Response Extensions

```typescript
export interface ChartData {
  // ... existing fields ...

  chart_type: ChartTypeId

  // For dual charts
  primary_chart?: ChartDataSection
  secondary_chart?: ChartDataSection

  // For attribute charts with variable limits
  uses_variable_limits?: boolean
}

export interface ChartDataSection {
  label: string
  data_points: ChartDataPoint[]
  control_limits: ControlLimits
  zone_boundaries?: ZoneBoundaries
}
```

---

## 5. Control Limit Formulas

### 5.1 Variable Control Charts

| Chart | UCL | Center Line | LCL |
|-------|-----|-------------|-----|
| X-bar (R) | X̄ + A₂R̄ | X̄ | X̄ - A₂R̄ |
| Range | D₄R̄ | R̄ | D₃R̄ |
| X-bar (S) | X̄ + A₃S̄ | X̄ | X̄ - A₃S̄ |
| S | B₄S̄ | S̄ | B₃S̄ |
| Individuals | X̄ + E₂MR̄ | X̄ | X̄ - E₂MR̄ |
| Moving Range | D₄MR̄ | MR̄ | D₃MR̄ |

### 5.2 Attribute Control Charts

| Chart | UCL | Center Line | LCL |
|-------|-----|-------------|-----|
| p | p̄ + 3√(p̄(1-p̄)/n) | p̄ | max(0, p̄ - 3√(p̄(1-p̄)/n)) |
| np | n̄p̄ + 3√(n̄p̄(1-p̄)) | n̄p̄ | max(0, n̄p̄ - 3√(n̄p̄(1-p̄))) |
| c | c̄ + 3√c̄ | c̄ | max(0, c̄ - 3√c̄) |
| u | ū + 3√(ū/n) | ū | max(0, ū - 3√(ū/n)) |

---

## 6. Implementation Phases

### Phase 1: Variable Data Extensions (Priority: High)
**Goal**: Add Range and S companion charts to existing X-bar

1. Create DualChartPanel component with resizable divider
2. Implement RangeChart component (reuse ControlChart patterns)
3. Implement SChart component
4. Add ChartTypeSelector to ChartToolbar
5. Extend dashboardStore with chartType state
6. Refactor ControlChart to support I-MR mode (subgroup_size=1)

**Deliverables**:
- X-bar/Range dual chart
- X-bar/S dual chart
- I-MR dual chart
- Chart type selector dropdown

### Phase 2: Analysis Charts (Priority: Medium)
**Goal**: Add Pareto and Box-Whisker for defect analysis

1. Implement ParetoChart component using Recharts
2. Implement BoxWhiskerChart component
3. Add defect category management to characteristic config
4. Integrate analysis charts into Reports view
5. Add "Quick Analysis" context menu option

**Deliverables**:
- Pareto chart with cumulative line
- Box & Whisker with outlier detection
- Defect category configuration

### Phase 3: Attribute Charts (Priority: Medium-High)
**Goal**: Support pass/fail and defect count data

1. Extend Characteristic model with data_type and attribute_config
2. Create AttributeDataEntry component for manual entry
3. Implement p-chart, np-chart, c-chart, u-chart components
4. Backend: Add attribute sample storage and calculations
5. Handle variable control limits for p and u charts

**Deliverables**:
- Attribute data entry modal
- p, np, c, u chart components
- Variable control limit rendering

---

## 7. Migration Strategy

### Backward Compatibility
- Existing X-bar behavior unchanged (default chart type)
- New chart_type parameter is optional in API
- No breaking changes to existing data

### Progressive Enhancement
- Chart type stored per-characteristic (optional)
- Users can ignore new features and use current X-bar
- New features discoverable via toolbar dropdown

---

## 8. Key UI/UX Decisions

### Chart Type Selection
- **Location**: ChartToolbar (alongside time range, histogram position)
- **Interaction**: Dropdown grouped by category (Variable, Attribute, Analysis)
- **Smart Defaults**: Auto-suggest based on subgroup size

### Dual Chart Synchronization
- Shared X-axis (sample index)
- Cross-chart highlighting on hover
- Resizable height ratio with drag handle
- Combined tooltip showing both values

### Attribute Data Entry
- Modal dialog (similar to existing InputModal)
- Clear labels for what to enter (inspected vs defective)
- Live calculation preview
- Validation before submission

### Analysis Chart Access
- Available via Chart Type dropdown
- Also in Reports view templates
- Right-click context menu for quick access

---

## 9. Critical Files to Modify/Create

### Modify
- `ChartPanel.tsx` - Support dual-chart layout
- `ChartToolbar.tsx` - Add ChartTypeSelector
- `ControlChart.tsx` - Refactor for reuse in secondary charts
- `dashboardStore.ts` - Add chart type state
- `types/index.ts` - Extend Characteristic and Sample types
- `api/hooks.ts` - Add chart type parameter to useChartData

### Create
- `components/charts/DualChartPanel.tsx`
- `components/charts/ChartTypeSelector.tsx`
- `components/charts/control/RangeChart.tsx`
- `components/charts/control/SChart.tsx`
- `components/charts/analysis/ParetoChart.tsx`
- `components/charts/analysis/BoxWhiskerChart.tsx`
- `types/charts.ts` - Chart type definitions
- `lib/chart-registry.ts` - Chart type registry
- `lib/control-limit-formulas.ts` - Formula implementations
