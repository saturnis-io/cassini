import { useRef, useEffect, useState } from 'react'
import {
  Columns2,
  Download,
  Eye,
  EyeOff,
  ArrowLeftRight,
  CalendarClock,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Package,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLicense } from '@/hooks/useLicense'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useProductCodes, useAnomalyEvents } from '@/api/hooks'
import { TimeRangeSelector } from './TimeRangeSelector'
import { HistogramPositionSelector } from './HistogramPositionSelector'
import { ChartTypeSelector } from './charts/ChartTypeSelector'
import { recommendChartType, HISTOGRAM_CHART_TYPES } from '@/lib/chart-registry'
import type { ChartTypeId } from '@/types/charts'
import { useSampleLabel } from '@/hooks/useSampleLabel'
import type { AnomalyEvent } from '@/types/anomaly'
import {
  EVENT_TYPE_LABELS,
  DETECTOR_FRIENDLY,
  DETECTOR_TECHNICAL,
  SEVERITY_PRIORITY,
  SEVERITY_THEME_CLASS,
  SEVERITY_PILL_CLASS,
} from '@/lib/anomaly-labels'

interface ChartToolbarProps {
  /** Currently selected characteristic ID for chart type selection */
  characteristicId?: number | null
  /** Subgroup size of the characteristic (for chart type recommendations) */
  subgroupSize?: number
  /** Whether the characteristic uses attribute data (pass/fail, defect counts) */
  isAttributeData?: boolean
  /** The characteristic's configured attribute chart type (p/np/c/u) */
  attributeChartType?: 'p' | 'np' | 'c' | 'u' | null
  /** Override chart type (e.g. from characteristic's chart_type field for CUSUM/EWMA) */
  overrideChartType?: ChartTypeId | null
  /** Callback when attribute chart type changes (p/np/c/u) — persists to backend */
  onAttributeChartTypeChange?: (chartType: string) => void
  onComparisonToggle?: () => void
  onChangeSecondary?: () => void
  onExportExcel?: () => void
}

/**
 * Compact toolbar button matching the trading-terminal aesthetic.
 */
function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
        active
          ? 'bg-primary/15 text-primary border-primary/30 border'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent',
      )}
    >
      {children}
    </button>
  )
}

const SEVERITY_DOT: Record<string, string> = {
  CRITICAL: 'bg-destructive',
  WARNING: 'bg-warning',
  INFO: 'bg-primary',
}

/** Titles for insight popover cards — slightly different from EVENT_TYPE_LABELS. */
const INSIGHT_TITLES: Record<string, string> = {
  changepoint: 'Process Shift Detected',
  distribution_shift: 'Distribution Drift',
  outlier: 'Unusual Pattern',
  anomaly_score: 'Unusual Pattern',
}

const SEVERITY_BORDER: Record<string, string> = {
  CRITICAL: 'border-l-destructive',
  WARNING: 'border-l-warning',
  INFO: 'border-l-primary',
}

/** Convert a p-value into a human-readable confidence phrase. */
function pValueToConfidence(p: number): string {
  if (!Number.isFinite(p)) return 'Confidence unavailable'
  const clamped = Math.max(0, Math.min(1, p))
  const pct = Math.min((1 - clamped) * 100, 99.9).toFixed(1)
  if (clamped < 0.001) return `Very high confidence (${pct}%)`
  if (clamped < 0.01) return `High confidence (${pct}%)`
  if (clamped < 0.05) return `Moderate confidence (${pct}%)`
  return `Low confidence (${pct}%)`
}

