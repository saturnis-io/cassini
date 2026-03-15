import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  FlaskConical,
  Beaker,
  BarChart3,
  ClipboardList,
  Shuffle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContextualHint } from '@/components/ContextualHint'
import { hints } from '@/lib/guidance'
import { usePlantContext } from '@/providers/PlantProvider'
import {
  useDOEStudy,
  useCreateStudy,
  useGenerateDesign,
  useDOERuns,
  useUpdateRuns,
  useAnalyzeStudy,
  useDOEAnalysis,
} from '@/api/hooks'
import { FactorEditor, type FactorRow } from './FactorEditor'
import { DesignMatrix } from './DesignMatrix'
import { RunTable } from './RunTable'
import { ANOVATable } from './ANOVATable'
import { MainEffectsPlot } from './MainEffectsPlot'
import { InteractionPlot } from './InteractionPlot'
import { EffectsParetoChart } from './EffectsParetoChart'
import { DOEResidualsPanel } from './DOEResidualsPanel'
import { StudySteps, type StudyStep } from '@/components/studies/StudySteps'

// ── Constants ──

type PhaseKey = 'define' | 'design' | 'collect' | 'analyze'

const DESIGN_TYPES = [
  {
    value: 'full_factorial',
    label: 'Full Factorial',
    description: 'All combinations of factor levels. Best for 2-4 factors.',
  },
  {
    value: 'fractional_factorial',
    label: 'Fractional Factorial',
    description: 'Subset of runs using aliasing. Efficient for 4-7 factors.',
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
] as const

const PHASE_STEPS: StudyStep[] = [
  { key: 'define', label: 'Define', icon: ClipboardList },
  { key: 'design', label: 'Design', icon: FlaskConical },
  { key: 'collect', label: 'Collect', icon: Beaker },
  { key: 'analyze', label: 'Analyze', icon: BarChart3 },
]

const PHASE_KEYS: PhaseKey[] = ['define', 'design', 'collect', 'analyze']

const STATUS_TO_PHASE: Record<string, PhaseKey> = {
  design: 'design',
  collecting: 'collect',
  analyzed: 'analyze',
}

// ── Main component (router entry point) ──

export function DOEStudyEditor() {
  const { studyId } = useParams<{ studyId: string }>()

  if (!studyId) return <NewStudyForm />
  return <ExistingStudyView studyId={Number(studyId)} />
}

// ── New Study Form (Phase 1: Define) ──

function NewStudyForm() {
  const navigate = useNavigate()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const [name, setName] = useState('')
  const [designType, setDesignType] = useState('full_factorial')
  const [resolution, setResolution] = useState('')
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

  const canCreate = name.trim() && !factorErrors && !createStudy.isPending

  const handleCreate = async () => {
    if (!canCreate) return
    try {
      const result = await createStudy.mutateAsync({
        name: name.trim(),
        plant_id: plantId,
        design_type: designType,
        resolution: resolution ? parseInt(resolution) : undefined,
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

// ── Existing Study View ──

function ExistingStudyView({ studyId }: { studyId: number }) {
  const navigate = useNavigate()

  const { data: study, isLoading } = useDOEStudy(studyId)
  const { data: runs } = useDOERuns(studyId)
  const { data: analysis } = useDOEAnalysis(
    study?.status === 'analyzed' ? studyId : 0,
  )

  const generateDesign = useGenerateDesign()
  const updateRuns = useUpdateRuns()
  const analyzeStudy = useAnalyzeStudy()

  // Determine current phase from study status
  const currentPhaseKey: PhaseKey = STATUS_TO_PHASE[study?.status ?? 'design'] ?? 'design'
  const [activePhaseKey, setActivePhaseKey] = useState<PhaseKey>(currentPhaseKey)

  useEffect(() => {
    setActivePhaseKey(STATUS_TO_PHASE[study?.status ?? 'design'] ?? 'design')
  }, [study?.status])

  const factorNames = useMemo(
    () => study?.factors?.map((f) => f.name) ?? [],
    [study?.factors],
  )

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
          onClick={() => navigate('/doe')}
          className="text-primary hover:text-primary/80 text-sm font-medium"
        >
          Back to DOE Studies
        </button>
      </div>
    )
  }

  const handleGenerate = async () => {
    try {
      await generateDesign.mutateAsync(studyId)
    } catch {
      // Error handled by mutation hook
    }
  }

  const handleSaveRuns = (updates: { run_id: number; response_value: number; notes?: string }[]) => {
    updateRuns.mutate({ studyId, runs: updates })
  }

  const handleAnalyze = async () => {
    try {
      await analyzeStudy.mutateAsync(studyId)
    } catch {
      // Error handled by mutation hook
    }
  }

  const isPending = generateDesign.isPending || updateRuns.isPending || analyzeStudy.isPending

  return (
    <div data-ui="doe-editor" className="flex flex-col gap-4 p-6">
      {/* Top bar */}
      <div data-ui="doe-editor-header" className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/doe')}
            className="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{study.name}</h1>
            <div className="text-muted-foreground mt-0.5 text-sm">
              {DESIGN_TYPES.find((dt) => dt.value === study.design_type)?.label ?? study.design_type}
              {study.response_name && ` -- Response: ${study.response_name}`}
              {study.response_unit && ` (${study.response_unit})`}
            </div>
          </div>
        </div>
      </div>

      {/* Phase indicator (clickable for navigation) */}
      <StudySteps
        steps={PHASE_STEPS.map((s) => {
          const idx = PHASE_KEYS.indexOf(s.key as PhaseKey)
          const currentIdx = PHASE_KEYS.indexOf(currentPhaseKey)
          return {
            ...s,
            completed: idx < currentIdx,
            disabled: idx > currentIdx,
          }
        })}
        activeKey={activePhaseKey}
        onStepClick={(key) => setActivePhaseKey(key as PhaseKey)}
      />

      {/* Phase content */}
      <div className="min-h-[400px]">
        {/* Phase 1: Define (read-only overview for existing studies) */}
        {activePhaseKey === 'define' && (
          <DefineOverview study={study} />
        )}

        {/* Phase 2: Design */}
        {activePhaseKey === 'design' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Design Matrix</h2>
                <p className="text-muted-foreground text-sm">
                  {runs && runs.length > 0
                    ? `${runs.length} runs generated`
                    : 'Generate the experimental design to see the run matrix'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={isPending}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {generateDesign.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Shuffle className="h-4 w-4" />
                  )}
                  {runs && runs.length > 0 ? 'Regenerate' : 'Generate Design'}
                </button>
              </div>
            </div>

            {/* Factor summary */}
            <div className="bg-muted/30 rounded-lg p-4">
              <h3 className="mb-2 text-sm font-medium">Factors</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {study.factors.map((f) => (
                  <div key={f.id} className="bg-card rounded border px-3 py-2 text-sm">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-muted-foreground ml-2">
                      [{f.low_level}, {f.high_level}]
                      {f.unit && ` ${f.unit}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {runs && runs.length > 0 && (
              <DesignMatrix runs={runs} factorNames={factorNames} />
            )}
          </div>
        )}

        {/* Phase 3: Collect */}
        {activePhaseKey === 'collect' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Data Collection</h2>
                <p className="text-muted-foreground text-sm">
                  Enter response values for each experimental run
                  {study.response_name && ` (${study.response_name})`}
                </p>
              </div>
              {runs && runs.length > 0 && runs.every((r) => r.response_value != null) && (
                <button
                  onClick={handleAnalyze}
                  disabled={isPending}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {analyzeStudy.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart3 className="h-4 w-4" />
                  )}
                  Analyze Results
                </button>
              )}
            </div>

            {runs && runs.length > 0 ? (
              <RunTable
                studyId={studyId}
                runs={runs}
                factorNames={factorNames}
                onSave={handleSaveRuns}
                isSaving={updateRuns.isPending}
              />
            ) : (
              <div className="border-border flex h-32 items-center justify-center rounded-lg border border-dashed">
                <p className="text-muted-foreground text-sm">
                  Generate the design matrix first (go to Design phase).
                </p>
              </div>
            )}
          </div>
        )}

        {/* Phase 4: Analyze */}
        {activePhaseKey === 'analyze' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Analysis Results</h2>
                <p className="text-muted-foreground text-sm">
                  ANOVA table, effect estimates, and diagnostic plots
                </p>
              </div>
              {study.status !== 'analyzed' && (
                <button
                  onClick={handleAnalyze}
                  disabled={isPending}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                    'bg-primary text-primary-foreground hover:bg-primary/90',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  {analyzeStudy.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart3 className="h-4 w-4" />
                  )}
                  Run Analysis
                </button>
              )}
            </div>

            {analysis ? (
              <div className="space-y-8">
                <ANOVATable
                  anova={analysis.anova_table}
                  r_squared={analysis.r_squared}
                  adj_r_squared={analysis.adj_r_squared}
                  pred_r_squared={analysis.pred_r_squared}
                  lack_of_fit_f={analysis.lack_of_fit_f}
                  lack_of_fit_p={analysis.lack_of_fit_p}
                />

                <EffectsParetoChart
                  effects={analysis.effects}
                  interactions={analysis.interactions}
                />

                <MainEffectsPlot
                  effects={analysis.effects}
                  grandMean={analysis.grand_mean}
                />

                {analysis.interactions.length > 0 && (
                  <InteractionPlot
                    interactions={analysis.interactions}
                    effects={analysis.effects}
                    grandMean={analysis.grand_mean}
                  />
                )}

                {/* Residual diagnostics */}
                <DOEResidualsPanel analysis={analysis} />

                {/* Effect coefficients summary */}
                <div className="border-border rounded-xl border">
                  <div className="bg-muted/50 border-border border-b px-4 py-3">
                    <h3 className="text-sm font-medium">Effect Estimates</h3>
                  </div>
                  <div className="divide-border divide-y">
                    {analysis.effects.map((eff) => (
                      <div key={eff.factor_name} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm font-medium">{eff.factor_name}</span>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">
                            Effect: <span className="font-mono">{eff.effect.toFixed(4)}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Coefficient: <span className="font-mono">{eff.coefficient.toFixed(4)}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                    {analysis.interactions.map((ix, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-sm font-medium">
                          {ix.factor_names.join(' x ')}
                        </span>
                        <div className="text-muted-foreground text-sm">
                          Effect: <span className="font-mono">{ix.effect.toFixed(4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : study.status === 'analyzed' ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="border-border flex h-40 flex-col items-center justify-center gap-3 rounded-lg border border-dashed">
                <p className="text-muted-foreground text-sm">
                  Analysis results will appear here after running the analysis.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Study notes */}
      {study.notes && (
        <div className="border-border mt-4 rounded-lg border p-4">
          <h3 className="mb-1 text-sm font-medium">Study Notes</h3>
          <p className="text-muted-foreground whitespace-pre-wrap text-sm">{study.notes}</p>
        </div>
      )}
    </div>
  )
}

// ── Define Overview (read-only for existing studies) ──

function DefineOverview({ study }: { study: NonNullable<ReturnType<typeof useDOEStudy>['data']> }) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Study Definition</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Design Type</div>
          <div className="mt-1 text-sm font-semibold">
            {DESIGN_TYPES.find((dt) => dt.value === study.design_type)?.label ?? study.design_type}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Factors</div>
          <div className="mt-1 text-sm font-semibold">{study.factors?.length ?? 0}</div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Runs</div>
          <div className="mt-1 text-sm font-semibold">{study.run_count}</div>
        </div>
        <div className="bg-muted/50 rounded-lg px-4 py-3">
          <div className="text-muted-foreground text-xs font-medium">Status</div>
          <div className="mt-1 text-sm font-semibold capitalize">{study.status}</div>
        </div>
      </div>

      {(study.response_name || study.response_unit) && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Response Variable</h3>
          <p className="text-sm">
            {study.response_name ?? 'Response'}
            {study.response_unit && ` (${study.response_unit})`}
          </p>
        </div>
      )}

      {study.resolution && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Resolution</h3>
          <p className="text-sm">{study.resolution}</p>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Factors</h3>
        <div className="border-border overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">Name</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">Low</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">High</th>
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">Center</th>
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">Unit</th>
              </tr>
            </thead>
            <tbody>
              {study.factors.map((f) => (
                <tr key={f.id} className="border-border/50 border-t">
                  <td className="px-4 py-2 font-medium">{f.name}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{f.low_level}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs">{f.high_level}</td>
                  <td className="text-muted-foreground px-4 py-2 text-right font-mono text-xs">
                    {((f.low_level + f.high_level) / 2).toFixed(2)}
                  </td>
                  <td className="text-muted-foreground px-4 py-2">{f.unit ?? '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
