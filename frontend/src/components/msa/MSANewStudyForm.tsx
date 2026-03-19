import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useCreateMSAStudy,
  useSetMSAOperators,
  useSetMSAParts,
  useCharacteristics,
} from '@/api/hooks'
import type { MSAStudyCreate } from '@/api/client'
import { usePlantContext } from '@/providers/PlantProvider'
import { CharacteristicPicker } from './CharacteristicPicker'

const STUDY_TYPES = [
  { value: 'crossed_anova', label: 'Crossed ANOVA (standard Gage R&R)' },
  { value: 'range_method', label: 'Range Method (quick study)' },
  { value: 'nested_anova', label: 'Nested ANOVA (destructive testing)' },
  { value: 'attribute_agreement', label: 'Attribute Agreement Analysis' },
  { value: 'linearity', label: 'Linearity Study (bias vs range)' },
  { value: 'stability', label: 'Stability Study (I-MR over time)' },
  { value: 'bias', label: 'Bias Study (independent sample method)' },
]

function isAttributeStudy(studyType: string): boolean {
  return studyType === 'attribute_agreement'
}

function isLinearityStudy(studyType: string): boolean {
  return studyType === 'linearity'
}

function isStabilityStudy(studyType: string): boolean {
  return studyType === 'stability'
}

function isBiasStudy(studyType: string): boolean {
  return studyType === 'bias'
}

function isSingleOperatorStudy(studyType: string): boolean {
  return ['linearity', 'stability', 'bias'].includes(studyType)
}

