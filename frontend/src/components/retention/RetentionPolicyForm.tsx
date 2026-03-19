import { useState } from 'react'
import { Infinity as InfinityIcon, Hash, Calendar, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RetentionPolicySet } from '@/types'
import { retentionPolicySchema } from '@/schemas/admin'
import { useFormValidation } from '@/hooks/useFormValidation'
import { FieldError } from '@/components/FieldError'
import { inputErrorClass } from '@/lib/validation'

type RetentionType = 'forever' | 'sample_count' | 'time_delta'
type TimeUnit = 'days' | 'months' | 'years'

interface RetentionPolicyFormProps {
  initialPolicy?: RetentionPolicySet | null
  onSubmit: (policy: RetentionPolicySet) => void
  onCancel: () => void
  submitLabel?: string
  isSubmitting?: boolean
}

const TYPE_OPTIONS: { value: RetentionType; label: string; icon: typeof InfinityIcon }[] = [
  { value: 'forever', label: 'Forever', icon: InfinityIcon },
  { value: 'sample_count', label: 'By Count', icon: Hash },
  { value: 'time_delta', label: 'By Age', icon: Calendar },
]

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
    initialPolicy?.retention_type === 'sample_count'
      ? (initialPolicy.retention_value ?? 1000)
      : 1000,
  )
  const [ageValue, setAgeValue] = useState<number>(
    initialPolicy?.retention_type === 'time_delta' ? (initialPolicy.retention_value ?? 90) : 90,
  )
  const [ageUnit, setAgeUnit] = useState<TimeUnit>(
    initialPolicy?.retention_type === 'time_delta'
      ? parseInitialUnit(initialPolicy.retention_unit)
      : 'days',
  )

  const { validate, getError, hasErrors } = useFormValidation(retentionPolicySchema)

  const handleSubmit = () => {
    const validated = validate({ type, count, ageValue, ageUnit })
    if (!validated) return
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
        <label className="text-muted-foreground mb-2 block text-sm font-medium">
          Retention Type
        </label>
        <div className="grid grid-cols-3 gap-3">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setType(opt.value)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                type === opt.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50',
              )}
            >
              <opt.icon className="h-6 w-6" />
              <span className="text-sm font-medium">{opt.label}</span>
              {type === opt.value && <Check className="text-primary h-4 w-4" />}
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
              className={cn(
                'bg-background border-input focus:ring-ring w-28 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none',
                inputErrorClass(getError('count')),
              )}
            />
            <span className="text-muted-foreground text-sm">samples per characteristic</span>
          </div>
          <FieldError error={getError('count')} />
        </div>
      )}

      {type === 'time_delta' && (
        <div>
          <label className="mb-1 block text-sm font-medium">Keep records from the last</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={ageValue}
              onChange={(e) => setAgeValue(Number(e.target.value))}
              className={cn(
                'bg-background border-input focus:ring-ring w-24 rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none',
                inputErrorClass(getError('ageValue')),
              )}
            />
            <select
              value={ageUnit}
              onChange={(e) => setAgeUnit(e.target.value as TimeUnit)}
              className="bg-background border-input focus:ring-ring rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="days">days</option>
              <option value="months">months</option>
              <option value="years">years</option>
            </select>
          </div>
          <FieldError error={getError('ageValue')} />
        </div>
      )}

      <div className="border-border flex justify-end gap-3 border-t pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={hasErrors || isSubmitting}
          className={cn(
            'rounded-xl px-5 py-2.5 text-sm font-medium',
            hasErrors || isSubmitting
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </div>
  )
}
