import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Microscope,
  Plus,
  Trash2,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { usePlantContext } from '@/providers/PlantProvider'
import { useMSAStudies, useDeleteMSAStudy } from '@/api/hooks'

const STUDY_TYPE_LABELS: Record<string, string> = {
  crossed_anova: 'Crossed ANOVA',
  nested_anova: 'Nested ANOVA',
  range_method: 'Range Method',
  attribute_agreement: 'Attribute Agreement',
  linearity: 'Linearity',
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  setup: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Setup' },
  collecting: { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'Collecting' },
  complete: { bg: 'bg-green-500/10', text: 'text-green-500', label: 'Complete' },
}

const STATUS_FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'setup', label: 'Setup' },
  { value: 'collecting', label: 'Collecting' },
  { value: 'complete', label: 'Complete' },
] as const

export function MSAPage() {
  const { formatDate } = useDateFormat()
  const navigate = useNavigate()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined)
  const { data: studies, isLoading } = useMSAStudies(plantId, statusFilter)
  const deleteMutation = useDeleteMSAStudy()

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  const handleDelete = async (id: number) => {
    setConfirmDeleteId(null)
    await deleteMutation.mutateAsync(id)
  }

  if (!selectedPlant) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground text-sm">Select a plant to view MSA studies.</p>
      </div>
    )
  }

  return (
    <div data-ui="msa-page" className="flex max-w-6xl flex-col gap-6 p-6">
      {/* Header */}
      <div data-ui="msa-header" className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-lg p-2">
            <Microscope className="text-primary h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Measurement System Analysis</h1>
            <p className="text-muted-foreground text-sm">
              Gage R&amp;R and Attribute Agreement studies
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/msa/new')}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Study
        </button>
      </div>

      {/* Status filter tabs */}
      <div data-ui="msa-filters" className="flex gap-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            onClick={() => setStatusFilter(f.value)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Studies table */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      ) : !studies || studies.length === 0 ? (
        <div data-ui="msa-empty-state" className="border-border flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed">
          <Microscope className="text-muted-foreground h-10 w-10" />
          <p className="text-muted-foreground text-sm">No MSA studies yet.</p>
          <button
            onClick={() => navigate('/msa/new')}
            className="text-primary hover:text-primary/80 mt-1 text-sm font-medium"
          >
            Create your first study
          </button>
        </div>
      ) : (
        <div data-ui="msa-content" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {studies.map((study) => {
            const statusStyle = STATUS_STYLES[study.status] ?? STATUS_STYLES.setup
            return (
              <div
                key={study.id}
                onClick={() => navigate(`/msa/${study.id}`)}
                className="bg-card text-card-foreground hover:border-primary/50 cursor-pointer rounded-lg border p-4 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium">{study.name}</h3>
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
                      <span className="bg-muted rounded px-1.5 py-0.5 text-xs font-medium">
                        {STUDY_TYPE_LABELS[study.study_type] ?? study.study_type}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmDeleteId(study.id)
                      }}
                      className="text-muted-foreground hover:text-destructive rounded p-1 transition-colors"
                      title="Delete study"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  </div>
                </div>
                <div className="text-muted-foreground mt-3 flex items-center gap-4 text-xs">
                  <span>{study.num_operators} operator{study.num_operators !== 1 ? 's' : ''}</span>
                  <span>{study.num_parts} part{study.num_parts !== 1 ? 's' : ''}</span>
                  <span>{study.num_replicates} replicate{study.num_replicates !== 1 ? 's' : ''}</span>
                  <span>{formatDate(study.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDeleteId(null)} />
          <div data-ui="msa-delete-confirm-dialog" className="bg-card border-border relative mx-4 max-w-md rounded-xl border p-6 shadow-lg">
            <h3 className="mb-2 text-lg font-semibold">Delete MSA Study?</h3>
            <p className="text-muted-foreground mb-6 text-sm">
              This will permanently delete the study and all associated measurements and results.
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deleteMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
