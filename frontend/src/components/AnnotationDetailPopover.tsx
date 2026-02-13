import { useState } from 'react'
import { Pencil, Trash2, MessageSquare, Clock, User, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUpdateAnnotation, useDeleteAnnotation } from '@/api/hooks'
import type { Annotation } from '@/types'

interface AnnotationDetailPopoverProps {
  annotation: Annotation
  characteristicId: number
  /** Pixel position for anchoring the popover */
  anchorPosition: { x: number; y: number }
  onClose: () => void
}

export function AnnotationDetailPopover({
  annotation,
  characteristicId,
  anchorPosition,
  onClose,
}: AnnotationDetailPopoverProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(annotation.text)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const updateAnnotation = useUpdateAnnotation()
  const deleteAnnotation = useDeleteAnnotation()

  const handleSave = async () => {
    if (!editText.trim()) return
    await updateAnnotation.mutateAsync({
      characteristicId,
      annotationId: annotation.id,
      data: { text: editText.trim() },
    })
    setIsEditing(false)
  }

  const handleDelete = async () => {
    await deleteAnnotation.mutateAsync({
      characteristicId,
      annotationId: annotation.id,
    })
    onClose()
  }

  const typeLabel =
    annotation.annotation_type === 'point' ? 'Point Annotation' : 'Period Annotation'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover */}
      <div
        className={cn(
          'fixed z-50',
          'bg-popover border-border rounded-xl border shadow-xl',
          'max-w-[400px] min-w-[300px]',
          'animate-in fade-in-0 zoom-in-95 duration-100',
        )}
        style={{
          left: Math.min(anchorPosition.x - 150, window.innerWidth - 420),
          top: anchorPosition.y + 8,
        }}
      >
        {/* Header */}
        <div className="border-border bg-muted/50 rounded-t-xl border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="text-warning h-4 w-4" />
              <span className="text-sm font-semibold">{typeLabel}</span>
            </div>
            {annotation.color && (
              <div
                className="border-border h-3 w-3 rounded-full border"
                style={{ backgroundColor: annotation.color }}
              />
            )}
          </div>
        </div>

        {/* Body */}
        <div className="space-y-3 px-4 py-3">
          {/* Annotation text */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                maxLength={500}
                className="bg-background border-border focus:ring-primary/50 w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditText(annotation.text)
                  }}
                  className="text-muted-foreground hover:text-foreground border-border rounded-lg border px-3 py-1.5 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!editText.trim() || updateAnnotation.isPending}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {updateAnnotation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
              {/* Edit history */}
              {annotation.history && annotation.history.length > 0 && (
                <div className="border-border/50 border-t pt-2">
                  <div className="mb-1.5 flex items-center gap-1">
                    <History className="text-muted-foreground h-3 w-3" />
                    <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
                      Previous values
                    </span>
                  </div>
                  <div className="max-h-24 space-y-1.5 overflow-y-auto">
                    {annotation.history.map((entry) => (
                      <div key={entry.id} className="text-muted-foreground text-[11px]">
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <span className="text-[10px]">
                            {new Date(entry.changed_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {entry.changed_by && (
                            <span className="text-[10px]">&mdash; {entry.changed_by}</span>
                          )}
                        </div>
                        <p className="border-border/50 border-l pl-2 italic">
                          &ldquo;{entry.previous_text}&rdquo;
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{annotation.text}</p>
          )}

          {/* Metadata */}
          <div className="border-border space-y-1.5 border-t pt-2">
            {annotation.created_by && (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <User className="h-3 w-3" />
                <span>{annotation.created_by}</span>
              </div>
            )}
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Clock className="h-3 w-3" />
              <span>Created {new Date(annotation.created_at).toLocaleString()}</span>
            </div>
            {annotation.updated_at !== annotation.created_at && (
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                <Clock className="h-3 w-3" />
                <span>Updated {new Date(annotation.updated_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isEditing && (
          <div className="border-border bg-muted/30 flex justify-end gap-1 rounded-b-xl border-t px-4 py-2.5">
            <button
              onClick={() => setIsEditing(true)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={deleteAnnotation.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  {deleteAnnotation.isPending ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-muted-foreground hover:text-foreground rounded-lg px-3 py-1.5 text-xs font-medium"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
