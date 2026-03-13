import { usePlantContext } from '@/providers/PlantProvider'
import { useLicense } from '@/hooks/useLicense'
import { useMSAStudies, useMSAResults } from '@/api/hooks'
import { Microscope, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ReportMeasurementSystemHealthProps {
  characteristicId?: number
}

export function ReportMeasurementSystemHealth({
  characteristicId,
}: ReportMeasurementSystemHealthProps) {
  const { isCommercial } = useLicense()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const { data: studies, isLoading } = useMSAStudies(
    isCommercial ? plantId : 0,
    'completed',
  )

  if (!isCommercial) return null
  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Microscope className="h-5 w-5" />
          Measurement System Health
        </h2>
        <p className="text-muted-foreground text-sm">Loading MSA data...</p>
      </div>
    )
  }

  // Filter studies by characteristic if provided
  const relevantStudies = characteristicId
    ? (studies ?? []).filter((s) => s.characteristic_id === characteristicId)
    : (studies ?? [])

  const MAX_STUDIES = 5
  const displayStudies = relevantStudies.slice(0, MAX_STUDIES)
  const remaining = relevantStudies.length - displayStudies.length

  if (relevantStudies.length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Microscope className="h-5 w-5" />
          Measurement System Health
        </h2>
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <Microscope className="text-muted-foreground/40 h-8 w-8" />
          <p className="text-muted-foreground text-sm">
            No completed MSA studies found{characteristicId ? ' for this characteristic' : ''}
          </p>
          <p className="text-muted-foreground/70 text-xs">
            Complete a Gage R&amp;R or attribute MSA study to see results here
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Microscope className="h-5 w-5" />
        Measurement System Health
      </h2>

      <div className="space-y-3">
        {displayStudies.map((study) => (
          <MSAStudySummary key={study.id} studyId={study.id} studyName={study.name} />
        ))}
        {remaining > 0 && (
          <p className="text-muted-foreground text-xs">
            +{remaining} more completed {remaining === 1 ? 'study' : 'studies'} not shown
          </p>
        )}
      </div>
    </div>
  )
}

function MSAStudySummary({ studyId, studyName }: { studyId: number; studyName: string }) {
  const { data: results } = useMSAResults(studyId)

  if (!results) return null

  // Handle both gage_rr and attribute results
  const gageRR = 'pct_study_grr' in results ? results : null
  if (!gageRR) {
    // Attribute MSA — show verdict only
    const verdict = 'verdict' in results ? (results as { verdict: string }).verdict : 'Unknown'
    return (
      <div className="bg-muted/30 rounded-md p-3">
        <div className="mb-1 text-sm font-medium">{studyName}</div>
        <div className="text-muted-foreground text-xs">
          Attribute study — Verdict: {verdict}
        </div>
      </div>
    )
  }

  const pctStudyGRR = gageRR.pct_study_grr
  const pctToleranceGRR = gageRR.pct_tolerance_grr
  const ndc = gageRR.ndc
  const verdict = gageRR.verdict

  // AIAG thresholds
  const grrLevel =
    pctStudyGRR < 10 ? 'good' : pctStudyGRR <= 30 ? 'warning' : 'critical'
  const tolLevel =
    pctToleranceGRR != null
      ? pctToleranceGRR < 10
        ? 'good'
        : pctToleranceGRR <= 30
          ? 'warning'
          : 'critical'
      : null

  const levelConfig = {
    good: { icon: CheckCircle2, color: 'text-success', label: 'Acceptable' },
    warning: { icon: AlertTriangle, color: 'text-warning', label: 'Marginal' },
    critical: { icon: XCircle, color: 'text-destructive', label: 'Unacceptable' },
  }

  const cfg = levelConfig[grrLevel]
  const VerdictIcon = cfg.icon

  return (
    <div className="bg-muted/30 rounded-md p-3">
      <div className="mb-2 flex items-center gap-2">
        <VerdictIcon className={cn('h-4 w-4', cfg.color)} />
        <span className="text-sm font-medium">{studyName}</span>
        <span className={cn('text-xs font-medium', cfg.color)}>{verdict || cfg.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        <div>
          <span className="text-muted-foreground">%Study GRR:</span>{' '}
          <span className={cn('font-medium', levelConfig[grrLevel].color)}>
            {pctStudyGRR.toFixed(1)}%
          </span>
        </div>
        {pctToleranceGRR != null && tolLevel && (
          <div>
            <span className="text-muted-foreground">%Tolerance GRR:</span>{' '}
            <span className={cn('font-medium', levelConfig[tolLevel].color)}>
              {pctToleranceGRR.toFixed(1)}%
            </span>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">NDC:</span>{' '}
          <span className={cn('font-medium', ndc >= 5 ? 'text-success' : 'text-warning')}>
            {ndc}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">EV/AV:</span>{' '}
          <span className="font-medium">
            {gageRR.pct_contribution_ev.toFixed(1)}% / {gageRR.pct_contribution_av.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}
