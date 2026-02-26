import { cn } from '@/lib/utils'
import { useShowYourWorkStore } from '@/stores/showYourWorkStore'
import type { ExplainChartOptions } from '@/api/explain.api'

interface ExplainableProps {
  /** Metric type key sent to the explain API (e.g., 'cpk', 'pp') */
  metric: string
  /** Resource ID (characteristic ID or MSA study ID) */
  resourceId: string | number
  /** Resource type for API routing */
  resourceType?: 'capability' | 'msa' | 'control-limits' | 'attribute'
  /** Chart data options so the explanation matches the displayed value */
  chartOptions?: ExplainChartOptions
  /** The rendered value to wrap */
  children: React.ReactNode
  /** Additional class name */
  className?: string
}

export function Explainable({
  metric,
  resourceId,
  resourceType = 'capability',
  chartOptions,
  children,
  className,
}: ExplainableProps) {
  const enabled = useShowYourWorkStore((s) => s.enabled)
  const activeMetric = useShowYourWorkStore((s) => s.activeMetric)
  const openExplanation = useShowYourWorkStore((s) => s.openExplanation)

  if (!enabled) return <>{children}</>

  const isActive =
    activeMetric?.type === metric && activeMetric?.resourceId === String(resourceId)

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        openExplanation(metric, String(resourceId), resourceType, chartOptions)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          openExplanation(metric, String(resourceId), resourceType, chartOptions)
        }
      }}
      className={cn(
        'explainable-value cursor-pointer transition-all',
        'decoration-primary/50 underline decoration-dotted underline-offset-4',
        'hover:decoration-primary hover:text-primary',
        isActive && 'decoration-primary ring-primary/30 ring-2 rounded-sm text-primary',
        className,
      )}
    >
      {children}
    </span>
  )
}
