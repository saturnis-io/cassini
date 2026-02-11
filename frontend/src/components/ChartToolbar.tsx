import { Columns2, Eye, EyeOff, ArrowLeftRight, CalendarClock, SlidersHorizontal, MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { TimeRangeSelector } from './TimeRangeSelector'
import { HistogramPositionSelector } from './HistogramPositionSelector'
import { ChartTypeSelector } from './charts/ChartTypeSelector'
import { recommendChartType } from '@/lib/chart-registry'
import type { ChartTypeId } from '@/types/charts'

interface ChartToolbarProps {
  /** Currently selected characteristic ID for chart type selection */
  characteristicId?: number | null
  /** Subgroup size of the characteristic (for chart type recommendations) */
  subgroupSize?: number
  onComparisonToggle?: () => void
  onChangeSecondary?: () => void
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
        'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
        active
          ? 'bg-primary/15 text-primary border border-primary/30'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent'
      )}
    >
      {children}
    </button>
  )
}

export function ChartToolbar({
  characteristicId,
  subgroupSize = 5,
  onComparisonToggle,
  onChangeSecondary,
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
    showAnnotations,
    setShowAnnotations,
  } = useDashboardStore()

  // Get current chart type for the characteristic (fall back to recommended type for subgroup size)
  const currentChartType: ChartTypeId = (characteristicId && chartTypes.get(characteristicId)) || recommendChartType(subgroupSize)

  const handleChartTypeChange = (chartType: ChartTypeId) => {
    if (characteristicId) {
      setChartType(characteristicId, chartType)
    }
  }

  return (
    <div className="flex items-center gap-1 py-1 flex-shrink-0 flex-wrap">
      {/* Left group — data controls */}
      <div className="flex items-center gap-1">
        <TimeRangeSelector />

        <div className="h-4 w-px bg-border/40 mx-0.5" />

        <HistogramPositionSelector />

        {characteristicId && (
          <ChartTypeSelector
            value={currentChartType}
            onChange={handleChartTypeChange}
            subgroupSize={subgroupSize}
          />
        )}

        <div className="h-4 w-px bg-border/40 mx-0.5" />

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
          active={showAnnotations}
          onClick={() => setShowAnnotations(!showAnnotations)}
          title={showAnnotations ? 'Hide annotation list' : 'Show annotation list'}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Annotations</span>
        </ToolbarBtn>

        <ToolbarBtn
          active={showSpecLimits}
          onClick={() => setShowSpecLimits(!showSpecLimits)}
          title={showSpecLimits ? 'Hide spec limits' : 'Show spec limits'}
        >
          {showSpecLimits ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">LSL/USL</span>
        </ToolbarBtn>

        <div className="h-4 w-px bg-border/40 mx-0.5" />

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
          <ToolbarBtn
            onClick={onChangeSecondary}
            title="Change comparison characteristic"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Change</span>
          </ToolbarBtn>
        )}
      </div>
    </div>
  )
}
