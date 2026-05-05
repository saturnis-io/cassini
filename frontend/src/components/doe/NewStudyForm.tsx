import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  FlaskConical,
  Beaker,
  BarChart3,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContextualHint } from '@/components/ContextualHint'
import { hints } from '@/lib/guidance'
import { usePlantContext } from '@/providers/PlantProvider'
import { useCreateStudy } from '@/api/hooks'
import type { SNType } from '@/api/doe.api'
import { FactorEditor, type FactorRow } from './FactorEditor'
import { StudySteps, type StudyStep } from '@/components/studies/StudySteps'

export const DESIGN_TYPES = [
  {
    value: 'full_factorial',
    label: 'Full Factorial',
    description: 'All combinations of factor levels. Best for 2-4 factors.',
  },
  {
    value: 'fractional_factorial',
    label: 'Fractional Factorial',
    description: 'Subset of runs using aliasing. Efficient for 4-15 factors.',
  },
  {
    value: 'plackett_burman',
    label: 'Plackett-Burman',
    description:
      'Screening design for 2-23 factors in few runs. Resolution III — cannot estimate interactions.',
  },
  {
    value: 'central_composite',
    label: 'Central Composite (CCD)',
    description: 'Full factorial + star points + center points. Response surface methodology.',
  },
  {
    value: 'box_behnken',
    label: 'Box-Behnken',
    description: 'Three-level RSM design. No corner points. Requires 3+ factors.',
  },
  {
    value: 'd_optimal',
    label: 'D-Optimal',
    description:
      'Algorithmic design for custom run counts. Maximizes information via coordinate-exchange.',
  },
  {
    value: 'taguchi',
    label: 'Taguchi (Orthogonal Array)',
    description:
      'Robust design using standard OAs (L4-L27). Uses S/N ratios and ANOM for factor ranking.',
  },
] as const

const SN_TYPES: { value: SNType; label: string; description: string }[] = [
  {
    value: 'smaller_is_better',
    label: 'Smaller is Better',
    description: 'Minimize response (e.g., defect rate, shrinkage)',
  },
  {
    value: 'larger_is_better',
    label: 'Larger is Better',
    description: 'Maximize response (e.g., strength, yield)',
  },
  {
    value: 'nominal_is_best_1',
    label: 'Nominal is Best (Type 1)',
    description: 'Target value, mean adjustable (e.g., dimension with scaling)',
  },
  {
    value: 'nominal_is_best_2',
    label: 'Nominal is Best (Type 2)',
    description: 'Target value, mean on target (e.g., minimize variance only)',
  },
]

const PHASE_STEPS: StudyStep[] = [
  { key: 'define', label: 'Define', icon: ClipboardList },
  { key: 'design', label: 'Design', icon: FlaskConical },
  { key: 'collect', label: 'Collect', icon: Beaker },
  { key: 'analyze', label: 'Analyze', icon: BarChart3 },
]

