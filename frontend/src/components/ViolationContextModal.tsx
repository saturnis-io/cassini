import { useState, useMemo } from 'react'
import { X, AlertTriangle, Clock, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { ChartPanel } from '@/components/ChartPanel'
import { useSample, useCharacteristic, useAcknowledgeViolation } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { canPerformAction } from '@/lib/roles'
import { NELSON_RULES } from '@/components/ViolationLegend'
import { getMeasurementValues, StatCard, MiniBarChart } from '@/components/sample-inspector/shared'
import type { Severity } from '@/types'

interface ViolationContextModalProps {
  sampleId: number
  characteristicId: number
  violationId: number
  ruleId: number
  ruleName: string
  severity: Severity
  characteristicName: string | null
  hierarchyPath: string | null
  createdAt: string | null
  acknowledged: boolean
  requiresAcknowledgement: boolean
  onClose: () => void
  onAcknowledged?: () => void
}

export function ViolationContextModal({
  sampleId,
  characteristicId,
  violationId,
  ruleId,
  ruleName,
  severity,
  characteristicName,
  hierarchyPath,
  createdAt,
  acknowledged,
  requiresAcknowledgement,
  onClose,
  onAcknowledged,
}: ViolationContextModalProps) {
  const { user, role } = useAuth()
  const { formatDate, formatDateTime } = useDateFormat()
  const { data: sample } = useSample(sampleId)
  const { data: characteristic } = useCharacteristic(characteristicId)
  const acknowledgeMutation = useAcknowledgeViolation()

  const [ackReason, setAckReason] = useState('')
  const [showAckForm, setShowAckForm] = useState(false)

  const canAck =
    canPerformAction(role, 'violations:acknowledge') &&
    !acknowledged &&
    requiresAcknowledgement

  const precision = characteristic?.decimal_precision ?? 4

  const measurementValues = useMemo(() => (sample ? getMeasurementValues(sample) : []), [sample])
  const measurementStats = useMemo(() => {
    if (measurementValues.length === 0) return null
    const min = Math.min(...measurementValues)
    const max = Math.max(...measurementValues)
    return {
      min,
      max,
      range: max - min,
      mean: measurementValues.reduce((a, b) => a + b, 0) / measurementValues.length,
      count: measurementValues.length,
    }
  }, [measurementValues])

  const handleAcknowledge = () => {
    if (!ackReason.trim()) return
    acknowledgeMutation.mutate(
      {
        id: violationId,
        reason: ackReason.trim(),
        user: user?.username ?? 'Unknown',
      },
      {
        onSuccess: () => {
          setAckReason('')
          setShowAckForm(false)
          onAcknowledged?.()
        },
      },
    )
  }

  const getSeverityStyle = (sev: Severity) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-destructive/10 text-destructive border-destructive/20'
      case 'WARNING':
        return 'bg-warning/10 text-warning border-warning/20'
      default:
        return 'bg-primary/10 text-primary border-primary/20'
    }
  }

  const ruleDisplay = NELSON_RULES[ruleId]?.name || ruleName

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="bg-card border-border relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border shadow-2xl">
        {/* Header */}
        <div className="border-border bg-muted/30 flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={cn(
                  'h-5 w-5',
                  severity === 'CRITICAL' ? 'text-destructive' : 'text-warning',
                )}
              />
              <h2 className="text-lg font-semibold">Violation Context</h2>
            </div>
            <span
              className={cn(
                'rounded border px-2 py-0.5 text-xs font-medium',
                getSeverityStyle(severity),
              )}
            >
              {severity}
            </span>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg p-1.5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Violation info bar */}
        <div className="border-border bg-muted/20 grid grid-cols-2 gap-4 border-b px-5 py-3 sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground text-xs">Rule</div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold',
                  severity === 'CRITICAL'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-warning/10 text-warning',
                )}
              >
                {ruleId}
              </span>
              {ruleDisplay}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Characteristic</div>
            <div className="truncate text-sm font-medium">
              {characteristicName || 'Unknown'}
            </div>
            {hierarchyPath && (
              <div className="text-muted-foreground truncate text-xs">{hierarchyPath}</div>
            )}
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Time</div>
            <div className="text-sm font-medium">
              {createdAt ? (
                <>
                  {formatDate(createdAt)}{' '}
                  <span className="text-muted-foreground">
                    {new Date(createdAt).toLocaleTimeString()}
                  </span>
                </>
              ) : (
                '-'
              )}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Value</div>
            <div className="font-mono text-sm font-bold tabular-nums">
              {sample ? sample.mean.toFixed(precision) : '...'}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="border-border min-h-0 flex-1 border-b p-4">
          <div className="h-72">
            {characteristicId > 0 && (
              <ChartPanel
                characteristicId={characteristicId}
                chartOptions={{ limit: 50 }}
                histogramPosition="hidden"
                highlightSampleId={sampleId}
              />
            )}
          </div>
        </div>

        {/* Sample details + measurements breakdown */}
        {sample && (
          <div className="border-border overflow-y-auto border-b px-5 py-3">
            {/* Summary stats row */}
            <div className="bg-muted/10 mb-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
              <div className="flex items-center gap-1.5">
                <Eye className="text-muted-foreground h-3.5 w-3.5" />
                <span className="text-muted-foreground text-xs">Mean</span>
                <span className="font-mono text-sm tabular-nums">
                  {sample.mean.toFixed(precision)}
                </span>
              </div>
              {sample.range_value != null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-xs">Range</span>
                  <span className="font-mono text-sm tabular-nums">
                    {sample.range_value.toFixed(precision)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Clock className="text-muted-foreground h-3.5 w-3.5" />
                <span className="text-muted-foreground text-xs">Timestamp</span>
                <span className="text-sm">{formatDateTime(sample.timestamp)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-xs">Measurements</span>
                <span className="text-sm">{measurementValues.length}</span>
              </div>
            </div>

            {/* Measurement cells grid */}
            {measurementValues.length > 0 && (
              <div className="border-border overflow-hidden rounded-lg border">
                <div className="bg-muted/30 text-muted-foreground border-border border-b px-3 py-1.5 text-xs font-medium">
                  Measurements ({measurementValues.length})
                </div>
                <div className="bg-border grid grid-cols-5 gap-px sm:grid-cols-10">
                  {measurementValues.map((value, idx) => (
                    <div key={idx} className="bg-card px-2 py-1.5">
                      <div className="text-muted-foreground mb-0.5 text-[10px]">M{idx + 1}</div>
                      <div className="font-mono text-xs tabular-nums">
                        {(value ?? 0).toFixed(precision)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats + mini bar chart */}
            {measurementStats && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard label="Mean" value={measurementStats.mean.toFixed(precision)} />
                <StatCard label="Range" value={measurementStats.range.toFixed(precision)} />
                <StatCard label="Min" value={measurementStats.min.toFixed(precision)} />
                <StatCard label="Max" value={measurementStats.max.toFixed(precision)} />
              </div>
            )}

            {measurementValues.length > 1 && measurementStats && (
              <div className="mt-3">
                <MiniBarChart
                  values={measurementValues}
                  min={measurementStats.min}
                  max={measurementStats.max}
                  mean={measurementStats.mean}
                  precision={precision}
                />
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3">
          <div className="text-muted-foreground text-xs">
            Sample #{sampleId}
            {characteristic && <> &middot; {characteristic.name}</>}
          </div>
          <div className="flex items-center gap-2">
            {canAck && !showAckForm && (
              <button
                onClick={() => setShowAckForm(true)}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1.5 text-sm font-medium transition-colors"
              >
                Acknowledge
              </button>
            )}
            {showAckForm && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Reason..."
                  value={ackReason}
                  onChange={(e) => setAckReason(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAcknowledge()
                  }}
                  className="bg-background border-border focus:ring-primary w-48 rounded border px-2 py-1.5 text-sm focus:ring-1 focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={handleAcknowledge}
                  disabled={!ackReason.trim() || acknowledgeMutation.isPending}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  onClick={() => {
                    setShowAckForm(false)
                    setAckReason('')
                  }}
                  className="border-border hover:bg-muted rounded border px-3 py-1.5 text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
            <button
              onClick={onClose}
              className="border-border hover:bg-muted rounded border px-3 py-1.5 text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
