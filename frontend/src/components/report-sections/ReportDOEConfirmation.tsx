import { useDOEAnalysis } from '@/api/hooks/doe'
import { cn } from '@/lib/utils'
import { CheckCircle2, AlertTriangle } from 'lucide-react'

interface ReportDOEConfirmationProps {
  studyId?: number
}

// Extended type to account for regression data the API returns
interface RegressionData {
  optimal_settings?: Record<string, number> | null
  r_squared?: number
}

function assessModelQuality(rSquared: number): {
  label: string
  level: 'good' | 'adequate' | 'poor'
} {
  if (rSquared >= 0.9) return { label: 'Excellent', level: 'good' }
  if (rSquared >= 0.7) return { label: 'Adequate', level: 'adequate' }
  return { label: 'Poor', level: 'poor' }
}

export function ReportDOEConfirmation({ studyId }: ReportDOEConfirmationProps) {
  const { data: analysis } = useDOEAnalysis(studyId ?? 0)

  if (!analysis) return null

  const { label: qualityLabel, level: qualityLevel } = assessModelQuality(analysis.r_squared)

  const totalFactors = analysis.anova_table.filter(
    (row) => row.source !== 'Residual' && row.source !== 'Total',
  ).length
  const significantFactors = analysis.anova_table.filter(
    (row) =>
      row.p_value != null &&
      row.p_value < 0.05 &&
      row.source !== 'Residual' &&
      row.source !== 'Total',
  ).length

  const regression = (analysis as { regression?: RegressionData | null }).regression
  const hasOptimalSettings =
    regression?.optimal_settings != null &&
    Object.keys(regression.optimal_settings).length > 0

  const Icon = qualityLevel === 'poor' ? AlertTriangle : CheckCircle2
  const iconColor =
    qualityLevel === 'good'
      ? 'text-success'
      : qualityLevel === 'adequate'
        ? 'text-warning'
        : 'text-destructive'

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Icon className={cn('h-5 w-5', iconColor)} />
        Model Confirmation
      </h2>

      <div className="space-y-3">
        {/* Model quality */}
        <div className="bg-muted/30 rounded-md p-3">
          <div className="mb-1 text-sm font-medium">Model Quality</div>
          <p className="text-sm">
            The model explains{' '}
            <span className={cn('font-mono font-bold', iconColor)}>
              {(analysis.r_squared * 100).toFixed(1)}%
            </span>{' '}
            of the variation in the response (R²). This is rated as{' '}
            <span
              className={cn(
                'font-bold',
                qualityLevel === 'good'
                  ? 'text-success'
                  : qualityLevel === 'adequate'
                    ? 'text-warning'
                    : 'text-destructive',
              )}
            >
              {qualityLabel.toLowerCase()}
            </span>
            .
            {qualityLevel === 'poor' &&
              ' Consider adding more factors, center points, or checking for measurement error.'}
          </p>
        </div>

        {/* Significant factors */}
        <div className="bg-muted/30 rounded-md p-3">
          <div className="mb-1 text-sm font-medium">Significant Factors</div>
          <p className="text-sm">
            <span className="font-mono font-bold">{significantFactors}</span> of{' '}
            <span className="font-mono font-bold">{totalFactors}</span>{' '}
            {totalFactors === 1 ? 'source is' : 'sources are'} statistically significant (p &lt;
            0.05).
            {significantFactors === 0 &&
              ' No factors showed a statistically significant effect on the response.'}
          </p>
        </div>

        {/* Predicted response at optimal settings */}
        {hasOptimalSettings && analysis.grand_mean != null && (
          <div className="bg-muted/30 rounded-md p-3">
            <div className="mb-1 text-sm font-medium">Predicted Response at Optimal Settings</div>
            <p className="text-sm">
              The grand mean of the response is{' '}
              <span className="font-mono font-bold">{analysis.grand_mean.toFixed(4)}</span>.
              Optimal factor settings have been identified via response surface modeling.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
