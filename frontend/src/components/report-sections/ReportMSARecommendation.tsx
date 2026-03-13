import { useMSAResults } from '@/api/hooks/msa'
import { ClipboardCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GageRRResult, AttributeMSAResult } from '@/api/types'

interface ReportMSARecommendationProps {
  studyId?: number
}

function getVariableRecommendations(r: GageRRResult): string[] {
  const recommendations: string[] = []

  if (r.verdict === 'acceptable') {
    recommendations.push(
      'The measurement system is acceptable for use. Continue routine monitoring with periodic re-evaluation.',
    )
    return recommendations
  }

  // Identify dominant error source
  const evDominant = r.pct_study_ev > r.pct_study_av

  if (evDominant) {
    recommendations.push(
      'Repeatability (equipment variation) is the dominant error source. Focus improvement efforts on the gage itself.',
    )
    recommendations.push(
      'Consider gage maintenance, calibration, or replacement with a higher-resolution instrument.',
    )
    recommendations.push(
      'Verify the fixture holds parts consistently and reduces positional variation.',
    )
  } else {
    recommendations.push(
      'Reproducibility (appraiser variation) is the dominant error source. Focus improvement efforts on operator training and procedures.',
    )
    recommendations.push(
      'Standardize measurement procedures with clear work instructions and visual aids.',
    )
    recommendations.push(
      'Train all operators on consistent technique and verify with a follow-up study.',
    )
  }

  if (r.verdict === 'marginal') {
    recommendations.push(
      'The measurement system may be acceptable depending on the application criticality and cost of improvement.',
    )
  } else {
    recommendations.push(
      'The measurement system is unacceptable and must be improved before use for production decisions.',
    )
  }

  if (r.ndc < 5) {
    recommendations.push(
      `NDC of ${r.ndc} is below the AIAG minimum of 5. The gage lacks sufficient resolution to distinguish between parts.`,
    )
  }

  return recommendations
}

function getAttributeRecommendations(r: AttributeMSAResult): string[] {
  const recommendations: string[] = []

  if (r.verdict === 'acceptable') {
    recommendations.push(
      'The attribute measurement system shows acceptable agreement. Continue routine monitoring.',
    )
    return recommendations
  }

  if (r.fleiss_kappa < 0.40) {
    recommendations.push(
      `Fleiss' kappa of ${r.fleiss_kappa.toFixed(3)} indicates poor overall agreement. The inspection criteria may be ambiguous or poorly defined.`,
    )
    recommendations.push(
      'Revise acceptance criteria with clear, objective definitions and boundary samples.',
    )
  } else if (r.fleiss_kappa < 0.75) {
    recommendations.push(
      `Fleiss' kappa of ${r.fleiss_kappa.toFixed(3)} indicates marginal agreement. Some improvement in consistency is needed.`,
    )
  }

  // Check within-appraiser consistency for weak operators
  const weakOperators = Object.entries(r.within_appraiser).filter(
    ([, kappa]) => kappa < 0.40,
  )
  if (weakOperators.length > 0) {
    const names = weakOperators.map(([name]) => name).join(', ')
    recommendations.push(
      `Operators with poor self-consistency: ${names}. Provide targeted training on inspection criteria.`,
    )
  }

  recommendations.push(
    'Consider creating reference standards or limit samples to improve consistency across all appraisers.',
  )

  return recommendations
}

export function ReportMSARecommendation({ studyId }: ReportMSARecommendationProps) {
  const { data: results, isLoading, isError } = useMSAResults(studyId ?? 0)

  if (!studyId) return null

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck className="h-5 w-5" />
          Recommendations
        </h2>
        <p className="text-muted-foreground text-sm">Loading results...</p>
      </div>
    )
  }

  if (isError || !results) return null

  const isVariable = 'repeatability_ev' in results
  const recommendations = isVariable
    ? getVariableRecommendations(results as GageRRResult)
    : 'fleiss_kappa' in results
      ? getAttributeRecommendations(results as AttributeMSAResult)
      : []

  if (recommendations.length === 0) return null

  const verdict = 'verdict' in results ? (results as { verdict: string }).verdict : 'unknown'
  const verdictColor =
    verdict === 'acceptable'
      ? 'border-success/30'
      : verdict === 'marginal'
        ? 'border-warning/30'
        : 'border-destructive/30'

  return (
    <div className={cn('border-border rounded-lg border p-4', verdictColor)}>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <ClipboardCheck className="h-5 w-5" />
        Recommendations
      </h2>

      <ul className="space-y-2">
        {recommendations.map((rec, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className="text-muted-foreground mt-0.5 shrink-0">&#8226;</span>
            <span>{rec}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
