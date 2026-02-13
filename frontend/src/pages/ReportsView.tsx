import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { REPORT_TEMPLATES } from '@/lib/report-templates'
import type { ReportTemplate } from '@/lib/report-templates'
import { ReportPreview } from '@/components/ReportPreview'
import { ExportDropdown } from '@/components/ExportDropdown'
import { HierarchyCharacteristicSelector } from '@/components/HierarchyCharacteristicSelector'
import { TimeRangeSelector } from '@/components/TimeRangeSelector'
import { usePlantContext } from '@/providers/PlantProvider'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useChartData, useViolations } from '@/api/hooks'
import { FileText, ChevronRight } from 'lucide-react'

export function ReportsView() {
  const [searchParams] = useSearchParams()
  const { selectedPlant } = usePlantContext()
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null)
  const selectedCharId = useDashboardStore((state) => state.selectedCharacteristicId)
  const setSelectedCharId = useDashboardStore((state) => state.setSelectedCharacteristicId)
  const reportContentRef = useRef<HTMLDivElement>(null)

  // Use the same time range state as the dashboard
  const timeRange = useDashboardStore((state) => state.timeRange)

  // Initialize from URL params (from SelectionToolbar navigation) - intentional sync

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
    <div className="h-[calc(100vh-10rem)]">
      <div className="grid h-full grid-cols-12 gap-6">
        {/* Left Panel - Template & Characteristic Selection */}
        <div className="col-span-3 flex h-full flex-col gap-4">
          {/* Report Templates */}
          <div className="border-border bg-card flex-shrink-0 overflow-hidden rounded-xl border">
            <div className="border-border border-b p-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <FileText className="h-4 w-4" />
                Report Templates
              </h2>
            </div>
            <div className="max-h-48 overflow-auto p-2">
              <div className="space-y-2">
                {REPORT_TEMPLATES.map((template) => {
                  const Icon = template.icon
                  const isSelected = selectedTemplate?.id === template.id
                  return (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className={cn(
                        'w-full rounded-lg p-3 text-left transition-colors',
                        'border border-transparent',
                        isSelected ? 'bg-primary/10 border-primary/30' : 'hover:bg-muted',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon
                          className={cn(
                            'h-4 w-4',
                            isSelected ? 'text-primary' : 'text-muted-foreground',
                          )}
                        />
                        <span className={cn('text-sm font-medium', isSelected && 'text-primary')}>
                          {template.name}
                        </span>
                      </div>
                      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                        {template.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Time Range Selection - z-index ensures dropdown appears above other panels */}
          <div className="border-border bg-card relative z-20 flex-shrink-0 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Data Range</h3>
              <TimeRangeSelector />
            </div>
          </div>

          {/* Characteristic Selection - Hierarchy Navigation */}
          <div className="border-border bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border">
            <div className="border-border flex flex-shrink-0 items-center justify-between border-b p-4">
              <h3 className="text-sm font-semibold">Characteristic</h3>
              {selectedCharId && (
                <button
                  onClick={() => setSelectedCharId(null)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Clear
                </button>
              )}
            </div>
            <HierarchyCharacteristicSelector
              selectedCharId={selectedCharId}
              onSelect={(char) => setSelectedCharId(char.id)}
              plantId={selectedPlant?.id}
            />
          </div>
        </div>

        {/* Right Panel - Preview */}
        <div className="col-span-9 flex h-full flex-col overflow-hidden">
          {selectedTemplate ? (
            <>
              {/* Preview Header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <span>Templates</span>
                  <ChevronRight className="h-4 w-4" />
                  <span className="text-foreground font-medium">{selectedTemplate.name}</span>
                </div>
                <ExportDropdown
                  contentRef={reportContentRef}
                  exportData={exportData}
                  filename={`${selectedTemplate.id}-report`}
                  disabled={!selectedCharId}
                />
              </div>

              {/* Report Preview */}
              <div ref={reportContentRef} className="flex-1 overflow-auto">
                <ReportPreview
                  template={selectedTemplate}
                  characteristicIds={selectedCharId ? [selectedCharId] : []}
                  chartOptions={chartOptions}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-muted-foreground text-center">
                <FileText className="mx-auto mb-4 h-12 w-12 opacity-30" />
                <p>Select a report template to get started</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReportsView
