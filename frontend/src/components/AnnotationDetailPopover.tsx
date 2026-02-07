import { useState } from 'react'
import { Pencil, Trash2, MessageSquare, Clock, User } from 'lucide-react'
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

  const typeLabel = annotation.annotation_type === 'point' ? 'Point Annotation' : 'Period Annotation'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover */}
      <div
        className={cn(
          'fixed z-50',
          'bg-popover border border-border rounded-xl shadow-xl',
          'min-w-[300px] max-w-[400px]',
          'animate-in fade-in-0 zoom-in-95 duration-100'
        )}
        style={{
          left: Math.min(anchorPosition.x - 150, window.innerWidth - 420),
          top: anchorPosition.y + 8,
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-muted/50 rounded-t-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold">{typeLabel}</span>
            </div>
            {annotation.color && (
              <div
                className="h-3 w-3 rounded-full border border-border"
                style={{ backgroundColor: annotation.color }}
              />
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* Annotation text */}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setIsEditing(false)
                    setEditText(annotation.text)
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!editText.trim() || updateAnnotation.isPending}
                  className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {updateAnnotation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{annotation.text}</p>
          )}

          {/* Metadata */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            {annotation.created_by && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span>{annotation.created_by}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Created {new Date(annotation.created_at).toLocaleString()}</span>
            </div>
            {annotation.updated_at !== annotation.created_at && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Updated {new Date(annotation.updated_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {!isEditing && (
          <div className="px-4 py-2.5 border-t border-border bg-muted/30 rounded-b-xl flex justify-end gap-1">
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDelete}
                  disabled={deleteAnnotation.isPending}
                  className="px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleteAnnotation.isPending ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
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
