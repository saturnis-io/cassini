import { useState } from 'react'
import { X, ChevronRight } from 'lucide-react'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useAccessibilityStore } from '@/stores/accessibilityStore'
import { useCharacteristic, useSubmitSample, useHierarchyPath } from '@/api/hooks'
import { NumberInput } from './NumberInput'
import { FieldError } from '@/components/FieldError'
import { useFormValidation } from '@/hooks/useFormValidation'
import { measurementsSchema } from '@/schemas/data-entry'
import { cn } from '@/lib/utils'

export function InputModal() {
  const characteristicId = useDashboardStore((state) => state.inputModalCharacteristicId)
  const closeModal = useDashboardStore((state) => state.closeInputModal)
  const { data: characteristic } = useCharacteristic(characteristicId ?? 0)
  // Characteristic names are NOT unique — show hierarchy breadcrumb so the
  // operator entering data can confirm they're targeting the right
  // characteristic (per CLAUDE.md rule).
  const hierarchyPath = useHierarchyPath(characteristicId)
  const submitSample = useSubmitSample()

  const touchMode = useAccessibilityStore((s) => s.touchMode)
  const [measurements, setMeasurements] = useState<string[]>([''])
  const [error, setError] = useState<string | null>(null)
  const { validate, getError, clearErrors } = useFormValidation(measurementsSchema)

  if (!characteristic) {
    return null
  }

  const subgroupSize = characteristic.subgroup_size || 1
  const target = characteristic.target_value
  const usl = characteristic.usl
  const lsl = characteristic.lsl

  // Ensure we have the right number of input fields
  if (measurements.length !== subgroupSize) {
    setMeasurements(Array(subgroupSize).fill(''))
  }

  const handleMeasurementChange = (index: number, value: string) => {
    const newMeasurements = [...measurements]
    newMeasurements[index] = value
    setMeasurements(newMeasurements)
    setError(null)
    clearErrors()
  }

  const getValueStatus = (value: string): 'ok' | 'warning' | 'error' | 'empty' => {
    if (!value) return 'empty'
    const num = parseFloat(value)
    if (isNaN(num)) return 'error'
    if (usl && num > usl) return 'error'
    if (lsl && num < lsl) return 'error'
    if (usl && lsl) {
      const range = usl - lsl
      const warningThreshold = range * 0.1
      if (num > usl - warningThreshold || num < lsl + warningThreshold) {
        return 'warning'
      }
    }
    return 'ok'
  }

  const canSubmit = measurements.every((m) => {
    const num = parseFloat(m)
    return !isNaN(num)
  })

  const handleSubmit = async () => {
    if (!canSubmit || !characteristicId) return

    const values = measurements.map((m) => parseFloat(m))

    const validated = validate({ measurements: values })
    if (!validated) return

    try {
      await submitSample.mutateAsync({
        characteristic_id: characteristicId,
        measurements: validated.measurements,
      })
      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit sample')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        className={cn(
          'bg-card mx-4 w-full max-w-md rounded-lg border shadow-xl',
          touchMode && 'max-w-lg',
        )}
      >
        <div className={cn('flex items-center justify-between border-b p-4', touchMode && 'p-5')}>
          <h2 className={cn('text-lg font-semibold', touchMode && 'text-xl')}>
            Enter Measurement
          </h2>
          <button
            onClick={closeModal}
            className={cn(
              'hover:bg-muted rounded p-1',
              touchMode && 'p-2',
            )}
          >
            <X className={cn('h-5 w-5', touchMode && 'h-6 w-6')} />
          </button>
        </div>

        <div className={cn('space-y-4 p-4', touchMode && 'space-y-6 p-5')}>
          <div>
            {hierarchyPath.length > 0 && (
              <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-1 text-xs">
                {hierarchyPath.map((node, idx) => (
                  <span key={node.id} className="flex items-center gap-1">
                    <span>{node.name}</span>
                    {idx < hierarchyPath.length - 1 && (
                      <ChevronRight className="text-muted-foreground/50 h-3 w-3" />
                    )}
                  </span>
                ))}
              </div>
            )}
            <div className="font-medium">{characteristic.name}</div>
            <div className="text-muted-foreground text-sm">
              {target !== null && `Target: ${target}`}
              {usl !== null && lsl !== null && ` | Spec: ${lsl} - ${usl}`}
            </div>
          </div>

          <div className={cn('space-y-3', touchMode && 'space-y-4')}>
            {measurements.map((measurement, index) => {
              const status = getValueStatus(measurement)
              return (
                <div key={index}>
                  <label className={cn('text-sm font-medium', touchMode && 'text-base')}>
                    {subgroupSize > 1 ? `Measurement ${index + 1}` : 'Value'}
                  </label>
                  <NumberInput
                    step="any"
                    value={measurement}
                    onChange={(v) => handleMeasurementChange(index, v)}
                    placeholder="Enter value..."
                    size="lg"
                    className={cn(
                      'mt-1 w-full',
                      touchMode && 'min-h-[var(--touch-input-height)]',
                      status === 'ok' && 'border-success bg-success/10',
                      status === 'warning' && 'border-warning bg-warning/10',
                      status === 'error' && 'border-destructive bg-destructive/10',
                    )}
                    inputClassName={cn(
                      'text-lg font-mono',
                      touchMode && 'text-[length:var(--touch-font-size)]',
                      status === 'ok' && 'text-success',
                      status === 'warning' && 'text-warning',
                      status === 'error' && 'text-destructive',
                    )}
                  />
                </div>
              )
            })}
          </div>

          {/* Spec position indicator */}
          {usl !== null &&
            lsl !== null &&
            measurements[0] &&
            !isNaN(parseFloat(measurements[0])) && (
              <div className="bg-muted relative h-4 overflow-hidden rounded-full">
                <div
                  className="bg-primary absolute h-full rounded-full"
                  style={{
                    left: `${Math.max(0, Math.min(100, ((parseFloat(measurements[0]) - lsl) / (usl - lsl)) * 100))}%`,
                    width: '4px',
                    transform: 'translateX(-50%)',
                  }}
                />
                <div className="text-muted-foreground absolute inset-0 flex justify-between px-2 text-xs">
                  <span>{lsl}</span>
                  <span>{usl}</span>
                </div>
              </div>
            )}

          <FieldError error={getError('measurements')} />
          {error && <div className="text-destructive text-sm">{error}</div>}
        </div>

        <div
          className={cn(
            'flex justify-end gap-2 border-t p-4',
            touchMode && 'flex-col gap-3 p-5',
          )}
        >
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitSample.isPending}
            className={cn(
              'rounded-md px-4 py-2 text-sm',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90',
              'disabled:cursor-not-allowed disabled:opacity-50',
              touchMode &&
                'min-h-[var(--touch-button-height)] text-[length:var(--touch-font-size)] font-semibold',
            )}
          >
            {submitSample.isPending ? 'Submitting...' : 'Submit'}
          </button>
          <button
            onClick={closeModal}
            className={cn(
              'hover:bg-muted rounded-md border px-4 py-2 text-sm',
              touchMode &&
                'min-h-[var(--touch-button-height)] text-[length:var(--touch-font-size)]',
            )}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
