import { useCapability, useCapabilityHistory, useSaveCapabilitySnapshot, useNonNormalCapability, useCharacteristic } from '@/api/hooks'
import { Explainable } from '@/components/Explainable'
import { InterpretResult } from '@/components/InterpretResult'
import { ContextualHint } from '@/components/ContextualHint'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess } from '@/lib/roles'
import { useLicense } from '@/hooks/useLicense'
import { useECharts } from '@/hooks/useECharts'
import { interpretCapability, hints } from '@/lib/guidance'
import type { CapabilityResult, CapabilityHistoryItem } from '@/types'
import { cn } from '@/lib/utils'
import { Camera, TrendingUp, AlertTriangle, CheckCircle, Info, HelpCircle, BarChart3 } from 'lucide-react'
import { useState, useMemo, useRef, useCallback, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { StatNote } from '@/components/StatNote'
import { usePlantContext } from '@/providers/PlantProvider'
import { useChartData } from '@/api/hooks'
import { getChartMeasurements } from '@/lib/report-utils'
import { CapabilityQQPlot } from './CapabilityQQPlot'

const DistributionAnalysis = lazy(() =>
  import('./DistributionAnalysis').then((m) => ({ default: m.DistributionAnalysis })),
)

/** Threshold-based color coding for capability indices */
function capabilityColor(value: number | null, greenThreshold = 1.33, yellowThreshold = 1.0): string {
  if (value === null) return 'text-muted-foreground'
  if (value >= greenThreshold) return 'text-success'
  if (value >= yellowThreshold) return 'text-warning'
  return 'text-destructive'
}

function capabilityBg(value: number | null, greenThreshold = 1.33, yellowThreshold = 1.0): string {
  if (value === null) return 'bg-muted/30'
  if (value >= greenThreshold) return 'bg-success/10'
  if (value >= yellowThreshold) return 'bg-warning/10'
  return 'bg-destructive/10'
}

function capabilityLabel(value: number | null, greenThreshold = 1.33, yellowThreshold = 1.0): string {
  if (value === null) return '--'
  if (value >= greenThreshold) return 'Capable'
  if (value >= yellowThreshold) return 'Marginal'
  return 'Not Capable'
}

const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  Cp: 'Potential capability. Compares specification width to process spread, ignoring centering. Higher is better; \u22651.33 is typically capable.',
  Cpk: 'Actual capability. Like Cp but penalizes off-center processes. The most commonly used index \u2014 measures real-world performance against specs.',
  Pp: 'Overall performance. Like Cp but uses total observed variation (long-term) instead of within-subgroup variation.',
  Ppk: 'Overall performance index. Like Cpk but using long-term variation. Compare Cpk vs Ppk to assess process stability over time.',
  Cpm: 'Taguchi capability. Measures how closely the process hits a specific target value, not just staying within spec limits.',
}

function IndexCard({
  label,
  value,
  characteristicId,
  ci,
  greenThreshold = 1.33,
  yellowThreshold = 1.0,
}: {
  label: string
  value: number | null
  characteristicId: number
  ci?: [number, number] | null
  greenThreshold?: number
  yellowThreshold?: number
}) {
  const [showTip, setShowTip] = useState(false)
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const description = CAPABILITY_DESCRIPTIONS[label]

  const openTip = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setTipPos({ top: rect.top - 4, left: rect.left + rect.width / 2 })
    }
    setShowTip(true)
  }, [])

  const sigmaNote: Record<string, string> = {
    Cp: 'Uses within-subgroup \u03C3 (R\u0304/d2) \u2014 measures short-term process potential assuming the process is centered.',
    Pp: 'Uses overall \u03C3 \u2014 measures actual long-term performance including all sources of variation.',
  }

  return (
    <div className={cn('border-border relative rounded-lg border p-3 text-center', capabilityBg(value, greenThreshold, yellowThreshold))}>
      <div className="text-muted-foreground mb-1 flex items-center justify-center gap-1 text-xs">
        {label}
        {description && (
          <button
            ref={btnRef}
            type="button"
            className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            onMouseEnter={openTip}
            onMouseLeave={() => setShowTip(false)}
            onClick={() => (showTip ? setShowTip(false) : openTip())}
            aria-label={`What is ${label}?`}
          >
            <HelpCircle className="h-3 w-3" />
          </button>
        )}
        {sigmaNote[label] && <StatNote>{sigmaNote[label]}</StatNote>}
      </div>
      <div className={cn('text-lg font-bold tabular-nums', capabilityColor(value, greenThreshold, yellowThreshold))}>
        {value !== null ? (
          <Explainable metric={label.toLowerCase()} resourceId={characteristicId}>
            {value.toFixed(2)}
          </Explainable>
        ) : (
          '--'
        )}
      </div>
      {ci && (
        <div className="text-muted-foreground mt-0.5 text-[10px] tabular-nums">
          ({ci[0].toFixed(2)} – {ci[1].toFixed(2)})
        </div>
      )}
      <div className={cn('mt-0.5 text-[10px]', capabilityColor(value, greenThreshold, yellowThreshold))}>
        {capabilityLabel(value, greenThreshold, yellowThreshold)}
      </div>
      {showTip && description && createPortal(
        <div
          className="bg-popover text-popover-foreground border-border fixed z-50 w-52 -translate-x-1/2 -translate-y-full rounded-md border p-2 text-left text-[11px] leading-snug shadow-md"
          style={{ top: tipPos.top, left: tipPos.left }}
        >
          {description}
        </div>,
        document.body,
      )}
    </div>
  )
}