/** Format the structured details into a human-readable description. */
function formatInsightBody(event: AnomalyEvent): string | null {
  const d = event.details ?? {}

  if (event.event_type === 'changepoint') {
    const before = d.segment_before_mean as number | undefined
    const after = d.segment_after_mean as number | undefined
    const sigma = d.shift_sigma as number | undefined
    if (before != null && after != null) {
      const direction = (after as number) > (before as number) ? 'increased' : 'decreased'
      const sigmaNote = sigma != null ? ` (${(sigma as number).toFixed(1)}\u03C3 shift)` : ''
      return `Mean ${direction} from ${(before as number).toFixed(3)} to ${(after as number).toFixed(3)}${sigmaNote}`
    }
    return event.summary ?? null
  }

  if (event.event_type === 'outlier') {
    // Drop the raw anomaly_score — severity badge already conveys risk level
    return 'This data point shows an unusual combination of values compared to historical patterns'
  }

  if (event.event_type === 'distribution_shift') {
    const pValue = d.p_value as number | undefined
    const refMean = d.reference_mean as number | undefined
    const testMean = d.test_mean as number | undefined
    if (pValue != null) {
      const confidence = pValueToConfidence(pValue)
      const meanShift =
        refMean != null && testMean != null
          ? `. Mean moved from ${refMean.toFixed(3)} to ${testMean.toFixed(3)}`
          : ''
      return `${confidence} that recent data no longer follows the established pattern${meanShift}`
    }
    return event.summary ?? null
  }

  return event.summary ?? null
}

