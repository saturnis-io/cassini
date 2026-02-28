import { useCapability, useCapabilityHistory, useSaveCapabilitySnapshot, useNonNormalCapability, useCharacteristic } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess } from '@/lib/roles'
import { useLicense } from '@/hooks/useLicense'
import { useECharts } from '@/hooks/useECharts'
import type { CapabilityResult, CapabilityHistoryItem } from '@/types'
import { cn } from '@/lib/utils'
import { Camera, TrendingUp, AlertTriangle, CheckCircle, Info, HelpCircle, BarChart3 } from 'lucide-react'
import { useState, useMemo, lazy, Suspense } from 'react'

const DistributionAnalysis = lazy(() =>
  import('./DistributionAnalysis').then((m) => ({ default: m.DistributionAnalysis })),
)

/** Threshold-based color coding for capability indices */
function capabilityColor(value: number | null): string {
  if (value === null) return 'text-muted-foreground'
  if (value >= 1.33) return 'text-success'
  if (value >= 1.0) return 'text-warning'
  return 'text-destructive'
}

function capabilityBg(value: number | null): string {
  if (value === null) return 'bg-muted/30'
  if (value >= 1.33) return 'bg-success/10'
  if (value >= 1.0) return 'bg-warning/10'
  return 'bg-destructive/10'
}

function capabilityLabel(value: number | null): string {
  if (value === null) return '--'
  if (value >= 1.33) return 'Capable'
  if (value >= 1.0) return 'Marginal'
  return 'Not Capable'
}

const CAPABILITY_DESCRIPTIONS: Record<string, string> = {
  Cp: 'Potential capability. Compares specification width to process spread, ignoring centering. Higher is better; \u22651.33 is typically capable.',
  Cpk: 'Actual capability. Like Cp but penalizes off-center processes. The most commonly used index \u2014 measures real-world performance against specs.',
  Pp: 'Overall performance. Like Cp but uses total observed variation (long-term) instead of within-subgroup variation.',
  Ppk: 'Overall performance index. Like Cpk but using long-term variation. Compare Cpk vs Ppk to assess process stability over time.',
  Cpm: 'Taguchi capability. Measures how closely the process hits a specific target value, not just staying within spec limits.',
}

function IndexCard({ label, value }: { label: string; value: number | null }) {
  const [showTip, setShowTip] = useState(false)
  const description = CAPABILITY_DESCRIPTIONS[label]

  return (
    <div className={cn('border-border relative rounded-lg border p-3 text-center', capabilityBg(value))}>
      <div className="text-muted-foreground mb-1 flex items-center justify-center gap-1 text-xs">
        {label}
        {description && (
          <button
            type="button"
            className="text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            onClick={() => setShowTip((v) => !v)}
            aria-label={`What is ${label}?`}
          >
            <HelpCircle className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className={cn('text-lg font-bold tabular-nums', capabilityColor(value))}>
        {value !== null ? value.toFixed(2) : '--'}
      </div>
      <div className={cn('mt-0.5 text-[10px]', capabilityColor(value))}>
        {capabilityLabel(value)}
      </div>
      {showTip && description && (
        <div className="bg-popover text-popover-foreground border-border absolute -top-2 left-1/2 z-50 w-52 -translate-x-1/2 -translate-y-full rounded-md border p-2 text-left text-[11px] leading-snug shadow-md">
          {description}
        </div>
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

  if (sorted.length === 0) {
    return (
      <div className="text-muted-foreground flex h-32 items-center justify-center text-xs">
        No history snapshots yet
      </div>
    )
  }

  return <div ref={containerRef} className="h-32 w-full" />
}

interface CapabilityCardProps {
  characteristicId: number
}

export function CapabilityCard({ characteristicId }: CapabilityCardProps) {
  const { role } = useAuth()
  const { data: capability, isLoading, error } = useCapability(characteristicId)
  const { data: history } = useCapabilityHistory(characteristicId)
  const { data: charData } = useCharacteristic(characteristicId)
  const storedMethod = charData?.distribution_method ?? 'auto'
  const { data: nnCapability } = useNonNormalCapability(characteristicId, storedMethod)
  const saveSnapshot = useSaveCapabilitySnapshot()
  const [showDistAnalysis, setShowDistAnalysis] = useState(false)

  const { isCommercial } = useLicense()
  const canSaveSnapshot = hasAccess(role, 'engineer')
  const canFitDist = hasAccess(role, 'engineer') && isCommercial

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
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
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

      {/* Index Cards — only show indices that have values */}
      <div className="space-y-4 p-4">
        {(() => {
          const indices = [
            { label: 'Cp', value: capability.cp },
            { label: 'Cpk', value: capability.cpk },
            { label: 'Pp', value: capability.pp },
            { label: 'Ppk', value: capability.ppk },
            { label: 'Cpm', value: capability.cpm },
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
              {indices.map(({ label, value }) => (
                <IndexCard key={label} label={label} value={value} />
              ))}
            </div>
          )
        })()}

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
                    <div className={cn('font-bold tabular-nums', capabilityColor(val ?? null))}>
                      {val !== null && val !== undefined ? val.toFixed(2) : '--'}
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
            <div className="text-muted-foreground mb-1 text-xs font-medium">Cpk / Ppk Trend</div>
            <CpkTrendChart history={history} />
          </div>
        )}
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
