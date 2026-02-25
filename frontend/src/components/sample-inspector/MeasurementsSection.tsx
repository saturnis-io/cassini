import { Pencil, Ban, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatCard, MiniBarChart } from './shared'

export interface MeasurementsSectionProps {
  measurementValues: number[]
  stats: { min: number; max: number; range: number; mean: number; count: number } | null
  precision: number
  isEditing: boolean
  editValues: number[]
  editReason: string
  setEditValues: (values: number[]) => void
  setEditReason: (reason: string) => void
  canEdit: boolean
  isSaving: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  canExclude: boolean
  isExcluded: boolean
  isExcluding: boolean
  onToggleExclude: () => void
}

export function MeasurementsSection({
  measurementValues,
  stats,
  precision,
  isEditing,
  editValues,
  editReason,
  setEditValues,
  setEditReason,
  canEdit,
  isSaving,
  onStartEdit,
  onCancelEdit,
  onSave,
  canExclude,
  isExcluded,
  isExcluding,
  onToggleExclude,
}: MeasurementsSectionProps) {
  return (
    <div className="space-y-4">
      {/* Action buttons */}
      {(canEdit || canExclude) && (
        <div className="flex items-center gap-2">
          {canEdit && !isEditing && (
            <button
              onClick={onStartEdit}
              className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <Pencil className="h-3 w-3" />
              Edit Measurements
            </button>
          )}
          {canExclude && (
            <button
              onClick={onToggleExclude}
              disabled={isExcluding}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                isExcluded
                  ? 'border-success/30 text-success hover:bg-success/10'
                  : 'border-destructive/30 text-destructive hover:bg-destructive/10',
              )}
            >
              {isExcluded ? (
                <>
                  <RotateCcw className="h-3 w-3" />
                  Restore Sample
                </>
              ) : (
                <>
                  <Ban className="h-3 w-3" />
                  Exclude Sample
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Measurement grid */}
      <div className="border-border overflow-hidden rounded-lg border">
        <div className="bg-muted/30 text-muted-foreground border-border border-b px-3 py-2 text-xs font-medium">
          Measurements ({measurementValues.length})
        </div>
        <div className="bg-border grid grid-cols-5 gap-px">
          {(isEditing ? editValues : measurementValues).map((value, idx) => (
            <div key={idx} className="bg-card px-3 py-2">
              <div className="text-muted-foreground mb-0.5 text-[10px]">M{idx + 1}</div>
              {isEditing ? (
                <input
                  type="number"
                  step="any"
                  value={value}
                  onChange={(e) => {
                    const next = [...editValues]
                    next[idx] = parseFloat(e.target.value) || 0
                    setEditValues(next)
                  }}
                  className="bg-background border-border focus:ring-primary w-full rounded border px-1.5 py-0.5 font-mono text-sm focus:ring-1 focus:outline-none"
                />
              ) : (
                <div className="font-mono text-sm tabular-nums">
                  {(value ?? 0).toFixed(precision)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Edit reason + save/cancel */}
      {isEditing && (
        <div className="space-y-2">
          <textarea
            placeholder="Reason for edit (required)..."
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            className="bg-background border-border focus:ring-primary w-full resize-none rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
            rows={2}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={onSave}
              disabled={!editReason.trim() || isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={onCancelEdit}
              className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Stats row */}
      {stats && !isEditing && (
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Mean" value={stats.mean.toFixed(precision)} />
          <StatCard label="Range" value={stats.range.toFixed(precision)} />
          <StatCard label="Min" value={stats.min.toFixed(precision)} />
          <StatCard label="Max" value={stats.max.toFixed(precision)} />
        </div>
      )}

      {/* Mini bar chart */}
      {!isEditing && measurementValues.length > 1 && stats && (
        <MiniBarChart
          values={measurementValues}
          min={stats.min}
          max={stats.max}
          mean={stats.mean}
          precision={precision}
        />
      )}
    </div>
  )
}
