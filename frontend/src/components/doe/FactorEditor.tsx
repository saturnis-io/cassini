import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FactorRow {
  name: string
  low_level: number
  high_level: number
  unit?: string
}

interface FactorEditorProps {
  factors: FactorRow[]
  onChange: (factors: FactorRow[]) => void
  designType: string
}

const MIN_FACTORS: Record<string, number> = {
  full_factorial: 2,
  fractional_factorial: 3,
  plackett_burman: 2,
  central_composite: 2,
}

const MAX_FACTORS: Record<string, number> = {
  full_factorial: 7,
  fractional_factorial: 15,
  plackett_burman: 23,
  central_composite: 7,
  box_behnken: 7,
}

function getMinFactors(designType: string): number {
  return MIN_FACTORS[designType] ?? 2
}

function getMaxFactors(designType: string): number {
  return MAX_FACTORS[designType] ?? 7
}

export function FactorEditor({ factors, onChange, designType }: FactorEditorProps) {
  const minCount = getMinFactors(designType)
  const maxCount = getMaxFactors(designType)
  const canRemove = factors.length > minCount
  const canAdd = factors.length < maxCount

  const addFactor = () => {
    if (!canAdd) return
    const letter = String.fromCharCode(65 + factors.length) // A, B, C, ...
    onChange([
      ...factors,
      { name: `Factor ${letter}`, low_level: -1, high_level: 1 },
    ])
  }

  const removeFactor = (index: number) => {
    if (!canRemove) return
    onChange(factors.filter((_, i) => i !== index))
  }

  const updateFactor = (index: number, field: keyof FactorRow, value: string) => {
    const updated = [...factors]
    if (field === 'low_level' || field === 'high_level') {
      updated[index] = { ...updated[index], [field]: parseFloat(value) || 0 }
    } else {
      updated[index] = { ...updated[index], [field]: value }
    }
    onChange(updated)
  }

  const getValidationErrors = (factor: FactorRow, index: number): string[] => {
    const errors: string[] = []
    if (!factor.name.trim()) {
      errors.push('Name is required')
    }
    const duplicate = factors.findIndex(
      (f, i) => i !== index && f.name.trim().toLowerCase() === factor.name.trim().toLowerCase(),
    )
    if (duplicate >= 0) {
      errors.push('Duplicate name')
    }
    if (factor.low_level >= factor.high_level) {
      errors.push('Low must be less than High')
    }
    return errors
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          Factors ({factors.length})
          <span className="text-muted-foreground ml-1 font-normal">
            (min {minCount}, max {maxCount})
          </span>
        </label>
        <button
          type="button"
          onClick={addFactor}
          disabled={!canAdd}
          className={cn(
            'flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Factor
        </button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_100px_100px_80px_32px] items-center gap-2 px-1">
        <span className="text-muted-foreground text-xs font-medium">Name</span>
        <span className="text-muted-foreground text-xs font-medium">Low Level</span>
        <span className="text-muted-foreground text-xs font-medium">High Level</span>
        <span className="text-muted-foreground text-xs font-medium">Unit</span>
        <span />
      </div>

      {/* Factor rows */}
      {factors.map((factor, index) => {
        const errors = getValidationErrors(factor, index)
        const center = (factor.low_level + factor.high_level) / 2
        const hasError = errors.length > 0

        return (
          <div key={index} className="space-y-1">
            <div className="grid grid-cols-[1fr_100px_100px_80px_32px] items-center gap-2">
              <input
                type="text"
                value={factor.name}
                onChange={(e) => updateFactor(index, 'name', e.target.value)}
                placeholder={`Factor ${String.fromCharCode(65 + index)}`}
                className={cn(
                  'bg-background border-border focus:ring-primary/50 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none',
                  hasError && 'border-destructive',
                )}
              />
              <input
                type="number"
                step="any"
                value={factor.low_level}
                onChange={(e) => updateFactor(index, 'low_level', e.target.value)}
                className={cn(
                  'bg-background border-border focus:ring-primary/50 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none',
                  factor.low_level >= factor.high_level && 'border-destructive',
                )}
              />
              <input
                type="number"
                step="any"
                value={factor.high_level}
                onChange={(e) => updateFactor(index, 'high_level', e.target.value)}
                className={cn(
                  'bg-background border-border focus:ring-primary/50 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none',
                  factor.low_level >= factor.high_level && 'border-destructive',
                )}
              />
              <input
                type="text"
                value={factor.unit ?? ''}
                onChange={(e) => updateFactor(index, 'unit', e.target.value)}
                placeholder="e.g. C"
                className="bg-background border-border focus:ring-primary/50 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeFactor(index)}
                disabled={!canRemove}
                className="text-muted-foreground hover:text-destructive rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                title="Remove factor"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {factor.low_level < factor.high_level && (
              <div className="text-muted-foreground px-1 text-xs">
                Center: {center.toFixed(2)}
              </div>
            )}
            {errors.length > 0 && (
              <div className="text-destructive px-1 text-xs">{errors.join('; ')}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
