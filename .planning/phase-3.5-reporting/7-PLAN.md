# Plan 7: Export Functionality

## Objective
Add export to PDF, Excel, and CSV from multiple access points.

---

## Task 1: Install Dependencies + Export Utilities

### Changes
1. Install PDF, Excel libraries
2. Create export utility functions

### Files
- `package.json`
- `frontend/src/lib/export-utils.ts` (new)

### Commands
```bash
cd frontend && npm install jspdf jspdf-autotable xlsx html2canvas
```

### Implementation

**Export utilities:**
```typescript
// PDF Export
export async function exportToPdf(
  element: HTMLElement,
  filename: string,
  options?: { orientation?: 'portrait' | 'landscape' }
) {
  const canvas = await html2canvas(element, { scale: 2 })
  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({
    orientation: options?.orientation ?? 'portrait',
    unit: 'mm',
  })

  const imgWidth = pdf.internal.pageSize.getWidth()
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
  pdf.save(`${filename}.pdf`)
}

// Excel Export
export function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = 'Data'
) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// CSV Export
export function exportToCsv(
  data: Record<string, unknown>[],
  filename: string
) {
  const ws = XLSX.utils.json_to_sheet(data)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  saveAs(blob, `${filename}.csv`)
}
```

### Verification
- [ ] Dependencies installed
- [ ] Export functions work standalone
- [ ] Files download correctly

---

## Task 2: Add Export to Reports Page

### Changes
1. Add export dropdown to report preview
2. Export current report to PDF/Excel/CSV

### Files
- `frontend/src/pages/ReportsView.tsx`
- `frontend/src/components/ExportDropdown.tsx` (new)

### Implementation

**Export dropdown:**
```tsx
const ExportDropdown = ({ onExport }: { onExport: (format: 'pdf' | 'excel' | 'csv') => void }) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button className="flex items-center gap-2 px-3 py-2 border rounded-lg">
        <Download className="h-4 w-4" />
        Export
        <ChevronDown className="h-4 w-4" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={() => onExport('pdf')}>
        <FileText className="h-4 w-4 mr-2" />
        Export as PDF
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onExport('excel')}>
        <FileSpreadsheet className="h-4 w-4 mr-2" />
        Export as Excel
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onExport('csv')}>
        <FileType className="h-4 w-4 mr-2" />
        Export as CSV
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)
```

### Verification
- [ ] Export dropdown visible on reports page
- [ ] PDF export captures preview
- [ ] Excel export includes data tables
- [ ] CSV export works

---

## Task 3: Add Export to ChartToolbar

### Changes
1. Add export button to chart toolbar
2. Quick export of current chart view

### Files
- `frontend/src/components/ChartToolbar.tsx`

### Implementation

**Toolbar export button:**
```tsx
<ExportDropdown
  onExport={(format) => {
    switch (format) {
      case 'pdf':
        exportToPdf(chartRef.current, `${characteristicName}-chart`)
        break
      case 'csv':
        exportToCsv(
          dataPoints.map(p => ({
            timestamp: p.timestamp,
            value: p.mean,
            zone: p.zone,
            violation: p.violation_rules.join(', '),
          })),
          `${characteristicName}-data`
        )
        break
      case 'excel':
        exportToExcel(/* same data */)
        break
    }
  }}
/>
```

### Verification
- [ ] Export button visible in toolbar
- [ ] Chart exports correctly to PDF
- [ ] Data exports correctly to CSV/Excel

---

## Dependencies
- Plan 6 (reports page)

## Commits
After each task:
```
feat(3.5-7): add export utility functions for PDF/Excel/CSV
feat(3.5-7): add export dropdown to reports page
feat(3.5-7): add export to chart toolbar
```

## Estimated Scope
- 3-4 files
- ~200 lines of code
- 3 new npm packages
