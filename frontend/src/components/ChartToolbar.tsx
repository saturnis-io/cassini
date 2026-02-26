import {
  Columns2,
  Download,
  Eye,
  EyeOff,
  ArrowLeftRight,
  CalendarClock,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { TimeRangeSelector } from './TimeRangeSelector'
import { HistogramPositionSelector } from './HistogramPositionSelector'
import { ChartTypeSelector } from './charts/ChartTypeSelector'
import { recommendChartType, HISTOGRAM_CHART_TYPES } from '@/lib/chart-registry'
import type { ChartTypeId } from '@/types/charts'

interface ChartToolbarProps {
  /** Currently selected characteristic ID for chart type selection */
  characteristicId?: number | null
  /** Subgroup size of the characteristic (for chart type recommendations) */
  subgroupSize?: number
  /** Whether the characteristic uses attribute data (pass/fail, defect counts) */
  isAttributeData?: boolean
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

export function ChartToolbar({
  characteristicId,
  subgroupSize = 5,
  isAttributeData = false,
  overrideChartType,
  onAttributeChartTypeChange,
  onComparisonToggle,
  onChangeSecondary,
  onExportExcel,
}: ChartToolbarProps) {
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
  } = useDashboardStore()

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
          />
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
        <ToolbarBtn
          active={showAnomalies}
          onClick={() => setShowAnomalies(!showAnomalies)}
          title={showAnomalies ? 'Hide anomaly overlay' : 'Show AI anomaly detection'}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">AI</span>
        </ToolbarBtn>

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
