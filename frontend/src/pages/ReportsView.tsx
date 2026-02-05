import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { REPORT_TEMPLATES } from '@/lib/report-templates'
import type { ReportTemplate } from '@/lib/report-templates'
import { ReportPreview } from '@/components/ReportPreview'
import { ExportDropdown } from '@/components/ExportDropdown'
import { HierarchyMultiSelector } from '@/components/HierarchyMultiSelector'
import { TimeRangeSelector } from '@/components/TimeRangeSelector'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useChartData, useViolations } from '@/api/hooks'
import { FileText, ChevronRight } from 'lucide-react'

export function ReportsView() {
  const [searchParams] = useSearchParams()
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null)
  const [selectedCharacteristicIds, setSelectedCharacteristicIds] = useState<number[]>([])
  const reportContentRef = useRef<HTMLDivElement>(null)

  // Use the same time range state as the dashboard
  const timeRange = useDashboardStore((state) => state.timeRange)

  // Initialize from URL params (from SelectionToolbar navigation) - intentional sync
   
  useEffect(() => {
    const characteristicsParam = searchParams.get('characteristics')
    if (characteristicsParam) {
      const ids = characteristicsParam.split(',').map(Number).filter((n) => !isNaN(n))
      if (ids.length > 0) {
        setSelectedCharacteristicIds(ids)
        // Auto-select first template if not already selected
        if (!selectedTemplate) {
          setSelectedTemplate(REPORT_TEMPLATES[0])
        }
      }
    }
  }, [searchParams])

  const handleClearSelection = () => {
    setSelectedCharacteristicIds([])
  }

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
  }, [timeRange.type, timeRange.pointsLimit, timeRange.hoursBack, timeRange.startDate, timeRange.endDate])

  // Fetch data for export functionality
  const primaryCharId = selectedCharacteristicIds[0] || 0
  const { data: chartData } = useChartData(primaryCharId, chartOptions)
  const { data: violations } = useViolations({
    characteristic_id: primaryCharId || undefined,
    per_page: 100,
  })

  // Build export data
  const exportData = useMemo(() => ({
    chartData: chartData ?? undefined,
    violations: violations?.items ?? [],
  }), [chartData, violations])

  return (
    <div className="h-[calc(100vh-10rem)]">
      <div className="grid grid-cols-12 gap-6 h-full">
        {/* Left Panel - Template & Characteristic Selection */}
        <div className="col-span-3 flex flex-col gap-4 h-full">
          {/* Report Templates */}
          <div className="border border-border rounded-xl bg-card overflow-hidden flex-shrink-0">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Report Templates
              </h2>
            </div>
            <div className="p-2 max-h-48 overflow-auto">
              <div className="space-y-2">
                {REPORT_TEMPLATES.map((template) => {
                  const Icon = template.icon
                  const isSelected = selectedTemplate?.id === template.id
                  return (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className={cn(
                        'w-full text-left p-3 rounded-lg transition-colors',
                        'border border-transparent',
                        isSelected
                          ? 'bg-primary/10 border-primary/30'
                          : 'hover:bg-muted'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={cn('h-4 w-4', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                        <span className={cn('font-medium text-sm', isSelected && 'text-primary')}>
                          {template.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Time Range Selection - z-index ensures dropdown appears above other panels */}
          <div className="border border-border rounded-xl bg-card p-4 flex-shrink-0 relative z-20">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Data Range</h3>
              <TimeRangeSelector />
            </div>
          </div>

          {/* Characteristic Selection - Hierarchy Navigation */}
          <div className="border border-border rounded-xl bg-card overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="p-4 border-b border-border flex items-center justify-between flex-shrink-0">
              <h3 className="font-semibold text-sm">Characteristics</h3>
              {selectedCharacteristicIds.length > 0 && (
                <button
                  onClick={handleClearSelection}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear ({selectedCharacteristicIds.length})
                </button>
              )}
            </div>
            <HierarchyMultiSelector
              selectedIds={selectedCharacteristicIds}
              onSelectionChange={setSelectedCharacteristicIds}
              className="flex-1 overflow-auto p-2"
            />
          </div>
        </div>

        {/* Right Panel - Preview */}
        <div className="col-span-9 flex flex-col h-full overflow-hidden">
          {selectedTemplate ? (
            <>
              {/* Preview Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Templates</span>
                  <ChevronRight className="h-4 w-4" />
                  <span className="text-foreground font-medium">{selectedTemplate.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  {selectedCharacteristicIds.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {selectedCharacteristicIds.length} characteristic{selectedCharacteristicIds.length !== 1 ? 's' : ''} selected
                    </span>
                  )}
                  <ExportDropdown
                    contentRef={reportContentRef}
                    exportData={exportData}
                    filename={`${selectedTemplate.id}-report`}
                    disabled={selectedCharacteristicIds.length === 0}
                  />
                </div>
              </div>

              {/* Report Preview */}
              <div ref={reportContentRef} className="flex-1 overflow-auto">
                <ReportPreview
                  template={selectedTemplate}
                  characteristicIds={selectedCharacteristicIds}
                  chartOptions={chartOptions}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
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
