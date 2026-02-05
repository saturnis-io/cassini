import { useMemo } from 'react'
import { Maximize2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCharacteristic, useChartData } from '@/api/hooks'
import { ControlChart } from '@/components/ControlChart'

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
    ok: 'bg-green-500',
    warning: 'bg-yellow-500',
    violation: 'bg-red-500 animate-pulse',
  }

  return <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', colors[status])} />
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
    const violations = recentPoints.filter(p => p.violation_rules?.length).length

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
        'bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden flex flex-col',
        'hover:border-zinc-700 transition-colors',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot status={status} />
          <span className="text-sm font-medium text-zinc-100 truncate">
            {characteristic?.name ?? `Char ${characteristicId}`}
          </span>
          {violationCount > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-red-500/20 text-red-400">
              <AlertTriangle className="h-3 w-3" />
              {violationCount}
            </span>
          )}
        </div>
        <button
          onClick={() => onExpand(characteristicId)}
          className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
          title="Expand chart"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-[120px] p-2">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
            Loading...
          </div>
        ) : (
          <ControlChart
            characteristicId={characteristicId}
            chartOptions={{ limit: 30 }}
          />
        )}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-2 border-t border-zinc-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">Value:</span>
          <span
            className={cn(
              'font-medium',
              status === 'violation' ? 'text-red-400' :
              status === 'warning' ? 'text-yellow-400' : 'text-zinc-100'
            )}
          >
            {latestValue?.toFixed(3) ?? '-'}
          </span>
        </div>
        {chartData?.control_limits && (
          <div className="flex gap-3 text-zinc-500">
            <span>UCL: {chartData.control_limits.ucl?.toFixed(2) ?? '-'}</span>
            <span>LCL: {chartData.control_limits.lcl?.toFixed(2) ?? '-'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
