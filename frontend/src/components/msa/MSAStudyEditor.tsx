import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Download,
  ChevronDown,
  Table2,
  Check,
  AlertTriangle,
  Eye,
  ClipboardList,
  BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'
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
  useCalculateLinearity,
  useCalculateStability,
  useCalculateBias,
  useMSAResults,
  useMSAMeasurements,
  useCharacteristics,
  useWorkflows,
} from '@/api/hooks'
import type {
  MSAStudyCreate,
  MSAStudyDetail,
  MSAMeasurement,
  MSAMeasurementInput,
  MSAAttributeInput,
  GageRRResult,
  AttributeMSAResult,
  LinearityResult,
  StabilityResult,
  BiasResult,
} from '@/api/client'
import { usePlantContext } from '@/providers/PlantProvider'
import { SignatureDialog } from '@/components/signatures/SignatureDialog'
import { StudySteps } from '@/components/studies/StudySteps'
import { MSADataGrid } from './MSADataGrid'
import { MSAResults } from './MSAResults'
import { AttributeMSAResults } from './AttributeMSAResults'
import { LinearityResults } from './LinearityResults'
import { StabilityResults } from './StabilityResults'
import { BiasResults } from './BiasResults'
import { CharacteristicPicker } from './CharacteristicPicker'

// ── Constants ──

const STUDY_TYPES = [
  { value: 'crossed_anova', label: 'Crossed ANOVA (standard Gage R&R)' },
  { value: 'range_method', label: 'Range Method (quick study)' },
  { value: 'nested_anova', label: 'Nested ANOVA (destructive testing)' },
  { value: 'attribute_agreement', label: 'Attribute Agreement Analysis' },
  { value: 'linearity', label: 'Linearity Study (bias vs range)' },
  { value: 'stability', label: 'Stability Study (I-MR over time)' },
  { value: 'bias', label: 'Bias Study (independent sample method)' },
]

const STUDY_TYPE_LABELS: Record<string, string> = {
  crossed_anova: 'Crossed ANOVA',
  nested_anova: 'Nested ANOVA',
  range_method: 'Range Method',
  attribute_agreement: 'Attribute Agreement',
  linearity: 'Linearity',
  stability: 'Stability',
  bias: 'Bias',
}

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  setup: { label: 'Setup', bg: 'bg-blue-500/10', text: 'text-blue-500' },
  collecting: { label: 'Collecting', bg: 'bg-amber-500/10', text: 'text-amber-500' },
  complete: { label: 'Complete', bg: 'bg-green-500/10', text: 'text-green-500' },
}

type TabKey = 'overview' | 'data' | 'results'

// ── Helpers ──

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
  return studyType === 'linearity' || studyType === 'stability' || studyType === 'bias'
}

function measurementsToGridData(
  measurements: MSAMeasurement[],
  isAttribute: boolean,
): { gridData: Record<string, number | null>; attrGridData: Record<string, string> } {
  const gridData: Record<string, number | null> = {}
  const attrGridData: Record<string, string> = {}
  for (const m of measurements) {
    const key = `${m.operator_id}-${m.part_id}-${m.replicate_num}`
    if (isAttribute) {
      attrGridData[key] = m.attribute_value ?? ''
    } else {
      gridData[key] = m.value
    }
  }
  return { gridData, attrGridData }
}

function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportMeasurementsCSV(
  study: MSAStudyDetail,
  measurements: MSAMeasurement[],
  isAttribute: boolean,
) {
  const opMap = new Map(study.operators.map((o) => [o.id, o.name]))
  const partMap = new Map(study.parts.map((p) => [p.id, p.name]))
  const header = isAttribute
    ? 'Operator,Part,Replicate,Attribute Value'
    : 'Operator,Part,Replicate,Value'
  const rows = measurements.map((m) => {
    const op = opMap.get(m.operator_id) ?? String(m.operator_id)
    const part = partMap.get(m.part_id) ?? String(m.part_id)
    const val = isAttribute ? (m.attribute_value ?? '') : m.value
    return `"${op}","${part}",${m.replicate_num},${val}`
  })
  const safeName = study.name.replace(/[^a-zA-Z0-9_-]/g, '_')
  downloadCSV(`${safeName}_measurements.csv`, [header, ...rows].join('\n'))
}

function safeFixed(val: number | null | undefined, digits: number): string {
  if (val == null || isNaN(val)) return '-'
  return val.toFixed(digits)
}

function exportGageRRResultsCSV(study: MSAStudyDetail, result: GageRRResult) {
  const rows = [
    'Source,StdDev,%Contribution,%Study Var',
    `"Repeatability (EV)",${safeFixed(result.repeatability_ev, 6)},${safeFixed(result.pct_contribution_ev, 2)},${safeFixed(result.pct_study_ev, 2)}`,
    `"Reproducibility (AV)",${safeFixed(result.reproducibility_av, 6)},${safeFixed(result.pct_contribution_av, 2)},${safeFixed(result.pct_study_av, 2)}`,
    `"Gage R&R",${safeFixed(result.gage_rr, 6)},${safeFixed(result.pct_contribution_grr, 2)},${safeFixed(result.pct_study_grr, 2)}`,
    `"Part Variation",${safeFixed(result.part_variation, 6)},${safeFixed(result.pct_contribution_pv, 2)},${safeFixed(result.pct_study_pv, 2)}`,
    `"Total Variation",${safeFixed(result.total_variation, 6)},100.00,100.00`,
    '',
    `"ndc",${result.ndc ?? '-'}`,
    `"Verdict","${result.verdict ?? '-'}"`,
  ]
  if (result.pct_tolerance_grr !== null) {
    rows.push(`"%Tolerance GRR",${safeFixed(result.pct_tolerance_grr, 2)}`)
  }
  const safeName = study.name.replace(/[^a-zA-Z0-9_-]/g, '_')
  downloadCSV(`${safeName}_results.csv`, rows.join('\n'))
}

function exportLinearityResultsCSV(study: MSAStudyDetail, result: LinearityResult) {
  const rows = [
    '"Metric","Value"',
    `"Slope",${result.slope.toFixed(6)}`,
    `"Intercept",${result.intercept.toFixed(6)}`,
    `"R-squared",${result.r_squared.toFixed(6)}`,
    `"Linearity",${result.linearity.toFixed(6)}`,
    `"%Linearity",${safeFixed(result.linearity_percent, 2)}`,
    `"Average |Bias|",${result.bias_avg.toFixed(6)}`,
    `"%Bias",${safeFixed(result.bias_percent, 2)}`,
    `"p-value",${result.p_value.toFixed(6)}`,
    `"Verdict","${result.verdict}"`,
    '',
    '"Per-Level Bias"',
    '"Reference","Bias","%Bias"',
    ...result.reference_values.map(
      (ref, i) =>
        `${ref},${result.bias_values[i].toFixed(6)},${safeFixed(result.bias_percentages[i], 2)}`,
    ),
  ]
  const safeName = study.name.replace(/[^a-zA-Z0-9_-]/g, '_')
  downloadCSV(`${safeName}_linearity_results.csv`, rows.join('\n'))
}

function exportAttributeResultsCSV(study: MSAStudyDetail, result: AttributeMSAResult) {
  const rows = [
    '"Metric","Value"',
    `"Fleiss Kappa",${result.fleiss_kappa.toFixed(4)}`,
    `"Between-Appraiser Agreement",${result.between_appraiser.toFixed(1)}%`,
    `"Verdict","${result.verdict}"`,
    '',
    '"Within-Appraiser Agreement"',
    '"Appraiser","Agreement %"',
    ...Object.entries(result.within_appraiser).map(([k, v]) => `"${k}",${v.toFixed(1)}%`),
    '',
    '"Cohens Kappa Pairs"',
    '"Pair","Kappa"',
    ...Object.entries(result.cohens_kappa_pairs).map(([k, v]) => `"${k}",${v.toFixed(4)}`),
  ]
  const safeName = study.name.replace(/[^a-zA-Z0-9_-]/g, '_')
  downloadCSV(`${safeName}_results.csv`, rows.join('\n'))
}

// ── Main component (router entry point) ──

export function MSAStudyEditor() {
  const { studyId } = useParams<{ studyId: string }>()

  if (studyId === 'new') return <NewStudyForm />
  return <ExistingStudyView studyId={Number(studyId)} />
}

// ── New Study Form ──

