import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardCheck,
  Plus,
  Trash2,
  Loader2,
  FileText,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { usePlantContext } from '@/providers/PlantProvider'
import { usePlants } from '@/api/hooks'
import {
  useFAIReports,
  useCreateFAIReport,
  useDeleteFAIReport,
} from '@/api/hooks'

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  draft: { label: 'Draft', bg: 'bg-gray-500/10', text: 'text-gray-600 dark:text-gray-400' },
  submitted: { label: 'Submitted', bg: 'bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400' },
  approved: { label: 'Approved', bg: 'bg-green-500/10', text: 'text-green-600 dark:text-green-400' },
  rejected: { label: 'Rejected', bg: 'bg-red-500/10', text: 'text-red-600 dark:text-red-400' },
}

export function FAIPage() {
  const { formatDate } = useDateFormat()
  const navigate = useNavigate()
  const selectedPlantId = usePlantContext().selectedPlant?.id ?? null
  const { data: plants } = usePlants()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const { data: reports, isLoading } = useFAIReports({
    plant_id: selectedPlantId ?? undefined,
    status: statusFilter,
  })
  const createReport = useCreateFAIReport()
  const deleteReport = useDeleteFAIReport()

  const handleNewReport = async () => {
    if (!selectedPlantId) {
      toast.error('Please select a site first')
      return
    }
    try {
      const report = await createReport.mutateAsync({
        plant_id: selectedPlantId,
        part_number: 'NEW-PART',
      })
      navigate(`/fai/${report.id}`)
    } catch {
      // Error handled by mutation hook
    }
  }

  const handleDelete = async (id: number) => {
    setConfirmDeleteId(null)
    try {
      await deleteReport.mutateAsync(id)
    } catch {
      // Error handled by mutation hook
    }
  }

  const plantName = (plantId: number) =>
    plants?.find((p) => p.id === plantId)?.name ?? `Plant ${plantId}`

  return (
    <div data-ui="fai-page" className="flex max-w-6xl flex-col gap-6 p-6">
      {/* Header */}
      <div data-ui="fai-header" className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-lg p-2">
            <ClipboardCheck className="text-primary h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">First Article Inspection</h1>
            <p className="text-muted-foreground text-sm">
              AS9102 Rev C compliant inspection reports
            </p>
          </div>
        </div>
        <button
          onClick={handleNewReport}
          disabled={createReport.isPending}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {createReport.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Report
        </button>
      </div>

      {/* Filters */}
      <div data-ui="fai-filters" className="flex gap-1">
        {[
          { value: undefined, label: 'All' },
          { value: 'draft', label: 'Draft' },
          { value: 'submitted', label: 'Submitted' },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
        ].map((opt) => (
          <button
            key={opt.label}
            onClick={() => setStatusFilter(opt.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === opt.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Reports table */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      ) : !reports || reports.length === 0 ? (
        <div data-ui="fai-empty-state" className="border-border flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed">
          <FileText className="text-muted-foreground h-10 w-10" />
          <p className="text-muted-foreground text-sm">No FAI reports found.</p>
          <button
            onClick={handleNewReport}
            disabled={createReport.isPending}
            className="text-primary hover:text-primary/80 mt-1 text-sm font-medium"
          >
            Create your first report
          </button>
        </div>
      ) : (
        <div data-ui="fai-content" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => {
            const statusStyle = STATUS_STYLES[report.status] ?? STATUS_STYLES.draft
            return (
              <div
                key={report.id}
                onClick={() => navigate(`/fai/${report.id}`)}
                className="bg-card text-card-foreground hover:border-primary/50 cursor-pointer rounded-lg border p-4 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">{report.part_number}</h3>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                          statusStyle.bg,
                          statusStyle.text,
                        )}
                      >
                        {statusStyle.label}
                      </span>
                      {report.revision && (
                        <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">
                          Rev {report.revision}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {report.status === 'draft' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setConfirmDeleteId(report.id)
                        }}
                        className="text-muted-foreground hover:text-destructive rounded p-1 transition-colors"
                        title="Delete report"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  </div>
                </div>
                <div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
                  {report.part_name && <span>{report.part_name}</span>}
                  <span>{plantName(report.plant_id)}</span>
                  <span>{formatDate(report.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDeleteId(null)} />
          <div data-ui="fai-delete-confirm-dialog" className="bg-card border-border relative mx-4 max-w-sm rounded-xl border p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold">Delete Report?</h3>
            <p className="text-muted-foreground mb-6 text-sm">
              This will permanently delete this draft FAI report and all its inspection items.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg px-4 py-2 text-sm font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
