import { cn } from '@/lib/utils'
import { useAnomalyEvents } from '@/api/hooks'
import { Sparkles } from 'lucide-react'

interface AnomalyBadgeProps {
  characteristicId: number
  onClick?: () => void
  className?: string
}

const SEVERITY_PRIORITY: Record<string, number> = {
  CRITICAL: 3,
  WARNING: 2,
  INFO: 1,
}

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: 'bg-red-500/15 text-red-500 border-red-500/30',
  WARNING: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  INFO: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
}

/**
 * Small badge showing the count of active (unacknowledged, undismissed)
 * anomaly events for a characteristic. Colored by worst severity.
 */
export function AnomalyBadge({ characteristicId, onClick, className }: AnomalyBadgeProps) {
  const { data } = useAnomalyEvents(characteristicId, { limit: 100 })

  // Filter to active events only
  const activeEvents = (data?.items ?? []).filter((e) => !e.is_acknowledged && !e.is_dismissed)
  const count = activeEvents.length

  if (count === 0) return null

  // Find worst severity
  let worstSeverity = 'INFO'
  let worstPriority = 0
  for (const event of activeEvents) {
    const priority = SEVERITY_PRIORITY[event.severity] ?? 0
    if (priority > worstPriority) {
      worstPriority = priority
      worstSeverity = event.severity
    }
  }

  const style = SEVERITY_STYLES[worstSeverity] ?? SEVERITY_STYLES.INFO

  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none',
        style,
        onClick && 'cursor-pointer transition-opacity hover:opacity-80',
        className,
      )}
      onClick={onClick}
      title={`${count} active anomal${count === 1 ? 'y' : 'ies'}`}
    >
      <Sparkles className="h-2.5 w-2.5" />
      {count}
    </span>
  )

  return badge
}
