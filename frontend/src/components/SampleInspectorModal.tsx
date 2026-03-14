import { useState, useMemo, useCallback, useEffect } from 'react'
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
  Target,
  Users,
  Percent,
  Sparkles,
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
  useAnomalyEvents,
} from '@/api/hooks'
import { formatDisplayKey } from '@/lib/display-key'
import { useDateFormat } from '@/hooks/useDateFormat'
import { useLicense } from '@/hooks/useLicense'
import {
  SidebarItem,
  MetaItem,
  StatusChip,
  StatCard,
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

// ─── AI Insights Section ─────────────────────────────────────────────────────

import { EVENT_TYPE_LABELS, SEVERITY_THEME_CLASS } from '@/lib/anomaly-labels'

function InsightsSection({
  events,
  formatDateTime,
}: {
  events: import('@/types/anomaly').AnomalyEvent[]
  formatDateTime: (d: string | Date) => string
}) {
  if (events.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        No AI insights for this sample.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {events.map((event) => {
        const typeLabel = EVENT_TYPE_LABELS[event.event_type] ?? event.event_type
        const sevClass = SEVERITY_THEME_CLASS[event.severity] ?? 'text-primary'

        return (
          <div
            key={event.id}
            className="border-border bg-muted/20 space-y-2 rounded-lg border p-3"
          >
            <div className="flex items-center gap-2">
              <Sparkles className={cn('h-3.5 w-3.5', sevClass)} />
              <span className="text-foreground text-sm font-medium">{typeLabel}</span>
              <span className={cn('text-xs font-medium', sevClass)}>{event.severity}</span>
            </div>

            {event.summary && (
              <p className="text-muted-foreground text-xs leading-relaxed">
                {event.summary}
              </p>
            )}

            <div className="text-muted-foreground/60 text-[10px]">
              Detected {formatDateTime(event.detected_at)}
              {event.is_acknowledged && event.acknowledged_by && (
                <span className="text-success ml-2">
                  Acknowledged by {event.acknowledged_by}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SampleInspectorModal({
  sampleId,
  characteristicId,
  onClose,
}: SampleInspectorModalProps) {
  const { user, role } = useAuth()
  const { isEnterprise } = useLicense()
  const { formatDateTime } = useDateFormat()
  const [activeSection, setActiveSection] = useState<SectionId>('measurements')

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: sample, isLoading: sampleLoading } = useSample(sampleId)
  const { data: characteristic } = useCharacteristic(characteristicId)
  const { data: violationsData } = useViolations({ sample_id: sampleId })
  const { data: annotationsData } = useAnnotations(characteristicId)
  const { data: editHistory } = useSampleEditHistory(sampleId)
  const { data: anomalyData } = useAnomalyEvents(
    isEnterprise ? characteristicId : 0,
    { limit: 100 },
  )

  // Violations are already filtered by sample_id on the backend
  const sampleViolations = useMemo(() => {
    if (!violationsData?.items) return []
    return violationsData.items
  }, [violationsData])

  const sampleAnnotations = useMemo(() => {
    if (!annotationsData) return []
    return annotationsData.filter((a) => a.annotation_type === 'point' && a.sample_id === sampleId)
  }, [annotationsData, sampleId])

  // Anomaly events for this specific sample
  const sampleInsights = useMemo(() => {
    if (!anomalyData?.events) return []
    return anomalyData.events.filter(
      (e) => e.sample_id === sampleId && !e.is_dismissed,
    )
  }, [anomalyData, sampleId])

  // Reset active section if insights tab becomes empty while viewing it
  useEffect(() => {
    if (activeSection === 'insights' && sampleInsights.length === 0) {
      setActiveSection('measurements')
    }
  }, [activeSection, sampleInsights.length])

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
  const isAttribute = characteristic?.data_type === 'attribute'

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

  const isUndersized = !isAttribute &&
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
                {formatDateTime(sample.timestamp)}
              </div>
            </div>

            {/* Nav items */}
            <nav className="flex-1 py-2">
              <SidebarItem
                icon={BarChart3}
                label={isAttribute ? 'Details' : 'Measurements'}
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
              {isEnterprise && sampleInsights.length > 0 && (
                <SidebarItem
                  icon={Sparkles}
                  label="AI Insights"
                  active={activeSection === 'insights'}
                  onClick={() => setActiveSection('insights')}
                  badge={sampleInsights.length}
                  badgeColor="blue"
                />
              )}
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
              {/* Large value display — branches on data type */}
              {isAttribute ? (
                <>
                  <div className="mb-3 flex items-center gap-4">
                    <div className="font-mono text-3xl font-bold tabular-nums">
                      {sample.defect_count ?? 0}
                    </div>
                    <span className="text-muted-foreground text-sm">
                      {characteristic?.attribute_chart_type === 'p' || characteristic?.attribute_chart_type === 'np'
                        ? `defective item${(sample.defect_count ?? 0) !== 1 ? 's' : ''}`
                        : `defect${(sample.defect_count ?? 0) !== 1 ? 's' : ''}`}
                    </span>
                    {characteristic?.attribute_chart_type && (
                      <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs font-medium">
                        {characteristic.attribute_chart_type}-chart
                      </span>
                    )}
                  </div>

                  {/* Attribute metadata grid */}
                  <div className="mb-3 grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    <MetaItem
                      icon={Clock}
                      label="Timestamp"
                      value={formatDateTime(sample.timestamp)}
                    />
                    <MetaItem
                      icon={Target}
                      label="Plotted Value"
                      value={
                        characteristic?.attribute_chart_type === 'p'
                          ? ((sample.mean ?? 0) * 100).toFixed(Math.max(precision - 2, 1)) + '%'
                          : (sample.mean ?? 0).toFixed(precision)
                      }
                    />
                    {sample.sample_size != null && (
                      <MetaItem
                        icon={Users}
                        label="Sample Size"
                        value={String(sample.sample_size)}
                      />
                    )}
                    {sample.units_inspected != null && (
                      <MetaItem
                        icon={Percent}
                        label="Units Inspected"
                        value={String(sample.units_inspected)}
                      />
                    )}
                    <MetaItem icon={Layers} label="Source" value={sample.source ?? 'Manual'} />
                    {sample.batch_number && (
                      <MetaItem icon={FlaskConical} label="Batch" value={sample.batch_number} />
                    )}
                    {sample.operator_id && (
                      <MetaItem icon={User} label="Operator" value={sample.operator_id} />
                    )}
                  </div>
                </>
              ) : (
                <>
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

                  {/* Variable metadata grid */}
                  <div className="mb-3 grid grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    <MetaItem
                      icon={Clock}
                      label="Timestamp"
                      value={formatDateTime(sample.timestamp)}
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
                </>
              )}

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
                isAttribute ? (
                  <div className="space-y-4">
                    {/* Exclude action for attribute data */}
                    {canExclude && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleExclude}
                          disabled={excludeSample.isPending}
                          className={cn(
                            'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                            sample.is_excluded
                              ? 'border-success/30 text-success hover:bg-success/10'
                              : 'border-destructive/30 text-destructive hover:bg-destructive/10',
                          )}
                        >
                          {sample.is_excluded ? 'Restore Sample' : 'Exclude Sample'}
                        </button>
                      </div>
                    )}

                    {/* Attribute data summary */}
                    <div className="grid grid-cols-2 gap-3">
                      <StatCard
                        label={characteristic?.attribute_chart_type === 'p' || characteristic?.attribute_chart_type === 'np' ? 'Defective Items' : 'Defect Count'}
                        value={String(sample.defect_count ?? 0)}
                      />
                      <StatCard
                        label="Plotted Value"
                        value={
                          characteristic?.attribute_chart_type === 'p'
                            ? ((sample.mean ?? 0) * 100).toFixed(Math.max(precision - 2, 1)) + '%'
                            : (sample.mean ?? 0).toFixed(precision)
                        }
                      />
                      {sample.sample_size != null && (
                        <StatCard label="Sample Size" value={String(sample.sample_size)} />
                      )}
                      {sample.units_inspected != null && (
                        <StatCard label="Units Inspected" value={String(sample.units_inspected)} />
                      )}
                    </div>

                    {/* Chart type explanation */}
                    {characteristic?.attribute_chart_type && (
                      <div className="bg-muted/30 border-border rounded-lg border p-3 text-sm">
                        <div className="text-muted-foreground mb-1 text-[10px] tracking-wider uppercase">
                          Chart Type
                        </div>
                        <div className="text-foreground">
                          {characteristic.attribute_chart_type === 'p' && 'Proportion defective (p-chart)'}
                          {characteristic.attribute_chart_type === 'np' && 'Number defective (np-chart)'}
                          {characteristic.attribute_chart_type === 'c' && 'Defect count (c-chart)'}
                          {characteristic.attribute_chart_type === 'u' && 'Defects per unit (u-chart)'}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
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
                )
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

              {activeSection === 'insights' && (
                <InsightsSection events={sampleInsights} formatDateTime={formatDateTime} />
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
