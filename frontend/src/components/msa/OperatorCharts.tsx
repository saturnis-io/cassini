import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { useECharts } from '@/hooks/useECharts'
import type { ECOption } from '@/lib/echarts'
import type { OperatorData } from '@/api/client'

interface OperatorChartsProps {
  operatorData: OperatorData[]
  partNames?: string[]
  pctContributionEv: number
  pctContributionAv: number
  pctContributionGrr: number
  pctContributionPv: number
}

const COLORS = [
  '#6366f1', // indigo
  '#f97316', // orange
  '#22c55e', // green
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#eab308', // yellow
]

type ChartTab = 'scatter' | 'interaction' | 'components'

export function OperatorCharts({
  operatorData,
  partNames,
  pctContributionEv,
  pctContributionAv,
  pctContributionGrr,
  pctContributionPv,
}: OperatorChartsProps) {
  const [activeTab, setActiveTab] = useState<ChartTab>('scatter')

  // -- Measurement by Operator (scatter/jitter plot) --
  const scatterOption = useMemo<ECOption>(() => {
    const categories = operatorData.map((op) => op.name)
    const seriesData: { value: [number, number]; itemStyle: { color: string } }[] = []
    const meanMarkers: { xAxis: number; yAxis: number; itemStyle: { color: string } }[] = []

    operatorData.forEach((op, opIdx) => {
      op.measurements.forEach((val) => {
        // Add small jitter for visibility
        const jitter = (Math.random() - 0.5) * 0.3
        seriesData.push({
          value: [opIdx + jitter, val],
          itemStyle: { color: COLORS[opIdx % COLORS.length] },
        })
      })
      meanMarkers.push({
        xAxis: opIdx,
        yAxis: op.mean,
        itemStyle: { color: COLORS[opIdx % COLORS.length] },
      })
    })

    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: (params: unknown) => {
          const p = params as { value: [number, number] }
          const opName = categories[Math.round(p.value[0])] ?? ''
          return `${opName}: ${p.value[1].toFixed(4)}`
        },
      },
      grid: { left: 80, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLabel: { interval: 0 },
      },
      yAxis: { type: 'value' as const },
      series: [
        {
          type: 'scatter' as const,
          data: seriesData,
          symbolSize: 6,
        },
        {
          type: 'scatter' as const,
          data: meanMarkers.map((m) => ({
            value: [m.xAxis, m.yAxis],
            itemStyle: m.itemStyle,
          })),
          symbolSize: 14,
          symbol: 'diamond',
          z: 10,
        },
      ],
    }
  }, [operatorData])

  // -- Operator x Part Interaction (line chart) --
  const interactionOption = useMemo<ECOption>(() => {
    const nParts = operatorData[0]?.part_means.length ?? 0
    const partLabels = partNames ?? Array.from({ length: nParts }, (_, i) => `Part ${i + 1}`)

    const series = operatorData.map((op, idx) => ({
      type: 'line' as const,
      name: op.name,
      data: op.part_means.map((v) => parseFloat(v.toFixed(4))),
      lineStyle: { color: COLORS[idx % COLORS.length] },
      itemStyle: { color: COLORS[idx % COLORS.length] },
      symbol: 'circle' as const,
      symbolSize: 6,
    }))

    return {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const ps = params as { seriesName: string; value: number; marker: string }[]
          const header = `<strong>${partLabels[ps[0]?.value != null ? 0 : 0]}</strong><br/>`
          const lines = ps.map((p) => `${p.marker} ${p.seriesName}: ${(p.value as unknown as number).toFixed(4)}`).join('<br/>')
          return header + lines
        },
      },
      grid: { left: 80, right: 20, top: 30, bottom: 40 },
      xAxis: {
        type: 'category' as const,
        data: partLabels,
        axisLabel: { interval: 0, rotate: partLabels.length > 8 ? 45 : 0 },
      },
      yAxis: { type: 'value' as const },
      series,
    }
  }, [operatorData, partNames])

  // -- Component of Variation bars --
  const componentOption = useMemo<ECOption>(() => {
    const categories = ['EV\n(Repeatability)', 'AV\n(Reproducibility)', 'Gage R&R', 'Part\nVariation']
    const values = [pctContributionEv, pctContributionAv, pctContributionGrr, pctContributionPv]
    const colors = values.map((v) => {
      if (v <= 10) return '#22c55e'
      if (v <= 30) return '#f59e0b'
      return '#ef4444'
    })

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (params: unknown) => {
          const p = (params as { name: string; value: number }[])[0]
          return `${p.name.replace('\n', ' ')}: ${p.value.toFixed(2)}%`
        },
      },
      grid: { left: 20, right: 20, top: 10, bottom: 60 },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLabel: { interval: 0 },
      },
      yAxis: {
        type: 'value' as const,
        max: 100,
        axisLabel: { formatter: '{value}%' },
      },
      series: [
        {
          type: 'bar' as const,
          data: values.map((v, i) => ({
            value: parseFloat(v.toFixed(2)),
            itemStyle: { color: colors[i] },
          })),
          barWidth: 40,
        },
      ],
    }
  }, [pctContributionEv, pctContributionAv, pctContributionGrr, pctContributionPv])

  const activeOption =
    activeTab === 'scatter'
      ? scatterOption
      : activeTab === 'interaction'
        ? interactionOption
        : componentOption

  const { containerRef } = useECharts({ option: activeOption, notMerge: true })

  return (
    <div className="border-border rounded-xl border">
      <div className="bg-muted/50 border-border flex items-center justify-between border-b px-4 py-2">
        <h3 className="text-sm font-medium">By-Operator Analysis</h3>
        <div className="bg-muted inline-flex rounded-md p-0.5 text-xs">
          {(
            [
              ['scatter', 'Measurements'],
              ['interaction', 'Interaction'],
              ['components', 'Components'],
            ] as [ChartTab, string][]
          ).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'rounded px-2.5 py-1 font-medium transition-colors',
                activeTab === tab
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        <p className="text-muted-foreground mb-2 text-xs">
          {activeTab === 'scatter' && 'Individual measurements by operator. Diamond markers show operator means.'}
          {activeTab === 'interaction' && 'Operator x Part interaction plot. Parallel lines indicate no interaction.'}
          {activeTab === 'components' && 'Component of variation (% Contribution). Shows relative contribution of each source.'}
        </p>
        <div
          ref={containerRef}
          style={{ width: '100%', height: 280, visibility: 'visible' }}
        />
      </div>
    </div>
  )
}
