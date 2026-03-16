import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pin, PinOff, AlertTriangle, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore, MAX_PINNED_CHARACTERISTICS } from '@/stores/dashboardStore'
import { useChartData, useCapability, useCharacteristic } from '@/api/hooks'
import { useECharts } from '@/hooks/useECharts'
import { useChartColors } from '@/hooks/useChartColors'
import { ErrorBoundary } from '@/components/ErrorBoundary'

/**
 * A single mini-chart card for a pinned characteristic.
 * Shows a sparkline control chart (last 50 points), Cpk badge, and violation count.
 */
function PinnedMiniChart({ characteristicId }: { characteristicId: number }) {
  const navigate = useNavigate()
  const unpinCharacteristic = useDashboardStore((state) => state.unpinCharacteristic)
  const setSelectedCharacteristicId = useDashboardStore((state) => state.setSelectedCharacteristicId)
  const setViewMode = useDashboardStore((state) => state.setViewMode)

  const { data: characteristic } = useCharacteristic(characteristicId)
  const { data: chartData } = useChartData(characteristicId, { limit: 50 })
  const { data: capability } = useCapability(characteristicId)
  const colors = useChartColors()

  // Compute quick stats from chart data
  const stats = useMemo(() => {
    if (!chartData) return null

    const stdPts = chartData.data_points ?? []
    const attrPts = chartData.attribute_data_points ?? []

    let violationCount = 0
    let values: number[] = []

    if (attrPts.length > 0) {
      violationCount = attrPts.filter((p) => p.violation_ids.length > 0).length
      values = attrPts.map((p) => p.plotted_value)
    } else if (stdPts.length > 0) {
      violationCount = stdPts.filter((p) => p.violation_ids.length > 0).length
      values = stdPts.map((p) => p.mean)
    }

    return {
      violationCount,
      values,
      ucl: chartData.control_limits?.ucl,
      lcl: chartData.control_limits?.lcl,
      centerLine: chartData.control_limits?.center_line,
    }
  }, [chartData])

  // Build ECharts option for the mini sparkline
  const chartOption = useMemo(() => {
    if (!stats || stats.values.length === 0) return null

    return {
      animation: false,
      grid: { top: 4, right: 4, bottom: 4, left: 4 },
      xAxis: { type: 'category' as const, show: false, data: stats.values.map((_, i) => i) },
      yAxis: { type: 'value' as const, show: false },
      series: [
        {
          type: 'line' as const,
          data: stats.values,
          symbol: 'none',
          lineStyle: { width: 1.5, color: colors.lineGradientStart },
          areaStyle: { color: colors.lineGradientStart, opacity: 0.05 },
          silent: true,
        },
        // UCL line
        ...(stats.ucl != null
          ? [
              {
                type: 'line' as const,
                data: stats.values.map(() => stats.ucl),
                symbol: 'none',
                lineStyle: { width: 1, color: colors.uclLine, type: 'dashed' as const },
                silent: true,
              },
            ]
          : []),
        // LCL line
        ...(stats.lcl != null
          ? [
              {
                type: 'line' as const,
                data: stats.values.map(() => stats.lcl),
                symbol: 'none',
                lineStyle: { width: 1, color: colors.lclLine, type: 'dashed' as const },
                silent: true,
              },
            ]
          : []),
        // Center line
        ...(stats.centerLine != null
          ? [
              {
                type: 'line' as const,
                data: stats.values.map(() => stats.centerLine),
                symbol: 'none',
                lineStyle: { width: 1, color: colors.centerLine, type: 'dotted' as const, opacity: 0.6 },
                silent: true,
              },
            ]
          : []),
      ],
      tooltip: { show: false },
    }
  }, [stats, colors])

  const { containerRef } = useECharts({ option: chartOption, notMerge: true })

  const cpkValue = capability?.cpk
  const cpkVariant =
    cpkValue == null ? 'muted' : cpkValue >= 1.33 ? 'success' : cpkValue >= 1.0 ? 'warning' : 'danger'

  const handleClick = () => {
    setSelectedCharacteristicId(characteristicId)
    setViewMode('single')
    navigate(`/dashboard/${characteristicId}`)
  }

  const handleUnpin = (e: React.MouseEvent) => {
    e.stopPropagation()
    unpinCharacteristic(characteristicId)
  }

  return (
    <div
      className="bg-card border-border hover:border-primary/30 group flex cursor-pointer items-stretch gap-3 rounded-lg border p-3 transition-colors"
      onClick={handleClick}
    >
      {/* Mini chart */}
      <div className="h-16 min-w-0 flex-1">
        <div ref={containerRef} style={{ width: '100%', height: '100%', visibility: chartOption ? 'visible' : 'hidden' }} />
        {!chartOption && (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            No data
          </div>
        )}
      </div>

      {/* Info column */}
      <div className="flex flex-shrink-0 flex-col items-end justify-between">
        <div className="flex items-center gap-2">
          <span className="max-w-[180px] truncate text-xs font-semibold">
            {characteristic?.name ?? `#${characteristicId}`}
          </span>
          <button
            onClick={handleUnpin}
            className="text-muted-foreground hover:text-destructive opacity-0 transition-opacity group-hover:opacity-100"
            title="Unpin characteristic"
          >
            <PinOff className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Violation count badge */}
          {stats != null && stats.violationCount > 0 && (
            <span className="bg-destructive/10 text-destructive flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold">
              <AlertTriangle className="h-3 w-3" />
              {stats.violationCount}
            </span>
          )}

          {/* Cpk badge */}
          <span
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
              cpkVariant === 'success' && 'bg-success/10 text-success',
              cpkVariant === 'warning' && 'bg-warning/10 text-warning',
              cpkVariant === 'danger' && 'bg-destructive/10 text-destructive',
              cpkVariant === 'muted' && 'bg-muted text-muted-foreground',
            )}
          >
            <Gauge className="h-3 w-3" />
            {cpkValue != null ? cpkValue.toFixed(2) : '-'}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * PinnedChartsView — vertical stack of mini-charts for pinned characteristics.
 * Each mini-chart shows a sparkline control chart, Cpk badge, and violation count.
 * Clicking navigates to the full dashboard for that characteristic.
 */
export function PinnedChartsView() {
  const pinnedIds = useDashboardStore((state) => state.pinnedCharacteristicIds)

  if (pinnedIds.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 text-sm">
        <Pin className="h-8 w-8 opacity-40" />
        <div className="text-center">
          <p className="font-medium">No pinned characteristics</p>
          <p className="mt-1 text-xs">
            Pin characteristics from the sidebar (max {MAX_PINNED_CHARACTERISTICS}) to monitor them here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-1">
      {pinnedIds.map((id) => (
        <ErrorBoundary key={id}>
          <PinnedMiniChart characteristicId={id} />
        </ErrorBoundary>
      ))}
    </div>
  )
}
