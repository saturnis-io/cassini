import { Columns2, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { TimeRangeSelector } from './TimeRangeSelector'
import { HistogramPositionSelector } from './HistogramPositionSelector'

interface ChartToolbarProps {
  onComparisonToggle?: () => void
}

export function ChartToolbar({ onComparisonToggle }: ChartToolbarProps) {
  const { comparisonMode, setComparisonMode, showSpecLimits, setShowSpecLimits } = useDashboardStore()

  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div className="flex items-center gap-3">
        <TimeRangeSelector />
        <HistogramPositionSelector />
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
      </div>
    </div>
  )
}
