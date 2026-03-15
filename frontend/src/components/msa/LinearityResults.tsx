import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useECharts } from '@/hooks/useECharts'
import type { ECOption } from '@/lib/echarts'
import type { LinearityResult } from '@/api/client'

interface LinearityResultsProps {
  result: LinearityResult
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
}

function safeFixed(val: number | null | undefined, digits: number): string {
  if (val == null || isNaN(val)) return '-'
  return val.toFixed(digits)
}

export function LinearityResults({ result, studyId: _studyId }: LinearityResultsProps) {
  const verdictStyle = VERDICT_STYLES[result.verdict] ?? VERDICT_STYLES.unacceptable

  // Bias vs Reference scatter plot with regression line
  const scatterOption = useMemo<ECOption>(() => {
    const points = result.individual_points
    const scatterData = points.map((p) => [p.reference, p.bias])

    // Regression line endpoints
    const minRef = Math.min(...result.reference_values)
    const maxRef = Math.max(...result.reference_values)
    const padding = (maxRef - minRef) * 0.05
    const lineStart = minRef - padding
    const lineEnd = maxRef + padding
    const lineData = [
      [lineStart, result.intercept + result.slope * lineStart],
      [lineEnd, result.intercept + result.slope * lineEnd],
    ]

    // Zero-bias reference line
    const zeroLine = [
      [lineStart, 0],
      [lineEnd, 0],
    ]

    // Mean bias points
    const meanBiasData = result.reference_values.map((ref, i) => [ref, result.bias_values[i]])

    return {
      tooltip: {
        trigger: 'item' as const,
        formatter: (params: unknown) => {
          const p = params as { seriesName: string; data: number[] }
          if (p.seriesName === 'Individual Bias') {
            return `Ref: ${p.data[0]}<br/>Bias: ${p.data[1].toFixed(6)}`
          }
          if (p.seriesName === 'Mean Bias') {
            return `Ref: ${p.data[0]}<br/>Mean Bias: ${p.data[1].toFixed(6)}`
          }
          return ''
        },
      },
      legend: {
        data: ['Individual Bias', 'Mean Bias', 'Regression', 'Zero Bias'],
        bottom: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { left: 60, right: 20, top: 20, bottom: 50 },
      xAxis: {
        type: 'value' as const,
        name: 'Reference Value',
        nameLocation: 'center' as const,
        nameGap: 30,
        min: lineStart,
        max: lineEnd,
      },
      yAxis: {
        type: 'value' as const,
        name: 'Bias',
        nameLocation: 'center' as const,
        nameGap: 45,
      },
      series: [
        {
          name: 'Individual Bias',
          type: 'scatter' as const,
          data: scatterData,
          symbolSize: 6,
          itemStyle: { color: '#6366f1', opacity: 0.5 },
        },
        {
          name: 'Mean Bias',
          type: 'scatter' as const,
          data: meanBiasData,
          symbolSize: 10,
          symbol: 'diamond',
          itemStyle: { color: '#f59e0b' },
        },
        {
          name: 'Regression',
          type: 'line' as const,
          data: lineData,
          lineStyle: { color: '#ef4444', width: 2 },
          symbol: 'none',
          showSymbol: false,
        },
        {
          name: 'Zero Bias',
          type: 'line' as const,
          data: zeroLine,
          lineStyle: { color: '#71717a', width: 1, type: 'dashed' as const },
          symbol: 'none',
          showSymbol: false,
        },
      ],
    }
  }, [result])

  const { containerRef: scatterRef } = useECharts({ option: scatterOption, notMerge: true })

  // Per-level bias bar chart
  const biasBarOption = useMemo<ECOption>(() => {
    const categories = result.reference_values.map((r) => String(r))
    const colors = result.bias_values.map((b) => {
      const absBias = Math.abs(b)
      const pctOfRange =
        result.reference_values.length > 1
          ? absBias /
            (Math.max(...result.reference_values) - Math.min(...result.reference_values))
          : 0
      if (pctOfRange <= 0.01) return '#22c55e'
      if (pctOfRange <= 0.05) return '#f59e0b'
      return '#ef4444'
    })

    return {
      tooltip: {
        trigger: 'axis' as const,
        axisPointer: { type: 'shadow' as const },
        formatter: (params: unknown) => {
          const p = (params as { name: string; value: number }[])[0]
          return `Ref: ${p.name}<br/>Mean Bias: ${p.value.toFixed(6)}`
        },
      },
      grid: { left: 60, right: 20, top: 10, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLabel: { fontSize: 11 },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Bias',
        axisLabel: { fontSize: 11 },
      },
      series: [
        {
          type: 'bar' as const,
          data: result.bias_values.map((v, i) => ({
            value: parseFloat(v.toFixed(6)),
            itemStyle: { color: colors[i] },
          })),
          barWidth: '60%',
        },
      ],
    }
  }, [result])

  const { containerRef: biasBarRef } = useECharts({ option: biasBarOption, notMerge: true })

  return (
    <div className="space-y-6">
      {/* Verdict banner */}
      <div className="flex items-center justify-between gap-4">
        <div className={cn('flex items-center gap-3 rounded-lg px-4 py-3', verdictStyle.bg)}>
          <span className={cn('text-lg font-bold', verdictStyle.text)}>
            {verdictStyle.label}
          </span>
          <span className="text-muted-foreground text-sm">Linearity Study</span>
          <span className="text-muted-foreground text-xs">
            %Linearity = {safeFixed(result.linearity_percent, 1)}%
            {!isNaN(result.linearity_percent) &&
              (result.linearity_percent <= 5
                ? ' (\u22645%)'
                : result.linearity_percent <= 10
                  ? ' (5-10%)'
                  : ' (>10%)')}
          </span>
        </div>
        <div className="text-muted-foreground text-sm">
          R<sup>2</sup> = {result.r_squared.toFixed(4)}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">%Linearity</div>
          <div
            className={cn(
              'mt-1 text-lg font-bold tabular-nums',
              !isNaN(result.linearity_percent) && result.linearity_percent <= 5
                ? 'text-green-600 dark:text-green-400'
                : !isNaN(result.linearity_percent) && result.linearity_percent <= 10
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-red-600 dark:text-red-400',
            )}
          >
            {safeFixed(result.linearity_percent, 2)}%
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">%Bias</div>
          <div className="mt-1 text-lg font-bold tabular-nums">
            {safeFixed(result.bias_percent, 2)}%
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Slope</div>
          <div className="mt-1 text-sm font-bold tabular-nums">{result.slope.toFixed(6)}</div>
          <div className="text-muted-foreground mt-0.5 text-[10px]">
            p = {result.p_value < 0.001 ? '<0.001' : result.p_value.toFixed(4)}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">
            R<sup>2</sup>
          </div>
          <div className="mt-1 text-lg font-bold tabular-nums">
            {result.r_squared.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Bias vs Reference scatter plot */}
      <div className="border-border rounded-xl border p-4">
        <h3 className="mb-2 text-sm font-medium">Bias vs Reference Value</h3>
        <div ref={scatterRef} style={{ width: '100%', height: 320 }} />
      </div>

      {/* Per-level bias bar chart */}
      <div className="border-border rounded-xl border p-4">
        <h3 className="mb-2 text-sm font-medium">Mean Bias at Each Reference Level</h3>
        <div ref={biasBarRef} style={{ width: '100%', height: 200 }} />
      </div>

      {/* Per-level detail table */}
      <div className="border-border rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-muted-foreground px-4 py-2 text-left font-medium">
                Reference
              </th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                Mean Bias
              </th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                |Bias|
              </th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                %Bias
              </th>
            </tr>
          </thead>
          <tbody>
            {result.reference_values.map((ref, i) => (
              <tr key={ref} className="border-border/50 border-t">
                <td className="px-4 py-2 font-medium tabular-nums">{ref}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {result.bias_values[i].toFixed(6)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {Math.abs(result.bias_values[i]).toFixed(6)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {safeFixed(result.bias_percentages[i], 2)}%
                </td>
              </tr>
            ))}
            <tr className="border-border/50 bg-muted/30 border-t font-semibold">
              <td className="px-4 py-2">Average</td>
              <td className="px-4 py-2 text-right">-</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {result.bias_avg.toFixed(6)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {safeFixed(result.bias_percent, 2)}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Regression equation */}
      <div className="border-border rounded-xl border p-4">
        <h3 className="mb-2 text-sm font-medium">Regression Equation</h3>
        <p className="font-mono text-sm">
          Bias = {result.intercept >= 0 ? '' : '-'}
          {Math.abs(result.intercept).toFixed(6)} {result.slope >= 0 ? '+' : '-'}{' '}
          {Math.abs(result.slope).toFixed(6)} x Reference
        </p>
        <div className="text-muted-foreground mt-2 space-y-1 text-xs">
          <p>
            Linearity = |slope| x range = {Math.abs(result.slope).toFixed(6)} x{' '}
            {(
              Math.max(...result.reference_values) - Math.min(...result.reference_values)
            ).toFixed(4)}{' '}
            = {result.linearity.toFixed(6)}
          </p>
          <p>
            p-value ={' '}
            {result.p_value < 0.001 ? '<0.001' : result.p_value.toFixed(4)}
            {result.p_value < 0.05
              ? ' (significant — slope differs from zero)'
              : ' (not significant — no evidence of non-linearity)'}
          </p>
        </div>
      </div>

      {/* Interpretation guide */}
      <div className="bg-muted/30 rounded-lg p-4 text-xs">
        <p className="mb-1 font-medium">Interpretation Guide (AIAG MSA 4th Ed)</p>
        <ul className="text-muted-foreground space-y-0.5">
          <li>
            <strong>%Linearity &le; 5%</strong> = Acceptable — gage bias is consistent across range
          </li>
          <li>
            <strong>%Linearity 5-10%</strong> = Marginal — bias may vary, investigate further
          </li>
          <li>
            <strong>%Linearity &gt; 10%</strong> = Unacceptable — gage bias changes significantly
            across range
          </li>
          <li>
            <strong>p-value &lt; 0.05</strong> = Slope is statistically significant (slope &ne; 0)
          </li>
          <li className="pt-1 italic">
            Even with acceptable %Linearity, check if average bias is large — a gage can be
            linear but still biased.
          </li>
        </ul>
      </div>
    </div>
  )
}
