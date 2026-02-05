import { useState, useEffect, useMemo } from 'react'
import { useSubmitSample } from '@/api/hooks'
import { HierarchyCharacteristicSelector } from './HierarchyCharacteristicSelector'
import { NumberInput } from './NumberInput'
import type { Characteristic } from '@/types'

export function ManualEntryPanel() {
  const [selectedChar, setSelectedChar] = useState<Characteristic | null>(null)
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

  const handleCharacteristicSelect = (char: Characteristic) => {
    setSelectedChar(char)
  }

  const handleMeasurementChange = (index: number, value: string) => {
    const newMeasurements = [...measurements]
    newMeasurements[index] = value
    setMeasurements(newMeasurements)
  }

  // Count how many valid measurements have been entered
  const filledCount = useMemo(() => {
    return measurements.filter(m => m !== '' && !isNaN(parseFloat(m))).length
  }, [measurements])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedChar) return

    // Only submit non-empty, valid measurements
    const values = measurements
      .map(m => parseFloat(m))
      .filter(n => !isNaN(n))

    if (values.length < minRequired) return

    submitSample.mutate(
      {
        characteristic_id: selectedChar.id,
        measurements: values,
      },
      {
        onSuccess: () => {
          // Clear form on success
          setMeasurements(Array(inputCount).fill(''))
          setBatchNumber('')
          setOperatorId('')
        },
      }
    )
  }

  const isValid = selectedChar && filledCount >= minRequired

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Select Characteristic</h3>
        <HierarchyCharacteristicSelector
          selectedCharId={selectedChar?.id ?? null}
          onSelect={handleCharacteristicSelect}
          filterProvider="MANUAL"
        />
        {selectedChar && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
            <div className="font-medium">{selectedChar.name}</div>
            <div className="text-sm text-muted-foreground">
              Subgroup size: {selectedChar.subgroup_size ?? 1}
              {selectedChar.min_measurements != null && selectedChar.min_measurements !== selectedChar.subgroup_size &&
                ` | Min: ${selectedChar.min_measurements}`}
              {selectedChar.target_value != null && ` | Target: ${selectedChar.target_value}`}
            </div>
          </div>
        )}
      </div>

      {selectedChar && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Submit Sample</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Measurement Inputs */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Measurements
                <span className="text-muted-foreground font-normal ml-2">
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
                        className={
                          isRequired && !isFilled
                            ? 'border-orange-300 dark:border-orange-700'
                            : ''
                        }
                      />
                      {isRequired && (
                        <span className="absolute -top-1 -right-1 text-orange-500 text-xs">*</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
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
                <label className="block text-sm font-medium mb-1">
                  Batch Number (optional)
                </label>
                <input
                  type="text"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  placeholder="e.g., LOT-2024-001"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Operator ID (optional)
                </label>
                <input
                  type="text"
                  value={operatorId}
                  onChange={(e) => setOperatorId(e.target.value)}
                  placeholder="e.g., OP-123"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!isValid || submitSample.isPending}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitSample.isPending ? 'Submitting...' : 'Submit Sample'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Quick Stats */}
      {selectedChar && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Characteristic Info</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Subgroup Size</span>
              <div className="font-medium">{selectedChar.subgroup_size ?? 1}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Min Required</span>
              <div className="font-medium">{minRequired}</div>
            </div>
            <div>
              <span className="text-muted-foreground">UCL</span>
              <div className="font-medium">
                {selectedChar.ucl != null ? selectedChar.ucl.toFixed(selectedChar.decimal_precision ?? 4) : '-'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">LCL</span>
              <div className="font-medium">
                {selectedChar.lcl != null ? selectedChar.lcl.toFixed(selectedChar.decimal_precision ?? 4) : '-'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Mode</span>
              <div className="font-medium">{selectedChar.subgroup_mode ?? '-'}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
