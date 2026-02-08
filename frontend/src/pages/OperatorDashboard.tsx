import { useEffect, useMemo, useState } from 'react'
import { useCharacteristics, useCharacteristic, useChartData } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { HierarchyTodoList } from '@/components/HierarchyTodoList'
import { ChartPanel } from '@/components/ChartPanel'
import { DualChartPanel, BoxWhiskerChart } from '@/components/charts'
import { InputModal } from '@/components/InputModal'
import { ChartToolbar } from '@/components/ChartToolbar'
import { ChartRangeSlider } from '@/components/ChartRangeSlider'
import { ComparisonSelector } from '@/components/ComparisonSelector'
import { AnnotationDialog } from '@/components/AnnotationDialog'
import { AnnotationListPanel } from '@/components/AnnotationListPanel'
import { useWebSocketContext } from '@/providers/WebSocketProvider'
import { DUAL_CHART_TYPES, recommendChartType } from '@/lib/chart-registry'
import type { ChartTypeId } from '@/types/charts'

export function OperatorDashboard() {
  const { data: characteristicsData, isLoading } = useCharacteristics()
  const selectedId = useDashboardStore((state) => state.selectedCharacteristicId)
  const inputModalOpen = useDashboardStore((state) => state.inputModalOpen)
  const histogramPosition = useDashboardStore((state) => state.histogramPosition)
  const showSpecLimits = useDashboardStore((state) => state.showSpecLimits)
  const comparisonMode = useDashboardStore((state) => state.comparisonMode)
  const secondaryCharacteristicId = useDashboardStore((state) => state.secondaryCharacteristicId)
  const setSecondaryCharacteristicId = useDashboardStore((state) => state.setSecondaryCharacteristicId)
  const timeRange = useDashboardStore((state) => state.timeRange)
  const chartTypes = useDashboardStore((state) => state.chartTypes)
  const showBrush = useDashboardStore((state) => state.showBrush)
  const rangeWindow = useDashboardStore((state) => state.rangeWindow)
  const setRangeWindow = useDashboardStore((state) => state.setRangeWindow)
  const showAnnotations = useDashboardStore((state) => state.showAnnotations)
  const [showComparisonSelector, setShowComparisonSelector] = useState(false)
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false)
  const [annotationMode, setAnnotationMode] = useState<'point' | 'period'>('period')
  const [annotationSampleId, setAnnotationSampleId] = useState<number | undefined>(undefined)
  const [annotationSampleLabel, setAnnotationSampleLabel] = useState<string | undefined>(undefined)

  // Get selected characteristic details for subgroup size
  const { data: selectedCharacteristic } = useCharacteristic(selectedId ?? 0)

  // Get current chart type — default to recommended type for the characteristic's subgroup size
  const subgroupSize = selectedCharacteristic?.subgroup_size ?? 5
  const currentChartType: ChartTypeId = (selectedId && chartTypes.get(selectedId)) || recommendChartType(subgroupSize)
  const isDualChart = DUAL_CHART_TYPES.includes(currentChartType)
  const isBoxWhisker = currentChartType === 'box-whisker'

  // Compute chart data options from time range
  // Note: For duration-based ranges, we compute dates at render time
  // This is acceptable since the options are used immediately for data fetching
  const chartOptions = (() => {
    if (timeRange.type === 'points' && timeRange.pointsLimit) {
      return { limit: timeRange.pointsLimit }
    }
    if (timeRange.type === 'duration' && timeRange.hoursBack) {
      // Quantize to nearest minute so the query key stays stable between renders
      const now = Math.floor(Date.now() / 60000) * 60000
      const endDate = new Date(now).toISOString()
      const startDate = new Date(now - timeRange.hoursBack * 60 * 60 * 1000).toISOString()
      return { startDate, endDate, limit: 500 } // Cap at 500 for performance
    }
    if (timeRange.type === 'custom' && timeRange.startDate && timeRange.endDate) {
      return { startDate: timeRange.startDate, endDate: timeRange.endDate, limit: 500 }
    }
    return { limit: 50 }
  })()

  // Get chart data for annotation dialog and range slider sparkline
  const { data: chartDataForAnnotation } = useChartData(selectedId ?? 0, chartOptions)

  // Sparkline values for range slider
  const sparklineValues = useMemo(() => {
    if (!chartDataForAnnotation?.data_points) return []
    return chartDataForAnnotation.data_points.map((p) => p.mean)
  }, [chartDataForAnnotation])

  // Timestamps for range slider time labels
  const sparklineTimestamps = useMemo(() => {
    if (!chartDataForAnnotation?.data_points) return []
    return chartDataForAnnotation.data_points.map((p) => p.timestamp)
  }, [chartDataForAnnotation])

  // Compute visible sample IDs and time range for annotation panel filtering
  const visibleSampleIds = useMemo(() => {
    if (!chartDataForAnnotation?.data_points) return null
    const pts = chartDataForAnnotation.data_points
    if (!showBrush || !rangeWindow) {
      return new Set(pts.map((p) => p.sample_id))
    }
    const [start, end] = rangeWindow
    return new Set(pts.slice(start, end + 1).map((p) => p.sample_id))
  }, [chartDataForAnnotation, rangeWindow, showBrush])

  // Visible time range for filtering time-based period annotations
  const visibleTimeRange = useMemo<[string, string] | null>(() => {
    if (!chartDataForAnnotation?.data_points?.length) return null
    const pts = chartDataForAnnotation.data_points
    if (!showBrush || !rangeWindow) {
      return [pts[0].timestamp, pts[pts.length - 1].timestamp]
    }
    const [start, end] = rangeWindow
    const slice = pts.slice(start, end + 1)
    if (slice.length === 0) return null
    return [slice[0].timestamp, slice[slice.length - 1].timestamp]
  }, [chartDataForAnnotation, rangeWindow, showBrush])

  // Reset range window when characteristic changes
  useEffect(() => {
    setRangeWindow(null)
  }, [selectedId, setRangeWindow])

  // Use app-level WebSocket context
  const { subscribe, unsubscribe } = useWebSocketContext()
  const characteristicIds = characteristicsData?.items.map((c) => c.id) ?? []
  const characteristicIdsKey = characteristicIds.join(',')

  // Manage subscriptions when characteristics change
  useEffect(() => {
    characteristicIds.forEach((id) => subscribe(id))

    return () => {
      // Only unsubscribe from these specific IDs when dashboard unmounts
      // The WebSocket connection itself stays open
      characteristicIds.forEach((id) => unsubscribe(id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characteristicIdsKey, subscribe, unsubscribe])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading characteristics...</div>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-10rem)]">
      {/* Left panel - Hierarchy-based characteristic selection */}
      <div className="w-80 flex-shrink-0">
        <HierarchyTodoList />
      </div>

      {/* Right panel - Visualization */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {selectedId ? (
          <>
            <ChartToolbar
              characteristicId={selectedId}
              subgroupSize={selectedCharacteristic?.subgroup_size ?? 5}
              onChangeSecondary={() => setShowComparisonSelector(true)}
              onAddAnnotation={() => {
                setAnnotationMode('period')
                setAnnotationSampleId(undefined)
                setAnnotationSampleLabel(undefined)
                setAnnotationDialogOpen(true)
              }}
            />

            {/* Range slider for chart viewport windowing */}
            {showBrush && sparklineValues.length > 10 && (
              <ChartRangeSlider
                totalPoints={sparklineValues.length}
                values={sparklineValues}
                timestamps={sparklineTimestamps}
              />
            )}

            {/* Primary Chart with optional histogram */}
            <div className="flex-1 min-h-0">
              {isBoxWhisker ? (
                <BoxWhiskerChart
                  characteristicId={selectedId}
                  chartOptions={chartOptions}
                  showSpecLimits={showSpecLimits}
                />
              ) : isDualChart ? (
                <DualChartPanel
                  characteristicId={selectedId}
                  chartType={currentChartType}
                  chartOptions={chartOptions}
                  label={comparisonMode ? 'Primary' : undefined}
                  histogramPosition={histogramPosition}
                  showSpecLimits={showSpecLimits}
                  onPointAnnotation={(sampleId) => {
                    const pt = chartDataForAnnotation?.data_points.find(p => p.sample_id === sampleId)
                    setAnnotationMode('point')
                    setAnnotationSampleId(sampleId)
                    setAnnotationSampleLabel(pt ? `Sample — ${new Date(pt.timestamp).toLocaleString()}` : undefined)
                    setAnnotationDialogOpen(true)
                  }}
                />
              ) : (
                <ChartPanel
                  characteristicId={selectedId}
                  chartOptions={chartOptions}
                  label={comparisonMode ? 'Primary' : undefined}
                  histogramPosition={histogramPosition}
                  showSpecLimits={showSpecLimits}
                  onPointAnnotation={(sampleId) => {
                    const pt = chartDataForAnnotation?.data_points.find(p => p.sample_id === sampleId)
                    setAnnotationMode('point')
                    setAnnotationSampleId(sampleId)
                    setAnnotationSampleLabel(pt ? `Sample — ${new Date(pt.timestamp).toLocaleString()}` : undefined)
                    setAnnotationDialogOpen(true)
                  }}
                />
              )}
            </div>

            {/* Secondary Chart (Comparison Mode) */}
            {comparisonMode && (
              <div className="flex-1 min-h-0 relative">
                {secondaryCharacteristicId ? (
                  <ChartPanel
                    characteristicId={secondaryCharacteristicId}
                    chartOptions={chartOptions}
                    label="Secondary"
                    histogramPosition={histogramPosition}
                    showSpecLimits={showSpecLimits}
                  />
                ) : (
                  <div className="h-full bg-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground">
                    <p className="mb-3">Select a characteristic to compare</p>
                    <button
                      onClick={() => setShowComparisonSelector(true)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Browse Hierarchy
                    </button>
                  </div>
                )}

                {/* Comparison Selector Modal */}
                {showComparisonSelector && (
                  <ComparisonSelector
                    excludeId={selectedId}
                    onSelect={(id) => {
                      setSecondaryCharacteristicId(id)
                      setShowComparisonSelector(false)
                    }}
                    onCancel={() => setShowComparisonSelector(false)}
                  />
                )}
              </div>
            )}
          {/* Annotation List Panel */}
          {showAnnotations && selectedId && (
            <AnnotationListPanel
              characteristicId={selectedId}
              visibleSampleIds={visibleSampleIds}
              visibleTimeRange={visibleTimeRange}
            />
          )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a characteristic from the list to view its control chart
          </div>
        )}
      </div>

      {/* Input Modal */}
      {inputModalOpen && <InputModal />}

      {/* Annotation Dialog */}
      {annotationDialogOpen && selectedId && (
        <AnnotationDialog
          characteristicId={selectedId}
          onClose={() => setAnnotationDialogOpen(false)}
          mode={annotationMode}
          sampleId={annotationSampleId}
          sampleLabel={annotationSampleLabel}
        />
      )}
    </div>
  )
}
