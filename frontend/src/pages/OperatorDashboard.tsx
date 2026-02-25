import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useCharacteristics, useCharacteristic, useChartData, useAnnotations } from '@/api/hooks'
import { characteristicApi } from '@/api/characteristics.api'
import { useDashboardStore } from '@/stores/dashboardStore'
import { calculateSharedYAxisDomain } from '@/lib/chart-domain'
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
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { BulkAcknowledgeDialog } from '@/components/BulkAcknowledgeDialog'
import { CapabilityCard } from '@/components/capability/CapabilityCard'
import { PendingApprovalsDashboard } from '@/components/signatures/PendingApprovalsDashboard'
import { RegionActionModal, type RegionSelection } from '@/components/RegionActionModal'
import { formatDisplayKey } from '@/lib/display-key'
import { useWebSocketContext } from '@/providers/WebSocketProvider'
import { useAuth } from '@/providers/AuthProvider'
import { canPerformAction } from '@/lib/roles'
import { DUAL_CHART_TYPES, recommendChartType } from '@/lib/chart-registry'
import type { ChartTypeId } from '@/types/charts'
import { cn } from '@/lib/utils'
import { AlertTriangle, Activity, Hash, Gauge } from 'lucide-react'
import { BottomDrawer } from '@/components/BottomDrawer'
import type { DrawerTab } from '@/components/BottomDrawer'

/** Maximum data points to fetch for duration/custom time ranges */
const MAX_CHART_POINTS = 500

/**
 * Stat pill — compact key-value badge for the stats ticker bar.
 */
function StatPill({
  icon: Icon,
  label,
  value,
  variant = 'default',
}: {
  icon: React.ElementType
  label: string
  value: string | number
  variant?: 'default' | 'success' | 'warning' | 'danger'
}) {
  const variantClasses = {
    default: 'text-muted-foreground',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
  }
  return (
    <div className="bg-muted/40 border-border/50 flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs">
      <Icon className={cn('h-3 w-3', variantClasses[variant])} />
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-semibold tabular-nums', variantClasses[variant])}>{value}</span>
    </div>
  )
}

