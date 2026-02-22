import { cn } from '@/lib/utils'
import type { AttributeMSAResult } from '@/api/client'

interface AttributeMSAResultsProps {
  result: AttributeMSAResult
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  acceptable: { bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400', label: 'Acceptable' },
  marginal: { bg: 'bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400', label: 'Marginal' },
  unacceptable: { bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400', label: 'Unacceptable' },
}

/** Color for an agreement percentage */
function agreePctClass(pct: number): string {
  if (pct >= 90) return 'text-green-600 dark:text-green-400'
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

/** Color for a kappa value */
function kappaClass(k: number): string {
  if (k >= 0.75) return 'text-green-600 dark:text-green-400'
  if (k >= 0.40) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function kappaBg(k: number): string {
  if (k >= 0.75) return 'bg-green-500/10'
  if (k >= 0.40) return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

export function AttributeMSAResults({ result }: AttributeMSAResultsProps) {
  const verdictStyle = VERDICT_STYLES[result.verdict] ?? VERDICT_STYLES.unacceptable

  return (
    <div className="space-y-6">
      {/* Verdict banner */}
      <div className="flex items-center justify-between gap-4">
        <div className={cn('flex items-center gap-3 rounded-lg px-4 py-3', verdictStyle.bg)}>
          <span className={cn('text-lg font-bold', verdictStyle.text)}>
            {verdictStyle.label}
          </span>
          <span className="text-muted-foreground text-sm">Attribute Agreement Analysis</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Fleiss' Kappa =</span>
          <span
            className={cn(
              'rounded-full px-3 py-1 text-sm font-bold',
              kappaBg(result.fleiss_kappa),
              kappaClass(result.fleiss_kappa),
            )}
          >
            {result.fleiss_kappa.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Within-appraiser agreement */}
      <div className="border-border overflow-hidden rounded-xl border">
        <div className="bg-muted/50 border-border border-b px-4 py-2">
          <h3 className="text-sm font-medium">Within-Appraiser Agreement</h3>
          <p className="text-muted-foreground text-xs">
            Percentage of times each appraiser agreed with themselves across replicates
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-muted-foreground px-4 py-2 text-left font-medium">Appraiser</th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">Agreement %</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(result.within_appraiser).map(([name, pct]) => (
              <tr key={name} className="border-border/50 border-t">
                <td className="px-4 py-2 font-medium">{name}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums font-medium', agreePctClass(pct))}>
                  {pct.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Between-appraiser agreement */}
      <div className="border-border rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Between-Appraiser Agreement</h3>
            <p className="text-muted-foreground text-xs">
              Percentage of parts where all appraisers agreed on every replicate
            </p>
          </div>
          <span
            className={cn(
              'rounded-lg px-4 py-2 text-lg font-bold',
              agreePctClass(result.between_appraiser),
              result.between_appraiser >= 90 ? 'bg-green-500/10' : result.between_appraiser >= 70 ? 'bg-amber-500/10' : 'bg-red-500/10',
            )}
          >
            {result.between_appraiser.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Vs Reference (if available) */}
      {result.vs_reference && Object.keys(result.vs_reference).length > 0 && (
        <div className="border-border overflow-hidden rounded-xl border">
          <div className="bg-muted/50 border-border border-b px-4 py-2">
            <h3 className="text-sm font-medium">Appraiser vs Reference</h3>
            <p className="text-muted-foreground text-xs">
              Agreement between each appraiser and the known reference decisions
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">Appraiser</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">vs Reference %</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.vs_reference).map(([name, pct]) => (
                <tr key={name} className="border-border/50 border-t">
                  <td className="px-4 py-2 font-medium">{name}</td>
                  <td className={cn('px-4 py-2 text-right tabular-nums font-medium', agreePctClass(pct))}>
                    {pct.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cohen's Kappa pairwise */}
      <div className="border-border overflow-hidden rounded-xl border">
        <div className="bg-muted/50 border-border border-b px-4 py-2">
          <h3 className="text-sm font-medium">Cohen's Kappa (Pairwise)</h3>
          <p className="text-muted-foreground text-xs">
            Inter-rater agreement between each pair of appraisers
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30">
              <th className="text-muted-foreground px-4 py-2 text-left font-medium">Pair</th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">Kappa</th>
              <th className="text-muted-foreground px-4 py-2 text-right font-medium">Strength</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(result.cohens_kappa_pairs).map(([pair, kappa]) => (
              <tr key={pair} className="border-border/50 border-t">
                <td className="px-4 py-2 font-medium">{pair}</td>
                <td className={cn('px-4 py-2 text-right tabular-nums font-medium', kappaClass(kappa))}>
                  {kappa.toFixed(4)}
                </td>
                <td className={cn('px-4 py-2 text-right text-xs', kappaClass(kappa))}>
                  {kappa >= 0.75
                    ? 'Excellent'
                    : kappa >= 0.40
                      ? 'Moderate'
                      : 'Poor'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fleiss' Kappa display */}
      <div className="border-border rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Fleiss' Kappa (Overall)</h3>
            <p className="text-muted-foreground text-xs">
              Multi-rater agreement statistic accounting for chance agreement
            </p>
          </div>
          <span
            className={cn(
              'rounded-lg px-4 py-2 text-lg font-bold',
              kappaBg(result.fleiss_kappa),
              kappaClass(result.fleiss_kappa),
            )}
          >
            {result.fleiss_kappa.toFixed(4)}
          </span>
        </div>
      </div>

      {/* Interpretation guide */}
      <div className="bg-muted/30 rounded-lg p-4 text-xs">
        <p className="mb-1 font-medium">Interpretation Guide</p>
        <ul className="text-muted-foreground space-y-0.5">
          <li>Kappa &ge; 0.75 = Excellent agreement</li>
          <li>Kappa 0.40-0.75 = Moderate agreement, investigate sources of disagreement</li>
          <li>Kappa &lt; 0.40 = Poor agreement, measurement system needs improvement</li>
          <li>Within-appraiser &ge; 90% indicates consistent individual decisions</li>
          <li>Between-appraiser &ge; 90% indicates good cross-appraiser consistency</li>
        </ul>
      </div>
    </div>
  )
}
