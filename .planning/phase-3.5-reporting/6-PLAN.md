# Plan 6: Report Templates & Generation

## Objective
Create canned report templates with preview UI.

---

## Task 1: Reports Page Structure

### Changes
1. Create `/reports` route and page
2. Template selection UI
3. Characteristic selection (from URL params or manual)

### Files
- `frontend/src/pages/ReportsView.tsx` (new)
- `frontend/src/App.tsx`

### Implementation

**ReportsView structure:**
```tsx
export function ReportsView() {
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null)
  const [selectedCharacteristics, setSelectedCharacteristics] = useState<number[]>([])

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Template Selection */}
      <div className="col-span-3">
        <h2>Report Templates</h2>
        <TemplateList
          selected={selectedTemplate}
          onSelect={setSelectedTemplate}
        />
      </div>

      {/* Configuration + Preview */}
      <div className="col-span-9">
        {selectedTemplate ? (
          <>
            <ReportConfig template={selectedTemplate} />
            <ReportPreview
              template={selectedTemplate}
              characteristicIds={selectedCharacteristics}
            />
          </>
        ) : (
          <EmptyState message="Select a report template" />
        )}
      </div>
    </div>
  )
}
```

### Verification
- [ ] Route `/reports` works
- [ ] Template list displays
- [ ] Selection persists

---

## Task 2: Report Templates

### Changes
1. Define report template types
2. Create 4 canned templates
3. Template configuration options

### Files
- `frontend/src/lib/report-templates.ts` (new)

### Implementation

**Template definitions:**
```typescript
interface ReportTemplate {
  id: string
  name: string
  description: string
  icon: LucideIcon
  sections: ReportSection[]
  requiredData: ('chartData' | 'violations' | 'samples' | 'stats')[]
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'characteristic-summary',
    name: 'Characteristic Summary',
    description: 'Control chart, statistics, and recent violations for a single characteristic',
    icon: BarChart2,
    sections: ['header', 'controlChart', 'statistics', 'violations', 'samples'],
    requiredData: ['chartData', 'violations', 'samples'],
  },
  {
    id: 'capability-analysis',
    name: 'Capability Analysis',
    description: 'Process capability metrics (Cp, Cpk, Pp, Ppk) with distribution analysis',
    icon: TrendingUp,
    sections: ['header', 'histogram', 'capabilityMetrics', 'interpretation'],
    requiredData: ['chartData', 'samples'],
  },
  {
    id: 'violation-summary',
    name: 'Violation Summary',
    description: 'All violations across selected characteristics with trends',
    icon: AlertTriangle,
    sections: ['header', 'violationStats', 'violationTable', 'trendChart'],
    requiredData: ['violations'],
  },
  {
    id: 'trend-analysis',
    name: 'Trend Analysis',
    description: 'Time-series analysis with moving average and trend detection',
    icon: LineChart,
    sections: ['header', 'trendChart', 'statistics', 'interpretation'],
    requiredData: ['chartData', 'samples'],
  },
]
```

### Verification
- [ ] All 4 templates defined
- [ ] Required data fields correct
- [ ] Sections list accurate

---

## Task 3: Report Preview Component

### Changes
1. Create preview component that renders report sections
2. Fetch required data based on template
3. Display loading and error states

### Files
- `frontend/src/components/ReportPreview.tsx` (new)
- `frontend/src/components/report-sections/` (new directory)

### Implementation

**ReportPreview:**
```tsx
const ReportPreview = ({ template, characteristicIds }) => {
  const { data, isLoading, error } = useReportData(template, characteristicIds)

  if (isLoading) return <LoadingState />
  if (error) return <ErrorState error={error} />

  return (
    <div className="bg-white p-8 shadow-lg rounded-lg" ref={printRef}>
      {template.sections.map((section) => (
        <ReportSection key={section} type={section} data={data} />
      ))}
    </div>
  )
}
```

**Report sections:**
- `HeaderSection` - Report title, date, characteristic info
- `ControlChartSection` - Embedded control chart
- `StatisticsSection` - Mean, std dev, Cp, Cpk table
- `ViolationsSection` - Recent violations table
- `HistogramSection` - Distribution histogram
- `CapabilitySection` - Cp, Cpk, Pp, Ppk with zones

### Verification
- [ ] Preview renders all sections
- [ ] Data fetched correctly
- [ ] Print-friendly layout

---

## Dependencies
- Plan 5 (multi-selection for characteristic IDs)

## Commits
After each task:
```
feat(3.5-6): create ReportsView page with template selection
feat(3.5-6): define canned report templates
feat(3.5-6): implement report preview with sections
```

## Estimated Scope
- 5-6 new files
- ~400 lines of code
