import { useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useChartData } from '@/api/hooks'
import { NELSON_RULES } from './ViolationLegend'
import { getStoredChartColors } from '@/lib/theme-presets'
import { Loader2 } from 'lucide-react'

interface ParetoChartProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
}

interface RuleCount {
  ruleId: number
  name: string
  count: number
}

/**
 * SPC Pareto Chart - Displays violation categories sorted by frequency
 * with a cumulative percentage line (80/20 analysis).
 *
 * Aggregates Nelson rule violations from the chart data for the selected
 * characteristic and time range.
 */
export function ParetoChart({ characteristicId, chartOptions }: ParetoChartProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, chartOptions ?? { limit: 200 })
  const colors = getStoredChartColors()

  const paretoData = useMemo(() => {
    if (!chartData) return null

    // Aggregate violation counts by rule from all data points
    const ruleCounts = new Map<number, number>()

    // Handle variable chart data points
    const points = chartData.data_points ?? []
    for (const pt of points) {
      const rules: number[] = pt.violation_rules ?? []
      for (const ruleId of rules) {
        ruleCounts.set(ruleId, (ruleCounts.get(ruleId) ?? 0) + 1)
      }
    }

    // Handle attribute chart data points
    const attrPoints = chartData.attribute_samples ?? []
    for (const pt of attrPoints) {
      const rules: number[] = pt.violation_rules ?? []
      for (const ruleId of rules) {
        ruleCounts.set(ruleId, (ruleCounts.get(ruleId) ?? 0) + 1)
      }
    }

    // Handle CUSUM data points
    const cusumPoints = chartData.cusum_data_points ?? []
    for (const pt of cusumPoints) {
      const rules: number[] = pt.violation_rules ?? []
      for (const ruleId of rules) {
        ruleCounts.set(ruleId, (ruleCounts.get(ruleId) ?? 0) + 1)
      }
    }

    // Handle EWMA data points
    const ewmaPoints = chartData.ewma_data_points ?? []
    for (const pt of ewmaPoints) {
      const rules: number[] = pt.violation_rules ?? []
      for (const ruleId of rules) {
        ruleCounts.set(ruleId, (ruleCounts.get(ruleId) ?? 0) + 1)
      }
    }

    if (ruleCounts.size === 0) return null

    // Build sorted array (descending by count)
    const entries: RuleCount[] = []
    for (const [ruleId, count] of ruleCounts) {
      const rule = NELSON_RULES[ruleId]
      entries.push({
        ruleId,
        name: rule ? `Rule ${ruleId}: ${rule.name}` : `Rule ${ruleId}`,
        count,
      })
    }
    entries.sort((a, b) => b.count - a.count)

    // Calculate cumulative percentages
    const total = entries.reduce((sum, e) => sum + e.count, 0)
    const cumulative: number[] = []
    let running = 0
    for (const entry of entries) {
      running += entry.count
      cumulative.push(Math.round((running / total) * 1000) / 10)
    }

    return { entries, cumulative, total }
  }, [chartData])

  const option = useMemo(() => {
    if (!paretoData) return null

    const { entries, cumulative } = paretoData
    const categories = entries.map((e) => e.name)
    const counts = entries.map((e) => e.count)

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (params: Array<{ seriesName?: string; name?: string; value?: number }>) => {
          const bar = params.find((p) => p.seriesName === 'Count')
          const line = params.find((p) => p.seriesName === 'Cumulative %')
          if (!bar) return ''
          return [
            `<b>${bar.name ?? ''}</b>`,
            `Count: <b>${bar.value ?? 0}</b>`,
            line ? `Cumulative: <b>${line.value ?? 0}%</b>` : '',
          ]
            .filter(Boolean)
            .join('<br/>')
        },
      },
      legend: {
        data: ['Count', 'Cumulative %'],
        bottom: 0,
        textStyle: { fontSize: 11 },
      },
      grid: {
        top: 30,
        right: 50,
        bottom: 40,
        left: 16,
        containLabel: true,
      },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLabel: {
          fontSize: 10,
          rotate: categories.length > 4 ? 25 : 0,
          interval: 0,
        },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: 'Count',
          nameTextStyle: { fontSize: 10 },
          minInterval: 1,
          axisLabel: { fontSize: 10 },
        },
        {
          type: 'value' as const,
          name: 'Cumulative %',
          nameTextStyle: { fontSize: 10 },
          min: 0,
          max: 100,
          axisLabel: { fontSize: 10, formatter: '{value}%' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Count',
          type: 'bar' as const,
          data: counts.map((c, i) => ({
            value: c,
            itemStyle: {
              color: cumulative[i] <= 80 ? colors.violationPoint : colors.undersizedPoint,
            },
          })),
          barMaxWidth: 60,
          label: {
            show: counts.length <= 8,
            position: 'top' as const,
            fontSize: 10,
            fontWeight: 'bold' as const,
          },
        },
        {
          name: 'Cumulative %',
          type: 'line' as const,
          yAxisIndex: 1,
          data: cumulative,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 2, color: colors.centerLine },
          itemStyle: { color: colors.centerLine },
          label: {
            show: false,
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: {
              color: colors.outOfControl,
              type: 'dashed' as const,
              width: 1,
            },
            data: [
              {
                yAxis: 80,
                label: {
                  formatter: '80%',
                  position: 'end' as const,
                  fontSize: 9,
                },
              },
            ],
          },
        },
      ],
    }
  }, [paretoData, colors])

  const { containerRef } = useECharts({
    option,
    replaceMerge: ['series'],
  })

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Chart container - MUST always be in DOM */}
      <div
        ref={containerRef}
        className="min-h-0 flex-1"
        style={{ visibility: paretoData ? 'visible' : 'hidden' }}
      />
      {!paretoData && (
        <div className="flex h-full items-center justify-center">
          <div className="text-muted-foreground text-center text-sm">
            <p className="font-medium">No violations found</p>
            <p className="mt-1 text-xs">
              This characteristic has no Nelson rule violations in the current data range.
            </p>
          </div>
        </div>
      )}
      {paretoData && (
        <div className="text-muted-foreground flex items-center justify-between px-2 pt-1 text-xs">
          <span>
            {paretoData.total} total violation{paretoData.total !== 1 ? 's' : ''} across{' '}
            {paretoData.entries.length} rule{paretoData.entries.length !== 1 ? 's' : ''}
          </span>
          <span>Vital few (80%) highlighted</span>
        </div>
      )}
    </div>
  )
}