function NewStudyForm() {
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

// ── Existing Study Editor (tab-based) ──

function ExistingStudyView({ studyId }: { studyId: number }) {
  const navigate = useNavigate()

  const { data: study, isLoading } = useMSAStudy(studyId)
  const { data: measurements } = useMSAMeasurements(studyId)
  const { data: results } = useMSAResults(
    study?.status === 'complete' ? studyId : 0,
  )
  const { data: workflows } = useWorkflows()
  const signatureRequired = (workflows ?? []).some(
    (w) => w.resource_type === 'msa_study' && w.is_active && w.is_required,
  )

  const [activeTab, setActiveTab] = useState<TabKey>('data')
  const [gridData, setGridData] = useState<Record<string, number | null>>({})
  const [attrGridData, setAttrGridData] = useState<Record<string, string>>({})
  const [showMeasurementData, setShowMeasurementData] = useState(false)
  const [showSignatureDialog, setShowSignatureDialog] = useState(false)

  const submitMeasurements = useSubmitMSAMeasurements()
  const submitAttributeMeasurements = useSubmitMSAAttributeMeasurements()
  const calculateMSA = useCalculateMSA()
  const calculateAttributeMSA = useCalculateAttributeMSA()
  const calculateLinearityMut = useCalculateLinearity()
  const calculateStabilityMut = useCalculateStability()
  const calculateBiasMut = useCalculateBias()

  useEffect(() => {
    if (study?.status === 'complete') setActiveTab('results')
  }, [study?.status])

  const isAttribute = isAttributeStudy(study?.study_type ?? '')
  const isLin = isLinearityStudy(study?.study_type ?? '')
  const isStab = isStabilityStudy(study?.study_type ?? '')
  const isBi = isBiasStudy(study?.study_type ?? '')
  const statusStyle = STATUS_STYLES[study?.status ?? 'setup'] ?? STATUS_STYLES.setup
  const isComplete = study?.status === 'complete'
  const totalExpected = (study?.num_operators ?? 0) * (study?.num_parts ?? 0) * (study?.num_replicates ?? 0)
  const measurementCount = measurements?.length ?? study?.measurement_count ?? 0
  const completionPct = totalExpected > 0 ? Math.round((measurementCount / totalExpected) * 100) : 0

  const readOnlyData = useMemo(() => {
    if (!measurements || measurements.length === 0) return null
    return measurementsToGridData(measurements, isAttribute)
  }, [measurements, isAttribute])

  // Pre-populate editable grid from existing measurements (e.g. study in "collecting" with saved data)
  useEffect(() => {
    if (!readOnlyData || isComplete) return
    setGridData((prev) => {
      // Only seed if grid is still empty (user hasn't started editing)
      if (Object.keys(prev).length > 0) return prev
      return readOnlyData.gridData
    })
    setAttrGridData((prev) => {
      if (Object.keys(prev).length > 0) return prev
      return readOnlyData.attrGridData
    })
  }, [readOnlyData, isComplete])

  const isPending =
    submitMeasurements.isPending ||
    submitAttributeMeasurements.isPending ||
    calculateMSA.isPending ||
    calculateAttributeMSA.isPending ||
    calculateLinearityMut.isPending ||
    calculateStabilityMut.isPending ||
    calculateBiasMut.isPending

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!study) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground text-sm">Study not found</p>
        <button
          onClick={() => navigate('/msa')}
          className="text-primary hover:text-primary/80 text-sm font-medium"
        >
          Back to MSA Studies
        </button>
      </div>
    )
  }

  const handleSaveMeasurements = async () => {
    if (isAttribute) {
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
      if (attrMeasurements.length === 0) {
        toast.info('No measurements to save')
        return
      }
      await submitAttributeMeasurements.mutateAsync({
        studyId: study.id,
        measurements: attrMeasurements,
      })
    } else {
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
      if (variableMeasurements.length === 0) {
        toast.info('No measurements to save')
        return
      }
      await submitMeasurements.mutateAsync({
        studyId: study.id,
        measurements: variableMeasurements,
      })
    }
  }

  const handleCalculate = async () => {
    if (signatureRequired) {
      setShowSignatureDialog(true)
      return
    }
    await executeCalculation()
  }

  const executeCalculation = async () => {
    try {
      if (isAttribute) {
        await calculateAttributeMSA.mutateAsync(study.id)
      } else if (isLin) {
        await calculateLinearityMut.mutateAsync(study.id)
      } else if (isStab) {
        await calculateStabilityMut.mutateAsync(study.id)
      } else if (isBi) {
        await calculateBiasMut.mutateAsync(study.id)
      } else {
        await calculateMSA.mutateAsync(study.id)
      }
      setActiveTab('results')
    } catch {
      // Error handled by mutation hooks
    }
  }

  const handleSignatureComplete = async () => {
    setShowSignatureDialog(false)
    await executeCalculation()
  }

  const handleExportData = () => {
    if (study && measurements) exportMeasurementsCSV(study, measurements, isAttribute)
  }

  const handleExportResults = () => {
    if (!study || !results) return
    if (isAttribute) {
      exportAttributeResultsCSV(study, results as AttributeMSAResult)
    } else if (isLin) {
      exportLinearityResultsCSV(study, results as LinearityResult)
    } else {
      exportGageRRResultsCSV(study, results as GageRRResult)
    }
  }

  return (
    <div data-ui="msa-editor" className="flex flex-col gap-4 p-6">
      {/* Top bar */}
      <div data-ui="msa-editor-header" className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/msa')}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{study.name}</h1>
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                  statusStyle.bg,
                  statusStyle.text,
                )}
              >
                {statusStyle.label}
              </span>
              <span className="text-muted-foreground text-sm">
                {STUDY_TYPE_LABELS[study.study_type] ?? study.study_type}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {measurements && measurements.length > 0 && (
            <button
              onClick={handleExportData}
              className="border-border hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
            >
              <Download className="h-4 w-4" />
              Export Data
            </button>
          )}
          {isComplete && results && (
            <button
              onClick={handleExportResults}
              className="border-border hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
            >
              <Download className="h-4 w-4" />
              Export Results
            </button>
          )}
        </div>
      </div>

      {/* Step navigation */}
      <StudySteps
        steps={[
          { key: 'overview', label: 'Overview', icon: Eye },
          { key: 'data', label: 'Data Entry', icon: ClipboardList },
          { key: 'results', label: 'Results', icon: BarChart3, completed: isComplete },
        ]}
        activeKey={activeTab}
        onStepClick={(key) => setActiveTab(key as TabKey)}
      />

      {/* Tab content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && <OverviewTab study={study} />}

        {activeTab === 'data' && (
          <div className="space-y-4">
            {/* Completion stats */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Data Completion</span>
                <span className="text-muted-foreground">
                  {measurementCount} / {totalExpected} ({completionPct}%)
                </span>
              </div>
              <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    completionPct >= 100 ? 'bg-green-500' : 'bg-amber-500',
                  )}
                  style={{ width: `${Math.min(completionPct, 100)}%` }}
                />
              </div>
            </div>

            {!isComplete && completionPct < 100 && measurementCount > 0 && (
              <div className="border-warning/20 bg-warning/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <AlertTriangle className="text-warning h-4 w-4 shrink-0" />
                <span className="text-warning">
                  Missing {totalExpected - measurementCount} measurements.
                </span>
              </div>
            )}
            {completionPct >= 100 && !isComplete && (
              <div className="flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm">
                <Check className="h-4 w-4 shrink-0 text-green-500" />
                <span className="text-green-600 dark:text-green-400">
                  All measurements collected. Ready to calculate.
                </span>
              </div>
            )}

            {isComplete && readOnlyData ? (
              <MSADataGrid
                study={study}
                isAttribute={isAttribute}
                gridData={readOnlyData.gridData}
                attrGridData={readOnlyData.attrGridData}
                readOnly
              />
            ) : (
              <div className="space-y-3">
                <MSADataGrid
                  study={study}
                  isAttribute={isAttribute}
                  gridData={gridData}
                  onGridDataChange={setGridData}
                  attrGridData={attrGridData}
                  onAttrGridDataChange={setAttrGridData}
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleSaveMeasurements}
                    disabled={isPending}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                      completionPct >= 100
                        ? 'border-border hover:bg-muted border'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    {submitMeasurements.isPending || submitAttributeMeasurements.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Save Measurements
                  </button>
                  {completionPct >= 100 && (
                    <button
                      onClick={handleCalculate}
                      disabled={isPending}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                        'bg-primary text-primary-foreground hover:bg-primary/90',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                      )}
                    >
                      {calculateMSA.isPending || calculateAttributeMSA.isPending || calculateLinearityMut.isPending || calculateStabilityMut.isPending || calculateBiasMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      Calculate Results
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'results' && (
          <div className="space-y-6">
            {!isComplete ? (
              <div className="flex h-40 flex-col items-center justify-center gap-3">
                <p className="text-muted-foreground text-sm">
                  Results will appear here after calculation.
                </p>
                {completionPct >= 100 && (
                  <button
                    onClick={handleCalculate}
                    disabled={isPending}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                      'bg-primary text-primary-foreground hover:bg-primary/90',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Calculate Now
                  </button>
                )}
              </div>
            ) : results ? (
              <>
                {isAttribute ? (
                  <AttributeMSAResults result={results as AttributeMSAResult} studyId={studyId} />
                ) : isLin ? (
                  <LinearityResults result={results as LinearityResult} studyId={studyId} />
                ) : isStab ? (
                  <StabilityResults result={results as StabilityResult} studyId={studyId} />
                ) : isBi ? (
                  <BiasResults result={results as BiasResult} studyId={studyId} />
                ) : (
                  <MSAResults result={results as GageRRResult} studyId={studyId} />
                )}

                {readOnlyData && (
                  <div className="border-border rounded-xl border">
                    <button
                      onClick={() => setShowMeasurementData(!showMeasurementData)}
                      className="hover:bg-muted/30 flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Table2 className="text-muted-foreground h-4 w-4" />
                        Measurement Data ({measurements?.length ?? 0} values)
                      </div>
                      <ChevronDown
                        className={cn(
                          'text-muted-foreground h-4 w-4 transition-transform',
                          showMeasurementData && 'rotate-180',
                        )}
                      />
                    </button>
                    {showMeasurementData && (
                      <div className="border-border border-t p-4">
                        <MSADataGrid
                          study={study}
                          isAttribute={isAttribute}
                          gridData={readOnlyData.gridData}
                          attrGridData={readOnlyData.attrGridData}
                          readOnly
                        />
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Signature dialog for MSA study completion */}
      <SignatureDialog
        open={showSignatureDialog}
        onClose={() => setShowSignatureDialog(false)}
        onSigned={handleSignatureComplete}
        resourceType="msa_study"
        resourceId={studyId}
        resourceSummary={`Complete MSA Study: ${study.name}`}
      />
    </div>
  )
}

// ── Overview Tab ──

function OverviewTab({ study }: { study: MSAStudyDetail }) {
  const isLin = isLinearityStudy(study.study_type)
  const isSingleOp = isSingleOperatorStudy(study.study_type)
  const isStab = isStabilityStudy(study.study_type)
  const isBi = isBiasStudy(study.study_type)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Study Type</div>
          <div className="mt-1 text-sm font-semibold">
            {STUDY_TYPE_LABELS[study.study_type] ?? study.study_type}
          </div>
        </div>
        {!isSingleOp && (
          <div className="bg-muted/50 rounded-lg px-4 py-3">
            <div className="text-muted-foreground text-xs font-medium">Operators</div>
            <div className="mt-1 text-sm font-semibold">{study.num_operators}</div>
          </div>
        )}
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">
            {isLin ? 'Reference Levels' : isStab ? 'Time Points' : 'Parts'}
          </div>
          <div className="mt-1 text-sm font-semibold">{study.num_parts}</div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">
            {isLin ? 'Measurements per Level' : isStab ? 'Measurements per Time Point' : isBi ? 'Measurements' : 'Replicates'}
          </div>
          <div className="mt-1 text-sm font-semibold">{study.num_replicates}</div>
        </div>
      </div>

      {!isSingleOp && study.operators.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Operators</h3>
          <div className="flex flex-wrap gap-2">
            {study.operators.map((op) => (
              <span key={op.id} className="bg-muted rounded-md px-2.5 py-1 text-xs font-medium">
                {op.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {study.parts.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">
            {isLin ? 'Reference Standards' : 'Parts'}
          </h3>
          {isLin ? (
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="text-muted-foreground pr-6 text-left text-xs font-medium">
                    Name
                  </th>
                  <th className="text-muted-foreground text-right text-xs font-medium">
                    Reference Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {study.parts.map((part) => (
                  <tr key={part.id}>
                    <td className="pr-6 py-0.5 font-medium">{part.name}</td>
                    <td className="py-0.5 text-right tabular-nums">
                      {part.reference_value ?? '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex flex-wrap gap-2">
              {study.parts.map((part) => (
                <span
                  key={part.id}
                  className="bg-muted rounded-md px-2.5 py-1 text-xs font-medium"
                >
                  {part.name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {study.tolerance != null && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Tolerance (USL - LSL)</h3>
          <p className="text-sm">{study.tolerance}</p>
        </div>
      )}
    </div>
  )
}
