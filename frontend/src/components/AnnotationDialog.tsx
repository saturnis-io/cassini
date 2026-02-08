/**
 * AnnotationDialog - Modal for creating annotations.
 *
 * Two modes (determined by how the dialog was opened — no toggle):
 * - Point: Annotate a specific data point (opened by clicking a chart point)
 * - Period: Annotate a time range (opened by the toolbar Annotate button)
 */

import { useState } from 'react'
import { X, MapPin, CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateAnnotation } from '@/api/hooks'

interface AnnotationDialogProps {
  characteristicId: number
  onClose: () => void
  /** Mode determines the annotation type — set by the caller, not toggleable. */
  mode: 'point' | 'period'
  /** For point mode: the sample being annotated */
  sampleId?: number
  /** For point mode: display info about the sample */
  sampleLabel?: string
}

/** Convert a Date to datetime-local input value (local timezone) */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function AnnotationDialog({
  characteristicId,
  onClose,
  mode,
  sampleId,
  sampleLabel,
}: AnnotationDialogProps) {
  const [text, setText] = useState('')
  const [color, setColor] = useState<string>('')

  // Period mode: default to last 1 hour
  const now = new Date()
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const [startTime, setStartTime] = useState(toDatetimeLocal(oneHourAgo))
  const [endTime, setEndTime] = useState(toDatetimeLocal(now))

  const createAnnotation = useCreateAnnotation()

  const canSubmit = (() => {
    if (!text.trim()) return false
    if (mode === 'point' && !sampleId) return false
    if (mode === 'period' && (!startTime || !endTime || new Date(startTime) >= new Date(endTime))) return false
    return true
  })()

  const handleSubmit = async () => {
    if (!canSubmit) return

    if (mode === 'point') {
      await createAnnotation.mutateAsync({
        characteristicId,
        data: {
          annotation_type: 'point',
          text: text.trim(),
          color: color || undefined,
          sample_id: sampleId,
        },
      })
    } else {
      await createAnnotation.mutateAsync({
        characteristicId,
        data: {
          annotation_type: 'period',
          text: text.trim(),
          color: color || undefined,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
        },
      })
    }

    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {mode === 'point' ? (
              <MapPin className="h-5 w-5 text-amber-500" />
            ) : (
              <CalendarRange className="h-5 w-5 text-amber-500" />
            )}
            <h2 className="text-lg font-semibold">
              {mode === 'point' ? 'Annotate Data Point' : 'Annotate Time Range'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode-specific fields */}
        {mode === 'point' ? (
          <div className="mb-4 px-3 py-2.5 bg-muted/50 border border-border rounded-lg">
            <div className="text-xs font-medium text-muted-foreground mb-0.5">Data Point</div>
            <div className="text-sm font-medium">{sampleLabel || `Sample #${sampleId}`}</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Start</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">End</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            {startTime && endTime && new Date(startTime) >= new Date(endTime) && (
              <div className="col-span-2 text-xs text-destructive">
                Start time must be before end time.
              </div>
            )}
          </div>
        )}

        {/* Text input */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1.5">Note</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={mode === 'point' ? 'Note about this data point...' : 'e.g., Changeover, Material batch switch, Equipment maintenance...'}
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            autoFocus
          />
          <div className="text-xs text-muted-foreground mt-1">{text.length}/500</div>
        </div>

        {/* Color picker */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-1.5">Color (optional)</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={color || '#6366f1'}
              onChange={(e) => setColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-border"
            />
            <span className="text-sm text-muted-foreground">
              {color || 'Default (theme primary)'}
            </span>
            {color && (
              <button
                onClick={() => setColor('')}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || createAnnotation.isPending}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              canSubmit && !createAnnotation.isPending
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {createAnnotation.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
