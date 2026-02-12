import { useState } from 'react'
import { Infinity, Hash, Calendar, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RetentionPolicySet } from '@/types'

type RetentionType = 'forever' | 'sample_count' | 'time_delta'
type TimeUnit = 'days' | 'months' | 'years'

interface RetentionPolicyFormProps {
  initialPolicy?: RetentionPolicySet | null
  onSubmit: (policy: RetentionPolicySet) => void
  onCancel: () => void
  submitLabel?: string
  isSubmitting?: boolean
}

const TYPE_OPTIONS: { value: RetentionType; label: string; icon: typeof Infinity }[] = [
  { value: 'forever', label: 'Forever', icon: Infinity },
  { value: 'sample_count', label: 'By Count', icon: Hash },
  { value: 'time_delta', label: 'By Age', icon: Calendar },
]

function unitToDays(value: number, unit: TimeUnit): number {
  switch (unit) {
    case 'days': return value
    case 'months': return value * 30
    case 'years': return value * 365
  }
}

function parseInitialUnit(unit: string | null | undefined): TimeUnit {
  if (unit === 'months' || unit === 'years') return unit
  return 'days'
}

export function RetentionPolicyForm({
  initialPolicy,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  isSubmitting = false,
}: RetentionPolicyFormProps) {
  const [type, setType] = useState<RetentionType>(initialPolicy?.retention_type ?? 'forever')
  const [count, setCount] = useState<number>(
    initialPolicy?.retention_type === 'sample_count' ? (initialPolicy.retention_value ?? 1000) : 1000
  )
  const [ageValue, setAgeValue] = useState<number>(
    initialPolicy?.retention_type === 'time_delta' ? (initialPolicy.retention_value ?? 90) : 90
  )
  const [ageUnit, setAgeUnit] = useState<TimeUnit>(
    initialPolicy?.retention_type === 'time_delta'
      ? parseInitialUnit(initialPolicy.retention_unit)
      : 'days'
  )

  const countError = type === 'sample_count' && (count < 10 || count > 1_000_000)
    ? 'Must be between 10 and 1,000,000'
    : null
  const ageDaysTotal = unitToDays(ageValue, ageUnit)
  const ageError = type === 'time_delta' && (ageDaysTotal < 1 || ageDaysTotal > 3650)
    ? 'Must be between 1 day and 10 years'
    : null
  const hasError = countError !== null || ageError !== null

  const handleSubmit = () => {
    if (hasError) return
    if (type === 'forever') {
      onSubmit({ retention_type: 'forever', retention_value: null, retention_unit: null })
    } else if (type === 'sample_count') {
      onSubmit({ retention_type: 'sample_count', retention_value: count, retention_unit: null })
    } else {
      onSubmit({ retention_type: 'time_delta', retention_value: ageValue, retention_unit: ageUnit })
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">Retention Type</label>
        <div className="grid grid-cols-3 gap-3">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all',
                type === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <opt.icon className="h-6 w-6" />
              <span className="text-sm font-medium">{opt.label}</span>
              {type === opt.value && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </div>

      {type === 'sample_count' && (
        <div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Keep Last</label>
            <input
              type="number"
              min={10}
              max={1_000_000}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-28 px-3 py-2 text-sm bg-background border border-input rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground">samples per characteristic</span>
          </div>
          {countError && <p className="text-xs text-destructive mt-1">{countError}</p>}
        </div>
      )}

      {type === 'time_delta' && (
        <div>
          <label className="text-sm font-medium mb-1 block">Keep records from the last</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={ageValue}
              onChange={(e) => setAgeValue(Number(e.target.value))}
              className="w-24 px-3 py-2 text-sm bg-background border border-input rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <select
              value={ageUnit}
              onChange={(e) => setAgeUnit(e.target.value as TimeUnit)}
              className="px-3 py-2 text-sm bg-background border border-input rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="days">days</option>
              <option value="months">months</option>
              <option value="years">years</option>
            </select>
          </div>
          {ageError && <p className="text-xs text-destructive mt-1">{ageError}</p>}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={hasError || isSubmitting}
          className={cn(
            'px-5 py-2.5 text-sm font-medium rounded-xl',
            hasError || isSubmitting
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </div>
  )
}
