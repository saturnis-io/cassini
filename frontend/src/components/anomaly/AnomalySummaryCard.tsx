import { cn } from '@/lib/utils'
import { useAnomalySummary, useTriggerAnalysis } from '@/api/hooks'
import { Sparkles, Play, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react'

interface AnomalySummaryCardProps {
  characteristicId: number
  className?: string
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-500',
  WARNING: 'text-amber-500',
  INFO: 'text-blue-500',
}

const STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  active: { dot: 'bg-green-500', text: 'text-green-500' },
  warning: { dot: 'bg-amber-500', text: 'text-amber-500' },
  inactive: { dot: 'bg-muted-foreground', text: 'text-muted-foreground' },
}

function getDetectorStatusColor(
  detector: { enabled: boolean; events_last_24h: number },
): { dot: string; text: string } {
  if (!detector.enabled) return STATUS_COLORS.inactive
  if (detector.events_last_24h > 0) return STATUS_COLORS.warning
  return STATUS_COLORS.active
}

export function AnomalySummaryCard({ characteristicId, className }: AnomalySummaryCardProps) {
  const { data: summary, isLoading, isError } = useAnomalySummary(characteristicId)
  const triggerAnalysis = useTriggerAnalysis()

  if (isLoading) {
    return (
      <div className={cn('animate-pulse rounded-lg border border-border bg-card p-4', className)}>
        <div className="bg-muted h-4 w-32 rounded" />
        <div className="bg-muted mt-2 h-3 w-full rounded" />
      </div>
    )
  }

  if (isError || !summary) {
    return (
      <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          Anomaly detection not configured {/* TODO: i18n */}
        </div>
      </div>
    )
  }

  // Determine worst severity from active anomalies
  const worstSeverity = summary.active_anomalies > 0 ? 'WARNING' : 'INFO'

  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            AI Anomaly Summary {/* TODO: i18n */}
          </h3>
        </div>

        {/* Active anomaly count */}
        {summary.active_anomalies > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
              worstSeverity === 'CRITICAL'
                ? 'bg-red-500/15 text-red-500'
                : worstSeverity === 'WARNING'
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-blue-500/15 text-blue-500',
            )}
          >
            {worstSeverity === 'CRITICAL' ? (
              <AlertTriangle className="h-2.5 w-2.5" />
            ) : worstSeverity === 'WARNING' ? (
              <AlertCircle className="h-2.5 w-2.5" />
            ) : (
              <Info className="h-2.5 w-2.5" />
            )}
            {summary.active_anomalies} active
          </span>
        )}

        {summary.active_anomalies === 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] text-green-500">
            <CheckCircle2 className="h-3 w-3" />
            No anomalies
          </span>
        )}
      </div>

      {/* Summary text */}
      <div className="px-4 py-3">
        <p className="text-xs leading-relaxed text-foreground/80">
          {summary.latest_summary || 'No analysis results available yet.'}
        </p>
      </div>

      {/* Detector status */}
      <div className="flex items-center gap-4 border-t border-border/50 px-4 py-2">
        {summary.detectors.map((det) => {
          const statusColor = getDetectorStatusColor(det)
          return (
            <div key={det.detector_type} className="flex items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 rounded-full', statusColor.dot)} />
              <span className={cn('text-[10px]', statusColor.text)}>
                {det.detector_type === 'pelt'
                  ? 'PELT'
                  : det.detector_type === 'isolation_forest'
                    ? 'IForest'
                    : 'K-S'}
              </span>
              {det.events_last_24h > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  ({det.events_last_24h})
                </span>
              )}
            </div>
          )
        })}

        <div className="flex-1" />

        {/* Trigger analysis button */}
        <button
          onClick={() => triggerAnalysis.mutate(characteristicId)}
          disabled={triggerAnalysis.isPending}
          className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <Play className="h-2.5 w-2.5" />
          {triggerAnalysis.isPending ? 'Running...' : 'Run Analysis'}
        </button>
      </div>

      {/* Last analysis timestamp */}
      {summary.last_analysis_at && (
        <div className="border-t border-border/30 px-4 py-1">
          <span className="text-[10px] text-muted-foreground">
            Last analysis: {new Date(summary.last_analysis_at).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  )
}
