import { useState } from 'react'
import { Pencil, X, MessageSquare, User, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import type { Annotation } from '@/types'
import type { useCreateAnnotation, useUpdateAnnotation, useDeleteAnnotation } from '@/api/hooks'

export interface AnnotationsSectionProps {
  annotations: Annotation[]
  characteristicId: number
  sampleId: number
  annotationText: string
  setAnnotationText: (text: string) => void
  createAnnotation: ReturnType<typeof useCreateAnnotation>
  updateAnnotation: ReturnType<typeof useUpdateAnnotation>
  deleteAnnotation: ReturnType<typeof useDeleteAnnotation>
  onAdd: () => void
}

export function AnnotationsSection({
  annotations,
  characteristicId,
  sampleId: _sampleId,
  annotationText,
  setAnnotationText,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  onAdd,
}: AnnotationsSectionProps) {
  const { formatDateTime } = useDateFormat()
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
                    {formatDateTime(wasEdited ? a.updated_at : a.created_at)}
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
                            {formatDateTime(entry.changed_at)}
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
