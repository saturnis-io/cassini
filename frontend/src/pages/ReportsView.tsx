import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { REPORT_TEMPLATES } from '@/lib/report-templates'
import type { ReportTemplate } from '@/lib/report-templates'
import { ReportPreview } from '@/components/ReportPreview'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ExportDropdown } from '@/components/ExportDropdown'
import { CharacteristicContextBar } from '@/components/CharacteristicContextBar'
import { NoCharacteristicState } from '@/components/NoCharacteristicState'
import { TimeRangeSelector } from '@/components/TimeRangeSelector'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useChartData, useViolations } from '@/api/hooks'
import { FileText } from 'lucide-react'

export function ReportsView() {
  const [searchParams] = useSearchParams()
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null)
  const selectedCharId = useDashboardStore((state) => state.selectedCharacteristicId)
  const setSelectedCharId = useDashboardStore((state) => state.setSelectedCharacteristicId)
  const reportContentRef = useRef<HTMLDivElement>(null)

  // Use the same time range state as the dashboard
  const timeRange = useDashboardStore((state) => state.timeRange)

  // Initialize from URL params (from SelectionToolbar navigation) - intentional sync
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit selectedTemplate to avoid re-running on template change
  useEffect(() => {
    const characteristicsParam = searchParams.get('characteristics')
    if (characteristicsParam) {
      const ids = characteristicsParam
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n))
      if (ids.length > 0) {
        setSelectedCharId(ids[0])
        // Auto-select first template if not already selected
        if (!selectedTemplate) {
          setSelectedTemplate(REPORT_TEMPLATES[0])
        }
      }
    }
  }, [searchParams, setSelectedCharId])

  // Build chart options from time range - memoize to avoid query key changes on every render
  const chartOptions = useMemo(() => {
    if (timeRange.type === 'points') {
      return { limit: timeRange.pointsLimit ?? 50 }
    }
    if (timeRange.type === 'duration' && timeRange.hoursBack) {
      const now = new Date()
      // Round to nearest minute to avoid excessive query invalidation
      now.setSeconds(0, 0)
      const startDate = new Date(now.getTime() - timeRange.hoursBack * 60 * 60 * 1000)
      return {
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
      }
    }
    if (timeRange.type === 'custom' && timeRange.startDate && timeRange.endDate) {
      return {
        startDate: timeRange.startDate,
        endDate: timeRange.endDate,
      }
    }
    // Default fallback
    return { limit: 50 }
  }, [
    timeRange.type,
    timeRange.pointsLimit,
    timeRange.hoursBack,
    timeRange.startDate,
    timeRange.endDate,
  ])

  // Fetch data for export functionality
  const { data: chartData } = useChartData(selectedCharId || 0, chartOptions)
  const { data: violations } = useViolations({
    characteristic_id: selectedCharId || undefined,
    per_page: 100,
  })

  // Build export data
  const exportData = useMemo(
    () => ({
      chartData: chartData ?? undefined,
      violations: violations?.items ?? [],
    }),
    [chartData, violations],
  )

  return (
    <div data-ui="reports-page" className="flex h-[calc(100vh-10rem)] flex-col gap-4">
      {/* Controls bar */}
      <div data-ui="reports-toolbar" className="bg-card border-border flex flex-shrink-0 items-center gap-4 rounded-lg border px-4 py-3">
        {/* Template dropdown */}
        <div className="flex items-center gap-2">
          <FileText className="text-muted-foreground h-4 w-4" />
          <select
            aria-label="Report template"
            value={selectedTemplate?.id ?? ''}
            onChange={(e) => {
              const tmpl = REPORT_TEMPLATES.find((t) => t.id === e.target.value)
              setSelectedTemplate(tmpl ?? null)
            }}
            className="bg-background border-input rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            <option value="">Select template...</option>
            {REPORT_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Divider */}
        <div className="border-border h-6 border-l" />

        {/* Time range */}
        <TimeRangeSelector />

        {/* Spacer + Export */}
        <div className="ml-auto">
          <ExportDropdown
            contentRef={reportContentRef}
            exportData={exportData}
            filename={`${selectedTemplate?.id ?? 'report'}-report`}
            disabled={!selectedCharId}
          />
        </div>
      </div>

      {/* Characteristic context bar */}
      <CharacteristicContextBar />

      {/* Report preview — full width */}
      {!selectedCharId ? (
        <NoCharacteristicState />
      ) : !selectedTemplate ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <FileText className="text-muted-foreground/30 mx-auto mb-4 h-12 w-12" />
            <h3 className="text-foreground mb-1 font-semibold">No template selected</h3>
            <p className="text-muted-foreground text-sm">
              Choose a report template from the dropdown above to preview.
            </p>
          </div>
        </div>
      ) : (
        <div data-ui="reports-content" ref={reportContentRef} className="flex-1 overflow-auto">
          <ErrorBoundary>
            <ReportPreview
              template={selectedTemplate}
              characteristicIds={[selectedCharId]}
              chartOptions={chartOptions}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
}

export default ReportsView
