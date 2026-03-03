import { useRef, useEffect } from 'react'
import { init } from '@/lib/echarts'
import { useTheme } from '@/providers/ThemeProvider'

interface MainEffectsPlotProps {
  effects: {
    factor_name: string
    effect: number
    coefficient: number
  }[]
  grandMean: number
}

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
]

export function MainEffectsPlot({ effects, grandMean }: MainEffectsPlotProps) {
  const chartRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  useEffect(() => {
    if (!chartRef.current || effects.length === 0) return

    const chart = init(chartRef.current)

    // Theme-aware colors
    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const axisLineColor = isDark ? 'hsl(220, 10%, 30%)' : 'hsl(210, 15%, 80%)'
    const axisNameColor = isDark ? 'hsl(220, 5%, 65%)' : 'hsl(220, 15%, 40%)'
    const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 90%)'
    const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    const tooltipTextColor = isDark ? '#e5e5e5' : '#333'
    const tooltipBorder = isDark ? 'hsl(220, 12%, 26%)' : 'hsl(210, 15%, 88%)'

    // Each factor gets a line from Low to High
    // Y at Low = grandMean - effect/2, Y at High = grandMean + effect/2
    const series = effects.map((eff, i) => ({
      name: eff.factor_name,
      type: 'line' as const,
      data: [
        ['Low', grandMean - eff.effect / 2],
        ['High', grandMean + eff.effect / 2],
      ],
      lineStyle: { width: 2.5 },
      symbolSize: 8,
      itemStyle: { color: COLORS[i % COLORS.length] },
    }))

    // Calculate Y-axis range with some padding
    const allY = effects.flatMap((eff) => [
      grandMean - eff.effect / 2,
      grandMean + eff.effect / 2,
    ])
    const minY = Math.min(...allY)
    const maxY = Math.max(...allY)
    const padding = (maxY - minY) * 0.15 || 1

    chart.setOption({
      tooltip: {
        trigger: 'item',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipTextColor },
        formatter: (params: { seriesName?: string; data?: [string, number] }) => {
          if (!params.data) return ''
          const [level, value] = params.data
          return `<b>${params.seriesName ?? ''}</b><br/>Level: ${level}<br/>Mean Response: ${value.toFixed(4)}`
        },
      },
      grid: {
        top: 20,
        right: 20,
        bottom: 30,
        left: 60,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: ['Low', 'High'],
        axisLabel: { fontSize: 12, fontWeight: 'bold', color: axisLabelColor },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value',
        name: 'Mean Response',
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: { color: axisNameColor },
        axisLabel: { color: axisLabelColor },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
        min: minY - padding,
        max: maxY + padding,
      },
      series,
    })

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(chartRef.current)

    return () => {
      ro.disconnect()
      chart.dispose()
    }
  }, [effects, grandMean, isDark])

  if (effects.length === 0) {
    return (
      <div className="border-border flex h-64 items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground text-sm">No effects data available.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Main Effects Plot</h3>
      <div ref={chartRef} style={{ width: '100%', height: 350 }} />
      {/* HTML legend (LegendComponent not registered in tree-shaken ECharts) */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        {effects.map((eff, i) => (
          <div key={eff.factor_name} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            <span>{eff.factor_name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
