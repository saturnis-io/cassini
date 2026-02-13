import { useState, useCallback } from 'react'
import {
  FileText,
  Plus,
  Play,
  Trash2,
  Edit,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Mail,
  Calendar,
  X,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlant } from '@/providers/PlantProvider'
import {
  useReportSchedules,
  useReportRuns,
  useCreateReportSchedule,
  useUpdateReportSchedule,
  useDeleteReportSchedule,
  useTriggerReport,
} from '@/api/hooks'
import { REPORT_TEMPLATES } from '@/lib/report-templates'
import type {
  ReportSchedule,
  ReportRun,
  CreateReportSchedule,
  UpdateReportSchedule,
} from '@/types'

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHrs = Math.floor(diffMs / 3_600_000)
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHrs < 24) return `${diffHrs}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle className="text-success h-4 w-4" />
    case 'failed':
      return <XCircle className="text-destructive h-4 w-4" />
    case 'running':
      return <Loader2 className="text-primary h-4 w-4 animate-spin" />
    default:
      return <Clock className="text-muted-foreground h-4 w-4" />
  }
}

export function ScheduledReports() {
  const { selectedPlant } = usePlant()
  const plantId = selectedPlant?.id ?? 0

  const { data: schedules = [], isLoading } = useReportSchedules(plantId)

  const createMutation = useCreateReportSchedule()
  const updateMutation = useUpdateReportSchedule()
  const deleteMutation = useDeleteReportSchedule()
  const triggerMutation = useTriggerReport()

  const [showForm, setShowForm] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ReportSchedule | null>(null)
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null)

  const handleCreate = useCallback(
    (data: CreateReportSchedule) => {
      createMutation.mutate(data, {
        onSuccess: () => {
          setShowForm(false)
        },
      })
    },
    [createMutation],
  )

  const handleUpdate = useCallback(
    (id: number, data: UpdateReportSchedule) => {
      updateMutation.mutate(
        { id, data },
        {
          onSuccess: () => {
            setEditingSchedule(null)
          },
        },
      )
    },
    [updateMutation],
  )

  const handleDelete = useCallback(
    (id: number) => {
      deleteMutation.mutate(id, {
        onSuccess: () => {
          setShowDeleteConfirm(null)
          if (selectedScheduleId === id) setSelectedScheduleId(null)
        },
      })
    },
    [deleteMutation, selectedScheduleId],
  )

  const handleTrigger = useCallback(
    (id: number) => {
      triggerMutation.mutate(id)
    },
    [triggerMutation],
  )

  if (!selectedPlant) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
        Select a site to manage scheduled reports.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Scheduled Reports</h2>
          <p className="text-muted-foreground text-sm">
            Automate PDF report generation and email delivery
          </p>
        </div>
        <button
          onClick={() => {
            setEditingSchedule(null)
            setShowForm(true)
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Schedule
        </button>
      </div>

      {/* Schedule List */}
      {isLoading ? (
        <div className="text-muted-foreground flex h-32 items-center justify-center text-sm">
          Loading schedules...
        </div>
      ) : schedules.length === 0 ? (
        <div className="bg-muted rounded-xl p-8 text-center">
          <FileText className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
          <p className="text-muted-foreground text-sm">
            No scheduled reports yet. Create one to automate report delivery.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              isSelected={selectedScheduleId === schedule.id}
              onSelect={() =>
                setSelectedScheduleId(selectedScheduleId === schedule.id ? null : schedule.id)
              }
              onEdit={() => {
                setEditingSchedule(schedule)
                setShowForm(true)
              }}
              onDelete={() => setShowDeleteConfirm(schedule.id)}
              onTrigger={() => handleTrigger(schedule.id)}
              isTriggering={triggerMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* Run History Panel */}
      {selectedScheduleId && (
        <RunHistoryPanel
          scheduleId={selectedScheduleId}
          scheduleName={schedules.find((s) => s.id === selectedScheduleId)?.name ?? ''}
        />
      )}

      {/* Create/Edit Dialog */}
      {showForm && (
        <ScheduleFormDialog
          schedule={editingSchedule}
          plantId={plantId}
          onSubmit={(data) => {
            if (editingSchedule) {
              handleUpdate(editingSchedule.id, data)
            } else {
              handleCreate({ ...data, plant_id: plantId } as CreateReportSchedule)
            }
          }}
          onClose={() => {
            setShowForm(false)
            setEditingSchedule(null)
          }}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowDeleteConfirm(null)}
        >
          <div
            className="bg-card border-border mx-4 w-full max-w-md rounded-2xl border p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold">Delete Schedule</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              This will permanently delete the schedule and all its run history. This action cannot
              be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                disabled={deleteMutation.isPending}
                className={cn(
                  'rounded-xl px-5 py-2.5 text-sm font-medium',
                  deleteMutation.isPending
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                )}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Schedule Card
// ------------------------------------------------------------------

function ScheduleCard({
  schedule,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onTrigger,
  isTriggering,
}: {
  schedule: ReportSchedule
  isSelected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onTrigger: () => void
  isTriggering: boolean
}) {
  const template = REPORT_TEMPLATES.find((t) => t.id === schedule.template_id)

  const frequencyLabel = FREQUENCY_LABELS[schedule.frequency] ?? schedule.frequency
  let scheduleDesc = `${frequencyLabel} at ${String(schedule.hour).padStart(2, '0')}:00 UTC`
  if (schedule.frequency === 'weekly' && schedule.day_of_week !== null) {
    scheduleDesc = `${DAY_NAMES[schedule.day_of_week]}s at ${String(schedule.hour).padStart(2, '0')}:00 UTC`
  } else if (schedule.frequency === 'monthly' && schedule.day_of_month !== null) {
    scheduleDesc = `${frequencyLabel} on day ${schedule.day_of_month} at ${String(schedule.hour).padStart(2, '0')}:00 UTC`
  }

  return (
    <div
      className={cn(
        'bg-card border-border rounded-xl border p-4 transition-colors',
        isSelected && 'ring-primary/50 ring-2',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button onClick={onSelect} className="text-left">
              <h3 className="truncate font-medium">{schedule.name}</h3>
            </button>
            <span
              className={cn(
                'badge text-[10px] inline-block rounded-full px-2 py-0.5 font-medium',
                schedule.is_active
                  ? 'bg-success/10 text-success'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {schedule.is_active ? 'Active' : 'Paused'}
            </span>
          </div>
          <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {template?.name ?? schedule.template_id}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {scheduleDesc}
            </span>
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {schedule.recipients.length} recipient{schedule.recipients.length !== 1 ? 's' : ''}
            </span>
            {schedule.last_run_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last run: {formatRelativeTime(schedule.last_run_at)}
              </span>
            )}
          </div>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-1.5">
          <button
            onClick={onTrigger}
            disabled={isTriggering}
            title="Run now"
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5 transition-colors"
          >
            {isTriggering ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={onEdit}
            title="Edit"
            className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5 transition-colors"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg p-1.5 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expand to show run history */}
      {isSelected && (
        <button
          onClick={onSelect}
          className="text-primary mt-2 flex items-center gap-1 text-xs font-medium"
        >
          <ChevronDown className="h-3 w-3" />
          View run history below
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------
// Run History Panel
// ------------------------------------------------------------------

function RunHistoryPanel({
  scheduleId,
  scheduleName,
}: {
  scheduleId: number
  scheduleName: string
}) {
  const { data: runs = [], isLoading } = useReportRuns(scheduleId)

  return (
    <div className="bg-muted rounded-xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="text-muted-foreground h-5 w-5" />
        <h3 className="font-semibold">Run History: {scheduleName}</h3>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading history...</div>
      ) : runs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No runs yet for this schedule.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="text-muted-foreground pb-2 font-medium">Status</th>
                <th className="text-muted-foreground pb-2 font-medium">Started</th>
                <th className="text-muted-foreground pb-2 text-right font-medium">Recipients</th>
                <th className="text-muted-foreground pb-2 text-right font-medium">PDF Size</th>
                <th className="text-muted-foreground pb-2 font-medium">Duration</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run: ReportRun) => (
                <RunRow key={run.id} run={run} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function RunRow({ run }: { run: ReportRun }) {
  const duration = run.completed_at
    ? `${Math.max(1, Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000))}s`
    : run.status === 'running'
      ? '...'
      : '-'

  return (
    <tr className="border-border/50 border-b last:border-0">
      <td className="py-2">
        <div className="flex items-center gap-1.5">
          <StatusIcon status={run.status} />
          <span
            className={cn(
              'text-xs font-medium capitalize',
              run.status === 'success' && 'text-success',
              run.status === 'failed' && 'text-destructive',
              run.status === 'running' && 'text-primary',
            )}
          >
            {run.status}
          </span>
        </div>
        {run.error_message && (
          <p
            className="text-destructive mt-0.5 max-w-[200px] truncate text-xs"
            title={run.error_message}
          >
            {run.error_message}
          </p>
        )}
      </td>
      <td className="text-muted-foreground py-2">{formatRelativeTime(run.started_at)}</td>
      <td className="py-2 text-right font-mono">{run.recipients_count}</td>
      <td className="py-2 text-right font-mono">{formatBytes(run.pdf_size_bytes)}</td>
      <td className="text-muted-foreground py-2">{duration}</td>
    </tr>
  )
}

// ------------------------------------------------------------------
// Schedule Form Dialog
// ------------------------------------------------------------------

function ScheduleFormDialog({
  schedule,
  plantId,
  onSubmit,
  onClose,
  isSubmitting,
}: {
  schedule: ReportSchedule | null
  plantId: number
  onSubmit: (data: CreateReportSchedule | UpdateReportSchedule) => void
  onClose: () => void
  isSubmitting: boolean
}) {
  const isEditing = schedule !== null

  const [name, setName] = useState(schedule?.name ?? '')
  const [templateId, setTemplateId] = useState(schedule?.template_id ?? REPORT_TEMPLATES[0]?.id ?? '')
  const [scopeType, setScopeType] = useState<'plant' | 'hierarchy' | 'characteristic'>(
    (schedule?.scope_type as 'plant' | 'hierarchy' | 'characteristic') ?? 'plant',
  )
  const [scopeId, setScopeId] = useState<string>(schedule?.scope_id?.toString() ?? '')
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>(
    (schedule?.frequency as 'daily' | 'weekly' | 'monthly') ?? 'weekly',
  )
  const [hour, setHour] = useState(schedule?.hour ?? 6)
  const [dayOfWeek, setDayOfWeek] = useState(schedule?.day_of_week ?? 0)
  const [dayOfMonth, setDayOfMonth] = useState(schedule?.day_of_month ?? 1)
  const [recipientInput, setRecipientInput] = useState('')
  const [recipients, setRecipients] = useState<string[]>(schedule?.recipients ?? [])
  const [windowDays, setWindowDays] = useState(schedule?.window_days ?? 7)
  const [isActive, setIsActive] = useState(schedule?.is_active ?? true)

  const addRecipient = useCallback(() => {
    const email = recipientInput.trim()
    if (email && email.includes('@') && !recipients.includes(email)) {
      setRecipients((prev) => [...prev, email])
      setRecipientInput('')
    }
  }, [recipientInput, recipients])

  const removeRecipient = useCallback((email: string) => {
    setRecipients((prev) => prev.filter((r) => r !== email))
  }, [])

  const handleSubmit = useCallback(() => {
    if (!name.trim() || recipients.length === 0) return

    if (isEditing) {
      const data: UpdateReportSchedule = {
        name: name.trim(),
        template_id: templateId,
        scope_type: scopeType,
        scope_id: scopeType === 'plant' ? null : (parseInt(scopeId) || null),
        frequency,
        hour,
        day_of_week: frequency === 'weekly' ? dayOfWeek : null,
        day_of_month: frequency === 'monthly' ? dayOfMonth : null,
        recipients,
        window_days: windowDays,
        is_active: isActive,
      }
      onSubmit(data)
    } else {
      const data: CreateReportSchedule = {
        name: name.trim(),
        template_id: templateId,
        scope_type: scopeType,
        scope_id: scopeType === 'plant' ? undefined : (parseInt(scopeId) || undefined),
        frequency,
        hour,
        day_of_week: frequency === 'weekly' ? dayOfWeek : undefined,
        day_of_month: frequency === 'monthly' ? dayOfMonth : undefined,
        recipients,
        window_days: windowDays,
        is_active: isActive,
        plant_id: plantId,
      }
      onSubmit(data)
    }
  }, [
    name,
    templateId,
    scopeType,
    scopeId,
    frequency,
    hour,
    dayOfWeek,
    dayOfMonth,
    recipients,
    windowDays,
    isActive,
    plantId,
    isEditing,
    onSubmit,
  ])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-card border-border mx-4 w-full max-w-lg rounded-2xl border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {isEditing ? 'Edit Schedule' : 'New Report Schedule'}
          </h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {/* Name */}
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekly SPC Summary"
              className="border-border bg-background focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>

          {/* Template */}
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
              Report Template
            </label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="border-border bg-background focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            >
              {REPORT_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Scope */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
                Scope
              </label>
              <select
                value={scopeType}
                onChange={(e) =>
                  setScopeType(e.target.value as 'plant' | 'hierarchy' | 'characteristic')
                }
                className="border-border bg-background focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              >
                <option value="plant">Entire Plant</option>
                <option value="hierarchy">Hierarchy Node</option>
                <option value="characteristic">Single Characteristic</option>
              </select>
            </div>
            {scopeType !== 'plant' && (
              <div>
                <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
                  {scopeType === 'hierarchy' ? 'Hierarchy ID' : 'Characteristic ID'}
                </label>
                <input
                  type="number"
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  placeholder="Enter ID"
                  className="border-border bg-background focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Frequency + Hour */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
                Frequency
              </label>
              <select
                value={frequency}
                onChange={(e) =>
                  setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')
                }
                className="border-border bg-background focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            {frequency === 'weekly' && (
              <div>
                <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
                  Day of Week
                </label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(parseInt(e.target.value))}
                  className="border-border bg-background focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                >
                  {DAY_NAMES.map((day, i) => (
                    <option key={i} value={i}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {frequency === 'monthly' && (
              <div>
                <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
                  Day of Month
                </label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(parseInt(e.target.value) || 1)}
                  className="border-border bg-background focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
                Hour (UTC)
              </label>
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(parseInt(e.target.value) || 0)}
                className="border-border bg-background focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              />
            </div>
          </div>

          {/* Window Days */}
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
              Data Window (days)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={windowDays}
              onChange={(e) => setWindowDays(parseInt(e.target.value) || 7)}
              className="border-border bg-background focus:ring-primary w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <p className="text-muted-foreground mt-0.5 text-xs">
              Number of days of historical data to include in the report
            </p>
          </div>

          {/* Recipients */}
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium uppercase tracking-wider">
              Recipients
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addRecipient()
                  }
                }}
                placeholder="email@example.com"
                className="border-border bg-background focus:ring-primary flex-1 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              />
              <button
                type="button"
                onClick={addRecipient}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg px-3 py-2 text-sm font-medium"
              >
                Add
              </button>
            </div>
            {recipients.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {recipients.map((email) => (
                  <span
                    key={email}
                    className="bg-muted flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
                  >
                    {email}
                    <button
                      onClick={() => removeRecipient(email)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Active Toggle */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Schedule is active</span>
          </label>
        </div>

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim() || recipients.length === 0}
            className={cn(
              'rounded-xl px-5 py-2.5 text-sm font-medium',
              isSubmitting || !name.trim() || recipients.length === 0
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