/** Relative time label (e.g. "2h ago", "3d ago"). */
function timeAgo(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

/**
 * AI Insights popover — human-readable event cards.
 * Click-outside is handled by the parent wrapper ref, not here.
 */
function AnomalyInsightsPopover({
  events,
  characteristicId,
}: {
  events: AnomalyEvent[]
  characteristicId: number | null
}) {
  const getSampleLabel = useSampleLabel(characteristicId)
  const active = events.filter((e) => !e.is_dismissed)
  if (active.length === 0) return null

  return (
    <div className="bg-card border-border absolute top-full right-0 z-50 mt-1 w-80 rounded-lg border shadow-lg">
      <div className="border-border flex items-center justify-between border-b px-3 py-2">
        <span className="text-foreground text-xs font-medium">
          AI Insights
        </span>
        <span className="text-muted-foreground text-[10px]">
          {active.length} active
        </span>
      </div>
      <div className="max-h-64 space-y-1.5 overflow-y-auto p-2">
        {active.map((event) => {
          const borderStyle = SEVERITY_BORDER[event.severity] ?? SEVERITY_BORDER.INFO
          const sevStyle = SEVERITY_THEME_CLASS[event.severity] ?? SEVERITY_BADGE.INFO
          const title = INSIGHT_TITLES[event.event_type] ?? event.event_type
          const detectorDesc =
            DETECTOR_FRIENDLY[event.detector_type] ?? event.detector_type
          const detectorTech =
            DETECTOR_TECHNICAL[event.detector_type] ?? event.detector_type
          const body = formatInsightBody(event)

          return (
            <div
              key={event.id}
              className={cn(
                'bg-muted/40 rounded-md border-l-2 py-2 pr-2.5 pl-3 text-[11px] leading-snug',
                borderStyle,
              )}
            >
              <div className="text-foreground font-semibold">{title}</div>
              {body && (
                <div className="text-muted-foreground mt-0.5">{body}</div>
              )}
              <div className="text-muted-foreground/60 mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className={cn('font-medium', sevStyle)}>{event.severity}</span>
                <span>·</span>
                <span title={detectorTech}>{detectorDesc}</span>
                <span>·</span>
                <span>{timeAgo(event.detected_at)}</span>
                {event.sample_id != null && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">
                      {getSampleLabel(event.sample_id)}
                    </span>
                  </>
                )}
                {event.window_start_id != null && event.window_end_id != null && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">
                      {getSampleLabel(event.window_start_id)}–
                      {getSampleLabel(event.window_end_id)}
                    </span>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ChartToolbar({
  characteristicId,
  subgroupSize = 5,
  isAttributeData = false,
  attributeChartType,
  overrideChartType,
  onAttributeChartTypeChange,
  onComparisonToggle,
  onChangeSecondary,
  onExportExcel,
}: ChartToolbarProps) {
  const { isCommercial } = useLicense()
  const {
    comparisonMode,
    setComparisonMode,
    showSpecLimits,
    setShowSpecLimits,
    secondaryCharacteristicId,
    chartTypes,
    setChartType,
    xAxisMode,
    setXAxisMode,
    showBrush,
    setShowBrush,
    showAnomalies,
    setShowAnomalies,
    showPredictions,
    setShowPredictions,
    productCodeFilter,
    setProductCodeFilter,
  } = useDashboardStore()

  const { data: productCodes } = useProductCodes(characteristicId ?? 0)

  // Anomaly data — same query key as ControlChart so React Query deduplicates
  const { data: anomalyData } = useAnomalyEvents(
    isCommercial && showAnomalies ? (characteristicId ?? 0) : 0,
    { limit: 100 },
  )
  const [insightsOpen, setInsightsOpen] = useState(false)

  const activeEvents = anomalyData?.events?.filter((e: AnomalyEvent) => !e.is_dismissed) ?? []
  const worstSeverity = activeEvents.reduce(
    (w: string, e: AnomalyEvent) =>
      (SEVERITY_PRIORITY[e.severity] ?? 0) > (SEVERITY_PRIORITY[w] ?? 0) ? e.severity : w,
    'INFO',
  )

  // Reset product code filter when characteristic changes
  const prevCharIdRef = useRef(characteristicId)
  useEffect(() => {
    if (characteristicId !== prevCharIdRef.current) {
      prevCharIdRef.current = characteristicId
      if (productCodeFilter) {
        setProductCodeFilter(null)
      }
    }
  }, [characteristicId, productCodeFilter, setProductCodeFilter])

  // Close insights popover when anomalies toggled off
  useEffect(() => {
    if (!showAnomalies) setInsightsOpen(false)
  }, [showAnomalies])

  // Click-outside handler for the entire AI insights area (toggle + popover)
  const aiWrapperRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!insightsOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (aiWrapperRef.current && !aiWrapperRef.current.contains(e.target as Node)) {
        setInsightsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [insightsOpen])

  // Get current chart type for the characteristic (fall back to override or recommended type for subgroup size)
  const storeChartType = characteristicId ? chartTypes.get(characteristicId) : undefined
  const currentChartType: ChartTypeId =
    storeChartType || overrideChartType || recommendChartType(subgroupSize)

  const handleChartTypeChange = (chartType: ChartTypeId) => {
    if (characteristicId) {
      setChartType(characteristicId, chartType)
      // For attribute charts, persist to backend so limits are recomputed
      if (isAttributeData && ['p', 'np', 'c', 'u'].includes(chartType)) {
        onAttributeChartTypeChange?.(chartType)
      }
    }
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-1 py-1">
      {/* Left group — data controls */}
      <div className="flex items-center gap-1">
        <TimeRangeSelector />

        {HISTOGRAM_CHART_TYPES.includes(currentChartType) && (
          <>
            <div className="bg-border/40 mx-0.5 h-4 w-px" />
            <HistogramPositionSelector />
          </>
        )}

        {characteristicId && (
          <ChartTypeSelector
            value={currentChartType}
            onChange={handleChartTypeChange}
            subgroupSize={subgroupSize}
            isAttributeData={isAttributeData}
            attributeChartType={attributeChartType}
          />
        )}

        {/* Product code filter */}
        {productCodes && productCodes.length > 0 && (
          <>
            <div className="bg-border/40 mx-0.5 h-4 w-px" />
            <div className="flex items-center gap-1">
              <Package className="text-muted-foreground h-3.5 w-3.5" />
              <select
                value={productCodeFilter ?? ''}
                onChange={(e) => setProductCodeFilter(e.target.value || null)}
                className={cn(
                  'border-transparent bg-transparent py-0.5 pr-5 pl-1 text-xs',
                  'focus:border-primary focus:ring-primary/20 rounded focus:ring-1 focus:outline-none',
                  productCodeFilter
                    ? 'text-primary font-medium'
                    : 'text-muted-foreground',
                )}
                title="Filter by product code"
              >
                <option value="">All Products</option>
                {productCodes.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        <div className="bg-border/40 mx-0.5 h-4 w-px" />

        <ToolbarBtn
          active={xAxisMode === 'timestamp'}
          onClick={() => setXAxisMode(xAxisMode === 'index' ? 'timestamp' : 'index')}
          title={xAxisMode === 'timestamp' ? 'Show sample numbers' : 'Show timestamps'}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Time</span>
        </ToolbarBtn>

        <ToolbarBtn
          active={showBrush}
          onClick={() => setShowBrush(!showBrush)}
          title={showBrush ? 'Hide range slider' : 'Show range slider'}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Zoom</span>
        </ToolbarBtn>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right group — visibility toggles */}
      <div className="flex items-center gap-1">
        {isCommercial && (
          <div ref={aiWrapperRef} className="relative flex items-center gap-1.5">
            {/* AI toggle */}
            <ToolbarBtn
              active={showAnomalies}
              onClick={() => setShowAnomalies(!showAnomalies)}
              title={showAnomalies ? 'Hide anomaly overlay' : 'Show AI anomaly detection'}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">AI</span>
            </ToolbarBtn>

            {/* Insights count pill — solid severity color to stand out */}
            {showAnomalies && activeEvents.length > 0 && (
              <button
                onClick={() => setInsightsOpen((v) => !v)}
                title="View AI insights"
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm transition-colors',
                  SEVERITY_PILL_CLASS[worstSeverity] ?? SEVERITY_PILL.INFO,
                )}
              >
                <Sparkles className="h-3 w-3" />
                {activeEvents.length} insight{activeEvents.length !== 1 ? 's' : ''}
                <ChevronDown
                  className={cn('h-3 w-3 transition-transform', insightsOpen && 'rotate-180')}
                />
              </button>
            )}

            {/* Popover dropdown — click-outside handled by aiWrapperRef */}
            {insightsOpen && anomalyData?.events && (
              <AnomalyInsightsPopover
                events={anomalyData.events}
                characteristicId={characteristicId ?? null}
              />
            )}
          </div>
        )}

        {isCommercial && (
          <ToolbarBtn
            active={showPredictions}
            onClick={() => setShowPredictions(!showPredictions)}
            title={showPredictions ? 'Hide forecast predictions' : 'Show forecast predictions'}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Predictions</span>
          </ToolbarBtn>
        )}

        <ToolbarBtn
          active={showSpecLimits}
          onClick={() => setShowSpecLimits(!showSpecLimits)}
          title={showSpecLimits ? 'Hide spec limits' : 'Show spec limits'}
        >
          {showSpecLimits ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">LSL/USL</span>
        </ToolbarBtn>

        {onExportExcel && (
          <>
            <ToolbarBtn onClick={onExportExcel} title="Export data to Excel">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </ToolbarBtn>
            <div className="bg-border/40 mx-0.5 h-4 w-px" />
          </>
        )}

        <div className="bg-border/40 mx-0.5 h-4 w-px" />

        <ToolbarBtn
          active={comparisonMode}
          onClick={() => {
            setComparisonMode(!comparisonMode)
            onComparisonToggle?.()
          }}
          title={comparisonMode ? 'Exit comparison' : 'Compare charts'}
        >
          <Columns2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Compare</span>
        </ToolbarBtn>

        {comparisonMode && secondaryCharacteristicId && onChangeSecondary && (
          <ToolbarBtn onClick={onChangeSecondary} title="Change comparison characteristic">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Change</span>
          </ToolbarBtn>
        )}
      </div>
    </div>
  )
}
