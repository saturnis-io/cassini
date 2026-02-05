import { BarChart3, PanelRight, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore, type HistogramPosition } from '@/stores/dashboardStore'

const positions: { value: HistogramPosition; icon: typeof BarChart3; label: string }[] = [
  { value: 'below', icon: BarChart3, label: 'Histogram below chart' },
  { value: 'right', icon: PanelRight, label: 'Histogram on right (vertical)' },
  { value: 'hidden', icon: EyeOff, label: 'Hide histogram' },
]

export function HistogramPositionSelector() {
  const { histogramPosition, setHistogramPosition } = useDashboardStore()

  return (
    <div className="flex items-center border border-border rounded-lg overflow-hidden">
      {positions.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setHistogramPosition(value)}
          title={label}
          className={cn(
            'p-2 transition-colors border-r border-border last:border-r-0',
            histogramPosition === value
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}
