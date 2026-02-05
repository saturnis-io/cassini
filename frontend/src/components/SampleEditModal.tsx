import { useState, useEffect } from 'react'
import { useUpdateSample, useSampleEditHistory } from '@/api/hooks'
import { NumberInput } from './NumberInput'
import { EditHistoryTooltip } from './EditHistoryTooltip'
import type { Sample } from '@/types'

interface SampleEditModalProps {
  isOpen: boolean
  sample: Sample | null
  onClose: () => void
}

export function SampleEditModal({ isOpen, sample, onClose }: SampleEditModalProps) {
  const [measurements, setMeasurements] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const updateSample = useUpdateSample()
  const { data: editHistory } = useSampleEditHistory(isOpen && sample ? sample.id : null)

  // Get the actual edit count from history
  const editCount = editHistory?.length ?? 0

  // Helper to get measurement values - handles both number[] and Measurement[] formats
  const getMeasurementValues = (s: Sample): number[] => {
    if (!s.measurements || s.measurements.length === 0) {
      return []
    }
    // Check if it's an array of numbers or Measurement objects
    const first = s.measurements[0]
    if (typeof first === 'number') {
      return s.measurements as unknown as number[]
    }
    // It's Measurement objects
    return s.measurements.map(m => m.value)
  }

  // Initialize measurements when sample changes
  useEffect(() => {
    if (sample) {
      const values = getMeasurementValues(sample)
      setMeasurements(values.map(v => String(v)))
      setReason('') // Reset reason for each new sample
    }
  }, [sample])

  if (!isOpen || !sample) return null

  const handleMeasurementChange = (index: number, value: string) => {
    const newMeasurements = [...measurements]
    newMeasurements[index] = value
    setMeasurements(newMeasurements)
  }

  const handleSave = () => {
    const values = measurements.map(m => parseFloat(m)).filter(n => !isNaN(n))
    if (values.length === 0 || !reason.trim()) return

    updateSample.mutate(
      { id: sample.id, measurements: values, reason: reason.trim() },
      { onSuccess: onClose }
    )
  }

  const isValid = measurements.every(m => m !== '' && !isNaN(parseFloat(m))) && reason.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Edit Sample #{sample.id}</h3>
          {editCount > 0 && (
            <div className="flex items-center gap-1.5 text-amber-500 text-sm">
              <EditHistoryTooltip sampleId={sample.id} editCount={editCount} />
              <span>Modified {editCount}x</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Sample Info */}
          <div className="text-sm text-muted-foreground">
            <span>Timestamp: {new Date(sample.timestamp).toLocaleString()}</span>
          </div>

          {/* Measurement Inputs */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Measurements ({measurements.length})
            </label>
            <div className="flex flex-wrap gap-2">
              {measurements.map((value, index) => (
                <NumberInput
                  key={index}
                  step="any"
                  value={value}
                  onChange={(v) => handleMeasurementChange(index, v)}
                  placeholder={`M${index + 1}`}
                  size="sm"
                  className="w-24"
                  inputClassName="text-center"
                />
              ))}
            </div>
          </div>

          {/* Reason for Change (Required) */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Reason for Change <span className="text-destructive">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why this sample is being modified..."
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
              maxLength={1000}
            />
            <div className="text-xs text-muted-foreground mt-1 text-right">
              {reason.length}/1000
            </div>
          </div>

          {/* Calculated Values Preview */}
          {measurements.every(m => m !== '' && !isNaN(parseFloat(m))) && measurements.length > 0 && (
            <div className="p-3 bg-muted rounded-lg text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">New Mean: </span>
                  <span className="font-medium">
                    {(measurements.reduce((a, b) => a + parseFloat(b), 0) / measurements.length).toFixed(4)}
                  </span>
                </div>
                {measurements.length > 1 && (
                  <div>
                    <span className="text-muted-foreground">New Range: </span>
                    <span className="font-medium">
                      {(Math.max(...measurements.map(m => parseFloat(m))) -
                        Math.min(...measurements.map(m => parseFloat(m)))).toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={updateSample.isPending}
            className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || updateSample.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {updateSample.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
