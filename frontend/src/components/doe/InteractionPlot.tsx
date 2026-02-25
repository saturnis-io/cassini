import { useRef, useEffect } from 'react'
import { init } from '@/lib/echarts'

interface InteractionPlotProps {
  interactions: {
    factor_indices: number[]
    factor_names: string[]
    effect: number
  }[]
  effects: {
    factor_name: string
    effect: number
    coefficient: number
  }[]
  grandMean: number
}

const COLORS = ['#3b82f6', '#ef4444']

export function InteractionPlot({ interactions, effects, grandMean }: InteractionPlotProps) {
  // Only render 2-factor interactions
  const twoFactorInteractions = interactions.filter((ix) => ix.factor_names.length === 2)

  if (twoFactorInteractions.length === 0) {
    return (
      <div className="border-border flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground text-sm">No two-factor interactions to display.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Interaction Plots</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {twoFactorInteractions.map((ix, i) => (
          <InteractionSubPlot
            key={i}
            interaction={ix}
            effects={effects}
            grandMean={grandMean}
          />
        ))}
      </div>
    </div>
  )
}

function InteractionSubPlot({
  interaction,
  effects,
  grandMean,
}: {
  interaction: InteractionPlotProps['interactions'][0]
  effects: InteractionPlotProps['effects']
  grandMean: number
}) {
  const chartRef = useRef<HTMLDivElement>(null)
  const [nameA, nameB] = interaction.factor_names

  useEffect(() => {
    if (!chartRef.current) return

    const chart = init(chartRef.current)

    // Get main effects for each factor
    const effectA = effects.find((e) => e.factor_name === nameA)?.effect ?? 0
    const effectB = effects.find((e) => e.factor_name === nameB)?.effect ?? 0
    const interactionEffect = interaction.effect

    // Compute the four corner means:
    // y = grandMean + (effectA/2)*xA + (effectB/2)*xB + (interactionEffect/4)*xA*xB
    // where xA, xB in {-1, +1}
    const computeMean = (xA: number, xB: number) =>
      grandMean +
      (effectA / 2) * xA +
      (effectB / 2) * xB +
      (interactionEffect / 4) * xA * xB

    // Two series: one for each level of factor B
    // X-axis: levels of factor A
    const yBLow_ALow = computeMean(-1, -1)
    const yBLow_AHigh = computeMean(1, -1)
    const yBHigh_ALow = computeMean(-1, 1)
    const yBHigh_AHigh = computeMean(1, 1)

    const allY = [yBLow_ALow, yBLow_AHigh, yBHigh_ALow, yBHigh_AHigh]
    const minY = Math.min(...allY)
    const maxY = Math.max(...allY)
    const padding = (maxY - minY) * 0.15 || 0.5

    chart.setOption({
      tooltip: {
        trigger: 'item',
        formatter: (params: { seriesName?: string; data?: [string, number] }) => {
          if (!params.data) return ''
          const [level, value] = params.data
          return `<b>${params.seriesName ?? ''}</b><br/>${nameA}: ${level}<br/>Mean: ${value.toFixed(4)}`
        },
      },
      grid: {
        top: 15,
        right: 15,
        bottom: 20,
        left: 50,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: [`${nameA} Low`, `${nameA} High`],
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        min: minY - padding,
        max: maxY + padding,
        axisLabel: { fontSize: 10 },
      },
      series: [
        {
          name: `${nameB} Low`,
          type: 'line',
          data: [
            [`${nameA} Low`, yBLow_ALow],
            [`${nameA} High`, yBLow_AHigh],
          ],
          lineStyle: { width: 2 },
          symbolSize: 6,
          itemStyle: { color: COLORS[0] },
        },
        {
          name: `${nameB} High`,
          type: 'line',
          data: [
            [`${nameA} Low`, yBHigh_ALow],
            [`${nameA} High`, yBHigh_AHigh],
          ],
          lineStyle: { width: 2 },
          symbolSize: 6,
          itemStyle: { color: COLORS[1] },
        },
      ],
    })

    const ro = new ResizeObserver(() => chart.resize())
    ro.observe(chartRef.current)

    return () => {
      ro.disconnect()
      chart.dispose()
    }
  }, [interaction, effects, grandMean, nameA, nameB])

  return (
    <div className="border-border rounded-lg border p-2">
      <div className="px-2 pt-1 text-center text-xs font-semibold">
        {nameA} x {nameB}
      </div>
      <div ref={chartRef} style={{ width: '100%', height: 220 }} />
      <div className="flex items-center justify-center gap-3 pb-1">
        <div className="flex items-center gap-1 text-xs">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[0] }} />
          {nameB} Low
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[1] }} />
          {nameB} High
        </div>
      </div>
    </div>
  )
}
