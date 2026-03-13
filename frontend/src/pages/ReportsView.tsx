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
import { useChartData, useViolations, useCharacteristic, useAnnotations, useCapability } from '@/api/hooks'
import { useLicense } from '@/hooks/useLicense'
import { FileText, Lock } from 'lucide-react'

export function ReportsView() {
  const [searchParams] = useSearchParams()
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null)
  const selectedCharId = useDashboardStore((state) => state.selectedCharacteristicId)
  const setSelectedCharId = useDashboardStore((state) => state.setSelectedCharacteristicId)
  const reportContentRef = useRef<HTMLDivElement>(null)
  const { isCommercial } = useLicense()

  // Use the same time range state as the dashboard
  const timeRange = useDashboardStore((state) => state.timeRange)

  // Filter templates based on license — commercial templates hidden for community
  const availableTemplates = useMemo(
    () => REPORT_TEMPLATES.filter((t) => !t.commercial || isCommercial),
    [isCommercial],
  )

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
          setSelectedTemplate(availableTemplates[0])
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

  // Plant-scoped templates don't need a characteristic
  const isPlantScoped = selectedTemplate?.scope === 'plant'

  // Fetch data for export functionality (React Query caches, so these
  // don't cause extra network requests vs. the ones in ReportPreview)
  const { data: chartData } = useChartData(selectedCharId || 0, chartOptions)
  const { data: violations } = useViolations({
    characteristic_id: selectedCharId || undefined,
    per_page: 100,
  })
  const { data: characteristic } = useCharacteristic(selectedCharId || 0)
  const { data: annotations } = useAnnotations(selectedCharId || 0, !!selectedCharId)
  const { data: capability } = useCapability(selectedCharId || 0)

  // Build export data with all fields needed for PDF/Excel/CSV
  const exportData = useMemo(
    () => ({
      chartData: chartData ?? undefined,
      violations: violations?.items ?? [],
      characteristicName: characteristic?.name,
      hierarchyPath: (characteristic as any)?.hierarchy_path as string | undefined,
      templateName: selectedTemplate?.name,
      annotations: annotations ?? [],
      capability: capability ?? undefined,
    }),
    [chartData, violations, characteristic, annotations, capability, selectedTemplate],
  )

  // Determine whether we can show the report
  const needsCharacteristic = !isPlantScoped && !selectedCharId
  const canExport = isPlantScoped || (selectedCharId && chartData)

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
              const tmpl = availableTemplates.find((t) => t.id === e.target.value)
              setSelectedTemplate(tmpl ?? null)
            }}
            className="bg-background border-input rounded-md border px-3 py-1.5 text-sm font-medium"
          >
            <option value="">Select template...</option>
            {availableTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.commercial ? '★ ' : ''}{t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Commercial badge for selected template */}
        {selectedTemplate?.commercial && (
          <span className="bg-primary/10 text-primary flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium">
            <Lock className="h-3 w-3" />
            Commercial
          </span>
        )}

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
            disabled={!canExport}
          />
        </div>
      </div>

      {/* Characteristic context bar — hidden for plant-scoped templates */}
      {!isPlantScoped && <CharacteristicContextBar />}

      {/* Plant scope indicator for plant-wide templates */}
      {isPlantScoped && (
        <div className="bg-primary/5 border-primary/20 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm">
          <Lock className="text-primary h-4 w-4" />
          <span className="text-muted-foreground">
            This report covers all characteristics in the current plant.
          </span>
        </div>
      )}

      {/* Report preview — full width */}
      {needsCharacteristic ? (
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
              characteristicIds={selectedCharId ? [selectedCharId] : []}
              chartOptions={chartOptions}
            />
          </ErrorBoundary>
        </div>
      )}
    </div>
  )
}

export default ReportsView
