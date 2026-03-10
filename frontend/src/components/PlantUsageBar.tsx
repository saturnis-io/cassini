import { cn } from '@/lib/utils'

interface PlantUsageBarProps {
  used: number
  max: number
}

export function PlantUsageBar({ used, max }: PlantUsageBarProps) {
  const percent = max > 0 ? Math.min((used / max) * 100, 100) : 0
  const overLimit = used > max

  return (
    <div data-ui="plant-usage-bar" className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {used} / {max} sites
        </span>
        {overLimit && (
          <span className="text-destructive font-medium">Over limit</span>
        )}
      </div>
      <div
        className="bg-border h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={`${used} of ${max} sites used`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            overLimit
              ? 'bg-destructive'
              : percent >= 80
                ? 'bg-warning'
                : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
