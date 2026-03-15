import { useMemo } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import { useCapability } from '@/api/hooks'
import { useStaticChart } from '@/hooks/useStaticChart'
import { normalQuantile, blomQuantiles } from '@/lib/statistics-utils'
import { getChartMeasurements } from '@/lib/report-utils'
import type { ChartData } from '@/types'

interface ReportProbabilityPlotProps {
  characteristicId?: number
  chartData?: ChartData
}

/**
 * Normal probability plot for capability analysis reports.
 *
 * Plots ordered measurements against theoretical normal quantiles (Blom
 * plotting positions). A straight-line pattern indicates normality. Uses
 * the shared normalQuantile / blomQuantiles from statistics-utils.
 */
export function ReportProbabilityPlot({
  characteristicId,
  chartData,
}: ReportProbabilityPlotProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const { data: capability } = useCapability(characteristicId ?? 0)

  const values = useMemo(() => {
    if (!chartData) return []
    return getChartMeasurements(chartData)
  }, [chartData])

  const option = useMemo(() => {
    if (values.length < 3) return null

    const sorted = [...values].sort((a, b) => a - b)
    const n = sorted.length
    const theoretical = blomQuantiles(n)

    // Reference line through Q1 and Q3
    const q1Idx = Math.floor(n * 0.25)
    const q3Idx = Math.floor(n * 0.75)
    const slope =
      q3Idx !== q1Idx
        ? (sorted[q3Idx] - sorted[q1Idx]) / (theoretical[q3Idx] - theoretical[q1Idx])
        : 1
    const intercept = sorted[q1Idx] - slope * theoretical[q1Idx]
    const xMin = theoretical[0]
    const xMax = theoretical[n - 1]

    const scatterData: [number, number][] = theoretical.map((t, i) => [t, sorted[i]])

    const axisColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 10%, 40%)'
    const axisLineColor = isDark ? 'hsl(220, 10%, 35%)' : 'hsl(220, 10%, 80%)'
    const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 90%)'

    return {
      grid: { top: 30, right: 20, bottom: 45, left: 55, containLabel: true },
      xAxis: {
        type: 'value' as const,
        name: 'Theoretical Quantiles',
        nameLocation: 'middle' as const,
        nameGap: 30,
        nameTextStyle: { color: axisColor, fontSize: 11 },
        axisLabel: { color: axisColor, fontSize: 10 },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Ordered Values',
        nameTextStyle: { color: axisColor, fontSize: 11 },
        axisLabel: { color: axisColor, fontSize: 10 },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      tooltip: {
        trigger: 'item' as const,
        formatter: (params: { data?: [number, number] }) => {
          const d = params.data
          if (!d) return ''
          return `Theoretical: ${d[0].toFixed(3)}<br/>Value: ${d[1].toFixed(4)}`
        },
      },
      series: [
        {
          type: 'scatter' as const,
          name: 'Data',
          data: scatterData,
          symbolSize: 5,
          itemStyle: { color: isDark ? '#60a5fa' : '#3b82f6' },
        },
        {
          type: 'line' as const,
          name: 'Reference',
          data: [
            [xMin, slope * xMin + intercept],
            [xMax, slope * xMax + intercept],
          ],
          lineStyle: {
            color: isDark ? 'hsl(220, 5%, 55%)' : 'hsl(220, 10%, 60%)',
            type: 'dashed' as const,
            width: 1.5,
          },
          symbol: 'none',
          silent: true,
        },
      ],
    }
  }, [values, isDark])

  const { containerRef, dataURL, lightDataURL } = useStaticChart({ option, notMerge: true })

  if (values.length < 3) return null

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1)
  const stdDev = Math.sqrt(variance)

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Normal Probability Plot</h2>
      <div className="relative h-72">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: dataURL ? 'hidden' : 'visible' }}
        />
        {dataURL && (
          <img
            src={dataURL}
            data-light-src={lightDataURL ?? undefined}
            alt="Normal probability plot"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      <div className="text-muted-foreground mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs">
        <span>n = {values.length}</span>
        <span>Mean: {mean.toFixed(4)}</span>
        <span>StdDev: {stdDev.toFixed(4)}</span>
        {capability?.normality_p_value != null && (
          <span>
            Normality p-value: {capability.normality_p_value.toFixed(4)}
            {capability.normality_p_value > 0.05 ? ' (OK)' : ' (non-normal)'}
          </span>
        )}
      </div>
    </div>
  )
}
