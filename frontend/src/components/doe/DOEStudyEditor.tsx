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
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ContextualHint } from '@/components/ContextualHint'
import { hints } from '@/lib/guidance'
import {
  useDOEStudy,
  useGenerateDesign,
  useDOERuns,
  useUpdateRuns,
  useAnalyzeStudy,
  useDOEAnalysis,
  useCreateConfirmation,
  useAnalyzeConfirmation,
} from '@/api/hooks'
import type { SNType, TaguchiANOM, ConfirmationAnalysis } from '@/api/doe.api'
import { DesignMatrix } from './DesignMatrix'
import { RunTable } from './RunTable'
import { ANOVATable } from './ANOVATable'
import { MainEffectsPlot } from './MainEffectsPlot'
import { InteractionPlot } from './InteractionPlot'
import { EffectsParetoChart } from './EffectsParetoChart'
import { DOEResidualsPanel } from './DOEResidualsPanel'
import { StudySteps, type StudyStep } from '@/components/studies/StudySteps'
import { NewStudyForm } from './NewStudyForm'
import { ConfirmationResultsPanel } from './ConfirmationResultsPanel'

// ── Constants ──

type PhaseKey = 'define' | 'design' | 'collect' | 'analyze'

const SN_TYPE_LABELS: Record<SNType, string> = {
  smaller_is_better: 'Smaller is Better',
  larger_is_better: 'Larger is Better',
  nominal_is_best_1: 'Nominal is Best (Type 1)',
  nominal_is_best_2: 'Nominal is Best (Type 2)',
}

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
  const createConfirmation = useCreateConfirmation()
  const analyzeConfirmation = useAnalyzeConfirmation()

  // Confirmation analysis state
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationAnalysis | null>(null)

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

  const handleCreateConfirmation = async () => {
    if (!study) return
    try {
      const result = await createConfirmation.mutateAsync({
        studyId: studyId,
        nRuns: 3,
      })
      navigate(`/doe/${result.id}`)
    } catch {
      // Error handled by mutation hook
    }
  }

  const handleAnalyzeConfirmation = async () => {
    try {
      const result = await analyzeConfirmation.mutateAsync(studyId)
      setConfirmationResult(result)
    } catch {
      // Error handled by mutation hook
    }
  }

  const isPending =
    generateDesign.isPending ||
    updateRuns.isPending ||
    analyzeStudy.isPending ||
    createConfirmation.isPending ||
    analyzeConfirmation.isPending

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
            {/* Confirmation study banner */}
            {study.is_confirmation && study.parent_study_id && (
              <div className="bg-primary/5 border-primary/20 flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="text-primary h-4 w-4" />
                  <span className="text-primary font-medium">Confirmation Study</span>
                  <span className="text-muted-foreground">
                    — validating parent study #{study.parent_study_id}
                  </span>
                </div>
                <button
                  onClick={() => navigate(`/doe/${study.parent_study_id}`)}
                  className="text-primary hover:text-primary/80 flex items-center gap-1 text-xs font-medium"
                >
                  View Parent <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  {study.is_confirmation ? 'Confirmation Analysis' : 'Analysis Results'}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {study.is_confirmation
                    ? 'Prediction interval validation against parent model'
                    : 'ANOVA table, effect estimates, and diagnostic plots'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Confirmation study: analyze confirmation button */}
                {study.is_confirmation &&
                  study.status !== 'analyzed' &&
                  runs &&
                  runs.length > 0 &&
                  runs.every((r) => r.response_value != null) && (
                    <button
                      onClick={handleAnalyzeConfirmation}
                      disabled={isPending}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                        'bg-primary text-primary-foreground hover:bg-primary/90',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                      )}
                    >
                      {analyzeConfirmation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Validate Confirmation
                    </button>
                  )}

                {/* Regular study: run analysis button */}
                {!study.is_confirmation && study.status !== 'analyzed' && (
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

                {/* Create Confirmation Runs button (only on analyzed non-confirmation studies with regression) */}
                {!study.is_confirmation &&
                  study.status === 'analyzed' &&
                  analysis?.regression?.optimal_settings && (
                    <button
                      onClick={handleCreateConfirmation}
                      disabled={isPending}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                        'border-primary text-primary hover:bg-primary/5 border',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                      )}
                    >
                      {createConfirmation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Create Confirmation Runs
                    </button>
                  )}
              </div>
            </div>

            {study.design_type === 'plackett_burman' && (
              <div className="bg-warning/10 border-warning/30 rounded-lg border px-4 py-3 text-sm">
                <span className="text-warning font-medium">Resolution III Design:</span>{' '}
                <span className="text-muted-foreground">
                  Plackett-Burman designs cannot estimate two-factor interactions. Main effects are
                  partially confounded with interactions. Use a fractional factorial (Res IV+) or
                  full factorial if interaction estimation is needed.
                </span>
              </div>
            )}

            {/* Confirmation study results */}
            {study.is_confirmation && confirmationResult && (
              <ConfirmationResultsPanel result={confirmationResult} />
            )}

            {analysis && !study.is_confirmation ? (
              <div className="space-y-8">
                {/* Taguchi ANOM results */}
                {analysis.taguchi_anom ? (
                  <TaguchiANOMPanel anom={analysis.taguchi_anom} />
                ) : (
                  <>
                    <ANOVATable
                      anova={analysis.anova_table}
                      r_squared={analysis.r_squared}
                      adj_r_squared={analysis.adj_r_squared}
                      pred_r_squared={analysis.pred_r_squared}
                      lack_of_fit_f={analysis.lack_of_fit_f}
                      lack_of_fit_p={analysis.lack_of_fit_p}
                      ss_type_warning={analysis.ss_type_warning}
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
                  </>
                )}

                {/* Residual diagnostics */}
                <DOEResidualsPanel analysis={analysis} />

                {/* Effect coefficients summary (skip for Taguchi — shown in ANOM panel) */}
                {!analysis.taguchi_anom && (
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
                )}
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

      {study.sn_type && (
        <div>
          <h3 className="mb-1 text-sm font-medium">S/N Ratio Type</h3>
          <p className="text-sm">{SN_TYPE_LABELS[study.sn_type] ?? study.sn_type}</p>
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

// ── Taguchi ANOM Results Panel ──

function TaguchiANOMPanel({ anom }: { anom: TaguchiANOM }) {
  const levelOrder = ['-1', '0', '+1']

  // Collect all levels that appear in the response table
  const allLevels = useMemo(() => {
    const levels = new Set<string>()
    for (const factor of anom.response_table) {
      for (const key of Object.keys(factor.level_means)) {
        levels.add(key)
      }
    }
    return levelOrder.filter((l) => levels.has(l))
  }, [anom.response_table])

  return (
    <div className="space-y-6">
      {/* S/N Type badge */}
      <div className="bg-primary/5 border-primary/20 rounded-lg border px-4 py-3 text-sm">
        <span className="text-primary font-medium">Taguchi Analysis:</span>{' '}
        <span className="text-muted-foreground">
          S/N Ratio Type: {SN_TYPE_LABELS[anom.sn_type as SNType] ?? anom.sn_type}
          {' -- '}Higher S/N = better robustness.
        </span>
      </div>

      {/* Response Table (factor x level means) */}
      <div className="border-border rounded-xl border">
        <div className="bg-muted/50 border-border border-b px-4 py-3">
          <h3 className="text-sm font-medium">Response Table (Mean S/N Ratios)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30">
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">Rank</th>
                <th className="text-muted-foreground px-4 py-2 text-left font-medium">Factor</th>
                {allLevels.map((level) => (
                  <th key={level} className="text-muted-foreground px-4 py-2 text-right font-medium">
                    Level {level}
                  </th>
                ))}
                <th className="text-muted-foreground px-4 py-2 text-right font-medium">Range</th>
                <th className="text-muted-foreground px-4 py-2 text-center font-medium">Best</th>
              </tr>
            </thead>
            <tbody>
              {anom.response_table.map((factor) => (
                <tr key={factor.factor_name} className="border-border/50 border-t">
                  <td className="px-4 py-2 font-mono text-xs">#{factor.rank}</td>
                  <td className="px-4 py-2 font-medium">{factor.factor_name}</td>
                  {allLevels.map((level) => {
                    const value = factor.level_means[level]
                    const isBest = level === factor.best_level
                    return (
                      <td
                        key={level}
                        className={cn(
                          'px-4 py-2 text-right font-mono text-xs',
                          isBest && 'text-primary font-bold',
                        )}
                      >
                        {value != null ? value.toFixed(4) : '--'}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2 text-right font-mono text-xs font-semibold">
                    {factor.range.toFixed(4)}
                  </td>
                  <td className="text-primary px-4 py-2 text-center font-mono text-xs font-bold">
                    {factor.best_level}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Optimal Settings */}
      {Object.keys(anom.optimal_settings).length > 0 && (
        <div className="border-border rounded-xl border">
          <div className="bg-muted/50 border-border border-b px-4 py-3">
            <h3 className="text-sm font-medium">Optimal Factor Settings</h3>
          </div>
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(anom.optimal_settings).map(([name, level]) => (
              <div key={name} className="bg-card rounded border px-3 py-2 text-sm">
                <span className="font-medium">{name}</span>
                <span className="text-primary ml-2 font-mono font-bold">Level {level}</span>
              </div>
            ))}
          </div>
          <div className="border-border border-t px-4 py-2">
            <p className="text-muted-foreground text-xs">
              Optimal = coded level with highest mean S/N ratio for each factor. Confirm with
              validation runs.
            </p>
          </div>
        </div>
      )}

      {/* Factor Ranking Summary */}
      <div className="border-border rounded-xl border">
        <div className="bg-muted/50 border-border border-b px-4 py-3">
          <h3 className="text-sm font-medium">Factor Influence Ranking</h3>
        </div>
        <div className="divide-border divide-y">
          {anom.response_table.map((factor) => (
            <div key={factor.factor_name} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-3">
                <span className="bg-muted flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs font-bold">
                  {factor.rank}
                </span>
                <span className="text-sm font-medium">{factor.factor_name}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  Range: <span className="font-mono">{factor.range.toFixed(4)}</span> dB
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Confirmation Results Panel ──

