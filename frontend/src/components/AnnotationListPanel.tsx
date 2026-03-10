/**
 * AnnotationListPanel - Collapsible panel listing annotations for a characteristic.
 *
 * Compact list view: shows only current text per annotation.
 * Clicking Edit expands to show textarea + change history.
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import {
  Pencil,
  Trash2,
  MapPin,
  CalendarRange,
  History,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { applyFormat } from '@/lib/date-format'
import { useAnnotations, useUpdateAnnotation, useDeleteAnnotation } from '@/api/hooks'
import { useChartHoverSync } from '@/stores/chartHoverStore'
import type { Annotation } from '@/types'

interface AnnotationListPanelProps {
  characteristicId: number
  visibleSampleIds?: Set<number> | null
  visibleTimeRange?: [string, string] | null
  className?: string
  /** Callback to open annotation creation dialog */
  onAddAnnotation?: () => void
}

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

function isAnnotationVisible(
  ann: Annotation,
  visibleIds: Set<number> | null | undefined,
  visibleTimeRange: [string, string] | null | undefined,
): boolean {
  if (ann.annotation_type === 'point' && ann.sample_id != null) {
    if (!visibleIds) return true
    return visibleIds.has(ann.sample_id)
  }
  if (ann.annotation_type === 'period') {
    if (ann.start_time && ann.end_time) {
      if (!visibleTimeRange) return true
      return timeRangesOverlap(
        ann.start_time,
        ann.end_time,
        visibleTimeRange[0],
        visibleTimeRange[1],
      )
    }
    if (ann.start_sample_id != null && ann.end_sample_id != null) {
      if (!visibleIds) return true
      if (visibleIds.has(ann.start_sample_id) || visibleIds.has(ann.end_sample_id)) return true
      for (const id of visibleIds) {
        if (id >= ann.start_sample_id && id <= ann.end_sample_id) return true
      }
      return false
    }
  }
  return true
}

function isAnnotationHighlighted(ann: Annotation, hoveredIds: Set<number> | null): boolean {
  if (!hoveredIds) return false
  if (ann.annotation_type === 'point' && ann.sample_id != null) {
    return hoveredIds.has(ann.sample_id)
  }
  return false
}

function formatTimeRangeShort(startIso: string, endIso: string, dateFmt: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const timeFmtOpts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  if (start.toDateString() === end.toDateString()) {
    return `${applyFormat(start, dateFmt)} ${start.toLocaleTimeString(undefined, timeFmtOpts)}–${end.toLocaleTimeString(undefined, timeFmtOpts)}`
  }
  return `${applyFormat(start, dateFmt)} – ${applyFormat(end, dateFmt)}`
}

