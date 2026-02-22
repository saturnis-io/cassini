import { useState, useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useFitDistribution, useNonNormalCapability, useUpdateDistributionConfig } from '@/api/hooks'
import { cn } from '@/lib/utils'
import type { DistributionFitResultData, NonNormalCapabilityResult } from '@/types'
import { X, BarChart3, CheckCircle, ArrowDownUp, Save } from 'lucide-react'

const METHOD_OPTIONS = [
  { value: 'auto', label: 'Auto (cascade)' },
  { value: 'normal', label: 'Normal' },
  { value: 'box_cox', label: 'Box-Cox' },
  { value: 'percentile', label: 'Percentile' },
  { value: 'distribution_fit', label: 'Distribution Fit' },
]

interface DistributionAnalysisProps {
  characteristicId: number
  onClose: () => void
}

export function DistributionAnalysis({ characteristicId, onClose }: DistributionAnalysisProps) {
  const [method, setMethod] = useState('auto')
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)

  const { data: nnResult, isLoading: nnLoading } = useNonNormalCapability(characteristicId, method)
  const fitMutation = useFitDistribution()
  const updateConfig = useUpdateDistributionConfig()

  const fits = fitMutation.data?.fits ?? []
  const bestFit = fitMutation.data?.best_fit ?? null
  const recommendation = fitMutation.data?.recommendation ?? null

  const handleFit = () => {
    fitMutation.mutate(characteristicId)
  }

  const handleApply = () => {
    updateConfig.mutate({
      charId: characteristicId,
      config: {
        distribution_method: method,
        ...(selectedFamily ? { distribution_params: { family: selectedFamily } } : {}),
      },
    })
  }

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-card border-border relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border shadow-xl">
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="text-primary h-5 w-5" />
            <h2 className="text-lg font-semibold">Distribution Analysis</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Method selector + actions row */}
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <label className="text-muted-foreground text-sm">Method:</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="bg-input border-border text-foreground rounded-md border px-3 py-1.5 text-sm"
            >
              {METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              onClick={handleFit}
              disabled={fitMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              {fitMutation.isPending ? 'Fitting...' : 'Fit Distributions'}
            </button>

            <button
              onClick={handleApply}
              disabled={updateConfig.isPending}
              className="bg-success/10 text-success hover:bg-success/20 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {updateConfig.isPending ? 'Saving...' : 'Apply Config'}
            </button>
          </div>

          {/* Capability result summary */}
          {nnLoading && (
            <div className="text-muted-foreground mb-4 text-sm">Calculating capability...</div>
          )}
          {nnResult && <CapabilitySummary result={nnResult} />}

          {/* Distribution comparison table */}
          {fits.length > 0 && (
            <div className="mb-6">
              <h3 className="text-foreground mb-2 text-sm font-semibold">
                Distribution Comparison (ranked by AIC)
              </h3>
              <div className="border-border overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-border border-b">
                      <th className="px-3 py-2 text-left font-medium">Distribution</th>
                      <th className="px-3 py-2 text-right font-medium">AIC</th>
                      <th className="px-3 py-2 text-right font-medium">AD Stat</th>
                      <th className="px-3 py-2 text-right font-medium">p-value</th>
                      <th className="px-3 py-2 text-center font-medium">Adequate</th>
                      <th className="px-3 py-2 text-center font-medium">Select</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fits.map((fit, idx) => (
                      <tr
                        key={fit.family}
                        className={cn(
                          'border-border border-b last:border-0',
                          bestFit?.family === fit.family && 'bg-primary/5',
                          selectedFamily === fit.family && 'ring-primary ring-1 ring-inset',
                        )}
                      >
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {idx === 0 && (
                              <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
                                BEST
                              </span>
                            )}
                            <span className="font-mono text-xs">
                              {fit.family.replace('_', ' ')}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fit.aic.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fit.ad_statistic.toFixed(4)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fit.ad_p_value?.toFixed(4) ?? '--'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {fit.is_adequate_fit ? (
                            <CheckCircle className="text-success mx-auto h-4 w-4" />
                          ) : (
                            <span className="text-muted-foreground">--</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input
                            type="radio"
                            name="dist-select"
                            checked={selectedFamily === fit.family}
                            onChange={() => setSelectedFamily(fit.family)}
                            className="accent-primary h-3.5 w-3.5"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {recommendation && (
                <p className="text-muted-foreground mt-2 text-xs">{recommendation}</p>
              )}
            </div>
          )}

          {/* Charts: Histogram + Q-Q Plot side by side */}
          {nnResult && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-foreground mb-2 text-sm font-semibold">
                  Distribution Histogram
                </h3>
                <HistogramChart result={nnResult} />
              </div>
              <div>
                <h3 className="text-foreground mb-2 text-sm font-semibold">Q-Q Plot</h3>
                <QQPlot result={nnResult} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CapabilitySummary({ result }: { result: NonNormalCapabilityResult }) {
  return (
    <div className="bg-muted/20 border-border mb-6 rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-medium">
          {result.method_detail}
        </span>
        <span
          className={cn(
            'text-xs',
            result.is_normal ? 'text-success' : 'text-warning',
          )}
        >
          {result.is_normal ? 'Normal' : 'Non-normal'} (p=
          {result.normality_p_value?.toFixed(4) ?? '?'})
        </span>
      </div>
      <div className="grid grid-cols-5 gap-3 text-center text-sm">
        <IndexMini label="Pp" value={result.pp} />
        <IndexMini label="Ppk" value={result.ppk} />
        <IndexMini label="Cp" value={result.cp} />
        <IndexMini label="Cpk" value={result.cpk} />
        <IndexMini label="Cpm" value={result.cpm} />
      </div>
      {(result.percentile_pp !== null || result.percentile_ppk !== null) &&
        result.method !== 'percentile' && (
          <div className="mt-3 border-t border-border pt-2">
            <span className="text-muted-foreground text-xs">
              Percentile comparison: Pp={result.percentile_pp?.toFixed(2) ?? '--'}, Ppk=
              {result.percentile_ppk?.toFixed(2) ?? '--'}
            </span>
          </div>
        )}
    </div>
  )
}

function IndexMini({ label, value }: { label: string; value: number | null }) {
  const color =
    value === null
      ? 'text-muted-foreground'
      : value >= 1.33
        ? 'text-success'
        : value >= 1.0
          ? 'text-warning'
          : 'text-destructive'
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className={cn('font-bold tabular-nums', color)}>
        {value !== null ? value.toFixed(2) : '--'}
      </div>
    </div>
  )
}

function HistogramChart({ result }: { result: NonNormalCapabilityResult }) {
  const option = useMemo(() => {
    // We don't have raw data on the frontend, so show percentile info as reference lines
    const p0 = result.p0_135
    const p50 = result.p50
    const p99 = result.p99_865
    if (p0 === null || p50 === null || p99 === null) return null

    // Create approximate histogram bins from percentile info
    const range = p99 - p0
    if (range <= 0) return null
    const nBins = 20
    const binWidth = range / nBins
    const bins: string[] = []
    const binCenters: number[] = []
    for (let i = 0; i < nBins; i++) {
      const lo = p0 + i * binWidth
      const hi = lo + binWidth
      bins.push(`${lo.toFixed(2)}`)
      binCenters.push((lo + hi) / 2)
    }

    // Approximate a bell curve centered at p50 with spread from percentiles
    const sigma = (p99 - p0) / 6
    const heights = binCenters.map((x) => {
      const z = (x - p50) / sigma
      return Math.exp(-0.5 * z * z)
    })
    const maxH = Math.max(...heights)
    const normalizedHeights = heights.map((h) => +(h / maxH).toFixed(3))

    return {
      grid: { top: 30, right: 20, bottom: 40, left: 50 },
      tooltip: { trigger: 'axis' as const, textStyle: { fontSize: 11 } },
      xAxis: {
        type: 'category' as const,
        data: bins,
        axisLabel: { fontSize: 9, rotate: 45 },
        name: 'Value',
        nameLocation: 'middle' as const,
        nameGap: 30,
        nameTextStyle: { fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 9 },
        name: 'Density',
        nameTextStyle: { fontSize: 10 },
      },
      series: [
        {
          name: 'Distribution',
          type: 'bar' as const,
          data: normalizedHeights,
          itemStyle: { color: 'rgba(59, 130, 246, 0.5)' },
          barWidth: '90%',
        },
      ],
      graphic: [
        {
          type: 'text' as const,
          left: 'center',
          top: 5,
          style: {
            text: `P0.135=${p0.toFixed(3)} | P50=${p50.toFixed(3)} | P99.865=${p99.toFixed(3)}`,
            fontSize: 10,
            fill: '#888',
          },
        },
      ],
    }
  }, [result])

  const { containerRef } = useECharts({ option })
  return <div ref={containerRef} className="h-64 w-full" style={{ visibility: option ? 'visible' : 'hidden' }} />
}

function QQPlot({ result }: { result: NonNormalCapabilityResult }) {
  const option = useMemo(() => {
    const p0 = result.p0_135
    const p50 = result.p50
    const p99 = result.p99_865
    if (p0 === null || p50 === null || p99 === null) return null

    // Generate approximate Q-Q points from percentile data
    // Using standard normal quantiles vs estimated data quantiles
    const percentiles = [0.135, 2.5, 5, 10, 25, 50, 75, 90, 95, 97.5, 99.865]
    const sigma = (p99 - p0) / 6
    if (sigma <= 0) return null

    const qqData = percentiles.map((pct) => {
      // Theoretical normal quantile
      const zTheory = normalQuantile(pct / 100)
      // Estimated data quantile (linear interpolation from percentiles)
      const dataQ = p0 + ((pct - 0.135) / (99.865 - 0.135)) * (p99 - p0)
      // Standardized data quantile
      const zData = (dataQ - p50) / sigma
      return [+zTheory.toFixed(4), +zData.toFixed(4)]
    })

    const allZ = qqData.flatMap(([a, b]) => [a, b])
    const minZ = Math.min(...allZ) - 0.5
    const maxZ = Math.max(...allZ) + 0.5

    return {
      grid: { top: 20, right: 20, bottom: 40, left: 50 },
      tooltip: { trigger: 'item' as const, textStyle: { fontSize: 11 } },
      xAxis: {
        type: 'value' as const,
        min: minZ,
        max: maxZ,
        axisLabel: { fontSize: 9 },
        name: 'Theoretical Quantiles',
        nameLocation: 'middle' as const,
        nameGap: 28,
        nameTextStyle: { fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const,
        min: minZ,
        max: maxZ,
        axisLabel: { fontSize: 9 },
        name: 'Sample Quantiles',
        nameTextStyle: { fontSize: 10 },
      },
      series: [
        {
          name: 'Q-Q',
          type: 'scatter' as const,
          data: qqData,
          symbolSize: 6,
          itemStyle: { color: '#3b82f6' },
        },
        {
          name: 'Reference',
          type: 'line' as const,
          data: [
            [minZ, minZ],
            [maxZ, maxZ],
          ],
          lineStyle: { color: '#ef4444', type: 'dashed' as const, width: 1 },
          symbol: 'none',
        },
      ],
    }
  }, [result])

  const { containerRef } = useECharts({ option })
  return <div ref={containerRef} className="h-64 w-full" style={{ visibility: option ? 'visible' : 'hidden' }} />
}

/**
 * Approximate inverse normal CDF (probit function).
 * Uses Abramowitz & Stegun rational approximation.
 */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity
  if (p >= 1) return Infinity
  if (p === 0.5) return 0

  const a1 = -3.969683028665376e1
  const a2 = 2.209460984245205e2
  const a3 = -2.759285104469687e2
  const a4 = 1.383577518672690e2
  const a5 = -3.066479806614716e1
  const a6 = 2.506628277459239e0

  const b1 = -5.447609879822406e1
  const b2 = 1.615858368580409e2
  const b3 = -1.556989798598866e2
  const b4 = 6.680131188771972e1
  const b5 = -1.328068155288572e1

  const c1 = -7.784894002430293e-3
  const c2 = -3.223964580411365e-1
  const c3 = -2.400758277161838e0
  const c4 = -2.549732539343734e0
  const c5 = 4.374664141464968e0
  const c6 = 2.938163982698783e0

  const d1 = 7.784695709041462e-3
  const d2 = 3.224671290700398e-1
  const d3 = 2.445134137142996e0
  const d4 = 3.754408661907416e0

  const pLow = 0.02425
  const pHigh = 1 - pLow

  let q: number, r: number

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p))
    return (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
  } else if (p <= pHigh) {
    q = p - 0.5
    r = q * q
    return (((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p))
    return -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
  }
}