export function NewStudyForm() {
  const navigate = useNavigate()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const [name, setName] = useState('')
  const [designType, setDesignType] = useState('full_factorial')
  const [resolution, setResolution] = useState('')
  const [nRuns, setNRuns] = useState('')
  const [modelOrder, setModelOrder] = useState('linear')
  const [snType, setSnType] = useState<SNType>('smaller_is_better')
  const [responseName, setResponseName] = useState('')
  const [responseUnit, setResponseUnit] = useState('')
  const [notes, setNotes] = useState('')
  const [factors, setFactors] = useState<FactorRow[]>([
    { name: 'Factor A', low_level: -1, high_level: 1 },
    { name: 'Factor B', low_level: -1, high_level: 1 },
  ])

  const createStudy = useCreateStudy()

  // Validate factors
  const factorErrors = useMemo(() => {
    if (factors.length < 2) return 'At least 2 factors required'
    for (const f of factors) {
      if (!f.name.trim()) return 'All factors must have a name'
      if (f.low_level >= f.high_level) return 'Low level must be less than high level for all factors'
    }
    const names = factors.map((f) => f.name.trim().toLowerCase())
    if (new Set(names).size !== names.length) return 'Factor names must be unique'
    return null
  }, [factors])

  const canCreate =
    name.trim() &&
    !factorErrors &&
    !createStudy.isPending &&
    (designType !== 'd_optimal' || (nRuns && parseInt(nRuns) >= 2)) &&
    (designType !== 'taguchi' || snType)

  const handleCreate = async () => {
    if (!canCreate) return
    try {
      const result = await createStudy.mutateAsync({
        name: name.trim(),
        plant_id: plantId,
        design_type: designType,
        resolution: resolution ? parseInt(resolution) : undefined,
        n_runs: designType === 'd_optimal' && nRuns ? parseInt(nRuns) : undefined,
        model_order: designType === 'd_optimal' ? (modelOrder as 'linear' | 'interaction' | 'quadratic') : undefined,
        sn_type: designType === 'taguchi' ? snType : undefined,
        response_name: responseName.trim() || undefined,
        response_unit: responseUnit.trim() || undefined,
        notes: notes.trim() || undefined,
        factors: factors.map((f) => ({
          name: f.name.trim(),
          low_level: f.low_level,
          high_level: f.high_level,
          unit: f.unit?.trim() || undefined,
        })),
      })
      navigate(`/doe/${result.id}`, { replace: true })
    } catch {
      // Error handled by mutation hook
    }
  }

  if (!selectedPlant) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/doe')}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold">New DOE Study</h1>
        </div>
        <p className="text-muted-foreground text-sm">Select a plant first to create a study.</p>
      </div>
    )
  }

  return (
    <div data-ui="doe-editor" className="flex max-w-4xl flex-col gap-6 p-6">
      {/* Header */}
      <div data-ui="doe-editor-header" className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/doe')}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-bold">New DOE Study</h1>
        </div>
        <button
          onClick={handleCreate}
          disabled={!canCreate}
          className={cn(
            'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {createStudy.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {createStudy.isPending ? 'Creating...' : 'Create Study'}
        </button>
      </div>

      {/* Phase indicator */}
      <StudySteps
        steps={PHASE_STEPS.map((s) => ({
          ...s,
          disabled: s.key !== 'define',
        }))}
        activeKey="define"
        onStepClick={() => {}}
      />

      {/* Form */}
      <div className="space-y-6">
        {/* Study name */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">Study Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Temperature & Pressure Optimization"
            className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>

        {/* Design type selector */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">Design Type</label>
          <div className="grid gap-3 sm:grid-cols-2">
            {DESIGN_TYPES.map((dt) => (
              <button
                key={dt.value}
                type="button"
                onClick={() => setDesignType(dt.value)}
                className={cn(
                  'rounded-lg border p-3 text-left transition-colors',
                  designType === dt.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                )}
              >
                <div className="text-sm font-medium">{dt.label}</div>
                <div className="text-muted-foreground mt-0.5 text-xs">{dt.description}</div>
              </button>
            ))}
          </div>
          <ContextualHint hintId={hints.doeDesignType.id} className="mt-2">
            <strong>Tip:</strong> {hints.doeDesignType.text}
          </ContextualHint>
        </div>

        {/* Resolution (only for fractional factorial) */}
        {designType === 'fractional_factorial' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Resolution{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            >
              <option value="">Auto</option>
              <option value="3">III (main effects)</option>
              <option value="4">IV (main effects + some 2FI)</option>
              <option value="5">V (main effects + all 2FI)</option>
            </select>
            <p className="text-muted-foreground mt-1 text-xs">
              Higher resolution provides less aliasing but requires more runs.
            </p>
          </div>
        )}

        {/* D-Optimal parameters */}
        {designType === 'd_optimal' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Number of Runs</label>
              <input
                type="number"
                value={nRuns}
                onChange={(e) => setNRuns(e.target.value)}
                min={2}
                max={10000}
                placeholder="e.g., 12"
                className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Must be at least equal to the number of model parameters.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Model Order</label>
              <select
                value={modelOrder}
                onChange={(e) => setModelOrder(e.target.value)}
                className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
              >
                <option value="linear">Linear (main effects only)</option>
                <option value="interaction">Interaction (main + 2FI)</option>
                <option value="quadratic">Quadratic (main + 2FI + quadratic)</option>
              </select>
              <p className="text-muted-foreground mt-1 text-xs">
                Higher-order models require more runs for estimation.
              </p>
            </div>
          </div>
        )}

        {/* S/N Type (only for Taguchi) */}
        {designType === 'taguchi' && (
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Signal-to-Noise Ratio Type
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {SN_TYPES.map((sn) => (
                <button
                  key={sn.value}
                  type="button"
                  onClick={() => setSnType(sn.value)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    snType === sn.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  <div className="text-sm font-medium">{sn.label}</div>
                  <div className="text-muted-foreground mt-0.5 text-xs">{sn.description}</div>
                </button>
              ))}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Determines how response variability is measured. Higher S/N = better quality.
            </p>
          </div>
        )}

        {/* Response */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Response Name{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={responseName}
              onChange={(e) => setResponseName(e.target.value)}
              placeholder="e.g., Yield, Surface Roughness"
              className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Response Unit{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={responseUnit}
              onChange={(e) => setResponseUnit(e.target.value)}
              placeholder="e.g., %, mm, ppm"
              className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            />
          </div>
        </div>

        {/* Factors */}
        <FactorEditor
          factors={factors}
          onChange={setFactors}
          designType={designType}
        />
        {factorErrors && (
          <p className="text-destructive text-xs">{factorErrors}</p>
        )}

        {/* Notes */}
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Notes{' '}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Experiment objectives, constraints, assumptions..."
            rows={3}
            className="bg-background border-border focus:ring-primary/50 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
      </div>
    </div>
  )
}
