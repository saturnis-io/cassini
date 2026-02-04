import { Columns2, Eye, EyeOff, ArrowLeftRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { TimeRangeSelector } from './TimeRangeSelector'
import { HistogramPositionSelector } from './HistogramPositionSelector'
import { ChartTypeSelector } from './charts/ChartTypeSelector'
import type { ChartTypeId } from '@/types/charts'

interface ChartToolbarProps {
  /** Currently selected characteristic ID for chart type selection */
  characteristicId?: number | null
  /** Subgroup size of the characteristic (for chart type recommendations) */
  subgroupSize?: number
  onComparisonToggle?: () => void
  onChangeSecondary?: () => void
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
  } = useDashboardStore()

  // Get current chart type for the characteristic
  const currentChartType: ChartTypeId = (characteristicId && chartTypes.get(characteristicId)) || 'xbar'

  const handleChartTypeChange = (chartType: ChartTypeId) => {
    if (characteristicId) {
      setChartType(characteristicId, chartType)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div className="flex items-center gap-3">
        <TimeRangeSelector />
        <HistogramPositionSelector />
        {/* Chart Type Selector */}
        {characteristicId && (
          <ChartTypeSelector
            value={currentChartType}
            onChange={handleChartTypeChange}
            subgroupSize={subgroupSize}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Spec Limits Toggle */}
        <button
          onClick={() => setShowSpecLimits(!showSpecLimits)}
          title={showSpecLimits ? 'Hide spec limits' : 'Show spec limits'}
          className={cn(
            'p-2 rounded-lg border transition-colors flex items-center gap-1.5 text-xs',
            showSpecLimits
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
          )}
        >
          {showSpecLimits ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          <span className="hidden sm:inline">LSL/USL</span>
        </button>

        {/* Comparison Toggle */}
        <button
          onClick={() => {
            setComparisonMode(!comparisonMode)
            onComparisonToggle?.()
          }}
          title={comparisonMode ? 'Exit comparison' : 'Compare charts'}
          className={cn(
            'p-2 rounded-lg border transition-colors flex items-center gap-1.5 text-xs',
            comparisonMode
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
          )}
        >
          <Columns2 className="h-4 w-4" />
          <span className="hidden sm:inline">Compare</span>
        </button>

        {/* Change Secondary Characteristic (only in comparison mode with secondary selected) */}
        {comparisonMode && secondaryCharacteristicId && onChangeSecondary && (
          <button
            onClick={onChangeSecondary}
            title="Change comparison characteristic"
            className="p-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors flex items-center gap-1.5 text-xs"
          >
            <ArrowLeftRight className="h-4 w-4" />
            <span className="hidden sm:inline">Change</span>
          </button>
        )}
      </div>
    </div>
  )
}
