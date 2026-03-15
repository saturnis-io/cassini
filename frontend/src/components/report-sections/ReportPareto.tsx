import { useMemo } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import { useStaticChart } from '@/hooks/useStaticChart'
import type { Violation } from '@/types'

interface ReportParetoProps {
  violations: Violation[]
}

/**
 * Pareto chart of violations by rule.
 *
 * Bars show violation count per rule (descending), with a cumulative
 * percentage line overlay. Classic quality tool for prioritizing
 * improvement efforts.
 */
export function ReportPareto({ violations }: ReportParetoProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const { categories, counts, cumPct } = useMemo(() => {
    if (violations.length === 0) return { categories: [], counts: [], cumPct: [] }

    // Count violations by rule
    const ruleMap = new Map<string, number>()
    for (const v of violations) {
      const label = `Rule ${v.rule_id}: ${v.rule_name}`
      ruleMap.set(label, (ruleMap.get(label) ?? 0) + 1)
    }

    // Sort descending by count
    const sorted = [...ruleMap.entries()].sort((a, b) => b[1] - a[1])

    const cats = sorted.map(([label]) => label)
    const cnts = sorted.map(([, count]) => count)
    const total = cnts.reduce((a, b) => a + b, 0)

    // Cumulative percentage
    const cum: number[] = []
    let running = 0
    for (const c of cnts) {
      running += c
      cum.push(total > 0 ? (running / total) * 100 : 0)
    }

    return { categories: cats, counts: cnts, cumPct: cum }
  }, [violations])

  const option = useMemo(() => {
    if (categories.length === 0) return null

    const axisColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 10%, 40%)'
    const axisLineColor = isDark ? 'hsl(220, 10%, 35%)' : 'hsl(220, 10%, 80%)'

    return {
      grid: { top: 30, right: 50, bottom: 60, left: 50, containLabel: true },
      tooltip: { trigger: 'axis' as const },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLabel: {
          color: axisColor,
          fontSize: 10,
          rotate: categories.length > 4 ? 30 : 0,
          interval: 0,
          overflow: 'truncate' as const,
          width: 120,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: 'Count',
          nameTextStyle: { color: axisColor, fontSize: 11 },
          axisLabel: { color: axisColor, fontSize: 10 },
          axisLine: { lineStyle: { color: axisLineColor } },
          splitLine: {
            lineStyle: {
              color: isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 90%)',
            },
          },
        },
        {
          type: 'value' as const,
          name: 'Cumulative %',
          min: 0,
          max: 100,
          nameTextStyle: { color: axisColor, fontSize: 11 },
          axisLabel: { color: axisColor, fontSize: 10, formatter: '{value}%' },
          axisLine: { lineStyle: { color: axisLineColor } },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          type: 'bar' as const,
          name: 'Count',
          data: counts,
          yAxisIndex: 0,
          itemStyle: {
            color: isDark ? 'hsl(0, 72%, 55%)' : 'hsl(0, 72%, 51%)',
            opacity: 0.85,
          },
          barMaxWidth: 50,
        },
        {
          type: 'line' as const,
          name: 'Cumulative %',
          data: cumPct,
          yAxisIndex: 1,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: isDark ? '#facc15' : '#ca8a04', width: 2 },
          itemStyle: { color: isDark ? '#facc15' : '#ca8a04' },
        },
      ],
    }
  }, [categories, counts, cumPct, isDark])

  const { containerRef, dataURL, lightDataURL } = useStaticChart({ option, notMerge: true })

  if (violations.length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Violation Pareto</h2>
        <p className="text-muted-foreground text-sm">No violations to chart</p>
      </div>
    )
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Violation Pareto Chart</h2>
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
            alt="Violation Pareto chart"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      <div className="text-muted-foreground mt-2 text-center text-xs">
        Total violations: {violations.length} across {categories.length} rule{categories.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