export function MSANewStudyForm() {
  const navigate = useNavigate()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const [name, setName] = useState('')
  const [studyType, setStudyType] = useState('crossed_anova')
  const [charId, setCharId] = useState<number | null>(null)
  const [numOperators, setNumOperators] = useState(3)
  const [numParts, setNumParts] = useState(10)
  const [numReplicates, setNumReplicates] = useState(2)
  const [tolerance, setTolerance] = useState('')
  const [operatorNames, setOperatorNames] = useState<string[]>([])
  const [partNames, setPartNames] = useState<string[]>([])
  const [referenceValues, setReferenceValues] = useState<string[]>([])

  const isLinearity = isLinearityStudy(studyType)
  const isStability = isStabilityStudy(studyType)
  const isBias = isBiasStudy(studyType)
  const isSingleOp = isSingleOperatorStudy(studyType)

  const { data: charData } = useCharacteristics(
    plantId > 0 ? { plant_id: plantId, per_page: 500 } : undefined,
  )
  const characteristics = charData?.items ?? []

  const createStudy = useCreateMSAStudy()
  const setOperatorsMut = useSetMSAOperators()
  const setPartsMut = useSetMSAParts()

  const isPending = createStudy.isPending || setOperatorsMut.isPending || setPartsMut.isPending

  // When switching to linearity/stability/bias, set reasonable defaults
  useEffect(() => {
    if (isLinearity) {
      setNumOperators(1)
      setNumParts(5)
      setNumReplicates(10)
      setOperatorNames(['Operator 1'])
      setPartNames(['Ref 1', 'Ref 2', 'Ref 3', 'Ref 4', 'Ref 5'])
      setReferenceValues((prev) => {
        if (prev.length === 5) return prev
        return ['', '', '', '', '']
      })
    } else if (isStability) {
      setNumOperators(1)
      setNumParts(25)
      setNumReplicates(1)
      setOperatorNames(['Operator 1'])
      setPartNames(
        Array.from({ length: 25 }, (_, i) => `Time ${i + 1}`),
      )
      setReferenceValues([])
    } else if (isBias) {
      setNumOperators(1)
      setNumParts(1)
      setNumReplicates(25)
      setOperatorNames(['Operator 1'])
      setPartNames(['Reference Standard'])
      setReferenceValues([''])
    }
  }, [isLinearity, isStability, isBias])

  useEffect(() => {
    setOperatorNames((prev) => {
      const next = [...prev]
      while (next.length < numOperators) next.push(`Operator ${next.length + 1}`)
      return next.slice(0, numOperators)
    })
  }, [numOperators])

  useEffect(() => {
    const label = isLinearity ? 'Ref' : 'Part'
    setPartNames((prev) => {
      const next = [...prev]
      while (next.length < numParts) next.push(`${label} ${next.length + 1}`)
      return next.slice(0, numParts)
    })
    if (isLinearity) {
      setReferenceValues((prev) => {
        const next = [...prev]
        while (next.length < numParts) next.push('')
        return next.slice(0, numParts)
      })
    }
  }, [numParts, isLinearity])

  useEffect(() => {
    if (charId) {
      const char = characteristics.find((c) => c.id === charId)
      if (char?.usl != null && char?.lsl != null) {
        setTolerance(String(char.usl - char.lsl))
      }
    }
  }, [charId, characteristics])

  const handleCreate = async () => {
    // Validate reference values for linearity/bias studies
    if (isLinearity) {
      const refs = referenceValues.slice(0, numParts)
      if (refs.some((v) => v === '' || isNaN(parseFloat(v)))) {
        toast.error('All reference standard values must be filled for a linearity study')
        return
      }
    }
    if (isBias) {
      if (!referenceValues[0] || isNaN(parseFloat(referenceValues[0]))) {
        toast.error('Reference value must be provided for a bias study')
        return
      }
    }

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
      await setOperatorsMut.mutateAsync({
        studyId: created.id,
        operators: operatorNames.slice(0, numOperators),
      })
      const parts = partNames.slice(0, numParts).map((n, i) => ({
        name: n,
        reference_value:
          isLinearity
            ? parseFloat(referenceValues[i])
            : isBias && referenceValues[0]
              ? parseFloat(referenceValues[0])
              : undefined,
      }))
      await setPartsMut.mutateAsync({
        studyId: created.id,
        parts,
      })
      navigate(`/msa/${created.id}`, { replace: true })
    } catch {
      // Error handled by mutation hooks
    }
  }

  if (!selectedPlant) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/msa')}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold">New MSA Study</h1>
        </div>
        <p className="text-muted-foreground text-sm">Select a site first to create a study.</p>
      </div>
    )
  }

  return (
    <div data-ui="msa-editor" className="flex max-w-4xl flex-col gap-6 p-6">
      {/* Header */}
      <div data-ui="msa-editor-header" className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/msa')}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold">New MSA Study</h1>
        </div>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || isPending}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {isPending ? 'Creating...' : 'Create & Continue'}
        </button>
      </div>

      {/* Setup form */}
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium">Study Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Caliper Gage R&R - February 2026"
            className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Study Type</label>
          <select
            value={studyType}
            onChange={(e) => setStudyType(e.target.value)}
            className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          >
            {STUDY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Link to Characteristic <span className="text-muted-foreground">(optional)</span>
          </label>
          <CharacteristicPicker
            plantId={plantId}
            value={charId}
            onChange={setCharId}
            characteristics={characteristics}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Browse the hierarchy tree or search to find a characteristic.
          </p>
        </div>

        <div className={cn('grid gap-4', isSingleOp ? 'grid-cols-2' : 'grid-cols-3')}>
          {!isSingleOp && (
            <div>
              <label className="mb-1.5 block text-sm font-medium">Operators</label>
              <input
                type="number"
                min={2}
                max={20}
                value={numOperators}
                onChange={(e) => setNumOperators(Math.max(2, parseInt(e.target.value) || 2))}
                className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {isLinearity
                ? 'Reference Levels'
                : isStability
                  ? 'Time Points'
                  : isBias
                    ? 'Parts'
                    : 'Parts'}
            </label>
            <input
              type="number"
              min={2}
              max={50}
              value={numParts}
              onChange={(e) => setNumParts(Math.max(2, parseInt(e.target.value) || 2))}
              className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              {isLinearity
                ? 'Measurements per Level'
                : isStability
                  ? 'Measurements per Time Point'
                  : isBias
                    ? 'Measurements'
                    : 'Replicates'}
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={numReplicates}
              onChange={(e) => setNumReplicates(Math.max(1, parseInt(e.target.value) || 1))}
              className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
        </div>

        {!isAttributeStudy(studyType) && !isStability && (
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Tolerance (USL - LSL) <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="number"
              step="any"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              placeholder="e.g., 0.05"
              className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              {isLinearity
                ? 'Used to calculate %Linearity and %Bias. Leave blank to skip.'
                : isBias
                  ? 'Used to calculate %Bias. Leave blank to use 6*sigma fallback.'
                  : 'Used to calculate %Tolerance. Leave blank to skip.'}
            </p>
          </div>
        )}

        {isBias && (
          <div>
            <label className="mb-1.5 block text-sm font-medium">Reference Value</label>
            <input
              type="number"
              step="any"
              value={referenceValues[0] ?? ''}
              onChange={(e) => setReferenceValues([e.target.value])}
              placeholder="Known true value of the reference standard"
              className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm tabular-nums focus:ring-2 focus:outline-none"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Enter the certified/known true value of the reference standard being measured.
            </p>
          </div>
        )}

        {!isSingleOp && (
          <div>
            <label className="mb-1.5 block text-sm font-medium">Operator Names</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: numOperators }, (_, i) => (
                <input
                  key={i}
                  type="text"
                  value={operatorNames[i] ?? ''}
                  onChange={(e) => {
                    const next = [...operatorNames]
                    next[i] = e.target.value
                    setOperatorNames(next)
                  }}
                  placeholder={`Operator ${i + 1}`}
                  className="bg-background border-border focus:ring-primary/50 rounded border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
                />
              ))}
            </div>
          </div>
        )}

        {!isStability && !isBias && (
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            {isLinearity ? 'Reference Standards' : 'Part Names'}
          </label>
          {isLinearity ? (
            <div className="space-y-2">
              {Array.from({ length: numParts }, (_, i) => (
                <div key={i} className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={partNames[i] ?? ''}
                    onChange={(e) => {
                      const next = [...partNames]
                      next[i] = e.target.value
                      setPartNames(next)
                    }}
                    placeholder={`Ref ${i + 1} name`}
                    className="bg-background border-border focus:ring-primary/50 rounded border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
                  />
                  <input
                    type="number"
                    step="any"
                    value={referenceValues[i] ?? ''}
                    onChange={(e) => {
                      const next = [...referenceValues]
                      next[i] = e.target.value
                      setReferenceValues(next)
                    }}
                    placeholder="Reference value"
                    className="bg-background border-border focus:ring-primary/50 rounded border px-2.5 py-1.5 text-sm tabular-nums focus:ring-2 focus:outline-none"
                  />
                </div>
              ))}
              <p className="text-muted-foreground text-xs">
                Enter known reference standard values spanning the gage&apos;s operating range.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Array.from({ length: numParts }, (_, i) => (
                <input
                  key={i}
                  type="text"
                  value={partNames[i] ?? ''}
                  onChange={(e) => {
                    const next = [...partNames]
                    next[i] = e.target.value
                    setPartNames(next)
                  }}
                  placeholder={`Part ${i + 1}`}
                  className="bg-background border-border focus:ring-primary/50 rounded border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
                />
              ))}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
