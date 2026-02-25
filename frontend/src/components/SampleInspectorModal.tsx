import { useState, useMemo, useCallback } from 'react'
import {
  X,
  BarChart3,
  AlertTriangle,
  MessageSquare,
  History,
  ShieldAlert,
  Clock,
  User,
  Hash,
  Layers,
  FlaskConical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { canPerformAction } from '@/lib/roles'
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
import { formatDisplayKey } from '@/lib/display-key'
import {
  SidebarItem,
  MetaItem,
  StatusChip,
  getZoneColor,
  getMeasurementValues,
} from './sample-inspector'
import type { SectionId } from './sample-inspector'
import { MeasurementsSection } from './sample-inspector'
import { ViolationsSection } from './sample-inspector'
import { AnnotationsSection } from './sample-inspector'
import { EditHistorySection } from './sample-inspector'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SampleInspectorModalProps {
  sampleId: number
  characteristicId: number
  onClose: () => void
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

  const isUndersized =
    getMeasurementValues(sample).length < (characteristic?.subgroup_size ?? 1)

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
                {sample.operator_id && (
                  <MetaItem icon={User} label="Operator" value={sample.operator_id} />
                )}
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
