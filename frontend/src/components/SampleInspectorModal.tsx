import { useState, useMemo, useCallback } from 'react'
import {
  X,
  BarChart3,
  AlertTriangle,
  MessageSquare,
  History,
  ShieldAlert,
  Pencil,
  Ban,
  RotateCcw,
  CheckCircle,
  Clock,
  User,
  Hash,
  Layers,
  FlaskConical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { canPerformAction } from '@/lib/roles'
import { NELSON_RULES, NELSON_RULE_DETAILS } from '@/lib/nelson-rules'
import type { NelsonSeverity } from '@/lib/nelson-rules'
import { NELSON_SPARKLINES } from '@/components/characteristic-config/NelsonSparklines'
import {
  useSample,
  useCharacteristic,
  useViolations,
  useAnnotations,
  useSampleEditHistory,
  useUpdateSample,
  useExcludeSample,
  useAcknowledgeViolation,
  useCreateAnnotation,
  useUpdateAnnotation,
  useDeleteAnnotation,
} from '@/api/hooks'
import type { Violation, Annotation, SampleEditHistory, Sample } from '@/types'
import { formatDisplayKey } from '@/lib/display-key'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SampleInspectorModalProps {
  sampleId: number
  characteristicId: number
  onClose: () => void
}

type SectionId = 'measurements' | 'violations' | 'annotations' | 'history'

/**
 * Extract measurement values from a sample.
 * The API returns `measurements` as `number[]` (flat) but the TS type
 * declares `Measurement[]` (objects). Handle both shapes at runtime.
 */
function getMeasurementValues(sample: Sample): number[] {
  if (!sample.measurements || sample.measurements.length === 0) return []
  const first = sample.measurements[0]
  if (typeof first === 'number') {
    return sample.measurements as unknown as number[]
  }
  return (sample.measurements as unknown as { value: number; sequence: number }[])
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((m) => m.value ?? 0)
}

// ─── Severity Badge (inline, matches RulesTab) ──────────────────────────────

function SeverityBadge({ severity }: { severity: NelsonSeverity | string }) {
  const styles: Record<string, string> = {
    CRITICAL: 'bg-destructive/15 text-destructive border-destructive/30',
    WARNING: 'bg-warning/15 text-warning border-warning/30',
    INFO: 'bg-primary/15 text-primary border-primary/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
        styles[severity] ?? 'bg-muted text-muted-foreground border-border',
      )}
    >
      {severity}
    </span>
  )
}

// ─── Zone color helper ───────────────────────────────────────────────────────