export function AnnotationListPanel({
  characteristicId,
  visibleSampleIds,
  visibleTimeRange,
  className,
  onAddAnnotation,
}: AnnotationListPanelProps) {
  const { dateFormat, formatDateTime } = useDateFormat()
  const { data: annotations, isLoading } = useAnnotations(characteristicId, true)
  const { hoveredSampleIds } = useChartHoverSync(characteristicId)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const highlightedRef = useRef<HTMLDivElement>(null)

  const updateAnnotation = useUpdateAnnotation()
  const deleteAnnotation = useDeleteAnnotation()

  const filteredAnnotations = useMemo(() => {
    if (!annotations) return []
    return annotations.filter((ann) => isAnnotationVisible(ann, visibleSampleIds, visibleTimeRange))
  }, [annotations, visibleSampleIds, visibleTimeRange])

  const totalCount = annotations?.length ?? 0
  const visibleCount = filteredAnnotations.length

  useEffect(() => {
    if (highlightedRef.current) {
      highlightedRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [hoveredSampleIds])

  const handleStartEdit = (ann: Annotation) => {
    setEditingId(ann.id)
    setEditText(ann.text)
  }

  const handleSave = async (ann: Annotation) => {
    if (!editText.trim()) return
    await updateAnnotation.mutateAsync({
      characteristicId,
      annotationId: ann.id,
      data: { text: editText.trim() },
    })
    setEditingId(null)
  }

  const handleDelete = async (ann: Annotation) => {
    await deleteAnnotation.mutateAsync({
      characteristicId,
      annotationId: ann.id,
    })
    setDeletingId(null)
  }

  if (isLoading) return null

  return (
    <div
      className={cn(
        'flex-shrink-0 overflow-hidden',
        className,
      )}
    >
      {visibleCount === 0 ? (
        <div className="text-muted-foreground px-4 py-6 text-center text-sm">
          {totalCount > 0
            ? 'No annotations in the current viewport. Adjust the range slider to see more.'
            : (
              <div className="space-y-2">
                <p>No annotations yet.</p>
                <p className="text-muted-foreground/70 text-xs">
                  Click a data point to annotate it
                  {onAddAnnotation && ', or use the button below for a period annotation'}.
                </p>
                {onAddAnnotation && (
                  <button
                    onClick={onAddAnnotation}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/60 inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add period annotation</span>
                  </button>
                )}
              </div>
            )}
        </div>
      ) : (
        <div>
          {onAddAnnotation && (
            <div className="flex justify-end px-3 py-1">
              <button
                onClick={onAddAnnotation}
                className="text-muted-foreground hover:text-foreground hover:bg-muted/60 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors"
                title="Add period annotation"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </div>
          )}
          <div className="divide-border max-h-48 divide-y overflow-y-auto">
            {filteredAnnotations.map((ann) => {
                const highlighted = isAnnotationHighlighted(ann, hoveredSampleIds)
                const isEditing = editingId === ann.id
                const isDeleting = deletingId === ann.id

                return (
                  <div
                    key={ann.id}
                    ref={highlighted ? highlightedRef : undefined}
                    className={cn(
                      'px-4 transition-colors',
                      isEditing ? 'py-3' : 'py-2',
                      highlighted
                        ? 'border-l-warning bg-warning/10 border-l-2'
                        : 'border-l-2 border-l-transparent',
                      !isEditing && 'hover:bg-muted/30',
                    )}
                  >
                    {isEditing ? (
                      /* ── Expanded edit view ── */
                      <div className="space-y-2">
                        {/* Context: what type + when */}
                        <div className="text-muted-foreground flex items-center gap-2 text-[10px]">
                          {ann.annotation_type === 'point' ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> Point
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <CalendarRange className="h-3 w-3" />
                              {ann.start_time && ann.end_time
                                ? formatTimeRangeShort(ann.start_time, ann.end_time, dateFormat)
                                : 'Period'}
                            </span>
                          )}
                          <span className="ml-auto">
                            {ann.created_by && <span>{ann.created_by} · </span>}
                            {formatDateTime(ann.created_at)}
                          </span>
                        </div>

                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          maxLength={500}
                          className="bg-background border-border focus:ring-primary/50 w-full resize-none rounded-lg border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
                          autoFocus
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-muted-foreground hover:text-foreground border-border rounded-md border px-2.5 py-1 text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSave(ann)}
                            disabled={!editText.trim() || updateAnnotation.isPending}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-2.5 py-1 text-xs disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>

                        {/* Change history — only visible here in edit mode */}
                        {ann.history && ann.history.length > 0 && (
                          <div className="border-border/50 border-t pt-1">
                            <div className="mb-1 flex items-center gap-1">
                              <History className="text-muted-foreground h-3 w-3" />
                              <span className="text-muted-foreground text-[10px] font-medium tracking-wider uppercase">
                                Previous values
                              </span>
                            </div>
                            <div className="max-h-24 space-y-1 overflow-y-auto">
                              {ann.history.map((entry) => (
                                <div
                                  key={entry.id}
                                  className="text-muted-foreground flex items-start gap-2 text-[11px]"
                                >
                                  <span className="mt-0.5 flex-shrink-0 text-[10px]">
                                    {formatDateTime(entry.changed_at)}
                                  </span>
                                  <span className="min-w-0 break-words italic">
                                    &ldquo;{entry.previous_text}&rdquo;
                                  </span>
                                  {entry.changed_by && (
                                    <span className="mt-0.5 flex-shrink-0 text-[10px]">
                                      &mdash; {entry.changed_by}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* ── Compact read-only row: just the text + action icons ── */
                      <div className="flex items-center gap-2">
                        {ann.annotation_type === 'point' ? (
                          <MapPin className="text-muted-foreground/50 h-3 w-3 flex-shrink-0" />
                        ) : (
                          <CalendarRange className="text-muted-foreground/50 h-3 w-3 flex-shrink-0" />
                        )}
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm',
                            highlighted && 'font-medium',
                          )}
                        >
                          {ann.text}
                        </span>
                        {ann.history && ann.history.length > 0 && (
                          <span className="text-muted-foreground/50 flex-shrink-0 text-[9px] italic">
                            edited
                          </span>
                        )}
                        <div className="ml-auto flex flex-shrink-0 items-center gap-0.5">
                          <button
                            onClick={() => handleStartEdit(ann)}
                            className="hover:bg-muted text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          {isDeleting ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(ann)}
                                disabled={deleteAnnotation.isPending}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded px-2 py-0.5 text-[10px] font-medium disabled:opacity-50"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="text-muted-foreground hover:text-foreground px-1.5 py-0.5 text-[10px]"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingId(ann.id)}
                              className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded p-1 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
