/**
 * AnnotationDialog - Modal for creating point and period annotations.
 *
 * Provides a dedicated UI for both annotation types, with period annotations
 * as the primary use case per CEO clarification.
 */

import { useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateAnnotation } from '@/api/hooks'
import type { AnnotationType } from '@/types'

interface AnnotationDialogProps {
  characteristicId: number
  dataPoints: Array<{ sample_id: number; index: number; timestamp: string }>
  onClose: () => void
  /** Pre-selected mode and sample for point annotations from chart click */
  initialMode?: 'point' | 'period'
  initialSampleId?: number
}

export function AnnotationDialog({
  characteristicId,
  dataPoints,
  onClose,
  initialMode = 'period',
  initialSampleId,
}: AnnotationDialogProps) {
  const [mode, setMode] = useState<AnnotationType>(initialMode)
  const [text, setText] = useState('')
  const [color, setColor] = useState<string>('')
  const [sampleId, setSampleId] = useState<number | null>(initialSampleId ?? null)
  const [startSampleId, setStartSampleId] = useState<number | null>(null)
  const [endSampleId, setEndSampleId] = useState<number | null>(null)

  const createAnnotation = useCreateAnnotation()

  const canSubmit = (() => {
    if (!text.trim()) return false
    if (mode === 'point' && sampleId === null) return false
    if (mode === 'period' && (startSampleId === null || endSampleId === null)) return false
    return true
  })()

  const handleSubmit = async () => {
    if (!canSubmit) return

    await createAnnotation.mutateAsync({
      characteristicId,
      data: {
        annotation_type: mode,
        text: text.trim(),
        color: color || undefined,
        sample_id: mode === 'point' ? sampleId : undefined,
        start_sample_id: mode === 'period' ? startSampleId : undefined,
        end_sample_id: mode === 'period' ? endSampleId : undefined,
      },
    })

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
          <h2 className="text-lg font-semibold">Add Annotation</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mb-5 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setMode('period')}
            className={cn(
              'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
              mode === 'period'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Period
          </button>
          <button
            onClick={() => setMode('point')}
            className={cn(
              'flex-1 py-1.5 text-sm font-medium rounded-md transition-colors',
              mode === 'point'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Point
          </button>
        </div>

        {/* Mode-specific fields */}
        {mode === 'point' ? (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1.5">Sample</label>
            <select
              value={sampleId ?? ''}
              onChange={(e) => setSampleId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select a sample...</option>
              {dataPoints.map((point) => (
                <option key={point.sample_id} value={point.sample_id}>
                  Sample #{point.index} - {new Date(point.timestamp).toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5">Start Sample</label>
              <select
                value={startSampleId ?? ''}
                onChange={(e) => setStartSampleId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select start sample...</option>
                {dataPoints.map((point) => (
                  <option key={point.sample_id} value={point.sample_id}>
                    Sample #{point.index} - {new Date(point.timestamp).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1.5">End Sample</label>
              <select
                value={endSampleId ?? ''}
                onChange={(e) => setEndSampleId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Select end sample...</option>
                {dataPoints
                  .filter((p) => startSampleId === null || p.index >= (dataPoints.find(d => d.sample_id === startSampleId)?.index ?? 0))
                  .map((point) => (
                    <option key={point.sample_id} value={point.sample_id}>
                      Sample #{point.index} - {new Date(point.timestamp).toLocaleString()}
                    </option>
                  ))}
              </select>
            </div>
          </>
        )}

        {/* Text input */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1.5">Annotation Text</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter annotation text..."
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
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
