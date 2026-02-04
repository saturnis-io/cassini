import { BarChart3, Columns2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { TimeRangeSelector } from './TimeRangeSelector'

interface ChartToolbarProps {
  onComparisonToggle?: () => void
}

export function ChartToolbar({ onComparisonToggle }: ChartToolbarProps) {
  const { showHistogram, setShowHistogram, comparisonMode, setComparisonMode } = useDashboardStore()

  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div className="flex items-center gap-2">
        <TimeRangeSelector />
      </div>

      <div className="flex items-center gap-2">
        {/* Histogram Toggle */}
        <button
          onClick={() => setShowHistogram(!showHistogram)}
          title={showHistogram ? 'Hide histogram' : 'Show histogram'}
          className={cn(
            'p-2 rounded-lg border transition-colors',
            showHistogram
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
          )}
        >
          <BarChart3 className="h-4 w-4" />
        </button>

        {/* Comparison Toggle */}
        <button
          onClick={() => {
            setComparisonMode(!comparisonMode)
            onComparisonToggle?.()
          }}
          title={comparisonMode ? 'Exit comparison' : 'Compare charts'}
          className={cn(
            'p-2 rounded-lg border transition-colors',
            comparisonMode
              ? 'bg-primary/10 border-primary text-primary'
              : 'bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
          )}
        >
          <Columns2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
