import { useRef, useEffect } from 'react'
import { init } from '@/lib/echarts'
import { useTheme } from '@/providers/ThemeProvider'

interface ParetoChartProps {
  effects: { factor_name: string; effect: number }[]
  interactions: { factor_names: string[]; effect: number }[]
  significanceThreshold?: number
}

interface EffectEntry {
  label: string
  absEffect: number
  effect: number
}

export function ParetoChart({ effects, interactions, significanceThreshold }: ParetoChartProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  useEffect(() => {
    if (!chartRef.current) return

    // Combine main effects and interactions into a single sorted list
    const entries: EffectEntry[] = [
      ...effects.map((e) => ({
        label: e.factor_name,
        absEffect: Math.abs(e.effect),
        effect: e.effect,
      })),
      ...interactions
        .filter((ix) => ix.factor_names.length >= 2)
        .map((ix) => ({
          label: ix.factor_names.join(' x '),
          absEffect: Math.abs(ix.effect),
          effect: ix.effect,
        })),
    ]

    // Sort by absolute effect descending (for horizontal bar, reversed for ECharts)
    entries.sort((a, b) => a.absEffect - b.absEffect)

    if (entries.length === 0) return

    // Estimate significance threshold if not provided:
    // Use 2 * median absolute effect (a rough heuristic)
    const threshold =
      significanceThreshold ??
      (() => {
        const sorted = [...entries].sort((a, b) => a.absEffect - b.absEffect)
        const median = sorted[Math.floor(sorted.length / 2)]?.absEffect ?? 0
        return 2 * median
      })()

    const chart = init(chartRef.current)

    const labels = entries.map((e) => e.label)
    const values = entries.map((e) => e.absEffect)
    const barColors = entries.map((e) =>
      e.absEffect >= threshold ? '#3b82f6' : '#9ca3af',
    )

    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const axisLineColor = isDark ? 'hsl(220, 10%, 30%)' : 'hsl(210, 15%, 80%)'
    const axisNameColor = isDark ? 'hsl(220, 5%, 65%)' : 'hsl(220, 15%, 40%)'
    const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 90%)'

    chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: Array<{ name?: string; value?: number }>) => {
          const p = params[0]
          if (!p) return ''
          const entry = entries.find((e) => e.label === p.name)
          const sig = entry && entry.absEffect >= threshold ? ' (Significant)' : ''
          return `<b>${p.name ?? ''}</b><br/>|Effect|: ${(p.value ?? 0).toFixed(4)}${sig}`
        },
      },
      grid: {
        top: 20,
        right: 30,
        bottom: 30,
        left: 120,
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: '|Effect|',
        nameLocation: 'middle',
        nameGap: 25,
        nameTextStyle: { color: axisNameColor, fontSize: 12 },
        axisLabel: { color: axisLabelColor, fontSize: 12 },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      yAxis: {
        type: 'category',
        data: labels,
        axisLabel: { fontSize: 12, color: axisLabelColor },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      series: [
        {
          type: 'bar',
          data: values.map((v, i) => ({
            value: v,
            itemStyle: { color: barColors[i] },
          })),
          barMaxWidth: 30,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: {
              color: '#ef4444',
              type: 'dashed',
              width: 2,
            },
            data: [
              {
                xAxis: threshold,
                label: {
                  formatter: `Threshold: ${threshold.toFixed(3)}`,
                  position: 'end',
                  fontSize: 12,
                  color: isDark ? '#e5e5e5' : '#333',
                  textBorderWidth: 0,
                  backgroundColor: isDark ? 'hsl(220, 10%, 20%)' : 'hsl(0, 0%, 96%)',
                  borderRadius: 3,
                  padding: [3, 6],
                },
              },
            ],
          },
        },
      ],
    })

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(chartRef.current)

    return () => {
      ro.disconnect()
      chart.dispose()
    }
  }, [effects, interactions, significanceThreshold, isDark])

  const totalEntries = effects.length + interactions.filter((ix) => ix.factor_names.length >= 2).length

  if (totalEntries === 0) {
    return (
      <div className="border-border flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground text-sm">No effects data available.</p>
      </div>
    )
  }

  // Dynamic height: at least 200px, ~35px per bar
  const chartHeight = Math.max(200, totalEntries * 35 + 80)

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Pareto Chart of Effects</h3>
      <div ref={chartRef} style={{ width: '100%', height: chartHeight }} />
      <p className="text-muted-foreground text-xs">
        Blue bars exceed the significance threshold. Gray bars are non-significant.
      </p>
    </div>
  )
}
