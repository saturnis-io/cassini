import { useMSAResults } from '@/api/hooks/msa'
import { Microscope, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GageRRResult } from '@/api/types'

interface ReportMSAResolutionProps {
  studyId?: number
}

function ndcAssessment(ndc: number) {
  if (ndc >= 5)
    return {
      icon: CheckCircle2,
      color: 'text-success',
      bg: 'bg-success/10',
      label: 'Adequate',
    }
  if (ndc >= 3)
    return {
      icon: AlertTriangle,
      color: 'text-warning',
      bg: 'bg-warning/10',
      label: 'Marginal',
    }
  return {
    icon: XCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10',
    label: 'Inadequate',
  }
}

export function ReportMSAResolution({ studyId }: ReportMSAResolutionProps) {
  const { data: results, isLoading, isError } = useMSAResults(studyId ?? 0)

  if (!studyId) return null

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Microscope className="h-5 w-5" />
          Measurement Resolution
        </h2>
        <p className="text-muted-foreground text-sm">Loading results...</p>
      </div>
    )
  }

  if (isError || !results || !('ndc' in results)) return null

  const r = results as GageRRResult
  const assessment = ndcAssessment(r.ndc)
  const AssessmentIcon = assessment.icon

  const interpretation =
    r.ndc >= 5
      ? `The measurement system can reliably distinguish ${r.ndc} distinct categories of parts. This meets the AIAG requirement of at least 5 categories, indicating the gage has sufficient resolution for this application.`
      : r.ndc >= 3
        ? `The measurement system can only distinguish ${r.ndc} distinct categories of parts. The AIAG guideline recommends at least 5 categories. With ${r.ndc} categories, the gage may be marginally acceptable for some applications but should be improved for critical measurements.`
        : `The measurement system can only distinguish ${r.ndc} distinct ${r.ndc === 1 ? 'category' : 'categories'} of parts. This is well below the AIAG minimum of 5 categories, meaning the gage cannot adequately differentiate between parts. The measurement system requires significant improvement before use.`

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Microscope className="h-5 w-5" />
        Measurement Resolution
      </h2>

      <div className={cn('mb-4 flex items-center gap-3 rounded-lg p-4', assessment.bg)}>
        <AssessmentIcon className={cn('h-6 w-6', assessment.color)} />
        <div>
          <div className={cn('text-lg font-bold', assessment.color)}>
            NDC = {r.ndc}
          </div>
          <div className={cn('text-sm font-medium', assessment.color)}>
            {assessment.label}
          </div>
        </div>
      </div>

      <p className="text-muted-foreground text-sm leading-relaxed">{interpretation}</p>
    </div>
  )
}