function getZoneColor(zone: string | undefined): { bg: string; text: string; label: string } {
  switch (zone) {
    case 'A+':
    case 'A-':
    case 'beyond':
      return { bg: 'bg-destructive/15', text: 'text-destructive', label: 'Zone A' }
    case 'B+':
    case 'B-':
      return { bg: 'bg-warning/15', text: 'text-warning', label: 'Zone B' }
    case 'C+':
    case 'C-':
      return { bg: 'bg-success/15', text: 'text-success', label: 'Zone C' }
    default:
      return { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Unknown' }
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SampleInspectorModal({
  sampleId,
  characteristicId,
  onClose,
}: SampleInspectorModalProps) {
  const { user, role } = useAuth()
  const [activeSection, setActiveSection] = useState<SectionId>('measurements')

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: sample, isLoading: sampleLoading } = useSample(sampleId)
  const { data: characteristic } = useCharacteristic(characteristicId)
  const { data: violationsData } = useViolations({ sample_id: sampleId })
  const { data: annotationsData } = useAnnotations(characteristicId)
  const { data: editHistory } = useSampleEditHistory(sampleId)

  // Violations are already filtered by sample_id on the backend
  const sampleViolations = useMemo(() => {
    if (!violationsData?.items) return []
    return violationsData.items
  }, [violationsData])

  const sampleAnnotations = useMemo(() => {
    if (!annotationsData) return []
    return annotationsData.filter((a) => a.annotation_type === 'point' && a.sample_id === sampleId)
  }, [annotationsData, sampleId])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateSample = useUpdateSample()
  const excludeSample = useExcludeSample()
  const acknowledgeViolation = useAcknowledgeViolation()
  const createAnnotation = useCreateAnnotation()
  const updateAnnotation = useUpdateAnnotation()
  const deleteAnnotation = useDeleteAnnotation()

  // ── Edit state ─────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false)
  const [editValues, setEditValues] = useState<number[]>([])
  const [editReason, setEditReason] = useState('')

  // ── Annotation state ───────────────────────────────────────────────────────
  const [annotationText, setAnnotationText] = useState('')

  // ── Acknowledge state ──────────────────────────────────────────────────────
  const [ackViolationId, setAckViolationId] = useState<number | null>(null)
  const [ackReason, setAckReason] = useState('')

  // ── Permissions ────────────────────────────────────────────────────────────
  const canEdit = canPerformAction(role, 'samples:edit')
  const canExclude = canPerformAction(role, 'samples:exclude')
  const canAcknowledge = canPerformAction(role, 'violations:acknowledge')

  // ── Measurement stats ──────────────────────────────────────────────────────
  const measurementValues = useMemo(() => (sample ? getMeasurementValues(sample) : []), [sample])

  const stats = useMemo(() => {
    if (measurementValues.length === 0) return null
    const min = Math.min(...measurementValues)
    const max = Math.max(...measurementValues)
    const range = max - min
    const mean = measurementValues.reduce((s, v) => s + v, 0) / measurementValues.length
    return { min, max, range, mean, count: measurementValues.length }
  }, [measurementValues])

  // ── Zone from characteristic limits ────────────────────────────────────────
  const zone = useMemo(() => {
    if (!sample || !characteristic) return undefined
    const cl =
      characteristic.stored_center_line ??
      (characteristic.ucl != null && characteristic.lcl != null
        ? (characteristic.ucl + characteristic.lcl) / 2
        : null)
    const sigma = characteristic.stored_sigma
    if (cl == null || sigma == null || sigma === 0) return undefined
    const dist = Math.abs(sample.mean - cl)
    const sigmas = dist / sigma
    const side = sample.mean >= cl ? '+' : '-'
    if (sigmas > 3) return 'beyond'
    if (sigmas > 2) return `A${side}`
    if (sigmas > 1) return `B${side}`
    return `C${side}`
  }, [sample, characteristic])

  const zoneColor = getZoneColor(zone)
  const precision = characteristic?.decimal_precision ?? 4

  // ── Handlers ───────────────────────────────────────────────────────────────
  const startEditing = useCallback(() => {
    setEditValues([...measurementValues])
    setEditReason('')
    setIsEditing(true)
  }, [measurementValues])

  const cancelEditing = useCallback(() => {
    setIsEditing(false)
    setEditValues([])
    setEditReason('')
  }, [])

  const saveEdits = useCallback(() => {
    if (!editReason.trim() || editValues.length === 0) return
    updateSample.mutate(
      {
        id: sampleId,
        measurements: editValues,
        reason: editReason.trim(),
        edited_by: user?.username,
      },
      { onSuccess: () => cancelEditing() },
    )
  }, [sampleId, editValues, editReason, user, updateSample, cancelEditing])

  const handleExclude = useCallback(() => {
    if (!sample) return
    excludeSample.mutate({ id: sampleId, excluded: !sample.is_excluded })
  }, [sampleId, sample, excludeSample])

  const handleAcknowledge = useCallback(() => {
    if (!ackViolationId || !ackReason.trim()) return
    acknowledgeViolation.mutate(
      { id: ackViolationId, reason: ackReason.trim(), user: user?.username ?? '' },
      {
        onSuccess: () => {
          setAckViolationId(null)
          setAckReason('')
        },
      },
    )
  }, [ackViolationId, ackReason, user, acknowledgeViolation])

  const handleAddAnnotation = useCallback(() => {
    if (!annotationText.trim()) return
    createAnnotation.mutate(
      {
        characteristicId,
        data: {
          annotation_type: 'point',
          text: annotationText.trim(),
          sample_id: sampleId,
        },
      },
      { onSuccess: () => setAnnotationText('') },
    )
  }, [characteristicId, sampleId, annotationText, createAnnotation])

  // Badge counts for sidebar nav
  const violationCount = sampleViolations.length
  const annotationCount = sampleAnnotations.length
  const historyCount = editHistory?.length ?? 0

  const hasViolations = violationCount > 0
  const isOutOfControl = hasViolations

  // ── Loading state ──────────────────────────────────────────────────────────
  if (sampleLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="bg-card border-border relative rounded-xl border p-8 shadow-2xl">
          <div className="text-muted-foreground">Loading sample data...</div>
        </div>
      </div>
    )
  }

  if (!sample) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="bg-card border-border relative rounded-xl border p-8 shadow-2xl">
          <div className="text-muted-foreground">Sample not found.</div>
          <button onClick={onClose} className="text-primary mt-4 text-sm hover:underline">
            Close
          </button>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal container */}
      <div className="bg-card border-border relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="border-border bg-muted/30 flex items-center justify-between border-b px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {/* Point shape indicator */}
              {hasViolations ? (
                <div className="bg-destructive h-3 w-3 rotate-45" title="Violation" />
              ) : (
                <div className="bg-success h-3 w-3 rounded-full" title="Normal" />
              )}
              <h2 className="text-lg font-semibold">
                Sample {sample.display_key ? formatDisplayKey(sample.display_key) : `#${sample.id}`}
              </h2>
            </div>
            {hasViolations && (
              <span className="border-destructive/30 bg-destructive/15 text-destructive inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium">
                <ShieldAlert className="h-3 w-3" />
                {violationCount} violation{violationCount !== 1 ? 's' : ''}
              </span>
            )}
            {sample.is_excluded && (
              <span className="bg-muted text-muted-foreground border-border inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
                Excluded
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg p-1.5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body: sidebar + main ──────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <div className="border-border bg-muted/20 flex w-48 flex-shrink-0 flex-col border-r">
            {/* Sample info */}
            <div className="border-border border-b px-4 py-3">
              <div className="text-sm font-medium">
                Sample {sample.display_key ? formatDisplayKey(sample.display_key) : `#${sample.id}`}
              </div>
              <div className="text-muted-foreground mt-0.5 text-xs">
                {new Date(sample.timestamp).toLocaleString()}
              </div>
            </div>

            {/* Nav items */}
            <nav className="flex-1 py-2">
              <SidebarItem
                icon={BarChart3}
                label="Measurements"
                active={activeSection === 'measurements'}
                onClick={() => setActiveSection('measurements')}
              />
              <SidebarItem
                icon={AlertTriangle}
                label="Violations"
                active={activeSection === 'violations'}
                onClick={() => setActiveSection('violations')}
                badge={violationCount > 0 ? violationCount : undefined}
                badgeColor="red"
              />
              <SidebarItem
                icon={MessageSquare}
                label="Annotations"
                active={activeSection === 'annotations'}
                onClick={() => setActiveSection('annotations')}
                badge={annotationCount > 0 ? annotationCount : undefined}
                badgeColor="amber"
              />
              {(historyCount > 0 || sample.is_modified) && (
                <SidebarItem
                  icon={History}
                  label="Edit History"
                  active={activeSection === 'history'}
                  onClick={() => setActiveSection('history')}
                  badge={historyCount > 0 ? historyCount : undefined}
                  badgeColor="blue"
                />
              )}
            </nav>
          </div>

          {/* Main content area */}
          <div className="flex-1 overflow-y-auto">
            {/* Overview section (always visible) */}
            <OverviewSection
              sample={sample}
              zone={zone}
              zoneColor={zoneColor}
              precision={precision}
              isOutOfControl={isOutOfControl}
              historyCount={historyCount}
              characteristic={characteristic ?? undefined}
            />

            {/* Active section content */}
            <div className="px-5 py-5">
              {activeSection === 'measurements' && (
                <MeasurementsSection
                  measurementValues={measurementValues}
                  stats={stats}
                  precision={precision}
                  isEditing={isEditing}
                  editValues={editValues}
                  editReason={editReason}
                  setEditValues={setEditValues}
                  setEditReason={setEditReason}
                  canEdit={canEdit}
                  isSaving={updateSample.isPending}
                  onStartEdit={startEditing}
                  onCancelEdit={cancelEditing}
                  onSave={saveEdits}
                  canExclude={canExclude}
                  isExcluded={sample.is_excluded}
                  isExcluding={excludeSample.isPending}
                  onToggleExclude={handleExclude}
                />
              )}

              {activeSection === 'violations' && (
                <ViolationsSection
                  violations={sampleViolations}
                  canAcknowledge={canAcknowledge}
                  ackViolationId={ackViolationId}
                  ackReason={ackReason}
                  isAcknowledging={acknowledgeViolation.isPending}
                  setAckViolationId={setAckViolationId}
                  setAckReason={setAckReason}
                  onAcknowledge={handleAcknowledge}
                />
              )}

              {activeSection === 'annotations' && (
                <AnnotationsSection
                  annotations={sampleAnnotations}
                  characteristicId={characteristicId}
                  sampleId={sampleId}
                  annotationText={annotationText}
                  setAnnotationText={setAnnotationText}
                  createAnnotation={createAnnotation}
                  updateAnnotation={updateAnnotation}
                  deleteAnnotation={deleteAnnotation}
                  onAdd={handleAddAnnotation}
                />
              )}

              {activeSection === 'history' && (
                <EditHistorySection history={editHistory ?? []} precision={precision} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sidebar Nav Item ────────────────────────────────────────────────────────

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
  badgeColor,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active: boolean
  onClick: () => void
  badge?: number
  badgeColor?: 'red' | 'amber' | 'blue'
}) {
  const badgeStyles = {
    red: 'bg-destructive/20 text-destructive',
    amber: 'bg-warning/20 text-warning',
    blue: 'bg-primary/20 text-primary',
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors',
        active
          ? 'bg-primary/10 text-primary border-primary border-r-2 font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {badge != null && (
        <span
          className={cn(
            'inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] font-medium',
            badgeStyles[badgeColor ?? 'blue'],
          )}
        >
          {badge}
        </span>
      )}
    </button>
  )
}

// ─── Overview Section ────────────────────────────────────────────────────────

function OverviewSection({
  sample,
  zone,
  zoneColor,
  precision,
  isOutOfControl,
  historyCount,
  characteristic,
}: {
  sample: NonNullable<ReturnType<typeof useSample>['data']>
  zone: string | undefined
  zoneColor: ReturnType<typeof getZoneColor>
  precision: number
  isOutOfControl: boolean
  historyCount: number
  characteristic?: { subgroup_size?: number; is_undersized?: boolean; name?: string }
}) {
  const isUndersized = getMeasurementValues(sample).length < (characteristic?.subgroup_size ?? 1)

  return (
    <div className="border-border border-b px-5 py-4">
      {/* Large mean value */}
      <div className="mb-3 flex items-center gap-4">
        <div className={cn('font-mono text-3xl font-bold tabular-nums', zoneColor.text)}>
          {(sample.mean ?? 0).toFixed(precision)}
        </div>
        {zone && (
          <span
            className={cn(
              'rounded border px-2 py-0.5 text-xs font-medium',
              zoneColor.bg,
              zoneColor.text,
            )}
          >
            {zoneColor.label}
          </span>
        )}
      </div>

      {/* Metadata grid */}
      <div className="mb-3 grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
        <MetaItem
          icon={Clock}
          label="Timestamp"
          value={new Date(sample.timestamp).toLocaleString()}
        />
        <MetaItem icon={Layers} label="Source" value={sample.source ?? 'Manual'} />
        <MetaItem
          icon={Hash}
          label="Subgroup"
          value={`${getMeasurementValues(sample).length} measurements`}
        />
        {sample.batch_number && (
          <MetaItem icon={FlaskConical} label="Batch" value={sample.batch_number} />
        )}
        {sample.operator_id && <MetaItem icon={User} label="Operator" value={sample.operator_id} />}
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {isOutOfControl ? (
          <StatusChip color="red" label="OUT OF CONTROL" />
        ) : (
          <StatusChip color="green" label="In Control" />
        )}
        {sample.is_modified && (
          <StatusChip
            color="amber"
            label={`Modified ${historyCount > 0 ? `${historyCount}x` : ''}`}
          />
        )}
        {isUndersized && <StatusChip color="amber" label="Undersized" />}
        {sample.is_excluded && <StatusChip color="muted" label="Excluded" />}
      </div>
    </div>
  )
}

function MetaItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-1.5">
      <Icon className="text-muted-foreground mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <div>
        <div className="text-muted-foreground text-[10px] tracking-wider uppercase">{label}</div>
        <div className="text-foreground">{value}</div>
      </div>
    </div>
  )
}

