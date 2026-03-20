import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTheme } from '@/providers/ThemeProvider'
import { useECharts } from '@/hooks/useECharts'
import { blomQuantiles } from '@/lib/statistics-utils'
import { cn } from '@/lib/utils'

const MIN_MEASUREMENTS = 8

interface CapabilityQQPlotProps {
  measurements: number[]
}

/**
 * Inline Q-Q (normal probability) plot for CapabilityCard.
 *
 * Computes theoretical quantiles client-side using Blom plotting positions
 * (matching R qqnorm / Minitab). Reference line fitted through Q1-Q3.
 * Only rendered when n >= MIN_MEASUREMENTS.
 */
export function CapabilityQQPlot({ measurements }: CapabilityQQPlotProps) {
  const [expanded, setExpanded] = useState(true)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const option = useMemo(() => {
    if (measurements.length < MIN_MEASUREMENTS) return null

    const sorted = [...measurements].sort((a, b) => a - b)
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
      grid: { top: 12, right: 16, bottom: 42, left: 52, containLabel: true },
      xAxis: {
        type: 'value' as const,
        name: 'Theoretical Quantiles',
        nameLocation: 'middle' as const,
        nameGap: 28,
        nameTextStyle: { color: axisColor, fontSize: 10 },
        axisLabel: { color: axisColor, fontSize: 9 },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Sample Quantiles',
        nameTextStyle: { color: axisColor, fontSize: 10 },
        axisLabel: { color: axisColor, fontSize: 9 },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      tooltip: {
        trigger: 'item' as const,
        textStyle: { fontSize: 11 },
        confine: true,
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
  }, [measurements, isDark])

  const { containerRef } = useECharts({ option, notMerge: true })

  if (measurements.length < MIN_MEASUREMENTS) return null

  return (
    <div>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground mb-1 flex w-full items-center gap-1 text-xs font-medium transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Normal Probability Plot
        <span className="ml-1 tabular-nums">(n={measurements.length})</span>
      </button>
      <div className={cn(expanded ? 'block' : 'hidden')}>
        <div
          ref={containerRef}
          className="w-full"
          style={{ height: 200, visibility: option ? 'visible' : 'hidden' }}
        />
      </div>
    </div>
  )
}