function NormalityBadge({ result }: { result: CapabilityResult }) {
  if (result.normality_test === 'failed') {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
        <Info className="h-3 w-3" />
        Normality: not tested
      </span>
    )
  }
  const pValue = result.normality_p_value
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs',
        result.is_normal ? 'text-success' : 'text-warning',
      )}
    >
      {result.is_normal ? (
        <CheckCircle className="h-3 w-3" />
      ) : (
        <AlertTriangle className="h-3 w-3" />
      )}
      {result.is_normal ? 'Normal' : 'Non-normal'} (p={pValue?.toFixed(4) ?? '?'})
    </span>
  )
}

function CpkTrendChart({ history }: { history: CapabilityHistoryItem[] }) {
  // Reverse so oldest is first (history comes DESC)
  const sorted = useMemo(() => [...history].reverse(), [history])

  const option = useMemo(() => {
    if (sorted.length === 0) return null

    const dates = sorted.map((h) => {
      const d = new Date(h.calculated_at)
      return `${d.getMonth() + 1}/${d.getDate()}`
    })
    const cpkData = sorted.map((h) => h.cpk)
    const ppkData = sorted.map((h) => h.ppk)

    return {
      grid: { top: 20, right: 10, bottom: 24, left: 36 },
      tooltip: {
        trigger: 'axis' as const,
        textStyle: { fontSize: 11 },
      },
      xAxis: {
        type: 'category' as const,
        data: dates,
        axisLabel: { fontSize: 9 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 9 },
        splitLine: { lineStyle: { type: 'dashed' as const, opacity: 0.3 } },
      },
      series: [
        {
          name: 'Cpk',
          type: 'line' as const,
          data: cpkData,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { width: 2 },
          itemStyle: { color: '#3b82f6' },
        },
        {
          name: 'Ppk',
          type: 'line' as const,
          data: ppkData,
          smooth: true,
          symbol: 'diamond',
          symbolSize: 4,
          lineStyle: { width: 2, type: 'dashed' as const },
          itemStyle: { color: '#8b5cf6' },
        },
      ],
    }
  }, [sorted])

  const { containerRef } = useECharts({ option })

  return (
    <>
      <div
        ref={containerRef}
        className="h-32 w-full"
        style={{ visibility: sorted.length === 0 ? 'hidden' : 'visible' }}
      />
      {sorted.length === 0 && (
        <div className="text-muted-foreground flex h-32 items-center justify-center text-xs">
          No history snapshots yet
        </div>
      )}
    </>
  )
}

interface CapabilityCardProps {
  characteristicId: number
}

