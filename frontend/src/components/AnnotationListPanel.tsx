/**
 * AnnotationListPanel - Collapsible panel listing annotations for a characteristic.
 *
 * Compact list view: shows only current text per annotation.
 * Clicking Edit expands to show textarea + change history.
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { MessageSquare, ChevronDown, ChevronUp, Pencil, Trash2, MapPin, CalendarRange, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAnnotations, useUpdateAnnotation, useDeleteAnnotation } from '@/api/hooks'
import { useChartHoverSync } from '@/contexts/ChartHoverContext'
import type { Annotation } from '@/types'

interface AnnotationListPanelProps {
  characteristicId: number
  visibleSampleIds?: Set<number> | null
  visibleTimeRange?: [string, string] | null
  className?: string
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
      return timeRangesOverlap(ann.start_time, ann.end_time, visibleTimeRange[0], visibleTimeRange[1])
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

function formatTimeRangeShort(startIso: string, endIso: string): string {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const timeFmt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  const dateFmt: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (start.toDateString() === end.toDateString()) {
    return `${start.toLocaleDateString(undefined, dateFmt)} ${start.toLocaleTimeString(undefined, timeFmt)}–${end.toLocaleTimeString(undefined, timeFmt)}`
  }
  return `${start.toLocaleDateString(undefined, dateFmt)} – ${end.toLocaleDateString(undefined, dateFmt)}`
}

export function AnnotationListPanel({ characteristicId, visibleSampleIds, visibleTimeRange, className }: AnnotationListPanelProps) {
  const { data: annotations, isLoading } = useAnnotations(characteristicId, true)
  const { hoveredSampleIds } = useChartHoverSync(characteristicId)
  const [expanded, setExpanded] = useState(true)
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
    <div className={cn('bg-card border border-border rounded-xl overflow-hidden flex-shrink-0', className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">Annotations</span>
          {totalCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 font-medium">
              {visibleCount < totalCount ? `${visibleCount}/${totalCount}` : totalCount}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* List */}
      {expanded && (
        <div className="border-t border-border">
          {visibleCount === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {totalCount > 0
                ? 'No annotations in the current viewport. Adjust the range slider to see more.'
                : 'No annotations yet. Click a data point or use the Annotate button to add one.'}
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto divide-y divide-border">
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
                        ? 'bg-amber-500/10 border-l-2 border-l-amber-500'
                        : 'border-l-2 border-l-transparent',
                      !isEditing && 'hover:bg-muted/30'
                    )}
                  >
                    {isEditing ? (
                      /* ── Expanded edit view ── */
                      <div className="space-y-2">
                        {/* Context: what type + when */}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          {ann.annotation_type === 'point' ? (
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> Point</span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <CalendarRange className="h-3 w-3" />
                              {ann.start_time && ann.end_time ? formatTimeRangeShort(ann.start_time, ann.end_time) : 'Period'}
                            </span>
                          )}
                          <span className="ml-auto">
                            {ann.created_by && <span>{ann.created_by} · </span>}
                            {new Date(ann.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          maxLength={500}
                          className="w-full px-2.5 py-1.5 bg-background border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                          autoFocus
                        />
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSave(ann)}
                            disabled={!editText.trim() || updateAnnotation.isPending}
                            className="px-2.5 py-1 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                          >
                            Save
                          </button>
                        </div>

                        {/* Change history — only visible here in edit mode */}
                        {ann.history && ann.history.length > 0 && (
                          <div className="pt-1 border-t border-border/50">
                            <div className="flex items-center gap-1 mb-1">
                              <History className="h-3 w-3 text-muted-foreground" />
                              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Previous values</span>
                            </div>
                            <div className="max-h-24 overflow-y-auto space-y-1">
                              {ann.history.map((entry) => (
                                <div key={entry.id} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                                  <span className="flex-shrink-0 text-[10px] mt-0.5">
                                    {new Date(entry.changed_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span className="italic break-words min-w-0">&ldquo;{entry.previous_text}&rdquo;</span>
                                  {entry.changed_by && (
                                    <span className="flex-shrink-0 text-[10px] mt-0.5">&mdash; {entry.changed_by}</span>
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
                          <MapPin className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
                        ) : (
                          <CalendarRange className="h-3 w-3 flex-shrink-0 text-muted-foreground/50" />
                        )}
                        <span className={cn(
                          'text-sm truncate flex-1 min-w-0',
                          highlighted && 'font-medium'
                        )}>
                          {ann.text}
                        </span>
                        {ann.history && ann.history.length > 0 && (
                          <span className="text-[9px] text-muted-foreground/50 italic flex-shrink-0">edited</span>
                        )}
                        <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
                          <button
                            onClick={() => handleStartEdit(ann)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          {isDeleting ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(ann)}
                                disabled={deleteAnnotation.isPending}
                                className="px-2 py-0.5 text-[10px] font-medium bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 disabled:opacity-50"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingId(ann.id)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
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
          )}
        </div>
      )}
    </div>
  )
}
