import { usePlantContext } from '@/providers/PlantProvider'
import { useLicense } from '@/hooks/useLicense'
import { useDOEStudies, useDOEAnalysis } from '@/api/hooks'
import { FlaskConical, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReportDOEFindingsProps {
  characteristicId?: number
}

export function ReportDOEFindings({ characteristicId: _characteristicId }: ReportDOEFindingsProps) {
  const { isCommercial } = useLicense()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const { data: studies, isLoading } = useDOEStudies(
    isCommercial ? plantId : 0,
    'analyzed',
  )

  if (!isCommercial) return null
  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <FlaskConical className="h-5 w-5" />
          DOE Findings
        </h2>
        <p className="text-muted-foreground text-sm">Loading DOE data...</p>
      </div>
    )
  }

  const MAX_STUDIES = 5
  const analyzedStudies = studies ?? []
  const displayStudies = analyzedStudies.slice(0, MAX_STUDIES)
  const remaining = analyzedStudies.length - displayStudies.length

  if (analyzedStudies.length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <FlaskConical className="h-5 w-5" />
          DOE Findings
        </h2>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <FlaskConical className="text-muted-foreground/40 h-8 w-8" />
          <p className="text-muted-foreground text-sm">No analyzed DOE studies found</p>
          <p className="text-muted-foreground/70 text-xs">
            Run and analyze a DOE study to see findings here
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <FlaskConical className="h-5 w-5" />
        DOE Findings
      </h2>

      <div className="space-y-3">
        {displayStudies.map((study) => (
          <DOEStudySummary key={study.id} studyId={study.id} studyName={study.name} />
        ))}
        {remaining > 0 && (
          <p className="text-muted-foreground text-xs">
            +{remaining} more analyzed {remaining === 1 ? 'study' : 'studies'} not shown
          </p>
        )}
      </div>
    </div>
  )
}

function DOEStudySummary({ studyId, studyName }: { studyId: number; studyName: string }) {
  const { data: analysis } = useDOEAnalysis(studyId)

  if (!analysis) return null

  const significantFactors = analysis.anova_table.filter(
    (row) => row.p_value != null && row.p_value < 0.05 && row.source !== 'Residual' && row.source !== 'Total',
  )

  const topEffects = [...analysis.effects]
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect))
    .slice(0, 3)

  const rSquared = analysis.r_squared
  const rSquaredLevel = rSquared >= 0.9 ? 'good' : rSquared >= 0.7 ? 'warning' : 'critical'

  return (
    <div className="bg-muted/30 rounded-md p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">{studyName}</span>
        <span
          className={cn(
            'text-xs font-medium',
            rSquaredLevel === 'good'
              ? 'text-success'
              : rSquaredLevel === 'warning'
                ? 'text-warning'
                : 'text-destructive',
          )}
        >
          R² = {(rSquared * 100).toFixed(1)}%
        </span>
      </div>

      {/* Significant factors */}
      {significantFactors.length > 0 ? (
        <div className="mb-2">
          <span className="text-muted-foreground text-xs">Significant factors (p &lt; 0.05):</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {significantFactors.map((row) => (
              <span
                key={row.source}
                className="bg-success/10 text-success border-success/30 rounded border px-1.5 py-0.5 text-xs font-medium"
              >
                {row.source} (p = {row.p_value!.toFixed(4)})
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-2 flex items-center gap-1 text-xs">
          <AlertTriangle className="text-warning h-3 w-3" />
          <span className="text-muted-foreground">No statistically significant factors found</span>
        </div>
      )}

      {/* Top effects */}
      {topEffects.length > 0 && (
        <div>
          <span className="text-muted-foreground text-xs">Top effects:</span>
          <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
            {topEffects.map((eff) => (
              <div key={eff.factor_name} className="flex items-center gap-1">
                <CheckCircle2 className="text-muted-foreground h-3 w-3" />
                <span className="font-medium">{eff.factor_name}:</span>{' '}
                <span>{eff.effect > 0 ? '+' : ''}{eff.effect.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
