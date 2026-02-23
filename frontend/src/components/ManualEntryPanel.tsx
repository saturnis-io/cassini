import { useState, useEffect, useMemo } from 'react'
import { useSubmitSample, useCharacteristic } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { CharacteristicContextBar } from './CharacteristicContextBar'
import { NoCharacteristicState } from './NoCharacteristicState'
import { NumberInput } from './NumberInput'
import { AttributeEntryForm } from './AttributeEntryForm'

export function ManualEntryPanel() {
  const globalCharId = useDashboardStore((s) => s.selectedCharacteristicId)
  const { data: selectedChar } = useCharacteristic(globalCharId ?? 0)

  const [measurements, setMeasurements] = useState<string[]>([])
  const [batchNumber, setBatchNumber] = useState('')
  const [operatorId, setOperatorId] = useState('')

  const submitSample = useSubmitSample()

  // Calculate the number of input fields to show and minimum required
  const { inputCount, minRequired } = useMemo(() => {
    if (!selectedChar) return { inputCount: 0, minRequired: 0 }

    // subgroup_size is the desired/nominal count
    // min_measurements is the minimum required (defaults to subgroup_size if not set)
    const subgroupSize = selectedChar.subgroup_size ?? 1
    const minMeasurements = selectedChar.min_measurements ?? subgroupSize

    // Show the larger of the two - typically subgroup_size
    const count = Math.max(subgroupSize, minMeasurements, 1)

    return {
      inputCount: count,
      minRequired: Math.max(minMeasurements, 1),
    }
  }, [selectedChar])

  // Initialize measurement inputs when characteristic changes - intentional reset

  useEffect(() => {
    if (inputCount > 0) {
      setMeasurements(Array(inputCount).fill(''))
    } else {
      setMeasurements([])
    }
  }, [inputCount])

  const handleMeasurementChange = (index: number, value: string) => {
    const newMeasurements = [...measurements]
    newMeasurements[index] = value
    setMeasurements(newMeasurements)
  }

  // Count how many valid measurements have been entered
  const filledCount = useMemo(() => {
    return measurements.filter((m) => m !== '' && !isNaN(parseFloat(m))).length
  }, [measurements])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedChar) return

    // Only submit non-empty, valid measurements
    const values = measurements.map((m) => parseFloat(m)).filter((n) => !isNaN(n))

    if (values.length < minRequired) return

    submitSample.mutate(
      {
        characteristic_id: selectedChar.id,
        measurements: values,
        batch_number: batchNumber || undefined,
        operator_id: operatorId || undefined,
      },
      {
        onSuccess: () => {
          // Clear form on success
          setMeasurements(Array(inputCount).fill(''))
          setBatchNumber('')
          setOperatorId('')
        },
      },
    )
  }

  const isValid = selectedChar && filledCount >= minRequired

  return (
    <div className="space-y-5">
      <CharacteristicContextBar />

      {selectedChar ? (
        <div className="bg-muted rounded-xl p-6">
          <h3 className="mb-4 font-semibold">
            {selectedChar.data_type === 'attribute' ? 'Submit Attribute Data' : 'Submit Sample'}
          </h3>

          {selectedChar.data_type === 'attribute' ? (
            <AttributeEntryForm characteristic={selectedChar} />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Measurement Inputs */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Measurements
                  <span className="text-muted-foreground ml-2 font-normal">
                    ({filledCount}/{inputCount} entered
                    {minRequired < inputCount && `, min ${minRequired} required`})
                  </span>
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {measurements.map((value, index) => {
                    const isRequired = index < minRequired
                    const isFilled = value !== '' && !isNaN(parseFloat(value))
                    return (
                      <div key={index} className="relative">
                        <NumberInput
                          step="any"
                          value={value}
                          onChange={(v) => handleMeasurementChange(index, v)}
                          placeholder={`M${index + 1}`}
                          size="md"
                          inputClassName="text-center"
                          className={isRequired && !isFilled ? 'border-warning' : ''}
                        />
                        {isRequired && (
                          <span className="text-warning absolute -top-1 -right-1 text-xs">*</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-muted-foreground mt-2 text-sm">
                  {minRequired === inputCount ? (
                    <>All {inputCount} measurements are required.</>
                  ) : (
                    <>
                      Enter at least {minRequired} measurement{minRequired !== 1 ? 's' : ''}.
                      {inputCount > minRequired && ` Up to ${inputCount} accepted.`}
                    </>
                  )}
                  {selectedChar.target_value != null && (
                    <span className="ml-2">
                      Target: {selectedChar.target_value}
                      {selectedChar.lsl != null && ` | LSL: ${selectedChar.lsl}`}
                      {selectedChar.usl != null && ` | USL: ${selectedChar.usl}`}
                    </span>
                  )}
                </p>
              </div>

              {/* Optional Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">Batch Number (optional)</label>
                  <input
                    type="text"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    placeholder="e.g., LOT-2024-001"
                    className="bg-background border-input w-full rounded-lg border px-3 py-2"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Operator ID (optional)</label>
                  <input
                    type="text"
                    value={operatorId}
                    onChange={(e) => setOperatorId(e.target.value)}
                    placeholder="e.g., OP-123"
                    className="bg-background border-input w-full rounded-lg border px-3 py-2"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!isValid || submitSample.isPending}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-6 py-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitSample.isPending ? 'Submitting...' : 'Submit Sample'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <NoCharacteristicState />
      )}
    </div>
  )
}
