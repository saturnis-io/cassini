import { useMemo } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import { useDateFormat } from '@/hooks/useDateFormat'
import { applyFormat } from '@/lib/date-format'
import { useStaticChart } from '@/hooks/useStaticChart'
import type { ChartData } from '@/types'

interface ReportTrendSectionProps {
  chartData: ChartData
}

/**
 * Trend chart section for reports (ECharts)
 */
export function ReportTrendSection({ chartData }: ReportTrendSectionProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const { dateFormat, datetimeFormat } = useDateFormat()

  // Build a unified array of {timestamp, value} from whichever data source is populated
  const trendPoints = useMemo(() => {
    if (chartData.chart_type === 'cusum' && chartData.cusum_data_points?.length) {
      return chartData.cusum_data_points
        .filter((p) => !p.excluded)
        .map((p) => ({ timestamp: p.timestamp, value: p.measurement }))
    }
    if (chartData.chart_type === 'ewma' && chartData.ewma_data_points?.length) {
      return chartData.ewma_data_points
        .filter((p) => !p.excluded)
        .map((p) => ({ timestamp: p.timestamp, value: p.measurement }))
    }
    return chartData.data_points
      .filter((p) => !p.excluded)
      .map((p) => ({ timestamp: p.timestamp, value: p.mean }))
  }, [chartData])
  const windowSize = 5

  const option = useMemo(() => {
    if (trendPoints.length < 5) return null

    // Calculate moving average (5-point)
    const trendData = trendPoints.map((dp, i) => {
      const windowStart = Math.max(0, i - windowSize + 1)
      const windowSlice = trendPoints.slice(windowStart, i + 1)
      const ma = windowSlice.reduce((sum, p) => sum + p.value, 0) / windowSlice.length
      return {
        date: applyFormat(new Date(dp.timestamp), dateFormat),
        timestamp: dp.timestamp,
        value: dp.value,
        ma: i >= windowSize - 1 ? ma : null,
      }
    })

    const { control_limits } = chartData
    const values = trendPoints.map((p) => p.value)
    const minVal = Math.min(...values, control_limits.lcl ?? Infinity)
    const maxVal = Math.max(...values, control_limits.ucl ?? -Infinity)
    const padding = (maxVal - minVal) * 0.1

    // Theme-aware colors for trend chart markLines
    const trendControlColor = isDark ? 'hsl(179 70% 65%)' : 'hsl(179 50% 45%)'
    const trendCenterColor = isDark ? 'hsl(104 55% 55%)' : 'hsl(104 55% 40%)'

    // Build markLine data for control limits
    const markLineData: Array<{
      yAxis: number
      lineStyle: { color: string; width: number; type: string }
      label?: { show: boolean }
    }> = []
    if (control_limits.ucl != null)
      markLineData.push({
        yAxis: control_limits.ucl,
        lineStyle: { color: trendControlColor, width: 1.5, type: 'dashed' },
        label: { show: false },
      })
    if (control_limits.lcl != null)
      markLineData.push({
        yAxis: control_limits.lcl,
        lineStyle: { color: trendControlColor, width: 1.5, type: 'dashed' },
        label: { show: false },
      })
    if (control_limits.center_line != null)
      markLineData.push({
        yAxis: control_limits.center_line,
        lineStyle: { color: trendCenterColor, width: 1, type: 'dashed' },
        label: { show: false },
      })

    return {
      grid: { top: 10, right: 20, left: 40, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        boundaryGap: false,
        data: trendData.map((d) => d.date),
        axisLabel: { fontSize: 9, interval: Math.max(0, Math.floor(trendData.length / 6)), color: isDark ? 'hsl(220, 5%, 70%)' : undefined },
      },
      yAxis: {
        type: 'value' as const,
        min: minVal - padding,
        max: maxVal + padding,
        axisLabel: { fontSize: 10, formatter: (v: number) => v.toFixed(2), color: isDark ? 'hsl(220, 5%, 70%)' : undefined },
        splitLine: { lineStyle: { type: 'dashed' as const, color: isDark ? 'hsl(220, 10%, 25%)' : 'hsl(240 6% 90%)' } },
      },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (
          params: Array<{ data: number | null; seriesName: string; axisValue: string }>,
        ) => {
          const item =
            trendData[
              params[0]?.axisValue ? trendData.findIndex((d) => d.date === params[0].axisValue) : 0
            ]
          if (!item) return ''
          let html = `${applyFormat(new Date(item.timestamp), datetimeFormat)}<br/>Value: ${item.value.toFixed(4)}`
          if (item.ma != null) html += `<br/>MA(${windowSize}): ${item.ma.toFixed(4)}`
          return html
        },
      },
      series: [
        {
          name: 'Value',
          type: 'line' as const,
          data: trendData.map((d) => d.value),
          smooth: false,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: isDark ? 'hsl(46, 70%, 58%)' : 'hsl(212 100% 45%)', width: 1 },
          itemStyle: { color: isDark ? 'hsl(46, 70%, 58%)' : 'hsl(212 100% 45%)' },
          markLine:
            markLineData.length > 0
              ? { silent: true, symbol: 'none', precision: 10, data: markLineData }
              : undefined,
        },
        {
          name: 'Moving Avg',
          type: 'line' as const,
          data: trendData.map((d) => d.ma),
          smooth: true,
          symbol: 'none',
          lineStyle: { color: 'hsl(25 95% 53%)', width: 2 },
          itemStyle: { color: 'hsl(25 95% 53%)' },
        },
      ],
    }
  }, [trendPoints, chartData, isDark])

  const { containerRef, dataURL, lightDataURL } = useStaticChart({ option, notMerge: true })

  if (trendPoints.length < 5) return null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Measurement Value Trend</h2>
      <p className="text-muted-foreground mb-4 text-xs">
        Process values with 5-point moving average and control limits
      </p>
      <div className="relative h-48">
        {/* Hidden canvas for chart capture; static image shown for print reliability */}
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: dataURL ? 'hidden' : 'visible' }}
        />
        {dataURL && (
          <img
            src={dataURL}
            data-light-src={lightDataURL ?? undefined}
            alt="Trend analysis chart"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      <div className="text-muted-foreground mt-2 flex justify-center gap-6 text-xs">
        <span className="flex items-center gap-1">
          <span className="bg-primary inline-block h-0.5 w-3" /> Values
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-warning inline-block h-0.5 w-3" /> {windowSize}-Point Moving Avg
        </span>
      </div>
    </div>
  )
}
