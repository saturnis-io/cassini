import { useState, useRef } from 'react'
import { Download, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  exportToPdf,
  exportToExcel,
  exportToCsv,
  prepareChartDataForExport,
  prepareViolationsForExport,
} from '@/lib/export-utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { toast } from 'sonner'

type ExportFormat = 'pdf' | 'excel' | 'csv'

interface ExportDropdownProps {
  /** Reference to the element to capture for PDF export */
  contentRef: React.RefObject<HTMLElement | null>
  /** Data for Excel/CSV export */
  exportData?: {
    chartData?: {
      data_points: Array<{
        timestamp: string
        mean: number
        zone: string
        violation_rules: number[]
      }>
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
        if (!contentRef.current) {
          toast.error('No content to export')
          return
        }
        await exportToPdf(contentRef.current, exportFilename, {
          orientation: 'landscape',
        })
        toast.success('PDF exported successfully')
      } else if (format === 'excel' || format === 'csv') {
        // Prepare data for export
        const data: Record<string, unknown>[] = []

        if (exportData?.chartData) {
          const chartRows = prepareChartDataForExport(exportData.chartData, datetimeFormat)
          data.push(...chartRows)
        }

        if (exportData?.violations && exportData.violations.length > 0) {
          const violationRows = prepareViolationsForExport(exportData.violations, datetimeFormat)
          data.push(...violationRows)
        }

        if (data.length === 0) {
          toast.error('No data to export')
          return
        }

        if (format === 'excel') {
          await exportToExcel(data, exportFilename, 'Report Data')
          toast.success('Excel file exported successfully')
        } else {
          await exportToCsv(data, exportFilename)
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
