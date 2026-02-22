import { useState, useEffect, useMemo } from 'react'
import {
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Microscope,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useMSAStudy,
  useCreateMSAStudy,
  useSetMSAOperators,
  useSetMSAParts,
  useSubmitMSAMeasurements,
  useSubmitMSAAttributeMeasurements,
  useCalculateMSA,
  useCalculateAttributeMSA,
  useMSAResults,
  useMSAMeasurements,
  useCharacteristics,
} from '@/api/hooks'
import type {
  MSAStudyCreate,
  MSAMeasurementInput,
  MSAAttributeInput,
  GageRRResult,
  AttributeMSAResult,
} from '@/api/client'
import { MSADataGrid } from './MSADataGrid'
import { MSAResults } from './MSAResults'
import { AttributeMSAResults } from './AttributeMSAResults'

interface MSAStudyWizardProps {
  studyId: number | null
  plantId: number
  onClose: () => void
}

type WizardStep = 'setup' | 'data' | 'review' | 'results'
const STEPS: WizardStep[] = ['setup', 'data', 'review', 'results']
const STEP_LABELS: Record<WizardStep, string> = {
  setup: 'Setup',
  data: 'Data Entry',
  review: 'Review',
  results: 'Results',
}

const STUDY_TYPES = [
  { value: 'crossed_anova', label: 'Crossed ANOVA (standard Gage R&R)' },
  { value: 'range_method', label: 'Range Method (quick study)' },
  { value: 'nested_anova', label: 'Nested ANOVA (destructive testing)' },
  { value: 'attribute_agreement', label: 'Attribute Agreement Analysis' },
]

function isAttributeStudy(studyType: string): boolean {
  return studyType === 'attribute_agreement'
}

