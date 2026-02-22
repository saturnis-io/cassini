import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useECharts } from '@/hooks/useECharts'
import type { ECOption } from '@/lib/echarts'
import type { GageRRResult } from '@/api/client'

interface MSAResultsProps {
  result: GageRRResult
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  acceptable: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', label: 'Acceptable' },
  marginal: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', label: 'Marginal' },
  unacceptable: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', label: 'Unacceptable' },
}

const METHOD_LABELS: Record<string, string> = {
  crossed_anova: 'Crossed ANOVA',
  nested_anova: 'Nested ANOVA',
  range_method: 'Range Method',
}

/** Color-code a percentage value for Gage R&R tables */
function pctClass(pct: number): string {
  if (pct <= 10) return 'text-green-600 dark:text-green-400'
  if (pct <= 30) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function pctBg(pct: number): string {
  if (pct <= 10) return 'bg-green-500/10'
  if (pct <= 30) return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

export function MSAResults({ result }: MSAResultsProps) {
  const verdictStyle = VERDICT_STYLES[result.verdict] ?? VERDICT_STYLES.unacceptable

  // Variance components bar chart
  const chartOption = useMemo<ECOption>(() => {
    const categories = ['Repeatability (EV)', 'Reproducibility (AV)', 'Gage R&R', 'Part Variation']
    const pctContrib = [
      result.pct_contribution_ev,
      result.pct_contribution_av,
      result.pct_contribution_grr,
      result.pct_contribution_pv,
    ]
    const colors = pctContrib.map((v) => {
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
          return `${p.name}: ${p.value.toFixed(2)}%`
        },
      },
      grid: { left: 140, right: 20, top: 10, bottom: 30 },
      xAxis: {
        type: 'value' as const,
        max: 100,
        axisLabel: { formatter: '{value}%' },
      },
      yAxis: {
        type: 'category' as const,
        data: categories,
        inverse: true,
      },
      series: [
        {
          type: 'bar' as const,
          data: pctContrib.map((v, i) => ({
            value: parseFloat(v.toFixed(2)),
            itemStyle: { color: colors[i] },
          })),
          barWidth: 20,
        },
      ],
    }
  }, [result])

  const { containerRef } = useECharts({ option: chartOption, notMerge: true })

  return (
    <div className="space-y-6">
      {/* Verdict banner */}
      <div className="flex items-center justify-between gap-4">
        <div className={cn('flex items-center gap-3 rounded-lg px-4 py-3', verdictStyle.bg)}>
          <span className={cn('text-lg font-bold', verdictStyle.text)}>
            {verdictStyle.label}
          </span>
          <span className="text-muted-foreground text-sm">
            {METHOD_LABELS[result.method] ?? result.method}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">ndc =</span>
          <span
            className={cn(
              'rounded-full px-3 py-1 text-sm font-bold',
              result.ndc >= 5 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600',
            )}
          >
            {result.ndc}
          </span>
        </div>
      </div>

      {/* Variance components chart */}
      <div className="border-border rounded-xl border p-4">
        <h3 className="mb-2 text-sm font-medium">% Contribution (Variance Components)</h3>
        <div ref={containerRef} style={{ width: '100%', height: 200 }} />
      </div>

      {/* %Contribution table */}
      <div className="border-border overflow-hidden rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-muted-foreground px-4 py-2 text-left font-medium">Source</th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">StdDev</th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">%Contribution</th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">%Study Var</th>
              {result.pct_tolerance_grr !== null && (
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">%Tolerance</th>
              )}
            </tr>
          </thead>
          <tbody>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">Repeatability (EV)</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.repeatability_ev.toFixed(4)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctBg(result.pct_contribution_ev), pctClass(result.pct_contribution_ev))}>
                {result.pct_contribution_ev.toFixed(2)}%
              </td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctClass(result.pct_study_ev))}>
                {result.pct_study_ev.toFixed(2)}%
              </td>
              {result.pct_tolerance_grr !== null && <td className="px-4 py-2 text-right">-</td>}
            </tr>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">Reproducibility (AV)</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.reproducibility_av.toFixed(4)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctBg(result.pct_contribution_av), pctClass(result.pct_contribution_av))}>
                {result.pct_contribution_av.toFixed(2)}%
              </td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctClass(result.pct_study_av))}>
                {result.pct_study_av.toFixed(2)}%
              </td>
              {result.pct_tolerance_grr !== null && <td className="px-4 py-2 text-right">-</td>}
            </tr>
            {result.pct_contribution_interaction !== null && (
              <tr className="border-border/50 border-t">
                <td className="px-4 py-2 font-medium">Interaction</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {result.interaction !== null ? result.interaction.toFixed(4) : '-'}
                </td>
                <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctClass(result.pct_contribution_interaction!))}>
                  {result.pct_contribution_interaction!.toFixed(2)}%
                </td>
                <td className="px-4 py-2 text-right">-</td>
                {result.pct_tolerance_grr !== null && <td className="px-4 py-2 text-right">-</td>}
              </tr>
            )}
            <tr className="border-border/50 bg-muted/30 border-t font-semibold">
              <td className="px-4 py-2">Gage R&amp;R (GRR)</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.gage_rr.toFixed(4)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums', pctBg(result.pct_contribution_grr), pctClass(result.pct_contribution_grr))}>
                {result.pct_contribution_grr.toFixed(2)}%
              </td>
              <td className={cn('px-4 py-2 text-right tabular-nums', pctClass(result.pct_study_grr))}>
                {result.pct_study_grr.toFixed(2)}%
              </td>
              {result.pct_tolerance_grr !== null && (
                <td className={cn('px-4 py-2 text-right tabular-nums', pctClass(result.pct_tolerance_grr))}>
                  {result.pct_tolerance_grr.toFixed(2)}%
                </td>
              )}
            </tr>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">Part Variation (PV)</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.part_variation.toFixed(4)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctBg(result.pct_contribution_pv), pctClass(result.pct_contribution_pv))}>
                {result.pct_contribution_pv.toFixed(2)}%
              </td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctClass(result.pct_study_pv))}>
                {result.pct_study_pv.toFixed(2)}%
              </td>
              {result.pct_tolerance_grr !== null && <td className="px-4 py-2 text-right">-</td>}
            </tr>
            <tr className="border-border/50 bg-muted/30 border-t font-semibold">
              <td className="px-4 py-2">Total Variation (TV)</td>
              <td className="px-4 py-2 text-right tabular-nums">{result.total_variation.toFixed(4)}</td>
              <td className="px-4 py-2 text-right tabular-nums">100.00%</td>
              <td className="px-4 py-2 text-right tabular-nums">100.00%</td>
              {result.pct_tolerance_grr !== null && <td className="px-4 py-2 text-right">-</td>}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ANOVA table (crossed ANOVA only) */}
      {result.anova_table && (
        <div className="border-border overflow-hidden rounded-xl border">
          <div className="bg-muted/50 border-border border-b px-4 py-2">
            <h3 className="text-sm font-medium">ANOVA Table</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">Source</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">SS</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">df</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">MS</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">F</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">p-value</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.anova_table).map(([source, row]) => (
                <tr key={source} className="border-border/50 border-t">
                  <td className="px-4 py-2 font-medium capitalize">{source.replace('_', ' x ')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.SS.toFixed(6)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.df}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.MS.toFixed(6)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.F !== null ? row.F.toFixed(4) : '-'}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2 text-right tabular-nums',
                      row.p !== null && row.p < 0.05 && 'font-medium text-red-600',
                    )}
                  >
                    {row.p !== null ? row.p.toFixed(4) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Interpretation guide */}
      <div className="bg-muted/30 rounded-lg p-4 text-xs">
        <p className="mb-1 font-medium">Interpretation Guide</p>
        <ul className="text-muted-foreground space-y-0.5">
          <li>%GRR &le; 10% = Acceptable measurement system</li>
          <li>%GRR 10-30% = Marginal, may be acceptable depending on application</li>
          <li>%GRR &gt; 30% = Unacceptable, corrective action needed</li>
          <li>ndc &ge; 5 = Measurement system can distinguish at least 5 categories of parts</li>
        </ul>
      </div>
    </div>
  )
}