function StatusChip({
  color,
  label,
}: {
  color: 'red' | 'green' | 'amber' | 'muted'
  label: string
}) {
  const styles = {
    red: 'bg-destructive/15 text-destructive border-destructive/30',
    green: 'bg-success/15 text-success border-success/30',
    amber: 'bg-warning/15 text-warning border-warning/30',
    muted: 'bg-muted text-muted-foreground border-border',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium',
        styles[color],
      )}
    >
      {label}
    </span>
  )
}

// ─── Measurements Section ────────────────────────────────────────────────────

function MeasurementsSection({
  measurementValues,
  stats,
  precision,
  isEditing,
  editValues,
  editReason,
  setEditValues,
  setEditReason,
  canEdit,
  isSaving,
  onStartEdit,
  onCancelEdit,
  onSave,
  canExclude,
  isExcluded,
  isExcluding,
  onToggleExclude,
}: {
  measurementValues: number[]
  stats: { min: number; max: number; range: number; mean: number; count: number } | null
  precision: number
  isEditing: boolean
  editValues: number[]
  editReason: string
  setEditValues: (values: number[]) => void
  setEditReason: (reason: string) => void
  canEdit: boolean
  isSaving: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  canExclude: boolean
  isExcluded: boolean
  isExcluding: boolean
  onToggleExclude: () => void
}) {
  return (
    <div className="space-y-4">
      {/* Action buttons */}
      {(canEdit || canExclude) && (
        <div className="flex items-center gap-2">
          {canEdit && !isEditing && (
            <button
              onClick={onStartEdit}
              className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Edit Measurements
            </button>
          )}
          {canExclude && (
            <button
              onClick={onToggleExclude}
              disabled={isExcluding}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                isExcluded
                  ? 'border-success/30 text-success hover:bg-success/10'
                  : 'border-destructive/30 text-destructive hover:bg-destructive/10',
              )}
            >
              {isExcluded ? (
                <>
                  <RotateCcw className="h-3 w-3" />
                  Restore Sample
                </>
              ) : (
                <>
                  <Ban className="h-3 w-3" />
                  Exclude Sample
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Measurement grid */}
      <div className="border-border overflow-hidden rounded-lg border">
        <div className="bg-muted/30 text-muted-foreground border-border border-b px-3 py-2 text-xs font-medium">
          Measurements ({measurementValues.length})
        </div>
        <div className="bg-border grid grid-cols-5 gap-px">
          {(isEditing ? editValues : measurementValues).map((value, idx) => (
            <div key={idx} className="bg-card px-3 py-2">
              <div className="text-muted-foreground mb-0.5 text-[10px]">M{idx + 1}</div>
              {isEditing ? (
                <input
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) => {
                    const next = [...editValues]
                    next[idx] = parseFloat(e.target.value) || 0
                    setEditValues(next)
                  }}
                  className="bg-background border-border focus:ring-primary w-full rounded border px-1.5 py-0.5 font-mono text-sm focus:ring-1 focus:outline-none"
                />
              ) : (
                <div className="font-mono text-sm tabular-nums">
                  {(value ?? 0).toFixed(precision)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Edit reason + save/cancel */}
      {isEditing && (
        <div className="space-y-2">
          <textarea
            placeholder="Reason for edit (required)..."
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            className="bg-background border-border focus:ring-primary w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
            rows={2}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={!editReason.trim() || isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={onCancelEdit}
              className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats row */}
      {stats && !isEditing && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Mean" value={stats.mean.toFixed(precision)} />
          <StatCard label="Range" value={stats.range.toFixed(precision)} />
          <StatCard label="Min" value={stats.min.toFixed(precision)} />
          <StatCard label="Max" value={stats.max.toFixed(precision)} />
        </div>
      )}

      {/* Mini bar chart */}
      {!isEditing && measurementValues.length > 1 && stats && (
        <MiniBarChart
          values={measurementValues}
          min={stats.min}
          max={stats.max}
          mean={stats.mean}
          precision={precision}
        />
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/30 border-border rounded-lg border px-3 py-2">
      <div className="text-muted-foreground text-[10px] tracking-wider uppercase">{label}</div>
      <div className="font-mono text-sm font-medium tabular-nums">{value}</div>
    </div>
  )
}

function MiniBarChart({
  values,
  min,
  max,
  mean,
  precision,
}: {
  values: number[]
  min: number
  max: number
  mean: number
  precision: number
}) {
  const range = max - min || 1
  const barHeights = values.map((v) => ((v - min) / range) * 100)
  const meanPct = ((mean - min) / range) * 100

  return (
    <div className="border-border rounded-lg border p-3">
      <div className="text-muted-foreground mb-2 text-[10px] tracking-wider uppercase">
        Distribution
      </div>
      <div className="h-[88px] pt-6">
        <div className="relative flex h-full items-end gap-1">
          {barHeights.map((h, idx) => (
            <div
              key={idx}
              className="bg-primary/60 hover:bg-primary/80 group relative flex-1 rounded-t-sm transition-all"
              style={{ height: `${Math.max(h, 4)}%` }}
            >
              <div className="bg-popover border-border absolute bottom-full left-1/2 z-10 mb-0.5 -translate-x-1/2 rounded border px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
                {(values[idx] ?? 0).toFixed(precision)}
              </div>
            </div>
          ))}
          {/* Mean line */}
          <div
            className="border-warning/60 absolute right-0 left-0 border-t-2 border-dashed"
            style={{ bottom: `${meanPct}%` }}
          />
        </div>
      </div>
      <div className="text-muted-foreground mt-1 flex justify-between font-mono text-[10px]">
        <span>M1</span>
        <span className="text-warning">x̄ = {mean.toFixed(precision)}</span>
        <span>M{values.length}</span>
      </div>
    </div>
  )
}

// ─── Violations Section ──────────────────────────────────────────────────────

function ViolationsSection({
  violations,
  canAcknowledge,
  ackViolationId,
  ackReason,
  isAcknowledging,
  setAckViolationId,
  setAckReason,
  onAcknowledge,
}: {
  violations: Violation[]
  canAcknowledge: boolean
  ackViolationId: number | null
  ackReason: string
  isAcknowledging: boolean
  setAckViolationId: (id: number | null) => void
  setAckReason: (reason: string) => void
  onAcknowledge: () => void
}) {
  if (violations.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No violations for this sample.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {violations.map((v) => {
        const ruleMeta = NELSON_RULES.find((r) => r.id === v.rule_id)
        const ruleDetail = NELSON_RULE_DETAILS[v.rule_id]
        const Sparkline = NELSON_SPARKLINES[v.rule_id]

        return (
          <div key={v.id} className="border-border overflow-hidden rounded-lg border">
            {/* Violation header */}
            <div className="bg-muted/30 flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldAlert
                  className={cn(
                    'h-4 w-4',
                    v.severity === 'CRITICAL'
                      ? 'text-destructive'
                      : v.severity === 'WARNING'
                        ? 'text-warning'
                        : 'text-primary',
                  )}
                />
                <span className="text-sm font-medium">
                  Rule {v.rule_id}: {ruleMeta?.name ?? v.rule_name}
                </span>
                {Sparkline && (
                  <div className="bg-background/50 border-border/50 flex h-6 w-16 flex-shrink-0 items-center justify-center rounded border">
                    <Sparkline className="text-foreground/80" />
                  </div>
                )}
                <SeverityBadge severity={v.severity} />
              </div>
              {v.acknowledged && (
                <span className="text-success inline-flex items-center gap-1 text-xs">
                  <CheckCircle className="h-3 w-3" /> Acknowledged
                </span>
              )}
            </div>

            {/* Rule details */}
            <div className="space-y-2 px-4 py-3 text-sm">
              {ruleDetail && (
                <>
                  <p className="text-foreground">{ruleDetail.description}</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-muted-foreground mb-0.5 text-[10px] tracking-wider uppercase">
                        Common Causes
                      </div>
                      <p className="text-foreground/80 text-xs">{ruleDetail.cause}</p>
                    </div>
                    <div>
                      <div className="text-muted-foreground mb-0.5 text-[10px] tracking-wider uppercase">
                        Recommended Action
                      </div>
                      <p className="text-foreground/80 text-xs">{ruleDetail.action}</p>
                    </div>
                  </div>
                </>
              )}

              {v.message && <p className="text-muted-foreground text-xs italic">{v.message}</p>}

              {/* Acknowledgment info or action */}
              {v.acknowledged ? (
                <div className="border-success/20 bg-success/5 mt-2 rounded-md border px-3 py-2">
                  <div className="flex items-center gap-4 text-xs">
                    {v.ack_user && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> {v.ack_user}
                      </span>
                    )}
                    {v.ack_timestamp && (
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {new Date(v.ack_timestamp).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {v.ack_reason && (
                    <p className="text-muted-foreground mt-1 text-xs italic">{v.ack_reason}</p>
                  )}
                </div>
              ) : (
                canAcknowledge &&
                v.requires_acknowledgement && (
                  <div className="mt-2">
                    {ackViolationId === v.id ? (
                      <div className="space-y-2">
                        <textarea
                          placeholder="Reason for acknowledgment (required)..."
                          value={ackReason}
                          onChange={(e) => setAckReason(e.target.value)}
                          className="bg-background border-border focus:ring-primary w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                          rows={2}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={onAcknowledge}
                            disabled={!ackReason.trim() || isAcknowledging}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            <CheckCircle className="h-3 w-3" />
                            {isAcknowledging ? 'Acknowledging...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => {
                              setAckViolationId(null)
                              setAckReason('')
                            }}
                            className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAckViolationId(v.id)}
                        className="border-warning/30 text-warning hover:bg-warning/10 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        <CheckCircle className="h-3 w-3" />
                        Acknowledge
                      </button>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Annotations Section ─────────────────────────────────────────────────────

function AnnotationsSection({
  annotations,
  characteristicId,
  sampleId,
  annotationText,
  setAnnotationText,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  onAdd,
}: {
  annotations: Annotation[]
  characteristicId: number
  sampleId: number
  annotationText: string
  setAnnotationText: (text: string) => void
  createAnnotation: ReturnType<typeof useCreateAnnotation>
  updateAnnotation: ReturnType<typeof useUpdateAnnotation>
  deleteAnnotation: ReturnType<typeof useDeleteAnnotation>
  onAdd: () => void
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null)
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null)

  const existing = annotations.length > 0 ? annotations[0] : null
  const hasExisting = existing != null

  const handleStartEdit = (annotation: Annotation) => {
    setEditingId(annotation.id)
    setEditText(annotation.text)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editText.trim()) return
    await updateAnnotation.mutateAsync({
      characteristicId,
      annotationId: editingId,
      data: { text: editText.trim() },
    })
    setEditingId(null)
    setEditText('')
  }

  const handleDelete = async (annotationId: number) => {
    await deleteAnnotation.mutateAsync({ characteristicId, annotationId })
    setShowDeleteConfirm(null)
  }

  return (
    <div className="space-y-3">
      {/* Existing annotations */}
      {annotations.map((a) => {
        const isEditing = editingId === a.id
        const isDeleting = showDeleteConfirm === a.id
        const hasHistory = a.history && a.history.length > 0
        const wasEdited = a.updated_at !== a.created_at
        const isHistoryExpanded = expandedHistoryId === a.id

        return (
          <div
            key={a.id}
            className="group border-border bg-muted/20 hover:bg-muted/30 rounded-lg border transition-colors"
          >
            {/* Delete confirmation */}
            {isDeleting ? (
              <div className="flex items-center justify-between gap-4 p-4">
                <span className="text-muted-foreground text-sm">Delete this annotation?</span>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deleteAnnotation.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    {deleteAnnotation.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ) : isEditing ? (
              /* Edit mode */
              <div className="space-y-2 p-3">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="bg-background border-border focus:ring-primary w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px]">{editText.length}/500</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingId(null)
                        setEditText('')
                      }}
                      className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editText.trim() || updateAnnotation.isPending}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {updateAnnotation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* View mode */
              <div className="p-3">
                {/* Text + hover actions */}
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {a.color && (
                      <span
                        className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: a.color }}
                      />
                    )}
                    <p className="text-foreground inline text-sm leading-relaxed whitespace-pre-wrap">
                      {a.text}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => handleStartEdit(a)}
                      className="text-muted-foreground hover:text-foreground hover:bg-background rounded-md p-1.5 transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(a.id)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md p-1.5 transition-colors"
                      title="Delete"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Meta row */}
                <div className="text-muted-foreground mt-2 flex items-center gap-2.5 text-[11px]">
                  {a.created_by && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {a.created_by}
                    </span>
                  )}
                  <span>
                    {wasEdited ? 'Edited ' : ''}
                    {new Date(wasEdited ? a.updated_at : a.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {hasHistory && (
                    <button
                      onClick={() => setExpandedHistoryId(isHistoryExpanded ? null : a.id)}
                      className={cn(
                        'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors',
                        isHistoryExpanded
                          ? 'bg-warning/15 text-warning'
                          : 'hover:bg-muted text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <History className="h-3 w-3" />
                      {a.history.length} edit{a.history.length !== 1 ? 's' : ''}
                    </button>
                  )}
                </div>

                {/* Inline history timeline */}
                {isHistoryExpanded && hasHistory && (
                  <div className="border-warning/30 mt-3 ml-0.5 space-y-2.5 border-l-2 pl-3">
                    {a.history.map((entry, idx) => (
                      <div key={entry.id} className="text-xs">
                        <div className="text-muted-foreground flex items-center gap-2">
                          <span>
                            {new Date(entry.changed_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {entry.changed_by && (
                            <span className="text-muted-foreground/70">by {entry.changed_by}</span>
                          )}
                          {idx === 0 && (
                            <span className="bg-warning/10 text-warning rounded px-1.5 py-0.5 text-[10px]">
                              Latest
                            </span>
                          )}
                        </div>
                        <p className="text-muted-foreground/70 mt-0.5 leading-relaxed italic">
                          &ldquo;{entry.previous_text}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Add annotation — only if no existing annotation for this sample */}
      {!hasExisting && (
        <div className="border-border/60 focus-within:border-primary/40 rounded-lg border border-dashed transition-colors">
          <textarea
            placeholder="Write a note about this sample..."
            value={annotationText}
            onChange={(e) => setAnnotationText(e.target.value)}
            maxLength={500}
            className="placeholder:text-muted-foreground/50 w-full resize-none border-0 bg-transparent px-3 pt-3 pb-1 text-sm focus:shadow-none focus:outline-none"
            rows={2}
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <span
              className={cn(
                'text-[10px] transition-opacity',
                annotationText.length > 0 ? 'text-muted-foreground opacity-100' : 'opacity-0',
              )}
            >
              {annotationText.length}/500
            </span>
            <button
              onClick={onAdd}
              disabled={!annotationText.trim() || createAnnotation.isPending}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                annotationText.trim()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              <MessageSquare className="h-3 w-3" />
              {createAnnotation.isPending ? 'Adding...' : 'Add Note'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state — visible only when form is untouched */}
      {!hasExisting && annotations.length === 0 && annotationText.length === 0 && (
        <div className="py-4 text-center">
          <MessageSquare className="text-muted-foreground/25 mx-auto mb-1.5 h-7 w-7" />
          <p className="text-muted-foreground/60 text-xs">No annotations on this sample yet</p>
        </div>
      )}
    </div>
  )
}

// ─── Edit History Section ────────────────────────────────────────────────────

function EditHistorySection({
  history,
  precision,
}: {
  history: SampleEditHistory[]
  precision: number
}) {
  if (history.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No edit history for this sample.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {history.map((entry, idx) => (
        <div key={entry.id} className="border-border overflow-hidden rounded-lg border">
          <div className="bg-muted/30 border-border flex items-center justify-between border-b px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs">
              <History className="text-warning h-3.5 w-3.5" />
              <span className="text-muted-foreground">
                {new Date(entry.edited_at).toLocaleString()}
              </span>
              {idx === 0 && (
                <span className="bg-warning/10 text-warning rounded px-1.5 py-0.5 text-[10px] font-medium">
                  Latest
                </span>
              )}
            </div>
            {entry.edited_by && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <User className="h-3 w-3" /> {entry.edited_by}
              </span>
            )}
          </div>

          <div className="space-y-2 px-4 py-3 text-sm">
            {/* Reason */}
            <div>
              <span className="text-muted-foreground text-xs">Reason: </span>
              <span className="text-xs italic">{entry.reason}</span>
            </div>

            {/* Mean diff */}
            <div className="flex items-center gap-2 font-mono text-sm tabular-nums">
              <span className="text-destructive/70 line-through">
                {entry.previous_mean.toFixed(precision)}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="text-success">{entry.new_mean.toFixed(precision)}</span>
            </div>

            {/* Value-by-value diff */}
            {entry.previous_values.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {entry.previous_values.map((prev, i) => {
                  const next = entry.new_values[i]
                  const changed = prev !== next
                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded border px-2 py-1 font-mono text-xs',
                        changed ? 'border-warning/30 bg-warning/5' : 'border-border bg-muted/20',
                      )}
                    >
                      <span className="text-muted-foreground mr-0.5">M{i + 1}:</span>
                      {changed ? (
                        <>
                          <span className="text-destructive/70 line-through">
                            {prev.toFixed(precision)}
                          </span>
                          <span className="text-muted-foreground mx-0.5">→</span>
                          <span className="text-success">{next.toFixed(precision)}</span>
                        </>
                      ) : (
                        <span>{prev.toFixed(precision)}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
