import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useECharts } from '@/hooks/useECharts'
import { Explainable } from '@/components/Explainable'
import type { ECOption } from '@/lib/echarts'
import type { BiasResult } from '@/api/client'

interface BiasResultsProps {
  result: BiasResult
  studyId: number
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  acceptable: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    label: 'Acceptable',
  },
  marginal: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'Marginal',
  },
  unacceptable: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    label: 'Unacceptable',
  },
  indeterminate: {
    bg: 'bg-zinc-500/10',
    text: 'text-zinc-600 dark:text-zinc-400',
    label: 'Indeterminate',
  },
}

function safeFixed(val: number | null | undefined, digits: number): string {
  if (val == null || isNaN(val)) return '-'
  return val.toFixed(digits)
}

export function BiasResults({ result, studyId }: BiasResultsProps) {
  const verdictStyle = VERDICT_STYLES[result.verdict] ?? VERDICT_STYLES.indeterminate

  // Histogram of measurements with reference line
  const histogramOption = useMemo<ECOption>(() => {
    const values = result.measurements
    if (values.length === 0) return {}

    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1
    const binCount = Math.max(5, Math.min(20, Math.ceil(Math.sqrt(values.length))))
    const binWidth = range / binCount

    // Build histogram bins
    const bins: number[] = new Array(binCount).fill(0)
    const binEdges: number[] = []
    for (let i = 0; i <= binCount; i++) {
      binEdges.push(min + i * binWidth)
    }
    for (const v of values) {
      let binIdx = Math.floor((v - min) / binWidth)
      if (binIdx >= binCount) binIdx = binCount - 1
      if (binIdx < 0) binIdx = 0
      bins[binIdx]++
    }

    const categories = binEdges.slice(0, -1).map((edge, i) => {
      const center = edge + binWidth / 2
      return center.toFixed(4)
    })

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
      },
      grid: { left: 60, right: 20, top: 20, bottom: 60 },
      xAxis: {
        type: 'category' as const,
        data: categories,
        name: 'Value',
        nameLocation: 'center' as const,
        nameGap: 40,
        axisLabel: { rotate: 45, fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Frequency',
        nameLocation: 'center' as const,
        nameGap: 40,
      },
      series: [
        {
          type: 'bar' as const,
          data: bins,
          barWidth: '90%',
          itemStyle: { color: '#6366f1', opacity: 0.7 },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                name: 'Reference',
                xAxis: (() => {
                  // Find closest bin to reference
                  const refBin = categories.reduce((closest, cat, idx) => {
                    const catVal = parseFloat(cat)
                    const closestVal = parseFloat(categories[closest])
                    return Math.abs(catVal - result.reference_value) <
                      Math.abs(closestVal - result.reference_value)
                      ? idx
                      : closest
                  }, 0)
                  return refBin
                })(),
                lineStyle: { color: '#ef4444', width: 2, type: 'solid' as const },
                label: {
                  formatter: `Ref = ${result.reference_value}`,
                  position: 'end' as const,
                  fontSize: 10,
                },
              },
              {
                name: 'Mean',
                xAxis: (() => {
                  const meanBin = categories.reduce((closest, cat, idx) => {
                    const catVal = parseFloat(cat)
                    const closestVal = parseFloat(categories[closest])
                    return Math.abs(catVal - result.mean) < Math.abs(closestVal - result.mean)
                      ? idx
                      : closest
                  }, 0)
                  return meanBin
                })(),
                lineStyle: { color: '#22c55e', width: 2, type: 'dashed' as const },
                label: {
                  formatter: `Mean = ${result.mean.toFixed(4)}`,
                  position: 'start' as const,
                  fontSize: 10,
                },
              },
            ],
          },
        },
      ],
    }
  }, [result])

  const { containerRef: histogramRef } = useECharts({ option: histogramOption, notMerge: true })

  return (
    <div className="space-y-6">
      {/* Verdict banner */}
      <div className="flex items-center justify-between gap-4">
        <div className={cn('flex items-center gap-3 rounded-lg px-4 py-3', verdictStyle.bg)}>
          <span className={cn('text-lg font-bold', verdictStyle.text)}>
            {verdictStyle.label}
          </span>
          <span className="text-muted-foreground text-sm">Bias Study</span>
          {result.bias_percent != null && (
            <span className="text-muted-foreground text-xs">
              %Bias = {safeFixed(result.bias_percent, 1)}%
            </span>
          )}
        </div>
        <div className="text-muted-foreground text-sm">
          n = {result.n}
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
          <div className="text-muted-foreground text-xs font-medium">Bias</div>
          <div className="mt-1 text-lg font-bold tabular-nums">
            <Explainable metric="bias" resourceId={studyId} resourceType="msa">
              {result.bias.toFixed(6)}
            </Explainable>
          </div>
          <div className="text-muted-foreground mt-0.5 text-[10px]">
            mean - reference
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">%Bias</div>
          <div
            className={cn(
              'mt-1 text-lg font-bold tabular-nums',
              result.bias_percent != null && result.bias_percent < 10
                ? 'text-green-600 dark:text-green-400'
                : result.bias_percent != null && result.bias_percent <= 30
                  ? 'text-amber-600 dark:text-amber-400'
                  : result.bias_percent != null
                    ? 'text-red-600 dark:text-red-400'
                    : '',
            )}
          >
            <Explainable metric="bias_percent" resourceId={studyId} resourceType="msa">
              {safeFixed(result.bias_percent, 2)}%
            </Explainable>
          </div>
          <div className="text-muted-foreground mt-0.5 text-[10px]">
            denom: {result.denominator_used}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">t-statistic</div>
          <div className="mt-1 text-lg font-bold tabular-nums">
            <Explainable metric="t_statistic" resourceId={studyId} resourceType="msa">
              {result.t_statistic.toFixed(4)}
            </Explainable>
          </div>
          <div className="text-muted-foreground mt-0.5 text-[10px]">
            df = {result.df}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">p-value</div>
          <div
            className={cn(
              'mt-1 text-lg font-bold tabular-nums',
              result.is_significant ? 'text-red-600 dark:text-red-400' : '',
            )}
          >
            <Explainable metric="p_value" resourceId={studyId} resourceType="msa">
              {result.p_value < 0.001 ? '<0.001' : result.p_value.toFixed(4)}
            </Explainable>
          </div>
          <div className="text-muted-foreground mt-0.5 text-[10px]">
            {result.is_significant ? 'significant' : 'not significant'}
          </div>
        </div>
      </div>

      {/* Measurement statistics */}
      <div className="border-border rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-muted-foreground px-4 py-2 text-left font-medium">Metric</th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">Reference Value</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.reference_value}</td>
            </tr>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">Sample Mean</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.mean.toFixed(6)}</td>
            </tr>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">Sample Std Dev</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.std_dev.toFixed(6)}</td>
            </tr>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">Bias (mean - reference)</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.bias.toFixed(6)}</td>
            </tr>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">%Bias</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {safeFixed(result.bias_percent, 2)}%
              </td>
            </tr>
            <tr className="border-border/50 bg-muted/30 border-t font-semibold">
              <td className="px-4 py-2">t-test (two-sided)</td>
              <td className="px-4 py-2 text-right tabular-nums">
                t = {result.t_statistic.toFixed(4)}, p ={' '}
                {result.p_value < 0.001 ? '<0.001' : result.p_value.toFixed(4)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Histogram */}
      {result.measurements.length > 0 && (
        <div className="border-border rounded-xl border p-4">
          <h3 className="mb-2 text-sm font-medium">
            Measurement Distribution (Reference vs Mean)
          </h3>
          <div ref={histogramRef} style={{ width: '100%', height: 280 }} />
        </div>
      )}

      {/* Interpretation guide */}
      <div className="bg-muted/30 rounded-lg p-4 text-xs">
        <p className="mb-1 font-medium">
          Interpretation Guide (AIAG MSA 4th Ed., Ch. 3: Independent Sample Bias Method)
        </p>
        <ul className="text-muted-foreground space-y-0.5">
          <li>
            <strong>%Bias &lt; 10%</strong> = Acceptable — bias is small relative to tolerance
          </li>
          <li>
            <strong>%Bias 10-30%</strong> = Marginal — may be acceptable depending on application
          </li>
          <li>
            <strong>%Bias &gt; 30%</strong> = Unacceptable — gage requires calibration or
            replacement
          </li>
          <li>
            <strong>p-value &lt; 0.05</strong> = Bias is statistically significant (bias &ne; 0)
          </li>
          <li className="pt-1 italic">
            A gage can have statistically significant bias that is still practically acceptable if
            %Bias is small. Report both t-test significance AND %Bias.
          </li>
        </ul>
      </div>
    </div>
  )
}
