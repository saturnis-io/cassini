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
    <div className="border-border flex items-center overflow-hidden rounded-lg border">
      {positions.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setHistogramPosition(value)}
          title={label}
          className={cn(
            'border-border border-r p-2 transition-colors last:border-r-0',
            histogramPosition === value
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  )
}