export function MSAStudyWizard({ studyId, plantId, onClose }: MSAStudyWizardProps) {
  // Form state for new studies
  const [name, setName] = useState('')
  const [studyType, setStudyType] = useState('crossed_anova')
  const [charId, setCharId] = useState<number | null>(null)
  const [numOperators, setNumOperators] = useState(3)
  const [numParts, setNumParts] = useState(10)
  const [numReplicates, setNumReplicates] = useState(2)
  const [tolerance, setTolerance] = useState<string>('')

  // Operator/part names
  const [operatorNames, setOperatorNames] = useState<string[]>([])
  const [partNames, setPartNames] = useState<string[]>([])

  // Created study tracking
  const [createdStudyId, setCreatedStudyId] = useState<number | null>(studyId)
  const effectiveStudyId = createdStudyId ?? 0

  // Current step
  const [step, setStep] = useState<WizardStep>(studyId ? 'data' : 'setup')

  // Measurement grid data (for variable studies)
  const [gridData, setGridData] = useState<Record<string, number | null>>({})
  // Attribute grid data
  const [attrGridData, setAttrGridData] = useState<Record<string, string>>({})

  // Queries
  const { data: study, isLoading: studyLoading } = useMSAStudy(effectiveStudyId)
  const { data: measurements } = useMSAMeasurements(effectiveStudyId)
  const { data: results } = useMSAResults(
    study?.status === 'complete' ? effectiveStudyId : 0,
  )
  const { data: charData } = useCharacteristics(
    plantId > 0 ? { plant_id: plantId, per_page: 500 } : undefined,
  )
  const characteristics = charData?.items ?? []

  // Mutations
  const createStudy = useCreateMSAStudy()
  const setOperators = useSetMSAOperators()
  const setParts = useSetMSAParts()
  const submitMeasurements = useSubmitMSAMeasurements()
  const submitAttributeMeasurements = useSubmitMSAAttributeMeasurements()
  const calculateMSA = useCalculateMSA()
  const calculateAttributeMSA = useCalculateAttributeMSA()

  // When editing, jump to results if complete
  useEffect(() => {
    if (study?.status === 'complete' && studyId) {
      setStep('results')
    } else if (study?.status === 'collecting' && studyId) {
      setStep('data')
    }
  }, [study?.status, studyId])

  // Initialize operator/part names when numOperators/numParts change
  useEffect(() => {
    setOperatorNames((prev) => {
      const newNames = [...prev]
      while (newNames.length < numOperators) newNames.push(`Operator ${newNames.length + 1}`)
      return newNames.slice(0, numOperators)
    })
  }, [numOperators])

  useEffect(() => {
    setPartNames((prev) => {
      const newNames = [...prev]
      while (newNames.length < numParts) newNames.push(`Part ${newNames.length + 1}`)
      return newNames.slice(0, numParts)
    })
  }, [numParts])

  // Derive effective study type
  const effectiveStudyType = study?.study_type ?? studyType
  const isAttribute = isAttributeStudy(effectiveStudyType)

  // Measurement completion stats
  const totalExpected = (study?.num_operators ?? numOperators) *
    (study?.num_parts ?? numParts) *
    (study?.num_replicates ?? numReplicates)

  const measurementCount = measurements?.length ?? study?.measurement_count ?? 0
  const completionPct = totalExpected > 0 ? Math.round((measurementCount / totalExpected) * 100) : 0

  // ----- Step 1: Setup -----
  const handleCreateStudy = async () => {
    const data: MSAStudyCreate = {
      name,
      study_type: studyType,
      characteristic_id: charId,
      num_operators: numOperators,
      num_parts: numParts,
      num_replicates: numReplicates,
      tolerance: tolerance ? parseFloat(tolerance) : undefined,
      plant_id: plantId,
    }

    try {
      const created = await createStudy.mutateAsync(data)
      setCreatedStudyId(created.id)

      // Set operators and parts
      await setOperators.mutateAsync({
        studyId: created.id,
        operators: operatorNames.slice(0, numOperators),
      })
      await setParts.mutateAsync({
        studyId: created.id,
        parts: partNames.slice(0, numParts).map((name) => ({ name })),
      })

      setStep('data')
    } catch {
      // Error handled by mutation hooks
    }
  }

  // ----- Step 2: Data Entry (submit) -----
  const handleSaveMeasurements = async () => {
    if (!study) return

    if (isAttribute) {
      // Build attribute measurement list
      const attrMeasurements: MSAAttributeInput[] = []
      for (const op of study.operators) {
        for (const part of study.parts) {
          for (let r = 1; r <= study.num_replicates; r++) {
            const key = `${op.id}-${part.id}-${r}`
            const val = attrGridData[key]
            if (val) {
              attrMeasurements.push({
                operator_id: op.id,
                part_id: part.id,
                replicate_num: r,
                attribute_value: val,
              })
            }
          }
        }
      }
      if (attrMeasurements.length > 0) {
        await submitAttributeMeasurements.mutateAsync({
          studyId: study.id,
          measurements: attrMeasurements,
        })
      }
    } else {
      // Build variable measurement list
      const variableMeasurements: MSAMeasurementInput[] = []
      for (const op of study.operators) {
        for (const part of study.parts) {
          for (let r = 1; r <= study.num_replicates; r++) {
            const key = `${op.id}-${part.id}-${r}`
            const val = gridData[key]
            if (val !== null && val !== undefined && !isNaN(val)) {
              variableMeasurements.push({
                operator_id: op.id,
                part_id: part.id,
                replicate_num: r,
                value: val,
              })
            }
          }
        }
      }
      if (variableMeasurements.length > 0) {
        await submitMeasurements.mutateAsync({
          studyId: study.id,
          measurements: variableMeasurements,
        })
      }
    }

    setStep('review')
  }

  // ----- Step 3: Review (calculate) -----
  const handleCalculate = async () => {
    if (!study) return
    try {
      if (isAttribute) {
        await calculateAttributeMSA.mutateAsync(study.id)
      } else {
        await calculateMSA.mutateAsync(study.id)
      }
      setStep('results')
    } catch {
      // Error handled by mutation hooks
    }
  }

  // ----- Navigation -----
  const stepIndex = STEPS.indexOf(step)
  const isPending =
    createStudy.isPending ||
    setOperators.isPending ||
    setParts.isPending ||
    submitMeasurements.isPending ||
    submitAttributeMeasurements.isPending ||
    calculateMSA.isPending ||
    calculateAttributeMSA.isPending

  const canGoNext = useMemo((): boolean => {
    switch (step) {
      case 'setup':
        return name.trim().length > 0 && !isPending
      case 'data':
        return !isPending
      case 'review':
        return measurementCount > 0 && !isPending
      case 'results':
        return false
    }
  }, [step, name, isPending, measurementCount])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="bg-card border-border relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-xl border shadow-xl">
        {/* Header */}
        <div className="border-border flex shrink-0 items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <Microscope className="text-primary h-5 w-5" />
            <h2 className="text-lg font-semibold">
              {studyId ? (study?.name ?? 'MSA Study') : 'New MSA Study'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded p-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="border-border flex shrink-0 items-center gap-1 border-b px-6 py-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  i < stepIndex && 'bg-primary/10 text-primary',
                  i === stepIndex && 'bg-primary text-primary-foreground',
                  i > stepIndex && 'bg-muted text-muted-foreground',
                )}
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[10px] font-bold">
                  {i < stepIndex ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <span
                      className={cn(
                        i === stepIndex ? 'text-primary-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </span>
                  )}
                </span>
                {STEP_LABELS[s]}
              </div>
              {i < STEPS.length - 1 && (
                <ArrowRight className="text-muted-foreground mx-1 h-3 w-3" />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {studyLoading && effectiveStudyId > 0 ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
            </div>
          ) : (
            <>
              {step === 'setup' && (
                <SetupStep
                  name={name}
                  onNameChange={setName}
                  studyType={studyType}
                  onStudyTypeChange={setStudyType}
                  charId={charId}
                  onCharIdChange={setCharId}
                  characteristics={characteristics}
                  numOperators={numOperators}
                  onNumOperatorsChange={setNumOperators}
                  numParts={numParts}
                  onNumPartsChange={setNumParts}
                  numReplicates={numReplicates}
                  onNumReplicatesChange={setNumReplicates}
                  tolerance={tolerance}
                  onToleranceChange={setTolerance}
                  operatorNames={operatorNames}
                  onOperatorNamesChange={setOperatorNames}
                  partNames={partNames}
                  onPartNamesChange={setPartNames}
                />
              )}

              {step === 'data' && study && (
                <MSADataGrid
                  study={study}
                  isAttribute={isAttribute}
                  gridData={gridData}
                  onGridDataChange={setGridData}
                  attrGridData={attrGridData}
                  onAttrGridDataChange={setAttrGridData}
                />
              )}

              {step === 'review' && study && (
                <ReviewStep
                  study={study}
                  measurementCount={measurementCount}
                  totalExpected={totalExpected}
                  completionPct={completionPct}
                />
              )}

              {step === 'results' && study && results && (
                isAttribute ? (
                  <AttributeMSAResults result={results as AttributeMSAResult} />
                ) : (
                  <MSAResults result={results as GageRRResult} />
                )
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-border flex shrink-0 items-center justify-between border-t px-6 py-4">
          <div>
            {stepIndex > 0 && step !== 'results' && (
              <button
                onClick={() => setStep(STEPS[stepIndex - 1])}
                className="text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {step === 'results' ? (
              <button
                onClick={onClose}
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium"
              >
                Close
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                {step === 'setup' && (
                  <button
                    onClick={handleCreateStudy}
                    disabled={!canGoNext}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        Create &amp; Continue
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
                {step === 'data' && (
                  <button
                    onClick={handleSaveMeasurements}
                    disabled={isPending}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Save &amp; Review
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
                {step === 'review' && (
                  <button
                    onClick={handleCalculate}
                    disabled={!canGoNext}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Calculating...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Calculate
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step 1: Setup ──

function SetupStep({
  name,
  onNameChange,
  studyType,
  onStudyTypeChange,
  charId,
  onCharIdChange,
  characteristics,
  numOperators,
  onNumOperatorsChange,
  numParts,
  onNumPartsChange,
  numReplicates,
  onNumReplicatesChange,
  tolerance,
  onToleranceChange,
  operatorNames,
  onOperatorNamesChange,
  partNames,
  onPartNamesChange,
}: {
  name: string
  onNameChange: (v: string) => void
  studyType: string
  onStudyTypeChange: (v: string) => void
  charId: number | null
  onCharIdChange: (v: number | null) => void
  characteristics: { id: number; name: string; usl: number | null; lsl: number | null }[]
  numOperators: number
  onNumOperatorsChange: (v: number) => void
  numParts: number
  onNumPartsChange: (v: number) => void
  numReplicates: number
  onNumReplicatesChange: (v: number) => void
  tolerance: string
  onToleranceChange: (v: string) => void
  operatorNames: string[]
  onOperatorNamesChange: (v: string[]) => void
  partNames: string[]
  onPartNamesChange: (v: string[]) => void
}) {
  const handleOperatorNameChange = (i: number, val: string) => {
    const next = [...operatorNames]
    next[i] = val
    onOperatorNamesChange(next)
  }

  const handlePartNameChange = (i: number, val: string) => {
    const next = [...partNames]
    next[i] = val
    onPartNamesChange(next)
  }

  // Auto-fill tolerance from characteristic
  useEffect(() => {
    if (charId) {
      const char = characteristics.find((c) => c.id === charId)
      if (char?.usl != null && char?.lsl != null) {
        onToleranceChange(String(char.usl - char.lsl))
      }
    }
  }, [charId, characteristics, onToleranceChange])

  return (
    <div className="space-y-5">
      {/* Study name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Study Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g., Caliper Gage R&R - February 2026"
          className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      {/* Study type */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Study Type</label>
        <select
          value={studyType}
          onChange={(e) => onStudyTypeChange(e.target.value)}
          className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        >
          {STUDY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Linked characteristic */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          Link to Characteristic <span className="text-muted-foreground">(optional)</span>
        </label>
        <select
          value={charId ?? ''}
          onChange={(e) => onCharIdChange(e.target.value ? Number(e.target.value) : null)}
          className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        >
          <option value="">-- None --</option>
          {characteristics.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Numeric params row */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Operators</label>
          <input
            type="number"
            min={2}
            max={20}
            value={numOperators}
            onChange={(e) => onNumOperatorsChange(Math.max(2, parseInt(e.target.value) || 2))}
            className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Parts</label>
          <input
            type="number"
            min={2}
            max={50}
            value={numParts}
            onChange={(e) => onNumPartsChange(Math.max(2, parseInt(e.target.value) || 2))}
            className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">Replicates</label>
          <input
            type="number"
            min={1}
            max={10}
            value={numReplicates}
            onChange={(e) => onNumReplicatesChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
      </div>

      {/* Tolerance */}
      {!isAttributeStudy(studyType) && (
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Tolerance (USL - LSL) <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            type="number"
            step="any"
            value={tolerance}
            onChange={(e) => onToleranceChange(e.target.value)}
            placeholder="e.g., 0.05"
            className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Used to calculate %Tolerance. Leave blank to skip.
          </p>
        </div>
      )}

      {/* Operator names */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Operator Names</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Array.from({ length: numOperators }, (_, i) => (
            <input
              key={i}
              type="text"
              value={operatorNames[i] ?? ''}
              onChange={(e) => handleOperatorNameChange(i, e.target.value)}
              placeholder={`Operator ${i + 1}`}
              className="bg-background border-border focus:ring-primary/50 rounded border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
            />
          ))}
        </div>
      </div>

      {/* Part names */}
      <div>
        <label className="mb-1.5 block text-sm font-medium">Part Names</label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {Array.from({ length: numParts }, (_, i) => (
            <input
              key={i}
              type="text"
              value={partNames[i] ?? ''}
              onChange={(e) => handlePartNameChange(i, e.target.value)}
              placeholder={`Part ${i + 1}`}
              className="bg-background border-border focus:ring-primary/50 rounded border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Review ──

function ReviewStep({
  study,
  measurementCount,
  totalExpected,
  completionPct,
}: {
  study: { num_operators: number; num_parts: number; num_replicates: number; study_type: string }
  measurementCount: number
  totalExpected: number
  completionPct: number
}) {
  const isComplete = completionPct >= 100
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div className="bg-muted flex-1 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold">{study.num_operators}</div>
          <div className="text-muted-foreground text-xs">Operators</div>
        </div>
        <div className="bg-muted flex-1 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold">{study.num_parts}</div>
          <div className="text-muted-foreground text-xs">Parts</div>
        </div>
        <div className="bg-muted flex-1 rounded-lg px-4 py-3 text-center">
          <div className="text-2xl font-bold">{study.num_replicates}</div>
          <div className="text-muted-foreground text-xs">Replicates</div>
        </div>
      </div>

      {/* Completion bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Data Completion</span>
          <span className="text-muted-foreground">
            {measurementCount} / {totalExpected} ({completionPct}%)
          </span>
        </div>
        <div className="bg-muted h-3 overflow-hidden rounded-full">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              isComplete ? 'bg-green-500' : 'bg-amber-500',
            )}
            style={{ width: `${Math.min(completionPct, 100)}%` }}
          />
        </div>
      </div>

      {!isComplete && (
        <div className="border-warning/20 bg-warning/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <AlertTriangle className="text-warning h-4 w-4 shrink-0" />
          <span className="text-warning">
            Missing {totalExpected - measurementCount} measurements. The calculation will fail
            unless all cells are filled.
          </span>
        </div>
      )}

      {isComplete && (
        <div className="border-green-500/20 bg-green-500/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <Check className="h-4 w-4 shrink-0 text-green-500" />
          <span className="text-green-600 dark:text-green-400">
            All measurements collected. Ready to calculate.
          </span>
        </div>
      )}
    </div>
  )
}
