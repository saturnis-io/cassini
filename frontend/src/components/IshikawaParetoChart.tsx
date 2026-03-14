import { useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useTheme } from '@/providers/ThemeProvider'
import type { ParetoItem } from '@/api/hooks/useIshikawa'

interface IshikawaParetoChartProps {
  pareto: ParetoItem[]
  height?: number
}

function getBarColor(percentage: number): string {
  if (percentage >= 20) return '#ef4444' // red-500 — major contributor
  if (percentage >= 10) return '#f59e0b' // amber-500 — moderate contributor
  return '#9ca3af' // gray-400 — minor contributor
}

export function IshikawaParetoChart({ pareto, height = 260 }: IshikawaParetoChartProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const option = useMemo(() => {
    if (pareto.length === 0) return null

    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const axisLineColor = isDark ? 'hsl(220, 10%, 30%)' : 'hsl(210, 15%, 80%)'
    const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 90%)'
    const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    const tooltipTextColor = isDark ? '#e5e5e5' : '#333'
    const tooltipBorder = isDark ? 'hsl(220, 12%, 26%)' : 'hsl(210, 15%, 88%)'

    const categories = pareto.map((p) => p.category)
    const barData = pareto.map((p) => ({
      value: p.percentage,
      itemStyle: { color: getBarColor(p.percentage) },
    }))
    const lineData = pareto.map((p) => p.cumulative)

    return {
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipTextColor, fontSize: 12 },
        formatter: (
          params: Array<{
            seriesName?: string
            axisValue?: string
            value?: number
            marker?: string
          }>,
        ) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const cat = params[0].axisValue ?? ''
          const item = pareto.find((p) => p.category === cat)
          if (!item) return cat
          let html = `<strong>${cat}</strong><br/>`
          html += `&eta;&sup2;: ${(item.eta_squared * 100).toFixed(1)}%<br/>`
          html += `Contribution: ${item.percentage}%<br/>`
          html += `Cumulative: ${item.cumulative}%`
          return html
        },
      },
      grid: {
        top: 30,
        right: 50,
        bottom: 30,
        left: 50,
        containLabel: true,
      },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLabel: {
          fontSize: 11,
          color: axisLabelColor,
          interval: 0,
          rotate: categories.length > 4 ? 20 : 0,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: 'Contribution %',
          nameTextStyle: { fontSize: 10, color: axisLabelColor },
          axisLabel: {
            fontSize: 10,
            color: axisLabelColor,
            formatter: '{value}%',
          },
          axisLine: { lineStyle: { color: axisLineColor } },
          splitLine: { lineStyle: { color: splitLineColor } },
          max: 100,
          min: 0,
        },
        {
          type: 'value' as const,
          name: 'Cumulative %',
          nameTextStyle: { fontSize: 10, color: axisLabelColor },
          axisLabel: {
            fontSize: 10,
            color: axisLabelColor,
            formatter: '{value}%',
          },
          axisLine: { lineStyle: { color: axisLineColor } },
          splitLine: { show: false },
          max: 100,
          min: 0,
        },
      ],
      series: [
        {
          name: 'Contribution',
          type: 'bar' as const,
          yAxisIndex: 0,
          data: barData,
          barMaxWidth: 40,
        },
        {
          name: 'Cumulative',
          type: 'line' as const,
          yAxisIndex: 1,
          data: lineData,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2, color: '#3b82f6' },
          itemStyle: { color: '#3b82f6' },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: {
              type: 'dashed' as const,
              color: isDark ? '#6b7280' : '#9ca3af',
              width: 1.5,
            },
            label: {
              formatter: '80%',
              fontSize: 10,
              color: isDark ? '#9ca3af' : '#6b7280',
              position: 'end' as const,
            },
            data: [{ yAxis: 80 }],
          },
        },
      ],
    }
  }, [pareto, isDark])

  const { containerRef } = useECharts({ option, notMerge: true })

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium">Pareto Prioritization</h3>
      <div
        ref={containerRef}
        style={{ width: '100%', height, visibility: pareto.length === 0 ? 'hidden' : 'visible' }}
      />
      {pareto.length === 0 && (
        <div className="border-border flex items-center justify-center rounded-lg border border-dashed py-6">
          <p className="text-muted-foreground text-sm">No analyzable categories</p>
        </div>
      )}
      {/* HTML legend (LegendComponent not registered in tree-shaken ECharts) */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500" />
          <span>&ge;20% contribution</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-500" />
          <span>10-20% contribution</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-400" />
          <span>&lt;10% contribution</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-blue-500" />
          <span>Cumulative %</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-gray-400" />
          <span>80% threshold</span>
        </div>
      </div>
    </div>
  )
}
