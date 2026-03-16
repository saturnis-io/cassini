import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useECharts } from '@/hooks/useECharts'
import { Explainable } from '@/components/Explainable'
import type { ECOption } from '@/lib/echarts'
import type { StabilityResult } from '@/api/client'

interface StabilityResultsProps {
  result: StabilityResult
  studyId: number
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  stable: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    label: 'Stable',
  },
  potentially_unstable: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Potentially Unstable',
  },
  unstable: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    label: 'Unstable',
  },
}

export function StabilityResults({ result, studyId }: StabilityResultsProps) {
  const verdictStyle = VERDICT_STYLES[result.verdict] ?? VERDICT_STYLES.unstable

  // Collect violation indices for highlighting
  const violationIndices = useMemo(() => {
    const set = new Set<number>()
    for (const v of result.violations) {
      for (const idx of v.indices) {
        set.add(idx)
      }
    }
    return set
  }, [result.violations])

  // I-chart (Individuals chart)
  const iChartOption = useMemo<ECOption>(() => {
    const categories = result.values.map((_, i) => String(i + 1))
    const normalData = result.values.map((v, i) => ({
      value: parseFloat(v.toFixed(6)),
      itemStyle: violationIndices.has(i)
        ? { color: '#ef4444', borderColor: '#ef4444' }
        : undefined,
    }))

    return {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const p = (params as { name: string; value: number }[])[0]
          const idx = parseInt(p.name) - 1
          const isViolation = violationIndices.has(idx)
          return `Point ${p.name}: ${p.value.toFixed(4)}${isViolation ? ' (violation)' : ''}`
        },
      },
      legend: {
        data: ['Value', 'UCL', 'CL', 'LCL'],
        bottom: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { left: 60, right: 20, top: 20, bottom: 50 },
      xAxis: {
        type: 'category' as const,
        data: categories,
        name: 'Observation',
        nameLocation: 'center' as const,
        nameGap: 30,
      },
      yAxis: {
        type: 'value' as const,
        name: 'Value',
        nameLocation: 'center' as const,
        nameGap: 45,
      },
      series: [
        {
          name: 'Value',
          type: 'line' as const,
          data: normalData,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: '#6366f1', width: 1.5 },
          itemStyle: { color: '#6366f1' },
        },
        {
          name: 'UCL',
          type: 'line' as const,
          data: categories.map(() => parseFloat(result.ucl.toFixed(6))),
          lineStyle: { color: '#ef4444', width: 1.5, type: 'dashed' as const },
          symbol: 'none',
          showSymbol: false,
        },
        {
          name: 'CL',
          type: 'line' as const,
          data: categories.map(() => parseFloat(result.center_line.toFixed(6))),
          lineStyle: { color: '#22c55e', width: 1.5 },
          symbol: 'none',
          showSymbol: false,
        },
        {
          name: 'LCL',
          type: 'line' as const,
          data: categories.map(() => parseFloat(result.lcl.toFixed(6))),
          lineStyle: { color: '#ef4444', width: 1.5, type: 'dashed' as const },
          symbol: 'none',
          showSymbol: false,
        },
      ],
    }
  }, [result, violationIndices])

  const { containerRef: iChartRef } = useECharts({ option: iChartOption, notMerge: true })

  // MR-chart (Moving Range chart)
  const mrChartOption = useMemo<ECOption>(() => {
    const categories = result.moving_ranges.map((_, i) => String(i + 2))

    return {
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const p = (params as { name: string; value: number }[])[0]
          return `MR ${p.name}: ${p.value.toFixed(4)}`
        },
      },
      legend: {
        data: ['MR', 'UCL', 'CL'],
        bottom: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { left: 60, right: 20, top: 20, bottom: 50 },
      xAxis: {
        type: 'category' as const,
        data: categories,
        name: 'Observation',
        nameLocation: 'center' as const,
        nameGap: 30,
      },
      yAxis: {
        type: 'value' as const,
        name: 'Moving Range',
        nameLocation: 'center' as const,
        nameGap: 45,
        min: 0,
      },
      series: [
        {
          name: 'MR',
          type: 'line' as const,
          data: result.moving_ranges.map((v) => parseFloat(v.toFixed(6))),
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: '#8b5cf6', width: 1.5 },
          itemStyle: { color: '#8b5cf6' },
        },
        {
          name: 'UCL',
          type: 'line' as const,
          data: categories.map(() => parseFloat(result.mr_ucl.toFixed(6))),
          lineStyle: { color: '#ef4444', width: 1.5, type: 'dashed' as const },
          symbol: 'none',
          showSymbol: false,
        },
        {
          name: 'CL',
          type: 'line' as const,
          data: categories.map(() => parseFloat(result.mr_center_line.toFixed(6))),
          lineStyle: { color: '#22c55e', width: 1.5 },
          symbol: 'none',
          showSymbol: false,
        },
      ],
    }
  }, [result])

  const { containerRef: mrChartRef } = useECharts({ option: mrChartOption, notMerge: true })

  return (
    <div className="space-y-6">
      {/* Verdict banner */}
      <div className="flex items-center justify-between gap-4">
        <div className={cn('flex items-center gap-3 rounded-lg px-4 py-3', verdictStyle.bg)}>
          <span className={cn('text-lg font-bold', verdictStyle.text)}>
            {verdictStyle.label}
          </span>
          <span className="text-muted-foreground text-sm">Stability Study</span>
        </div>
        <div className="text-muted-foreground text-sm">
          n = {result.values.length}
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="space-y-1">
          {result.warnings.map((w, i) => (
            <div
              key={i}
              className="border-amber-500/20 bg-amber-500/10 rounded-lg border px-3 py-2 text-sm text-amber-600 dark:text-amber-400"
            >
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Center Line</div>
          <div className="mt-1 text-lg font-bold tabular-nums">
            <Explainable metric="center_line" resourceId={studyId} resourceType="msa">
              {result.center_line.toFixed(4)}
            </Explainable>
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Sigma</div>
          <div className="mt-1 text-lg font-bold tabular-nums">
            <Explainable metric="sigma" resourceId={studyId} resourceType="msa">
              {result.sigma.toFixed(4)}
            </Explainable>
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">UCL / LCL</div>
          <div className="mt-1 text-sm font-bold tabular-nums">
            <Explainable metric="ucl" resourceId={studyId} resourceType="msa">
              {result.ucl.toFixed(4)}
            </Explainable>
            {' / '}
            <Explainable metric="lcl" resourceId={studyId} resourceType="msa">
              {result.lcl.toFixed(4)}
            </Explainable>
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Violations</div>
          <div
            className={cn(
              'mt-1 text-lg font-bold tabular-nums',
              result.violations.length === 0
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {result.violations.length}
          </div>
        </div>
      </div>

      {/* I-chart */}
      <div className="border-border rounded-xl border p-4">
        <h3 className="mb-2 text-sm font-medium">Individuals Chart (I-chart)</h3>
        <div ref={iChartRef} style={{ width: '100%', height: 280 }} />
      </div>

      {/* MR-chart */}
      <div className="border-border rounded-xl border p-4">
        <h3 className="mb-2 text-sm font-medium">Moving Range Chart (MR-chart)</h3>
        <div ref={mrChartRef} style={{ width: '100%', height: 220 }} />
      </div>

      {/* Violations table */}
      {result.violations.length > 0 && (
        <div className="border-border rounded-xl border">
          <div className="bg-muted/50 border-border border-b px-4 py-2">
            <h3 className="text-sm font-medium">Nelson Rules Violations</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">Rule</th>
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">Name</th>
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {result.violations.map((v, i) => (
                <tr key={i} className="border-border/50 border-t">
                  <td className="px-4 py-2 font-medium">Rule {v.rule_id}</td>
                  <td className="px-4 py-2">{v.rule_name}</td>
                  <td className="text-muted-foreground px-4 py-2 text-xs">{v.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Verdict reason */}
      <div className="border-border rounded-xl border p-4">
        <h3 className="mb-2 text-sm font-medium">Verdict Reason</h3>
        <p className="text-sm">{result.verdict_reason}</p>
      </div>

      {/* Interpretation guide */}
      <div className="bg-muted/30 rounded-lg p-4 text-xs">
        <p className="mb-1 font-medium">Interpretation Guide (AIAG MSA 4th Ed., Ch. 4)</p>
        <ul className="text-muted-foreground space-y-0.5">
          <li>
            <strong>Stable:</strong> No Nelson Rules 1-8 violations detected
          </li>
          <li>
            <strong>Potentially Unstable:</strong> Only supplementary rules (5-8) triggered
          </li>
          <li>
            <strong>Unstable:</strong> Critical rules (1-4) triggered — points beyond limits,
            shifts, trends, or alternating patterns
          </li>
          <li className="pt-1 italic">
            AIAG recommends n &ge; 20 time points for sufficient power to detect instability.
          </li>
        </ul>
      </div>
    </div>
  )
}