export function CapabilityCard({ characteristicId }: CapabilityCardProps) {
  const { role } = useAuth()
  const { selectedPlant } = usePlantContext()
  const { data: capability, isLoading, error } = useCapability(characteristicId, { includeCi: true })
  const { data: history } = useCapabilityHistory(characteristicId)
  const { data: charData } = useCharacteristic(characteristicId)
  const storedMethod = charData?.distribution_method ?? 'auto'
  const { data: nnCapability } = useNonNormalCapability(characteristicId, storedMethod)
  const saveSnapshot = useSaveCapabilitySnapshot()
  const [showDistAnalysis, setShowDistAnalysis] = useState(false)
  const { data: chartData } = useChartData(characteristicId)
  const qqMeasurements = useMemo(() => {
    if (!chartData) return []
    return getChartMeasurements(chartData)
  }, [chartData])

  const { isProOrAbove } = useLicense()

  const greenThreshold = selectedPlant?.capability_green_threshold ?? 1.33
  const yellowThreshold = selectedPlant?.capability_yellow_threshold ?? 1.0

  const canSaveSnapshot = hasAccess(role, 'engineer')
  const canFitDist = hasAccess(role, 'engineer') && isProOrAbove

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="bg-muted h-4 w-1/3 rounded" />
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-muted h-16 rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    const msg = error instanceof Error ? error.message : 'Failed to load'
    return (
      <div className="p-4">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Info className="h-4 w-4" />
          <span>{msg}</span>
        </div>
      </div>
    )
  }

  if (!capability) return null

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-primary h-4 w-4" />
          <h3 className="text-sm font-semibold">Process Capability</h3>
          <span className="text-muted-foreground text-xs">
            ({capability.sample_count} measurements)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {canFitDist && (
            <button
              onClick={() => setShowDistAnalysis(true)}
              className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-md border border-primary/20 px-2.5 py-1.5 text-xs font-medium transition-colors"
            >
              <BarChart3 className="h-3 w-3" />
              Fit Distribution
            </button>
          )}
          {canSaveSnapshot && (
            <button
              onClick={() => saveSnapshot.mutate(characteristicId)}
              disabled={saveSnapshot.isPending}
              className="bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50"
            >
              <Camera className="h-3 w-3" />
              {saveSnapshot.isPending ? 'Saving...' : 'Save Snapshot'}
            </button>
          )}
        </div>
      </div>

      {/* Stability Warning Banner (C4) */}
      {capability.stability_warning != null && (
        <div
          className={cn(
            'border-b px-4 py-2',
            capability.recent_violation_count >= 4
              ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
          )}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-xs">{capability.stability_warning}</span>
            <span
              className={cn(
                'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                capability.recent_violation_count >= 4 ? 'bg-red-500/20' : 'bg-amber-500/20',
              )}
            >
              {capability.recent_violation_count} violation{capability.recent_violation_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}

      {/* Index Cards — only show indices that have values */}
      <div className="space-y-3 px-4 py-3">
        {(() => {
          const indices = [
            { label: 'Cp', value: capability.cp, ci: undefined as [number, number] | null | undefined },
            { label: 'Cpk', value: capability.cpk, ci: capability.cpk_ci },
            { label: 'Pp', value: capability.pp, ci: capability.pp_ci },
            { label: 'Ppk', value: capability.ppk, ci: capability.ppk_ci },
            { label: 'Cpm', value: capability.cpm, ci: undefined as [number, number] | null | undefined },
          ].filter((idx) => idx.value !== null)

          if (indices.length === 0) {
            // Explain why no indices are available
            const missingBoth = capability.usl === null && capability.lsl === null
            const missingTarget = capability.target === null
            return (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  {missingBoth
                    ? 'Set specification limits (USL/LSL) in the characteristic configuration to enable capability indices.'
                    : missingTarget
                      ? 'Set a target value to enable Cpm calculation.'
                      : 'Insufficient data to calculate capability indices.'}
                </span>
              </div>
            )
          }

          const colsClass =
            indices.length >= 5 ? 'grid-cols-5' :
              indices.length === 4 ? 'grid-cols-4' :
                indices.length === 3 ? 'grid-cols-3' :
                  indices.length === 2 ? 'grid-cols-2' : 'grid-cols-1'

          return (
            <div className={cn('grid gap-3', colsClass)}>
              {indices.map(({ label, value, ci }) => (
                <IndexCard
                  key={label}
                  label={label}
                  value={value}
                  characteristicId={characteristicId}
                  ci={ci}
                  greenThreshold={greenThreshold}
                  yellowThreshold={yellowThreshold}
                />
              ))}
            </div>
          )
        })()}

        {(() => {
          const interpretation = interpretCapability({
            cp: capability.cp,
            cpk: capability.cpk,
            pp: capability.pp,
            ppk: capability.ppk,
            cpm: capability.cpm,
          })
          return <InterpretResult interpretation={interpretation} />
        })()}

        {capability.cp !== null && capability.cpk !== null && capability.cp - capability.cpk > 0.2 && (
          <ContextualHint hintId={hints.capabilityCpVsCpk.id}>
            <strong>Tip:</strong> {hints.capabilityCpVsCpk.text}
          </ContextualHint>
        )}

        {capability.cpk !== null && capability.ppk !== null && capability.cpk - capability.ppk > 0.15 && (
          <ContextualHint hintId={hints.capabilityCpkVsPpk.id}>
            <strong>Tip:</strong> {hints.capabilityCpkVsPpk.text}
          </ContextualHint>
        )}

        {/* Cp one-sided spec explanation */}
        {capability.cp === null &&
          (capability.usl === null || capability.lsl === null) &&
          !(capability.usl === null && capability.lsl === null) && (
            <div className="flex items-center gap-1 text-xs text-zinc-400">
              Cp: N/A &mdash; requires bilateral spec limits
              <StatNote>
                Cp measures process capability relative to both specification
                limits. For one-sided specs, use Cpk only.
              </StatNote>
            </div>
          )}

        {/* Sigma method note */}
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          <StatNote>
            &sigma; computed using R&#772;/d2 method (within-subgroup variation)
            for Cp/Cpk, sample standard deviation for Pp/Ppk.
          </StatNote>
        </div>

        {/* Normality + Distribution method + Specs */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <NormalityBadge result={capability} />
            {nnCapability && nnCapability.method !== 'normal' && (
              <span className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium">
                {nnCapability.method.replace('_', '-')}
              </span>
            )}
          </div>
          <span className="text-muted-foreground">
            {capability.short_run_mode === 'standardized' ? (
              <>LSL(Z): {capability.lsl != null && capability.sigma_within ? ((capability.lsl - (capability.target ?? 0)) / capability.sigma_within).toFixed(2) : '--'} | USL(Z): {capability.usl != null && capability.sigma_within ? ((capability.usl - (capability.target ?? 0)) / capability.sigma_within).toFixed(2) : '--'}</>
            ) : capability.short_run_mode === 'deviation' ? (
              <>LSL: {capability.lsl != null ? (capability.lsl - (capability.target ?? 0)).toFixed(4) : '--'} | USL: {capability.usl != null ? (capability.usl - (capability.target ?? 0)).toFixed(4) : '--'}</>
            ) : (
              <>LSL: {capability.lsl ?? '--'} | Target: {capability.target ?? '--'} | USL: {capability.usl ?? '--'}</>
            )}
          </span>
        </div>

        {/* Non-normal adjusted indices (when different from standard) */}
        {nnCapability && nnCapability.method !== 'normal' && (
          <div className="bg-muted/20 border-border rounded-lg border p-3">
            <div className="text-muted-foreground mb-2 text-[10px] font-medium uppercase tracking-wider">
              Adjusted ({nnCapability.method_detail})
            </div>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              {(['cp', 'cpk', 'pp', 'ppk', 'cpm'] as const).map((key) => {
                const label = key.charAt(0).toUpperCase() + key.slice(1)
                const val = nnCapability[key]
                return (
                  <div key={key}>
                    <div className="text-muted-foreground">{label}</div>
                    <div className={cn('font-bold tabular-nums', capabilityColor(val ?? null, greenThreshold, yellowThreshold))}>
                      {val !== null && val !== undefined ? (
                        <Explainable metric={key} resourceId={characteristicId}>
                          {val.toFixed(2)}
                        </Explainable>
                      ) : (
                        '--'
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Cpk Trend Chart */}
        {history && history.length > 0 && (
          <div>
            <div className="text-muted-foreground mb-1 flex items-center gap-1 text-xs font-medium">
              Cpk / Ppk Trend
              <StatNote>
                Each snapshot was captured at a specific point in time. Current
                capability values may differ as new data is collected.
              </StatNote>
            </div>
            <CpkTrendChart history={history} />
          </div>
        )}

        {/* Expected PPM (ISO 3534) — I9 */}
        {(capability.ppm_within_expected != null || capability.ppm_overall_expected != null) && (
          <div className="bg-muted/30 rounded-lg p-3">
            <div className="text-muted-foreground mb-1 text-xs font-medium">Expected PPM (ISO 3534)</div>
            <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
              {capability.ppm_within_expected != null && (
                <Explainable metric="cpk" resourceId={characteristicId}>
                  <span>Within: {capability.ppm_within_expected.toFixed(1)} PPM</span>
                </Explainable>
              )}
              {capability.ppm_overall_expected != null && (
                <Explainable metric="ppk" resourceId={characteristicId}>
                  <span>Overall: {capability.ppm_overall_expected.toFixed(1)} PPM</span>
                </Explainable>
              )}
            </div>
          </div>
        )}

        {/* Normal Probability Plot — C5 */}
        <CapabilityQQPlot measurements={qqMeasurements} />
      </div>

      {/* Distribution Analysis Modal */}
      {showDistAnalysis && (
        <Suspense
          fallback={
            <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
              <div className="text-muted-foreground text-sm">Loading analysis...</div>
            </div>
          }
        >
          <DistributionAnalysis
            characteristicId={characteristicId}
            onClose={() => setShowDistAnalysis(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
