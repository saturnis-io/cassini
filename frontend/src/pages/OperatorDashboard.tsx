import { useEffect, useMemo, useState } from 'react'
import { useCharacteristics, useCharacteristic, useChartData } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { HierarchyTodoList } from '@/components/HierarchyTodoList'
import { ChartPanel } from '@/components/ChartPanel'
import { DualChartPanel, BoxWhiskerChart } from '@/components/charts'
import { DistributionHistogram } from '@/components/DistributionHistogram'
import { InputModal } from '@/components/InputModal'
import { ChartToolbar } from '@/components/ChartToolbar'
import { ChartRangeSlider } from '@/components/ChartRangeSlider'
import { ComparisonSelector } from '@/components/ComparisonSelector'
import { AnnotationDialog } from '@/components/AnnotationDialog'
import { AnnotationListPanel } from '@/components/AnnotationListPanel'
import { SampleInspectorModal } from '@/components/SampleInspectorModal'
import { useWebSocketContext } from '@/providers/WebSocketProvider'
import { DUAL_CHART_TYPES, recommendChartType } from '@/lib/chart-registry'
import type { ChartTypeId } from '@/types/charts'

/** Maximum data points to fetch for duration/custom time ranges */
const MAX_CHART_POINTS = 500

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
  // Sample Inspector modal state
  const [sampleInspectorOpen, setSampleInspectorOpen] = useState(false)
  const [sampleInspectorSampleId, setSampleInspectorSampleId] = useState<number>(0)

  // Get selected characteristic details for subgroup size
  const { data: selectedCharacteristic } = useCharacteristic(selectedId ?? 0)

  // Get current chart type — default to recommended type for the characteristic's subgroup size
  const subgroupSize = selectedCharacteristic?.subgroup_size ?? 5
  const currentChartType: ChartTypeId = (selectedId && chartTypes.get(selectedId)) || recommendChartType(subgroupSize)
  const isDualChart = DUAL_CHART_TYPES.includes(currentChartType)
  const isBoxWhisker = currentChartType === 'box-whisker'

  // Use app-level WebSocket context — when connected, WS delivers real-time
  // updates so polling is redundant and can be disabled
  const { isConnected: wsConnected, subscribe, unsubscribe } = useWebSocketContext()

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
      return { startDate, endDate, limit: MAX_CHART_POINTS }
    }
    if (timeRange.type === 'custom' && timeRange.startDate && timeRange.endDate) {
      return { startDate: timeRange.startDate, endDate: timeRange.endDate, limit: MAX_CHART_POINTS }
    }
    return { limit: 50 }
  })()

  // Get chart data for annotation dialog and range slider sparkline
  // Disable polling when WebSocket is connected — WS pushes invalidations in real-time
  const { data: chartDataForAnnotation } = useChartData(selectedId ?? 0, chartOptions, {
    refetchInterval: wsConnected ? false : undefined,
  })

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

  // Shared Y-axis domain for box-whisker + histogram alignment
  const boxWhiskerYDomain = useMemo((): [number, number] | undefined => {
    if (!isBoxWhisker || !chartDataForAnnotation?.data_points?.length) return undefined

    const { control_limits, spec_limits, subgroup_mode, data_points } = chartDataForAnnotation
    const isModeA = subgroup_mode === 'STANDARDIZED'

    if (isModeA) {
      const zValues = data_points
        .filter((p) => p.z_score != null)
        .map((p) => p.z_score!)
      if (zValues.length === 0) return [-4, 4]
      const allZLimits = [...zValues, 3, -3]
      const zMin = Math.min(...allZLimits)
      const zMax = Math.max(...allZLimits)
      const zPadding = (zMax - zMin) * 0.1
      return [zMin - zPadding, zMax + zPadding]
    }

    const values = data_points.map((p) => p.mean)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)

    const allLimits = [minVal, maxVal]
    if (control_limits.ucl != null) allLimits.push(control_limits.ucl)
    if (control_limits.lcl != null) allLimits.push(control_limits.lcl)
    if (spec_limits.usl != null) allLimits.push(spec_limits.usl)
    if (spec_limits.lsl != null) allLimits.push(spec_limits.lsl)

    const domainMin = Math.min(...allLimits)
    const domainMax = Math.max(...allLimits)
    const padding = (domainMax - domainMin) * 0.1

    return [domainMin - padding, domainMax + padding]
  }, [isBoxWhisker, chartDataForAnnotation])

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
                histogramPosition === 'right' ? (
                  <div className="flex gap-4 h-full">
                    <div className="flex-1 min-w-0">
                      <BoxWhiskerChart
                        characteristicId={selectedId}
                        chartOptions={chartOptions}
                        showSpecLimits={showSpecLimits}
                        yAxisDomain={boxWhiskerYDomain}
                        hideLegend
                      />
                    </div>
                    <div className="w-[280px] flex-shrink-0">
                      <DistributionHistogram
                        characteristicId={selectedId}
                        orientation="vertical"
                        chartOptions={chartOptions}
                        yAxisDomain={boxWhiskerYDomain}
                        showSpecLimits={showSpecLimits}
                        gridBottom={50}
                      />
                    </div>
                  </div>
                ) : histogramPosition === 'below' ? (
                  <div className="flex flex-col gap-4 h-full">
                    <div className="flex-1 min-h-0">
                      <BoxWhiskerChart
                        characteristicId={selectedId}
                        chartOptions={chartOptions}
                        showSpecLimits={showSpecLimits}
                      />
                    </div>
                    <div className="h-[192px] flex-shrink-0">
                      <DistributionHistogram
                        characteristicId={selectedId}
                        orientation="horizontal"
                        chartOptions={chartOptions}
                        showSpecLimits={showSpecLimits}
                      />
                    </div>
                  </div>
                ) : (
                  <BoxWhiskerChart
                    characteristicId={selectedId}
                    chartOptions={chartOptions}
                    showSpecLimits={showSpecLimits}
                  />
                )
              ) : isDualChart ? (
                <DualChartPanel
                  characteristicId={selectedId}
                  chartType={currentChartType}
                  chartOptions={chartOptions}
                  label={comparisonMode ? 'Primary' : undefined}
                  histogramPosition={histogramPosition}
                  showSpecLimits={showSpecLimits}
                  onPointAnnotation={(sampleId) => {
                    setSampleInspectorSampleId(sampleId)
                    setSampleInspectorOpen(true)
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
                    setSampleInspectorSampleId(sampleId)
                    setSampleInspectorOpen(true)
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

      {/* Annotation Dialog (period mode from toolbar button) */}
      {annotationDialogOpen && selectedId && (
        <AnnotationDialog
          characteristicId={selectedId}
          onClose={() => setAnnotationDialogOpen(false)}
          mode={annotationMode}
          sampleId={annotationSampleId}
          sampleLabel={annotationSampleLabel}
        />
      )}

      {/* Sample Inspector Modal (point click on chart) */}
      {sampleInspectorOpen && selectedId && sampleInspectorSampleId > 0 && (
        <SampleInspectorModal
          sampleId={sampleInspectorSampleId}
          characteristicId={selectedId}
          onClose={() => setSampleInspectorOpen(false)}
        />
      )}
    </div>
  )
}
