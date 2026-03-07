import { useState, useEffect, useMemo, useRef } from 'react'
import {
  useSubmitSample,
  useCharacteristic,
  useMaterials,
  useMaterialOverrides,
} from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { usePlant } from '@/providers/PlantProvider'
import { CharacteristicContextBar } from './CharacteristicContextBar'
import { NoCharacteristicState } from './NoCharacteristicState'
import { NumberInput } from './NumberInput'
import { AttributeEntryForm } from './AttributeEntryForm'
import { FieldError } from '@/components/FieldError'
import { useFormValidation } from '@/hooks/useFormValidation'
import { measurementsSchema } from '@/schemas/data-entry'
import { AlertTriangle } from 'lucide-react'

export function ManualEntryPanel() {
  const globalCharId = useDashboardStore((s) => s.selectedCharacteristicId)
  const { data: selectedChar } = useCharacteristic(globalCharId ?? 0)
  const { selectedPlant } = usePlant()
  const plantId = selectedPlant?.id ?? 0

  const [measurements, setMeasurements] = useState<string[]>([])
  const [materialId, setMaterialId] = useState<number | null>(null)
  const [batchNumber, setBatchNumber] = useState('')
  const [operatorId, setOperatorId] = useState('')
  const [showMaterialSuggestions, setShowMaterialSuggestions] = useState(false)
  const [materialSearch, setMaterialSearch] = useState('')
  const materialRef = useRef<HTMLDivElement>(null)

  const { data: allMaterials } = useMaterials(plantId)
  const { data: overrides } = useMaterialOverrides(globalCharId ?? 0)
  const submitSample = useSubmitSample()

  // Separate materials into those with overrides vs others
  const { withOverrides, withoutOverrides } = useMemo(() => {
    if (!allMaterials) return { withOverrides: [], withoutOverrides: [] }
    const overrideMatIds = new Set(
      overrides?.filter((o) => o.material_id).map((o) => o.material_id) ?? [],
    )
    // Also include materials whose class has an override
    const overrideClassIds = new Set(
      overrides?.filter((o) => o.class_id).map((o) => o.class_id) ?? [],
    )
    const withOvr = allMaterials.filter(
      (m) => overrideMatIds.has(m.id) || (m.class_id && overrideClassIds.has(m.class_id)),
    )
    const withoutOvr = allMaterials.filter(
      (m) => !overrideMatIds.has(m.id) && !(m.class_id && overrideClassIds.has(m.class_id)),
    )
    return { withOverrides: withOvr, withoutOverrides: withoutOvr }
  }, [allMaterials, overrides])

  // Filter materials by search text
  const filteredWithOverrides = useMemo(() => {
    if (!materialSearch) return withOverrides
    const lower = materialSearch.toLowerCase()
    return withOverrides.filter(
      (m) =>
        m.name.toLowerCase().includes(lower) ||
        m.code.toLowerCase().includes(lower),
    )
  }, [withOverrides, materialSearch])

  const filteredWithoutOverrides = useMemo(() => {
    if (!materialSearch) return withoutOverrides
    const lower = materialSearch.toLowerCase()
    return withoutOverrides.filter(
      (m) =>
        m.name.toLowerCase().includes(lower) ||
        m.code.toLowerCase().includes(lower),
    )
  }, [withoutOverrides, materialSearch])

  // Determine if selected material has overrides
  const selectedMaterial = useMemo(() => {
    if (!materialId || !allMaterials) return null
    return allMaterials.find((m) => m.id === materialId) ?? null
  }, [materialId, allMaterials])

  const selectedHasOverride = useMemo(() => {
    if (!materialId) return true // no material selected, no warning needed
    return withOverrides.some((m) => m.id === materialId)
  }, [materialId, withOverrides])

  const { validate, getError, clearErrors } = useFormValidation(measurementsSchema)

  // Calculate the number of input fields to show and minimum required
  const { inputCount, minRequired } = useMemo(() => {
    if (!selectedChar) return { inputCount: 0, minRequired: 0 }

    const subgroupSize = selectedChar.subgroup_size ?? 1
    const minMeasurements = selectedChar.min_measurements ?? subgroupSize
    const count = Math.max(subgroupSize, minMeasurements, 1)

    return {
      inputCount: count,
      minRequired: Math.max(minMeasurements, 1),
    }
  }, [selectedChar])

  // Initialize measurement inputs when characteristic changes
  useEffect(() => {
    if (inputCount > 0) {
      setMeasurements(Array(inputCount).fill(''))
    } else {
      setMeasurements([])
    }
    clearErrors()
  }, [inputCount, clearErrors])

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (materialRef.current && !materialRef.current.contains(e.target as Node)) {
        setShowMaterialSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

    const validated = validate({
      measurements: values,
      batch_number: batchNumber || undefined,
      operator_id: operatorId || undefined,
    })
    if (!validated) return

    submitSample.mutate(
      {
        characteristic_id: selectedChar.id,
        measurements: validated.measurements,
        material_id: materialId ?? undefined,
        batch_number: validated.batch_number,
        operator_id: validated.operator_id,
      },
      {
        onSuccess: () => {
          // Clear form on success
          setMeasurements(Array(inputCount).fill(''))
          setMaterialId(null)
          setMaterialSearch('')
          setBatchNumber('')
          setOperatorId('')
          clearErrors()
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
                <FieldError error={getError('measurements')} />
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

              {/* Material Picker */}
              <div ref={materialRef} className="relative">
                <label className="mb-1 block text-sm font-medium">Material (optional)</label>
                {allMaterials && allMaterials.length > 0 ? (
                  <>
                    <div className="relative">
                      <input
                        type="text"
                        value={materialSearch || (selectedMaterial ? `${selectedMaterial.name} (${selectedMaterial.code})` : '')}
                        onChange={(e) => {
                          setMaterialSearch(e.target.value)
                          setShowMaterialSuggestions(true)
                          if (!e.target.value) {
                            setMaterialId(null)
                          }
                        }}
                        onFocus={() => {
                          setShowMaterialSuggestions(true)
                          if (selectedMaterial) {
                            setMaterialSearch('')
                          }
                        }}
                        placeholder="Select or search material"
                        className="bg-background border-input w-full rounded-lg border px-3 py-2 pr-8"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setShowMaterialSuggestions(!showMaterialSuggestions)
                        }}
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                    {showMaterialSuggestions && (
                      <div className="bg-card border-border absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border shadow-lg">
                        {/* Clear selection */}
                        {materialId && (
                          <button
                            type="button"
                            className="hover:bg-muted text-muted-foreground border-border w-full border-b px-3 py-1.5 text-left text-sm italic"
                            onMouseDown={(e) => {
                              e.preventDefault()
                              setMaterialId(null)
                              setMaterialSearch('')
                              setShowMaterialSuggestions(false)
                            }}
                          >
                            Clear selection
                          </button>
                        )}
                        {/* With Overrides section */}
                        {filteredWithOverrides.length > 0 && (
                          <>
                            <div className="text-muted-foreground bg-muted/50 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                              With Overrides
                            </div>
                            {filteredWithOverrides.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                className="hover:bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  setMaterialId(m.id)
                                  setMaterialSearch('')
                                  setShowMaterialSuggestions(false)
                                }}
                              >
                                <span className="flex-1">
                                  {m.name}{' '}
                                  <span className="text-muted-foreground">({m.code})</span>
                                  {m.class_path && (
                                    <span className="text-muted-foreground ml-1 text-xs">
                                      - {m.class_path}
                                    </span>
                                  )}
                                </span>
                                {materialId === m.id && (
                                  <svg className="text-primary ml-auto h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                            ))}
                          </>
                        )}
                        {/* All Materials section */}
                        {filteredWithoutOverrides.length > 0 && (
                          <>
                            <div className="text-muted-foreground bg-muted/50 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
                              All Materials
                            </div>
                            {filteredWithoutOverrides.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                className="hover:bg-muted flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  setMaterialId(m.id)
                                  setMaterialSearch('')
                                  setShowMaterialSuggestions(false)
                                }}
                              >
                                <span className="flex-1">
                                  {m.name}{' '}
                                  <span className="text-muted-foreground">({m.code})</span>
                                  {m.class_path && (
                                    <span className="text-muted-foreground ml-1 text-xs">
                                      - {m.class_path}
                                    </span>
                                  )}
                                </span>
                                {materialId === m.id && (
                                  <svg className="text-primary ml-auto h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </button>
                            ))}
                          </>
                        )}
                        {filteredWithOverrides.length === 0 &&
                          filteredWithoutOverrides.length === 0 && (
                            <div className="text-muted-foreground px-3 py-2 text-sm">
                              No materials found
                            </div>
                          )}
                      </div>
                    )}
                    {/* Warning for material without overrides */}
                    {materialId && !selectedHasOverride && (
                      <div className="text-warning mt-1.5 flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                        No limit overrides configured — characteristic defaults will be used
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No materials configured for this plant.
                  </p>
                )}
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
