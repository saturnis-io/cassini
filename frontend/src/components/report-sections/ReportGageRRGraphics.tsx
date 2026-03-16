import { useMemo } from 'react'
import { useMSAResults } from '@/api/hooks/msa'
import { useECharts } from '@/hooks/useECharts'
import type { ECOption } from '@/lib/echarts'
import type { GageRRResult, OperatorData } from '@/api/types'
import { BarChart2 } from 'lucide-react'

interface ReportGageRRGraphicsProps {
  studyId?: number
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

function ComponentBars({ result }: { result: GageRRResult }) {
  const option = useMemo<ECOption>(() => {
    const categories = [
      'EV\n(Repeatability)',
      'AV\n(Reproducibility)',
      'Gage R&R',
      'Part\nVariation',
    ]
    const values = [
      result.pct_contribution_ev,
      result.pct_contribution_av,
      result.pct_contribution_grr,
      result.pct_contribution_pv,
    ]
    const colors = values.map((v) => {
      if (v <= 10) return '#22c55e'
      if (v <= 30) return '#f59e0b'
      return '#ef4444'
    })

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
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
  }, [result])

  const { containerRef } = useECharts({ option, notMerge: true })

  return (
    <div>
      <h3 className="text-foreground mb-2 text-sm font-medium">Component of Variation (% Contribution)</h3>
      <div ref={containerRef} style={{ width: '100%', height: 240, visibility: 'visible' }} />
    </div>
  )
}

function InteractionPlot({
  operatorData,
}: {
  operatorData: OperatorData[]
}) {
  const option = useMemo<ECOption>(() => {
    const nParts = operatorData[0]?.part_means.length ?? 0
    const partLabels = Array.from({ length: nParts }, (_, i) => `Part ${i + 1}`)

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
      tooltip: { trigger: 'axis' as const },
      legend: { bottom: 0 },
      grid: { left: 80, right: 20, top: 20, bottom: 40 },
      xAxis: {
        type: 'category' as const,
        data: partLabels,
        axisLabel: { interval: 0, rotate: partLabels.length > 8 ? 45 : 0 },
      },
      yAxis: { type: 'value' as const },
      series,
    }
  }, [operatorData])

  const { containerRef } = useECharts({ option, notMerge: true })

  return (
    <div>
      <h3 className="text-foreground mb-2 text-sm font-medium">
        Operator x Part Interaction Plot
      </h3>
      <p className="text-muted-foreground mb-2 text-xs">
        Parallel lines indicate no significant operator-part interaction.
      </p>
      <div ref={containerRef} style={{ width: '100%', height: 240, visibility: 'visible' }} />
    </div>
  )
}

export function ReportGageRRGraphics({ studyId }: ReportGageRRGraphicsProps) {
  const { data: results, isLoading, isError } = useMSAResults(studyId ?? 0)

  if (!studyId) return null

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <BarChart2 className="h-5 w-5" />
          Gage R&amp;R Graphics
        </h2>
        <p className="text-muted-foreground text-sm">Loading results...</p>
      </div>
    )
  }

  // Only render for Gage R&R (variable) studies
  if (!results || !('repeatability_ev' in results)) return null
  if (isError) return null

  const gageResult = results as GageRRResult

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <BarChart2 className="h-5 w-5" />
        Gage R&amp;R Graphics
      </h2>
      <div className="space-y-6">
        <ComponentBars result={gageResult} />
        {gageResult.operator_data && gageResult.operator_data.length > 0 && (
          <InteractionPlot operatorData={gageResult.operator_data} />
        )}
      </div>
    </div>
  )
}
