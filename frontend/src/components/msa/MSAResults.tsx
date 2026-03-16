import { useMemo, useState, useRef, useCallback } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useECharts } from '@/hooks/useECharts'
import { Explainable } from '@/components/Explainable'
import { IshikawaDiagram } from '@/components/IshikawaDiagram'
import { OperatorCharts } from '@/components/msa/OperatorCharts'
import type { ECOption } from '@/lib/echarts'
import type { GageRRResult } from '@/api/client'
import type { IshikawaResult } from '@/api/hooks/useIshikawa'

interface MSAResultsProps {
  result: GageRRResult
  studyId: number
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

const TOOLTIPS: Record<string, string> = {
  ev: 'Equipment Variation (Repeatability). Variation when the same operator measures the same part repeatedly. High EV suggests the gage itself is imprecise.',
  av: 'Appraiser Variation (Reproducibility). Variation between different operators measuring the same part. High AV suggests operator technique differences or unclear procedures.',
  grr: 'Gage R&R = EV + AV combined. The total measurement system variation. AIAG guidelines: \u226410% acceptable, 10-30% marginal, >30% unacceptable.',
  pv: 'Part Variation. The actual variation between parts being measured. A good measurement system has PV >> GRR.',
  ndc: 'Number of Distinct Categories. How many groups of parts the gage can reliably distinguish. ndc \u2265 5 is required for adequate discrimination (AIAG MSA 4th Ed).',
  pct_contribution: '% Contribution = (variance component / total variance) \u00d7 100. Shows how much each source accounts for in total variation. Values sum to 100%.',
  pct_study: '% Study Variation = (\u03c3 component / \u03c3 total) \u00d7 100. Based on standard deviations, not variances. More conservative than %Contribution.',
  pct_tolerance: 'P/T Ratio (Precision to Tolerance) = (5.15\u00d7\u03c3 GRR / tolerance) \u00d7 100. Compares measurement variation to the spec range. Only available when tolerance (USL\u2212LSL) is provided. \u226410% acceptable, 10-30% marginal, >30% unacceptable.',
  anova: 'Analysis of Variance. Decomposes total variation into operator, part, and interaction components. p < 0.05 indicates a statistically significant effect.',
  interaction: 'Operator \u00d7 Part interaction. If significant (p < 0.05), some operators measure certain parts differently \u2014 suggests inconsistent technique.',
  ss: 'Sum of Squares. The total squared deviation for each source of variation. Larger values indicate more variation attributable to that source.',
  df: 'Degrees of Freedom. The number of independent values that can vary for each source. Used to calculate Mean Squares (MS = SS / df).',
  ms: 'Mean Squares = SS / df. The average squared deviation for each source. MS values are compared via the F-statistic to test significance.',
  f_stat: 'F-statistic = MS(source) / MS(error). Ratio of source variation to random error. A large F value suggests the source is statistically significant.',
  p_value: 'Probability of observing this F-statistic by chance. p < 0.05 is conventionally considered statistically significant (highlighted in red).',
}

/** Tooltip bubble that appears on hover/click, positioned via fixed to avoid clipping */
function Tip({ id }: { id: string }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const text = TOOLTIPS[id]

  const updatePos = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const tipWidth = 256 // w-64 = 16rem = 256px
    let left = rect.left + rect.width / 2 - tipWidth / 2
    // Clamp to viewport edges with 8px padding
    left = Math.max(8, Math.min(left, window.innerWidth - tipWidth - 8))
    setPos({ top: rect.top - 4, left })
  }, [])

  if (!text) return null

  return (
    <span className="inline-flex">
      <button
        ref={btnRef}
        type="button"
        className="text-muted-foreground/60 hover:text-muted-foreground ml-1 transition-colors"
        onMouseEnter={() => { updatePos(); setShow(true) }}
        onMouseLeave={() => setShow(false)}
        onClick={() => { updatePos(); setShow((v) => !v) }}
        aria-label={`Help: ${id}`}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {show && pos && (
        <span
          className="bg-popover text-popover-foreground border-border fixed z-50 w-64 rounded-md border p-2 text-left text-[11px] leading-snug shadow-md"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
        >
          {text}
        </span>
      )}
    </span>
  )
}

