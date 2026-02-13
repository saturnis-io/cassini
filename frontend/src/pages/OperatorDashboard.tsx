import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { BulkAcknowledgeDialog } from '@/components/BulkAcknowledgeDialog'
import { CapabilityCard } from '@/components/capability/CapabilityCard'
import { RegionActionModal, type RegionSelection } from '@/components/RegionActionModal'
import { formatDisplayKey } from '@/lib/display-key'
import { useWebSocketContext } from '@/providers/WebSocketProvider'
import { useAuth } from '@/providers/AuthProvider'
import { canPerformAction } from '@/lib/roles'
import { DUAL_CHART_TYPES, recommendChartType } from '@/lib/chart-registry'
import type { ChartTypeId } from '@/types/charts'
import { cn } from '@/lib/utils'
import { AlertTriangle, TrendingUp, Activity, Hash, Target, Gauge } from 'lucide-react'

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
  const showAnnotations = useDashboardStore((state) => state.showAnnotations)
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

  // Get current chart type — default to recommended type for the characteristic's subgroup size
  const subgroupSize = selectedCharacteristic?.subgroup_size ?? 5
  const currentChartType: ChartTypeId =
    (selectedId && chartTypes.get(selectedId)) || recommendChartType(subgroupSize)
  const isDualChart = DUAL_CHART_TYPES.includes(currentChartType)
  const isBoxWhisker = currentChartType === 'box-whisker'

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
      const zValues = data_points.filter((p) => p.z_score != null).map((p) => p.z_score!)
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

  // Compute visible unacknowledged violation IDs for bulk acknowledge
  const visibleViolationIds = useMemo(() => {
    if (!chartDataForAnnotation?.data_points?.length) return []
    const pts = chartDataForAnnotation.data_points
    const visible = !showBrush || !rangeWindow ? pts : pts.slice(rangeWindow[0], rangeWindow[1] + 1)
    return visible.flatMap((p) => p.unacknowledged_violation_ids ?? p.violation_ids)
  }, [chartDataForAnnotation, rangeWindow, showBrush])

  const { role } = useAuth()
  const canBulkAck =
    canPerformAction(role, 'violations:acknowledge') && visibleViolationIds.length > 0

  // Compute quick stats for the selected characteristic
  const quickStats = useMemo(() => {
    if (!chartDataForAnnotation?.data_points?.length) return null
    const pts = chartDataForAnnotation.data_points
    const { control_limits, spec_limits } = chartDataForAnnotation

    const totalSamples = pts.length
    const violationCount = pts.filter((p) => p.violation_ids.length > 0).length
    const lastMean = pts[pts.length - 1].mean
    const centerLine = control_limits.center_line

    // Compute Cpk if spec limits exist
    let cpk: number | null = null
    if (spec_limits.usl != null && spec_limits.lsl != null && control_limits.center_line != null) {
      const values = pts.map((p) => p.mean)
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

          {/* Stats pills */}
          <StatPill icon={Activity} label={t('stats.last')} value={quickStats.lastMean.toFixed(precision)} />
          {quickStats.centerLine != null && (
            <StatPill icon={Target} label={t('stats.centerLine')} value={quickStats.centerLine.toFixed(precision)} />
          )}
          <span className="hidden md:contents">
            {quickStats.ucl != null && (
              <StatPill icon={TrendingUp} label={t('stats.ucl')} value={quickStats.ucl.toFixed(precision)} />
            )}
            {quickStats.lcl != null && (
              <StatPill icon={TrendingUp} label={t('stats.lcl')} value={quickStats.lcl.toFixed(precision)} />
            )}
          </span>
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

      {/* ── Main Content Area ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 md:flex-row">
        {/* Left Panel — Hierarchy / Characteristics (Watchlist-style) */}
        <div className="h-48 flex-shrink-0 md:h-auto md:w-72">
          <HierarchyTodoList className="h-full" />
        </div>

        {/* Center + Right — Chart area */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {selectedId ? (
            <>
              {/* ── Toolbar ── */}
              <ChartToolbar
                characteristicId={selectedId}
                subgroupSize={selectedCharacteristic?.subgroup_size ?? 5}
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
                    characteristicId={selectedId}
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

              {/* ── Annotation List Panel ── */}
              {showAnnotations && selectedId && (
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
              )}

              {/* ── Process Capability Card ── */}
              {selectedId &&
                selectedCharacteristic?.usl != null &&
                selectedCharacteristic?.lsl != null && (
                  <div className="flex-shrink-0">
                    <CapabilityCard characteristicId={selectedId} />
                  </div>
                )}
            </>
          ) : (
            <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
              {t('selectCharacteristic')}
            </div>
          )}
        </div>
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

      {/* Sample Inspector Modal */}
      {sampleInspectorOpen && selectedId && sampleInspectorSampleId > 0 && (
        <SampleInspectorModal
          sampleId={sampleInspectorSampleId}
          characteristicId={selectedId}
          onClose={() => setSampleInspectorOpen(false)}
        />
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
