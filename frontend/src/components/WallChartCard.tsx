import { useMemo } from 'react'
import { Maximize2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCharacteristic, useChartData } from '@/api/hooks'
import { ControlChart } from '@/components/ControlChart'
import { ErrorBoundary } from '@/components/ErrorBoundary'

interface WallChartCardProps {
  characteristicId: number
  onExpand: (id: number) => void
  className?: string
}

/**
 * Status dot indicator
 */
function StatusDot({ status }: { status: 'ok' | 'warning' | 'violation' }) {
  const colors = {
    ok: 'bg-success',
    warning: 'bg-warning',
    violation: 'bg-destructive animate-pulse',
  }

  return <div className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', colors[status])} />
}

/**
 * Compact chart card for wall dashboard grid display
 *
 * Features:
 * - Compact control chart (no toolbar)
 * - Status indicator (green/yellow/red)
 * - Current value and control limits
 * - Click-to-expand functionality
 * - Violation indicator badge
 *
 * @example
 * <WallChartCard
 *   characteristicId={1}
 *   onExpand={(id) => setExpandedId(id)}
 * />
 */
export function WallChartCard({ characteristicId, onExpand, className }: WallChartCardProps) {
  const { data: characteristic } = useCharacteristic(characteristicId)
  const { data: chartData, isLoading } = useChartData(characteristicId, { limit: 30 })

  // Determine status from latest point
  const { status, violationCount } = useMemo(() => {
    if (!chartData?.data_points?.length) return { status: 'ok' as const, violationCount: 0 }

    // Count recent violations
    const recentPoints = chartData.data_points.slice(-10)
    const violations = recentPoints.filter((p) => p.violation_rules?.length).length

    const latestPoint = chartData.data_points[chartData.data_points.length - 1]
    if (latestPoint.violation_rules?.length) {
      return { status: 'violation' as const, violationCount: violations }
    }

    // Check if close to limits
    const mean = latestPoint.mean
    const ucl = chartData.control_limits?.ucl
    const lcl = chartData.control_limits?.lcl
    if (ucl && lcl) {
      const range = ucl - lcl
      const margin = range * 0.15
      if (mean > ucl - margin || mean < lcl + margin) {
        return { status: 'warning' as const, violationCount: violations }
      }
    }

    return { status: 'ok' as const, violationCount: violations }
  }, [chartData])

  const latestValue = chartData?.data_points?.length
    ? chartData.data_points[chartData.data_points.length - 1].mean
    : null

  return (
    <div
      className={cn(
        'border-border bg-card flex flex-col overflow-hidden rounded-lg border',
        'hover:border-muted-foreground/30 transition-colors',
        className,
      )}
    >
      {/* Header */}
      <div className="border-border bg-card/50 flex items-center justify-between border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={status} />
          <span className="text-foreground truncate text-sm font-medium">
            {characteristic?.name ?? `Char ${characteristicId}`}
          </span>
          {violationCount > 0 && (
            <span className="bg-destructive/20 text-destructive flex items-center gap-1 rounded px-1.5 py-0.5 text-xs">
              <AlertTriangle className="h-3 w-3" />
              {violationCount}
            </span>
          )}
        </div>
        <button
          onClick={() => onExpand(characteristicId)}
          className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1 transition-colors"
          title="Expand chart"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Chart area */}
      <div className="min-h-[120px] flex-1 p-2">
        {isLoading ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            Loading...
          </div>
        ) : (
          <ErrorBoundary>
            <ControlChart characteristicId={characteristicId} chartOptions={{ limit: 30 }} />
          </ErrorBoundary>
        )}
      </div>

      {/* Footer stats */}
      <div className="border-border flex items-center justify-between border-t px-3 py-2 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Value:</span>
          <span
            className={cn(
              'font-medium',
              status === 'violation'
                ? 'text-destructive'
                : status === 'warning'
                  ? 'text-warning'
                  : 'text-foreground',
            )}
          >
            {latestValue?.toFixed(3) ?? '-'}
          </span>
        </div>
        {chartData?.control_limits && (
          <div className="text-muted-foreground flex gap-3">
            <span>UCL: {chartData.control_limits.ucl?.toFixed(2) ?? '-'}</span>
            <span>LCL: {chartData.control_limits.lcl?.toFixed(2) ?? '-'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