/** Safe toFixed that handles null/undefined values gracefully */
function safeFixed(val: number | null | undefined, digits: number): string {
  if (val == null || isNaN(val)) return '-'
  return val.toFixed(digits)
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

/** Transform GageRRResult into IshikawaResult for fishbone visualization */
function grrToIshikawa(result: GageRRResult): IshikawaResult {
  const categories = [
    {
      name: 'Measurement',
      eta_squared: (result.pct_contribution_ev ?? 0) / 100,
      p_value: null,
      significant: (result.pct_contribution_ev ?? 0) > 10,
      sufficient_data: true,
      factors: [{ name: `EV (${safeFixed(result.repeatability_ev, 4)})`, sample_count: 0 }],
      detail: 'Equipment Variation (Repeatability)',
    },
    {
      name: 'Personnel',
      eta_squared: (result.pct_contribution_av ?? 0) / 100,
      p_value: null,
      significant: (result.pct_contribution_av ?? 0) > 10,
      sufficient_data: true,
      factors: [
        { name: `AV (${safeFixed(result.reproducibility_av, 4)})`, sample_count: 0 },
        ...(result.pct_contribution_interaction != null
          ? [{ name: `Interaction (${safeFixed(result.pct_contribution_interaction, 1)}%)`, sample_count: 0 }]
          : []),
      ],
      detail: 'Appraiser Variation (Reproducibility)',
    },
    {
      name: 'Material',
      eta_squared: (result.pct_contribution_pv ?? 0) / 100,
      p_value: null,
      significant: (result.pct_contribution_pv ?? 0) > 50,
      sufficient_data: true,
      factors: [{ name: `PV (${safeFixed(result.part_variation, 4)})`, sample_count: 0 }],
      detail: 'Part Variation',
    },
    // Empty categories to complete the fishbone
    { name: 'Method', eta_squared: null, p_value: null, significant: false, sufficient_data: false, factors: [], detail: '' },
    { name: 'Equipment', eta_squared: null, p_value: null, significant: false, sufficient_data: false, factors: [], detail: '' },
    { name: 'Environment', eta_squared: null, p_value: null, significant: false, sufficient_data: false, factors: [], detail: '' },
  ]

  return {
    effect: 'Measurement Variation',
    total_variance: (result.total_variation ?? 0) ** 2,
    sample_count: 0,
    categories,
    pareto: [],
    analysis_window: { start_date: null, end_date: null, limit: null },
    warnings: [],
  }
}

export function MSAResults({ result, studyId }: MSAResultsProps) {
  const verdictStyle = VERDICT_STYLES[result.verdict] ?? VERDICT_STYLES.unacceptable
  const [varianceView, setVarianceView] = useState<'bar' | 'fishbone'>('bar')

  const fishboneData = useMemo(() => grrToIshikawa(result), [result])

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
      if ((v ?? 0) <= 10) return '#22c55e'
      if ((v ?? 0) <= 30) return '#f59e0b'
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
            value: v != null && !isNaN(v) ? parseFloat(v.toFixed(2)) : 0,
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
          <span className="text-muted-foreground text-xs">
            %Study GRR ={' '}
            <Explainable metric="pct_study_grr" resourceId={studyId} resourceType="msa">
              {safeFixed(result.pct_study_grr, 1)}%
            </Explainable>
            {(result.pct_study_grr ?? 0) < 10 ? ' (\u226410%)' : (result.pct_study_grr ?? 0) <= 30 ? ' (10-30%)' : ' (>30%)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">ndc =</span>
          <Explainable metric="ndc" resourceId={studyId} resourceType="msa">
            <span
              className={cn(
                'rounded-full px-3 py-1 text-sm font-bold',
                (result.ndc ?? 0) >= 5 ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600',
              )}
            >
              {result.ndc}
            </span>
          </Explainable>
          <Tip id="ndc" />
        </div>
      </div>

      {/* Variance components chart */}
      <div className="border-border rounded-xl border p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">
            % Contribution (Variance Components)
            <Tip id="pct_contribution" />
          </h3>
          <div className="bg-muted inline-flex rounded-md p-0.5 text-xs">
            <button
              onClick={() => setVarianceView('bar')}
              className={cn(
                'rounded px-2.5 py-1 font-medium transition-colors',
                varianceView === 'bar'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Bar Chart
            </button>
            <button
              onClick={() => setVarianceView('fishbone')}
              className={cn(
                'rounded px-2.5 py-1 font-medium transition-colors',
                varianceView === 'fishbone'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Fishbone
            </button>
          </div>
        </div>
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: 200,
            visibility: varianceView === 'bar' ? ('visible' as const) : ('hidden' as const),
          }}
        />
        {varianceView === 'fishbone' && (
          <IshikawaDiagram data={fishboneData} height={280} />
        )}
      </div>

      {/* %Contribution table */}
      <div className="border-border rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-muted-foreground px-4 py-2 text-left font-medium">Source</th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">StdDev</th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                %Contribution
                <Tip id="pct_contribution" />
              </th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                %Study Var
                <Tip id="pct_study" />
              </th>
              {result.pct_tolerance_grr !== null && (
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                  P/T Ratio
                  <Tip id="pct_tolerance" />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">
                Repeatability (EV)
                <Tip id="ev" />
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{safeFixed(result.repeatability_ev, 4)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctBg(result.pct_contribution_ev ?? 0), pctClass(result.pct_contribution_ev ?? 0))}>
                {safeFixed(result.pct_contribution_ev, 2)}%
              </td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctClass(result.pct_study_ev ?? 0))}>
                <Explainable metric="pct_study_ev" resourceId={studyId} resourceType="msa">
                  {safeFixed(result.pct_study_ev, 2)}%
                </Explainable>
              </td>
              {result.pct_tolerance_grr !== null && <td className="px-4 py-2 text-right">-</td>}
            </tr>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">
                Reproducibility (AV)
                <Tip id="av" />
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{safeFixed(result.reproducibility_av, 4)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctBg(result.pct_contribution_av ?? 0), pctClass(result.pct_contribution_av ?? 0))}>
                {safeFixed(result.pct_contribution_av, 2)}%
              </td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctClass(result.pct_study_av ?? 0))}>
                <Explainable metric="pct_study_av" resourceId={studyId} resourceType="msa">
                  {safeFixed(result.pct_study_av, 2)}%
                </Explainable>
              </td>
              {result.pct_tolerance_grr !== null && <td className="px-4 py-2 text-right">-</td>}
            </tr>
            {result.pct_contribution_interaction !== null && (
              <tr className="border-border/50 border-t">
                <td className="px-4 py-2 font-medium">
                  Interaction
                  <Tip id="interaction" />
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {safeFixed(result.interaction, 4)}
                </td>
                <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctClass(result.pct_contribution_interaction ?? 0))}>
                  {safeFixed(result.pct_contribution_interaction, 2)}%
                </td>
                <td className="px-4 py-2 text-right">-</td>
                {result.pct_tolerance_grr !== null && <td className="px-4 py-2 text-right">-</td>}
              </tr>
            )}
            <tr className="border-border/50 bg-muted/30 border-t font-semibold">
              <td className="px-4 py-2">
                Gage R&amp;R (GRR)
                <Tip id="grr" />
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{safeFixed(result.gage_rr, 4)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums', pctBg(result.pct_contribution_grr ?? 0), pctClass(result.pct_contribution_grr ?? 0))}>
                {safeFixed(result.pct_contribution_grr, 2)}%
              </td>
              <td className={cn('px-4 py-2 text-right tabular-nums', pctClass(result.pct_study_grr ?? 0))}>
                <Explainable metric="pct_study_grr" resourceId={studyId} resourceType="msa">
                  {safeFixed(result.pct_study_grr, 2)}%
                </Explainable>
              </td>
              {result.pct_tolerance_grr !== null && (
                <td className={cn('px-4 py-2 text-right tabular-nums', pctClass(result.pct_tolerance_grr ?? 0))}>
                  <Explainable metric="pct_tolerance_grr" resourceId={studyId} resourceType="msa">
                    {safeFixed(result.pct_tolerance_grr, 2)}%
                  </Explainable>
                </td>
              )}
            </tr>
            <tr className="border-border/50 border-t">
              <td className="px-4 py-2 font-medium">
                Part Variation (PV)
                <Tip id="pv" />
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{safeFixed(result.part_variation, 4)}</td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctBg(result.pct_contribution_pv ?? 0), pctClass(result.pct_contribution_pv ?? 0))}>
                {safeFixed(result.pct_contribution_pv, 2)}%
              </td>
              <td className={cn('px-4 py-2 text-right tabular-nums font-medium', pctClass(result.pct_study_pv ?? 0))}>
                {safeFixed(result.pct_study_pv, 2)}%
              </td>
              {result.pct_tolerance_grr !== null && <td className="px-4 py-2 text-right">-</td>}
            </tr>
            <tr className="border-border/50 bg-muted/30 border-t font-semibold">
              <td className="px-4 py-2">Total Variation (TV)</td>
              <td className="px-4 py-2 text-right tabular-nums">{safeFixed(result.total_variation, 4)}</td>
              <td className="px-4 py-2 text-right tabular-nums">100.00%</td>
              <td className="px-4 py-2 text-right tabular-nums">100.00%</td>
              {result.pct_tolerance_grr !== null && <td className="px-4 py-2 text-right">-</td>}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ANOVA table (crossed ANOVA only) */}
      {result.anova_table && (
        <div className="border-border rounded-xl border">
          <div className="bg-muted/50 border-border border-b px-4 py-2">
            <h3 className="text-sm font-medium">
              ANOVA Table
              <Tip id="anova" />
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">Source</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                  SS<Tip id="ss" />
                </th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                  df<Tip id="df" />
                </th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                  MS<Tip id="ms" />
                </th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                  F<Tip id="f_stat" />
                </th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">
                  p-value<Tip id="p_value" />
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.anova_table).map(([source, row]) => (
                <tr key={source} className="border-border/50 border-t">
                  <td className="px-4 py-2 font-medium capitalize">{source.replace('_', ' x ')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{safeFixed(row.SS, 6)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{row.df ?? '-'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{safeFixed(row.MS, 6)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.F != null && ['operator', 'part', 'interaction'].includes(source) ? (
                      <Explainable metric={`f_${source}`} resourceId={studyId} resourceType="msa">
                        {safeFixed(row.F, 4)}
                      </Explainable>
                    ) : safeFixed(row.F, 4)}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-2 text-right tabular-nums',
                      row.p != null && row.p < 0.05 && 'font-medium text-red-600',
                    )}
                  >
                    {safeFixed(row.p, 4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* GRR% Confidence Interval */}
      {result.grr_ci_lower != null && result.grr_ci_upper != null && (
        <div className="border-border rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">%Study GRR Confidence Interval</h3>
              <p className="text-muted-foreground text-xs">
                95% CI via Satterthwaite approximation
                {result.grr_ci_df != null && ` (df = ${result.grr_ci_df.toFixed(1)})`}
              </p>
            </div>
            <Explainable metric="grr_ci" resourceId={studyId} resourceType="msa">
              <span className="text-foreground text-sm font-medium tabular-nums">
                [{result.grr_ci_lower.toFixed(2)}%, {result.grr_ci_upper.toFixed(2)}%]
              </span>
            </Explainable>
          </div>
        </div>
      )}

      {/* By-operator charts */}
      {result.operator_data && result.operator_data.length > 0 && (
        <OperatorCharts
          operatorData={result.operator_data}
          pctContributionEv={result.pct_contribution_ev}
          pctContributionAv={result.pct_contribution_av}
          pctContributionGrr={result.pct_contribution_grr}
          pctContributionPv={result.pct_contribution_pv}
        />
      )}

      {/* Interpretation guide */}
      <div className="bg-muted/30 rounded-lg p-4 text-xs">
        <p className="mb-1 font-medium">Interpretation Guide (AIAG MSA 4th Ed)</p>
        <ul className="text-muted-foreground space-y-0.5">
          <li><strong>%Study GRR &le; 10%</strong> = Acceptable measurement system</li>
          <li><strong>%Study GRR 10-30%</strong> = Marginal, may be acceptable depending on application</li>
          <li><strong>%Study GRR &gt; 30%</strong> = Unacceptable, corrective action needed</li>
          <li><strong>P/T Ratio &le; 10%</strong> = Gage variation is small relative to tolerance</li>
          <li><strong>ndc &ge; 5</strong> = Measurement system can distinguish at least 5 categories of parts</li>
          <li className="pt-1 italic">Verdict is determined by %Study GRR. ndc &lt; 5 indicates insufficient discrimination regardless of %GRR.</li>
        </ul>
      </div>
    </div>
  )
}
