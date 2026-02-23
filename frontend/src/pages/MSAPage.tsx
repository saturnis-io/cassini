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
import { usePlantContext } from '@/providers/PlantProvider'
import { useMSAStudies, useDeleteMSAStudy } from '@/api/hooks'

const STUDY_TYPE_LABELS: Record<string, string> = {
  crossed_anova: 'Crossed ANOVA',
  nested_anova: 'Nested ANOVA',
  range_method: 'Range Method',
  attribute_agreement: 'Attribute Agreement',
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  setup: { bg: 'bg-blue-500/10', text: 'text-blue-500', label: 'Setup' },
  collecting: { bg: 'bg-amber-500/10', text: 'text-amber-500', label: 'Collecting' },
  complete: { bg: 'bg-green-500/10', text: 'text-green-500', label: 'Complete' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function MSAPage() {
  const navigate = useNavigate()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const { data: studies, isLoading } = useMSAStudies(plantId)
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
    <div className="flex max-w-6xl flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
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

      {/* Studies table */}
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      ) : !studies || studies.length === 0 ? (
        <div className="border-border flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed">
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
        <div className="border-border overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">Name</th>
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">Type</th>
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">Status</th>
                <th className="text-muted-foreground px-4 py-3 text-center font-medium">Operators</th>
                <th className="text-muted-foreground px-4 py-3 text-center font-medium">Parts</th>
                <th className="text-muted-foreground px-4 py-3 text-left font-medium">Created</th>
                <th className="text-muted-foreground px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {studies.map((study) => {
                const statusStyle = STATUS_STYLES[study.status] ?? STATUS_STYLES.setup
                return (
                  <tr
                    key={study.id}
                    className="border-border/50 hover:bg-muted/30 cursor-pointer border-t transition-colors"
                    onClick={() => navigate(`/msa/${study.id}`)}
                  >
                    <td className="px-4 py-3 font-medium">{study.name}</td>
                    <td className="text-muted-foreground px-4 py-3">
                      {STUDY_TYPE_LABELS[study.study_type] ?? study.study_type}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          statusStyle.bg,
                          statusStyle.text,
                        )}
                      >
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">{study.num_operators}</td>
                    <td className="px-4 py-3 text-center">{study.num_parts}</td>
                    <td className="text-muted-foreground px-4 py-3">{formatDate(study.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDeleteId(null)} />
          <div className="bg-card border-border relative mx-4 max-w-md rounded-xl border p-6 shadow-lg">
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
