import { useState } from 'react'
import { X } from 'lucide-react'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useCharacteristic, useSubmitSample } from '@/api/hooks'
import { NumberInput } from './NumberInput'
import { cn } from '@/lib/utils'

export function InputModal() {
  const characteristicId = useDashboardStore((state) => state.inputModalCharacteristicId)
  const closeModal = useDashboardStore((state) => state.closeInputModal)
  const { data: characteristic } = useCharacteristic(characteristicId ?? 0)
  const submitSample = useSubmitSample()

  const [measurements, setMeasurements] = useState<string[]>([''])
  const [error, setError] = useState<string | null>(null)

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

    try {
      await submitSample.mutateAsync({
        characteristic_id: characteristicId,
        measurements: values,
      })
      closeModal()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit sample')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Enter Measurement</h2>
          <button
            onClick={closeModal}
            className="p-1 hover:bg-muted rounded"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <div className="font-medium">{characteristic.name}</div>
            <div className="text-sm text-muted-foreground">
              {target !== null && `Target: ${target}`}
              {usl !== null && lsl !== null && ` | Spec: ${lsl} - ${usl}`}
            </div>
          </div>

          <div className="space-y-3">
            {measurements.map((measurement, index) => {
              const status = getValueStatus(measurement)
              return (
                <div key={index}>
                  <label className="text-sm font-medium">
                    {subgroupSize > 1 ? `Measurement ${index + 1}` : 'Value'}
                  </label>
                  <NumberInput
                    step="any"
                    value={measurement}
                    onChange={(v) => handleMeasurementChange(index, v)}
                    placeholder="Enter value..."
                    size="lg"
                    className={cn(
                      'w-full mt-1',
                      status === 'ok' && 'border-green-500 bg-green-50 dark:bg-green-950',
                      status === 'warning' && 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950',
                      status === 'error' && 'border-destructive bg-destructive/10'
                    )}
                    inputClassName={cn(
                      'text-lg font-mono',
                      status === 'ok' && 'text-green-900 dark:text-green-100',
                      status === 'warning' && 'text-yellow-900 dark:text-yellow-100',
                      status === 'error' && 'text-destructive'
                    )}
                  />
                </div>
              )
            })}
          </div>

          {/* Spec position indicator */}
          {usl !== null && lsl !== null && measurements[0] && !isNaN(parseFloat(measurements[0])) && (
            <div className="relative h-4 bg-muted rounded-full overflow-hidden">
              <div
                className="absolute h-full bg-primary rounded-full"
                style={{
                  left: `${Math.max(0, Math.min(100, ((parseFloat(measurements[0]) - lsl) / (usl - lsl)) * 100))}%`,
                  width: '4px',
                  transform: 'translateX(-50%)',
                }}
              />
              <div className="absolute inset-0 flex justify-between px-2 text-xs text-muted-foreground">
                <span>{lsl}</span>
                <span>{usl}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={closeModal}
            className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitSample.isPending}
            className={cn(
              'px-4 py-2 text-sm rounded-md',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {submitSample.isPending ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
