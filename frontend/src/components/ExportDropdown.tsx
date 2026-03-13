import { useState, useRef } from 'react'
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  exportReportToPdf,
  exportToExcelMultiSheet,
  exportToCsv,
  prepareChartDataForExport,
  prepareViolationsForExport,
} from '@/lib/export-utils'
import type { ReportPdfData } from '@/lib/export-utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { toast } from 'sonner'

type ExportFormat = 'pdf' | 'excel' | 'csv'

interface ExportDropdownProps {
  /** Reference to the report content element (used to find chart canvas) */
  contentRef: React.RefObject<HTMLElement | null>
  /** Data for export */
  exportData?: {
    chartData?: {
      data_points: Array<{
        timestamp: string
        mean: number
        zone: string
        violation_rules: number[]
        excluded: boolean
      }>
      control_limits: {
        ucl: number | null
        lcl: number | null
        center_line: number | null
      }
      decimal_precision?: number
    }
    violations?: Array<{
      id: number
      created_at: string | null
      characteristic_name: string | null
      rule_id: number
      rule_name: string
      severity: string
      acknowledged: boolean
      ack_user: string | null
      ack_reason: string | null
    }>
    characteristicName?: string
    hierarchyPath?: string
    templateName?: string
    annotations?: Array<{
      text: string
      annotation_type: string
      created_by: string | null
      created_at: string
    }>
    capability?: {
      cp: number | null
      cpk: number | null
      pp: number | null
      ppk: number | null
      sigma_within: number | null
      usl: number | null
      lsl: number | null
    }
  }
  /** Filename prefix for exported files */
  filename?: string
  /** Whether export is disabled */
  disabled?: boolean
  /** CSS class name */
  className?: string
}

export function ExportDropdown({
  contentRef,
  exportData,
  filename = 'report',
  disabled = false,
  className,
}: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { datetimeFormat } = useDateFormat()

  const handleExport = async (format: ExportFormat) => {
    setIsOpen(false)
    setIsExporting(true)

    try {
      const timestamp = new Date().toISOString().split('T')[0]
      const exportFilename = `${filename}-${timestamp}`

      if (format === 'pdf') {
        // Capture chart image from the ECharts canvas in the report
        let chartImage: ReportPdfData['chartImage']
        if (contentRef.current) {
          const canvases = Array.from(contentRef.current.querySelectorAll('canvas'))
          // Pick the largest canvas (the main chart)
          const chartCanvas = canvases.sort(
            (a, b) => b.width * b.height - a.width * a.height,
          )[0]
          if (chartCanvas) {
            chartImage = {
              dataURL: chartCanvas.toDataURL('image/png'),
              aspectRatio: chartCanvas.width / chartCanvas.height,
            }
          }
        }

        await exportReportToPdf(
          {
            title: exportData?.templateName || 'Report',
            characteristicName: exportData?.characteristicName || 'Unknown',
            hierarchyPath: exportData?.hierarchyPath,
            chartImage,
            chartData: exportData?.chartData,
            violations: exportData?.violations,
            annotations: exportData?.annotations,
            capability: exportData?.capability,
          },
          exportFilename,
          datetimeFormat,
        )
        toast.success('PDF exported successfully')
      } else if (format === 'excel' || format === 'csv') {
        // Prepare datasets separately to avoid mixed-schema blank columns
        const chartRows = exportData?.chartData
          ? prepareChartDataForExport(exportData.chartData, datetimeFormat)
          : []
        const violationRows =
          exportData?.violations && exportData.violations.length > 0
            ? prepareViolationsForExport(exportData.violations, datetimeFormat)
            : []

        if (chartRows.length === 0 && violationRows.length === 0) {
          toast.error('No data to export')
          return
        }

        if (format === 'excel') {
          // Multi-sheet: each dataset gets its own tab with clean columns
          const sheets: Array<{ name: string; data: Record<string, unknown>[] }> = []
          if (chartRows.length > 0) sheets.push({ name: 'Measurements', data: chartRows })
          if (violationRows.length > 0) sheets.push({ name: 'Violations', data: violationRows })
          await exportToExcelMultiSheet(sheets, exportFilename)
          toast.success('Excel file exported successfully')
        } else {
          // CSV: export primary dataset only (chart data if present, else violations)
          const primaryData = chartRows.length > 0 ? chartRows : violationRows
          await exportToCsv(primaryData, exportFilename)
          toast.success('CSV file exported successfully')
        }
      }
    } catch (error) {
      console.error('Export failed:', error)
      toast.error('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  // Close dropdown when clicking outside
  const handleBlur = (e: React.FocusEvent) => {
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false)
    }
  }

  return (
    <div ref={dropdownRef} className={cn('relative', className)} onBlur={handleBlur}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled || isExporting}
        className={cn(
          'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <Download className="h-4 w-4" />
        {isExporting ? 'Exporting...' : 'Export'}
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <div className="border-border bg-card absolute right-0 z-50 mt-2 w-48 rounded-lg border shadow-lg">
          <div className="py-1">
            <button
              onClick={() => handleExport('pdf')}
              className="hover:bg-muted flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
            >
              <FileText className="text-destructive h-4 w-4" />
              <div>
                <div className="font-medium">PDF</div>
                <div className="text-muted-foreground text-xs">Visual report with charts</div>
              </div>
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="hover:bg-muted flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
            >
              <FileSpreadsheet className="text-success h-4 w-4" />
              <div>
                <div className="font-medium">Excel (.xlsx)</div>
                <div className="text-muted-foreground text-xs">Spreadsheet with data</div>
              </div>
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="hover:bg-muted flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors"
            >
              <FileText className="text-primary h-4 w-4" />
              <div>
                <div className="font-medium">CSV</div>
                <div className="text-muted-foreground text-xs">Plain text data</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ExportDropdown