export function OperatorDashboard() {
  const { t } = useTranslation('dashboard')
  const { t: tCommon } = useTranslation('common')
  const { data: characteristicsData, isLoading } = useCharacteristics()
  const selectedId = useDashboardStore((state) => state.selectedCharacteristicId)
  const inputModalOpen = useDashboardStore((state) => state.inputModalOpen)
  const histogramPosition = useDashboardStore((state) => state.histogramPosition)
  const showSpecLimits = useDashboardStore((state) => state.showSpecLimits)
  const comparisonMode = useDashboardStore((state) => state.comparisonMode)
  const secondaryCharacteristicId = useDashboardStore((state) => state.secondaryCharacteristicId)
  const setSecondaryCharacteristicId = useDashboardStore(
    (state) => state.setSecondaryCharacteristicId,
  )
  const timeRange = useDashboardStore((state) => state.timeRange)
  const chartTypes = useDashboardStore((state) => state.chartTypes)
  const showBrush = useDashboardStore((state) => state.showBrush)
  const rangeWindow = useDashboardStore((state) => state.rangeWindow)
  const setRangeWindow = useDashboardStore((state) => state.setRangeWindow)

  const { data: annotationsData } = useAnnotations(selectedId ?? 0)
  const annotationCount = annotationsData?.length ?? 0

  const [showComparisonSelector, setShowComparisonSelector] = useState(false)
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false)
  const [annotationMode, setAnnotationMode] = useState<'point' | 'period'>('period')
  const [annotationSampleId, setAnnotationSampleId] = useState<number | undefined>(undefined)
  const [annotationSampleLabel, setAnnotationSampleLabel] = useState<string | undefined>(undefined)
  // Sample Inspector modal state
  const [sampleInspectorOpen, setSampleInspectorOpen] = useState(false)
  const [sampleInspectorSampleId, setSampleInspectorSampleId] = useState<number>(0)
  // Bulk acknowledge dialog state
  const [bulkAckDialogOpen, setBulkAckDialogOpen] = useState(false)
  // Region selection state (from chart drag-select)
  const [regionSelection, setRegionSelection] = useState<RegionSelection | null>(null)
  const [regionAnnotateOpen, setRegionAnnotateOpen] = useState(false)
  const [regionAckOpen, setRegionAckOpen] = useState(false)

  // Get selected characteristic details for subgroup size
  const { data: selectedCharacteristic } = useCharacteristic(selectedId ?? 0)

  // Derive characteristic metadata before chart type computation
  const subgroupSize = selectedCharacteristic?.subgroup_size ?? 5
  const charChartType = selectedCharacteristic?.chart_type
  const isAttribute = selectedCharacteristic?.data_type === 'attribute'

  // Compute the effective chart type override for when the user hasn't explicitly selected one.
  // Priority: user store selection > characteristic-level config > data-type-aware default
  const effectiveOverride: ChartTypeId | undefined =
    charChartType && ['cusum', 'ewma'].includes(charChartType)
      ? (charChartType as ChartTypeId)
      : isAttribute
        ? ((selectedCharacteristic?.attribute_chart_type ?? 'p') as ChartTypeId)
        : undefined

  const currentChartType: ChartTypeId =
    (selectedId && chartTypes.get(selectedId)) ||
    effectiveOverride ||
    recommendChartType(subgroupSize)

  const isDualChart = DUAL_CHART_TYPES.includes(currentChartType) && !isAttribute
  const isBoxWhisker = currentChartType === 'box-whisker' && !isAttribute

  // Use app-level WebSocket context — when connected, WS delivers real-time
  // updates so polling is redundant and can be disabled
  const { isConnected: wsConnected, subscribe, unsubscribe } = useWebSocketContext()

  // Compute chart data options from time range
  const chartOptions = (() => {
    if (timeRange.type === 'points' && timeRange.pointsLimit) {
      return { limit: timeRange.pointsLimit }
    }
    if (timeRange.type === 'duration' && timeRange.hoursBack) {
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

  // Get chart data for annotation dialog, range slider sparkline, and stats
  const { data: chartDataForAnnotation } = useChartData(selectedId ?? 0, chartOptions, {
    refetchInterval: wsConnected ? false : undefined,
  })

  // Sparkline values for range slider
  const sparklineValues = useMemo(() => {
    if (!chartDataForAnnotation) return []
    const attrPts = chartDataForAnnotation.attribute_data_points ?? []
    if (attrPts.length > 0) return attrPts.map((p) => p.plotted_value)
    if (!chartDataForAnnotation.data_points) return []
    return chartDataForAnnotation.data_points.map((p) => p.mean)
  }, [chartDataForAnnotation])

  // Timestamps for range slider time labels
  const sparklineTimestamps = useMemo(() => {
    if (!chartDataForAnnotation) return []
    const attrPts = chartDataForAnnotation.attribute_data_points ?? []
    if (attrPts.length > 0) return attrPts.map((p) => p.timestamp)
    if (!chartDataForAnnotation.data_points) return []
    return chartDataForAnnotation.data_points.map((p) => p.timestamp)
  }, [chartDataForAnnotation])

  // Shared Y-axis domain for box-whisker + histogram alignment.
  // Skip for short-run modes: box plot uses raw sample values while the
  // shared domain uses display_value (Z-score / deviation), so forcing a
  // shared domain would create a scale mismatch.
  const isShortRun = !!chartDataForAnnotation?.short_run_mode
  const boxWhiskerYDomain = useMemo(
    () => (isBoxWhisker && !isShortRun ? calculateSharedYAxisDomain(chartDataForAnnotation, showSpecLimits) : undefined),
    [isBoxWhisker, isShortRun, chartDataForAnnotation, showSpecLimits],
  )

  // Unified data points accessor (variable or attribute)
  const unifiedPoints = useMemo(() => {
    if (!chartDataForAnnotation) return null
    const attrPts = chartDataForAnnotation.attribute_data_points ?? []
    if (attrPts.length > 0) {
      return attrPts.map((p) => ({
        sample_id: p.sample_id,
        timestamp: p.timestamp,
        unacknowledged_violation_ids: p.unacknowledged_violation_ids,
        violation_ids: p.violation_ids,
      }))
    }
    const stdPts = chartDataForAnnotation.data_points ?? []
    if (stdPts.length > 0) {
      return stdPts.map((p) => ({
        sample_id: p.sample_id,
        timestamp: p.timestamp,
        unacknowledged_violation_ids: p.unacknowledged_violation_ids,
        violation_ids: p.violation_ids,
      }))
    }
    return null
  }, [chartDataForAnnotation])

  // Compute visible sample IDs and time range for annotation panel filtering
  const visibleSampleIds = useMemo(() => {
    if (!unifiedPoints) return null
    if (!showBrush || !rangeWindow) {
      return new Set(unifiedPoints.map((p) => p.sample_id))
    }
    const [start, end] = rangeWindow
    return new Set(unifiedPoints.slice(start, end + 1).map((p) => p.sample_id))
  }, [unifiedPoints, rangeWindow, showBrush])

  // Visible time range for filtering time-based period annotations
  const visibleTimeRange = useMemo<[string, string] | null>(() => {
    if (!unifiedPoints?.length) return null
    if (!showBrush || !rangeWindow) {
      return [unifiedPoints[0].timestamp, unifiedPoints[unifiedPoints.length - 1].timestamp]
    }
    const [start, end] = rangeWindow
    const slice = unifiedPoints.slice(start, end + 1)
    if (slice.length === 0) return null
    return [slice[0].timestamp, slice[slice.length - 1].timestamp]
  }, [unifiedPoints, rangeWindow, showBrush])

  // Compute visible unacknowledged violation IDs for bulk acknowledge
  const visibleViolationIds = useMemo(() => {
    if (!unifiedPoints?.length) return []
    const visible = !showBrush || !rangeWindow ? unifiedPoints : unifiedPoints.slice(rangeWindow[0], rangeWindow[1] + 1)
    return visible.flatMap((p) => p.unacknowledged_violation_ids ?? p.violation_ids)
  }, [unifiedPoints, rangeWindow, showBrush])

  const { role } = useAuth()
  const canBulkAck =
    canPerformAction(role, 'violations:acknowledge') && visibleViolationIds.length > 0

  // Persist attribute chart type changes to backend so limits are recomputed
  const queryClient = useQueryClient()
  const handleAttributeChartTypeChange = useCallback(
    (chartType: string) => {
      if (!selectedId) return
      characteristicApi
        .update(selectedId, { attribute_chart_type: chartType as 'p' | 'np' | 'c' | 'u' })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['characteristics', 'chartData', selectedId] })
          queryClient.invalidateQueries({ queryKey: ['characteristics', 'detail', selectedId] })
        })
    },
    [selectedId, queryClient],
  )

  // Compute quick stats for the selected characteristic
  const quickStats = useMemo(() => {
    if (!chartDataForAnnotation) return null
    const { control_limits, spec_limits } = chartDataForAnnotation

    // Support standard, CUSUM, EWMA, and attribute data point arrays
    const stdPts = chartDataForAnnotation.data_points ?? []
    const cusumPts = chartDataForAnnotation.cusum_data_points ?? []
    const ewmaPts = chartDataForAnnotation.ewma_data_points ?? []
    const attrPts = chartDataForAnnotation.attribute_data_points ?? []

    let totalSamples: number
    let violationCount: number
    let lastMean: number
    let values: number[]

    if (attrPts.length > 0) {
      totalSamples = attrPts.length
      violationCount = attrPts.filter((p) => p.violation_ids.length > 0).length
      lastMean = attrPts[attrPts.length - 1].plotted_value
      values = attrPts.map((p) => p.plotted_value)
    } else if (stdPts.length > 0) {
      totalSamples = stdPts.length
      violationCount = stdPts.filter((p) => p.violation_ids.length > 0).length
      lastMean = stdPts[stdPts.length - 1].mean
      values = stdPts.map((p) => p.mean)
    } else if (cusumPts.length > 0) {
      totalSamples = cusumPts.length
      violationCount = cusumPts.filter((p) => p.violation_ids.length > 0).length
      lastMean = cusumPts[cusumPts.length - 1].measurement
      values = cusumPts.map((p) => p.measurement)
    } else if (ewmaPts.length > 0) {
      totalSamples = ewmaPts.length
      violationCount = ewmaPts.filter((p) => p.violation_ids.length > 0).length
      lastMean = ewmaPts[ewmaPts.length - 1].measurement
      values = ewmaPts.map((p) => p.measurement)
    } else {
      return null
    }

    const centerLine = control_limits.center_line

    // Compute Cpk if spec limits exist
    let cpk: number | null = null
    if (spec_limits.usl != null && spec_limits.lsl != null && control_limits.center_line != null) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
      const sigma = Math.sqrt(variance)
      if (sigma > 0) {
        const cpkUpper = (spec_limits.usl - mean) / (3 * sigma)
        const cpkLower = (mean - spec_limits.lsl) / (3 * sigma)
        cpk = Math.min(cpkUpper, cpkLower)
      }
    }

    return {
      totalSamples,
      violationCount,
      lastMean,
      centerLine,
      cpk,
      ucl: control_limits.ucl,
      lcl: control_limits.lcl,
      precision: chartDataForAnnotation.decimal_precision ?? 2,
    }
  }, [chartDataForAnnotation])

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
      characteristicIds.forEach((id) => unsubscribe(id))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characteristicIdsKey, subscribe, unsubscribe])

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-muted-foreground">{t('loadingCharacteristics')}</div>
      </div>
    )
  }

  const precision = quickStats?.precision ?? 2

  return (
    <div className="-mx-2 -my-2 flex h-[calc(100vh-5.5rem)] flex-col gap-2 px-1 py-1 md:-mx-4 md:-my-3 md:px-3 md:py-2">
      {/* ── Stats Ticker Bar ── */}
      {selectedId && quickStats && (
        <div className="flex flex-shrink-0 items-center gap-1.5 overflow-x-auto px-1 py-1 md:gap-2">
          {/* Characteristic name + chart type */}
          <div className="mr-1 flex flex-shrink-0 items-center gap-1.5 md:mr-2 md:gap-2">
            <span className="max-w-[120px] truncate text-xs font-semibold md:max-w-[200px] md:text-sm">
              {selectedCharacteristic?.name ?? '—'}
            </span>
            {selectedCharacteristic?.unit && (
              <span className="text-muted-foreground hidden text-xs md:inline">
                ({selectedCharacteristic.unit})
              </span>
            )}
          </div>

          <div className="bg-border/60 hidden h-4 w-px flex-shrink-0 md:block" />

          {/* Stats pills — trimmed to essentials */}
          <StatPill icon={Activity} label={t('stats.last')} value={quickStats.lastMean.toFixed(precision)} />
          <StatPill icon={Hash} label={t('stats.sampleCount')} value={quickStats.totalSamples} />
          <StatPill
            icon={AlertTriangle}
            label={t('stats.outOfControl')}
            value={quickStats.violationCount}
            variant={quickStats.violationCount > 0 ? 'danger' : 'success'}
          />
          {quickStats.cpk != null && (
            <StatPill
              icon={Gauge}
              label={t('stats.cpk')}
              value={quickStats.cpk.toFixed(2)}
              variant={
                quickStats.cpk >= 1.33 ? 'success' : quickStats.cpk >= 1.0 ? 'warning' : 'danger'
              }
            />
          )}
        </div>
      )}

      {/* ── Main Content Area (hierarchy now in sidebar) ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
          {selectedId ? (
            <>
              {/* ── Toolbar ── */}
              <ChartToolbar
                characteristicId={selectedId}
                subgroupSize={selectedCharacteristic?.subgroup_size ?? 5}
                isAttributeData={isAttribute}
                overrideChartType={effectiveOverride}
                onAttributeChartTypeChange={handleAttributeChartTypeChange}
                onChangeSecondary={() => setShowComparisonSelector(true)}
              />

              {/* ── Range Slider ── */}
              {showBrush && sparklineValues.length > 10 && (
                <ChartRangeSlider
                  totalPoints={sparklineValues.length}
                  values={sparklineValues}
                  timestamps={sparklineTimestamps}
                />
              )}

              {/* ── Primary Chart ── */}
              <div className="min-h-0 flex-1">
                {isBoxWhisker ? (
                  histogramPosition === 'right' ? (
                    <div className="flex h-full gap-2">
                      <div className="min-w-0 flex-1">
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
                    <div className="flex h-full flex-col gap-2">
                      <div className="min-h-0 flex-1">
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
                    key={`dual-${currentChartType}`}
                    characteristicId={selectedId}
                    chartType={currentChartType}
                    chartOptions={chartOptions}
                    label={comparisonMode ? (t('comparison.primary') as 'Primary') : undefined}
                    histogramPosition={histogramPosition}
                    showSpecLimits={showSpecLimits}
                    onPointAnnotation={(sampleId) => {
                      setSampleInspectorSampleId(sampleId)
                      setSampleInspectorOpen(true)
                    }}
                    onRegionSelect={setRegionSelection}
                  />
                ) : (
                  <ChartPanel
                    key={`single-${currentChartType}`}
                    characteristicId={selectedId}
                    chartType={currentChartType}
                    chartOptions={chartOptions}
                    label={comparisonMode ? (t('comparison.primary') as 'Primary') : undefined}
                    histogramPosition={histogramPosition}
                    showSpecLimits={showSpecLimits}
                    onPointAnnotation={(sampleId) => {
                      setSampleInspectorSampleId(sampleId)
                      setSampleInspectorOpen(true)
                    }}
                    onRegionSelect={setRegionSelection}
                  />
                )}
              </div>

              {/* ── Secondary Chart (Comparison Mode) ── */}
              {comparisonMode && (
                <div className="relative min-h-0 flex-1">
                  {secondaryCharacteristicId ? (
                    <ChartPanel
                      characteristicId={secondaryCharacteristicId}
                      chartOptions={chartOptions}
                      label={t('comparison.secondary') as 'Secondary'}
                      histogramPosition={histogramPosition}
                      showSpecLimits={showSpecLimits}
                    />
                  ) : (
                    <div className="bg-card border-border text-muted-foreground flex h-full flex-col items-center justify-center rounded-lg border border-dashed">
                      <p className="mb-3 text-sm">{t('selectCharacteristicToCompare')}</p>
                      <button
                        onClick={() => setShowComparisonSelector(true)}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                      >
                        {tCommon('buttons.browseHierarchy')}
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

              {/* ── Bottom Drawer — Capability + Annotations ── */}
              <BottomDrawer
                tabs={[
                  // Capability tab — only for variable charts
                  ...(selectedCharacteristic?.data_type !== 'attribute' ? [{
                    id: 'capability',
                    label: 'Capability',
                    badge:
                      selectedCharacteristic?.usl != null && selectedCharacteristic?.lsl != null && quickStats?.cpk != null ? (
                        <span className={cn(
                          'font-semibold tabular-nums',
                          quickStats.cpk >= 1.33 ? 'text-success' : quickStats.cpk >= 1.0 ? 'text-warning' : 'text-destructive',
                        )}>
                          {quickStats.cpk.toFixed(2)}
                        </span>
                      ) : undefined,
                    content: <CapabilityCard characteristicId={selectedId} />,
                  }] : []),
                  {
                    id: 'annotations',
                    label: 'Annotations',
                    badge: annotationCount > 0 ? String(annotationCount) : undefined,
                    content: (
                      <AnnotationListPanel
                        characteristicId={selectedId}
                        visibleSampleIds={visibleSampleIds}
                        visibleTimeRange={visibleTimeRange}
                        onAddAnnotation={() => {
                          setAnnotationMode('period')
                          setAnnotationSampleId(undefined)
                          setAnnotationSampleLabel(undefined)
                          setAnnotationDialogOpen(true)
                        }}
                      />
                    ),
                  },
                ] satisfies DrawerTab[]}
              />
            </>
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              {t('selectCharacteristic')}
            </div>
          )}
      </div>

      {/* Pending Signature Approvals */}
      <PendingApprovalsDashboard compact />

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

      {/* Sample Inspector Modal */}
      {sampleInspectorOpen && selectedId && sampleInspectorSampleId > 0 && (
        <ErrorBoundary>
          <SampleInspectorModal
            sampleId={sampleInspectorSampleId}
            characteristicId={selectedId}
            onClose={() => setSampleInspectorOpen(false)}
          />
        </ErrorBoundary>
      )}

      {/* Bulk Acknowledge Dialog */}
      {bulkAckDialogOpen && visibleViolationIds.length > 0 && (
        <BulkAcknowledgeDialog
          violationIds={visibleViolationIds}
          onClose={() => setBulkAckDialogOpen(false)}
          contextLabel="in current chart view"
        />
      )}

      {/* Region choice modal (from chart drag-select) */}
      {regionSelection && !regionAnnotateOpen && !regionAckOpen && (
        <RegionActionModal
          selection={regionSelection}
          canAcknowledge={
            canPerformAction(role, 'violations:acknowledge') &&
            regionSelection.violationIds.length > 0
          }
          onAnnotate={() => setRegionAnnotateOpen(true)}
          onAcknowledge={() => setRegionAckOpen(true)}
          onClose={() => setRegionSelection(null)}
        />
      )}

      {/* Region annotation dialog */}
      {regionAnnotateOpen && selectedId && regionSelection && (
        <AnnotationDialog
          characteristicId={selectedId}
          onClose={() => {
            setRegionAnnotateOpen(false)
            setRegionSelection(null)
          }}
          mode="period"
          prefillStartTime={regionSelection.startTime}
          prefillEndTime={regionSelection.endTime}
        />
      )}

      {/* Region bulk ack dialog */}
      {regionAckOpen && regionSelection && (
        <BulkAcknowledgeDialog
          violationIds={regionSelection.violationIds}
          onClose={() => {
            setRegionAckOpen(false)
            setRegionSelection(null)
          }}
          contextLabel={`in selected region (${formatDisplayKey(regionSelection.startDisplayKey)} \u2014 ${formatDisplayKey(regionSelection.endDisplayKey)})`}
        />
      )}
    </div>
  )
}
