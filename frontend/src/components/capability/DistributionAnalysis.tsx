import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useECharts } from '@/hooks/useECharts'
import { useCharacteristic, useFitDistribution, useNonNormalCapability, useUpdateDistributionConfig } from '@/api/hooks'
import { useTheme } from '@/providers/ThemeProvider'
import { cn } from '@/lib/utils'
import type { DistributionFitResultData, NonNormalCapabilityResult } from '@/types'
import { X, BarChart3, CheckCircle, ArrowDownUp, Save, AlertTriangle, HelpCircle } from 'lucide-react'
import { StatNote } from '@/components/StatNote'
import { evaluatePDF } from '@/lib/distribution-pdf'

const METHOD_OPTIONS = [
  { value: 'auto', label: 'Auto (cascade)' },
  { value: 'normal', label: 'Normal' },
  { value: 'box_cox', label: 'Box-Cox' },
  { value: 'percentile', label: 'Percentile' },
  { value: 'distribution_fit', label: 'Distribution Fit' },
]

/** Read a CSS custom property value from :root at render time */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Colors for each distribution family in chart overlays */
const FAMILY_COLORS: Record<string, string> = {
  normal: '#3b82f6',
  lognormal: '#f59e0b',
  weibull: '#10b981',
  gamma: '#8b5cf6',
  johnson_su: '#ec4899',
  johnson_sb: '#06b6d4',
}

/** Tooltip descriptions for table header metrics */
const METRIC_TOOLTIPS: Record<string, string> = {
  aic: 'Corrected Akaike Information Criterion (AICc) \u2014 lower is better. Penalizes complex models for small samples.',
  gof_stat: 'Goodness-of-fit test statistic \u2014 lower is better. Normal uses Anderson-Darling; others use Kolmogorov-Smirnov.',
  p_value: 'Statistical significance \u2014 higher is better (\u22650.05 means adequate fit). Note: KS p-values for fitted distributions may be optimistically biased.',
}

/** Human-readable labels for GoF test types */
const GOF_LABELS: Record<string, string> = {
  anderson_darling: 'AD',
  kolmogorov_smirnov: 'KS',
  unknown: 'GoF',
}

// ---------------------------------------------------------------------------
// PDF evaluation helpers (client-side approximations)
// ---------------------------------------------------------------------------

/**
 * Evaluate the probability density function for a given distribution family
 * at value x using the fitted parameters.
 */
// ---------------------------------------------------------------------------
// InfoTooltip component (fixed positioning, no clipping)
// ---------------------------------------------------------------------------

function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const iconRef = useRef<HTMLSpanElement>(null)

  const show = useCallback(() => {
    if (!iconRef.current) return
    const rect = iconRef.current.getBoundingClientRect()
    // Position tooltip below the icon, centered
    setPos({
      top: rect.bottom + 6,
      left: rect.left + rect.width / 2,
    })
    setVisible(true)
  }, [])

  const hide = useCallback(() => {
    setVisible(false)
  }, [])

  return (
    <>
      <span
        ref={iconRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        className="text-muted-foreground hover:text-foreground ml-1 inline-flex cursor-help transition-colors"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </span>
      {visible &&
        createPortal(
          <div
            onMouseEnter={show}
            onMouseLeave={hide}
            className="bg-popover text-popover-foreground border-border fixed z-[100] max-w-[260px] rounded-lg border px-3 py-2 text-xs shadow-lg"
            style={{
              top: pos.top,
              left: pos.left,
              transform: 'translateX(-50%)',
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface DistributionAnalysisProps {
  characteristicId: number
  onClose: () => void
}

export function DistributionAnalysis({ characteristicId, onClose }: DistributionAnalysisProps) {
  const { data: char } = useCharacteristic(characteristicId)
  // Initialize from stored value; fall back to 'auto' for null/undefined
  const storedMethod = char?.distribution_method ?? 'auto'
  const [method, setMethod] = useState(storedMethod)
  const [selectedFamily, setSelectedFamily] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Sync method from async char data on first load
  useEffect(() => {
    if (char && !initialized) {
      setMethod(char.distribution_method ?? 'auto')
      setInitialized(true)
    }
  }, [char, initialized])

  // Track whether user has made changes
  const hasChanges = method !== storedMethod || selectedFamily !== null

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
    updateConfig.mutate(
      {
        charId: characteristicId,
        config: {
          distribution_method: method,
          ...(selectedFamily ? { distribution_params: { family: selectedFamily } } : {}),
        },
      },
      { onSuccess: () => setApplied(true) },
    )
  }

  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false)

  const handleClose = useCallback(() => {
    if (hasChanges && !applied) {
      setShowUnsavedWarning(true)
    } else {
      onClose()
    }
  }, [hasChanges, applied, onClose])

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-card border-border relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border shadow-xl">
        {/* Unsaved changes confirmation */}
        {showUnsavedWarning && (
          <div className="bg-background/80 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-card border-border mx-4 max-w-sm rounded-lg border p-6 shadow-xl">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="text-warning h-5 w-5" />
                <h3 className="font-semibold">Unsaved Changes</h3>
              </div>
              <p className="text-muted-foreground mb-4 text-sm">
                You have unapplied distribution changes. Discard them?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowUnsavedWarning(false)}
                  className="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm"
                >
                  Go Back
                </button>
                <button
                  onClick={onClose}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md px-3 py-1.5 text-sm"
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="text-primary h-5 w-5" />
            <h2 className="text-lg font-semibold">Distribution Analysis</h2>
          </div>
          <button
            onClick={handleClose}
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
              onChange={(e) => setMethod(e.target.value as typeof method)}
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

            {method === 'auto' && (
              <StatNote>
                Method selected automatically: Shapiro-Wilk normality test
                &rarr; if non-normal, tries Box-Cox transform &rarr; if still
                non-normal, fits distribution families &rarr; falls back to
                percentile method.
              </StatNote>
            )}
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
                      <th className="px-3 py-2 text-right font-medium">
                        <span className="inline-flex items-center">
                          AICc
                          <InfoTooltip text={METRIC_TOOLTIPS.aic} />
                        </span>
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        <span className="inline-flex items-center">
                          GoF Stat
                          <InfoTooltip text={METRIC_TOOLTIPS.gof_stat} />
                        </span>
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        <span className="inline-flex items-center">
                          p-value
                          <InfoTooltip text={METRIC_TOOLTIPS.p_value} />
                        </span>
                      </th>
                      <th className="px-3 py-2 text-center font-medium">Adequate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fits.map((fit, idx) => {
                      const isSelected = selectedFamily === fit.family
                      const isBest = bestFit?.family === fit.family
                      return (
                        <tr
                          key={fit.family}
                          onClick={() => setSelectedFamily(isSelected ? null : fit.family)}
                          className={cn(
                            'border-border cursor-pointer border-b transition-colors last:border-0',
                            isSelected
                              ? 'bg-primary/10'
                              : isBest
                                ? 'bg-primary/5 hover:bg-primary/8'
                                : 'hover:bg-muted/50',
                          )}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  'inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-offset-1 ring-offset-transparent',
                                  isSelected ? 'ring-primary' : 'ring-transparent',
                                )}
                                style={{ backgroundColor: FAMILY_COLORS[fit.family] ?? '#888' }}
                              />
                              {idx === 0 && (
                                <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium">
                                  BEST
                                </span>
                              )}
                              <span className={cn('font-mono text-xs', isSelected && 'text-primary font-medium')}>
                                {fit.family.replace('_', ' ')}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{fit.aic.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className="text-muted-foreground mr-1 text-[10px]">
                              {GOF_LABELS[fit.gof_test_type] ?? 'GoF'}
                            </span>
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
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {recommendation && (
                <p className="text-muted-foreground mt-2 text-xs">{recommendation}</p>
              )}
            </div>
          )}

          {/* Charts: Histogram + Q-Q Plot — full width, side by side */}
          {nnResult && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-foreground mb-2 text-sm font-semibold">
                  Distribution Histogram
                </h3>
                <HistogramChart result={nnResult} fits={fits} bestFit={bestFit} selectedFamily={selectedFamily} />
              </div>
              <div>
                <h3 className="text-foreground mb-2 text-sm font-semibold">Q-Q Plot</h3>
                <QQPlot result={nnResult} bestFit={bestFit} selectedFamily={selectedFamily} fits={fits} />
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
      <div className="mb-2 flex flex-wrap items-center gap-2">
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
        {result.sample_count > 5000 && (
          <StatNote>
            Normality test uses a random sample of 5,000 points from the full
            dataset for statistical efficiency. Results are representative.
          </StatNote>
        )}
        {result.method === 'box_cox' && (
          <span className="flex items-center gap-1 text-xs text-zinc-400">
            Box-Cox transformed
            <StatNote>
              Data transformed using Box-Cox to achieve normality. Capability
              indices computed on transformed data, then back-transformed.
            </StatNote>
          </span>
        )}
      </div>
      <div className="grid grid-cols-5 gap-3 text-center text-sm">
        <IndexMini label="Cp" value={result.cp} />
        <IndexMini label="Cpk" value={result.cpk} />
        <IndexMini label="Pp" value={result.pp} />
        <IndexMini label="Ppk" value={result.ppk} />
        <IndexMini label="Cpm" value={result.cpm} />
      </div>
      {/* Distribution p-value */}
      {result.fitted_distribution?.ad_p_value != null && (
        <div className="text-muted-foreground mt-2 text-xs">
          Distribution fit p-value: {result.fitted_distribution.ad_p_value.toFixed(4)}
          {result.fitted_distribution.ad_p_value >= 0.05 ? ' (adequate)' : ' (poor fit)'}
        </div>
      )}
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

// ---------------------------------------------------------------------------
// Histogram chart with PDF overlays
// ---------------------------------------------------------------------------

interface HistogramChartProps {
  result: NonNormalCapabilityResult
  fits: DistributionFitResultData[]
  bestFit: DistributionFitResultData | null
  selectedFamily: string | null
}

function HistogramChart({ result, fits, bestFit, selectedFamily }: HistogramChartProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const option = useMemo(() => {
    const hist = result.histogram
    if (!hist || hist.counts.length === 0) return null

    // Theme-aware colors
    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const axisNameColor = isDark ? 'hsl(220, 5%, 65%)' : undefined
    const barColor = isDark ? 'rgba(96, 165, 250, 0.5)' : 'rgba(59, 130, 246, 0.4)'
    const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    const tooltipTextColor = isDark ? '#e5e5e5' : '#333'
    const tooltipBorder = isDark ? 'hsl(220, 12%, 26%)' : 'hsl(210, 15%, 88%)'
    const legendTextColor = isDark ? 'hsl(220, 5%, 70%)' : undefined

    const nBins = hist.counts.length
    const binWidth = hist.bin_edges[1] - hist.bin_edges[0]

    // Build bin center labels and centers for PDF evaluation
    const bins: string[] = []
    const binCenters: number[] = []
    for (let i = 0; i < nBins; i++) {
      const center = (hist.bin_edges[i] + hist.bin_edges[i + 1]) / 2
      bins.push(center.toFixed(2))
      binCenters.push(center)
    }

    // Use actual density values from backend (count / (N * bin_width))
    const densityData = hist.density.map((d) => +d.toFixed(6))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = [
      {
        name: 'Data',
        type: 'bar',
        data: densityData,
        itemStyle: { color: barColor },
        barWidth: '90%',
        z: 1,
      },
    ]

    // PDF overlays — evaluated at bin centers on the SAME density scale
    if (fits.length > 0) {
      for (const fit of fits) {
        const pdfVals = binCenters.map((x) => +evaluatePDF(fit.family, fit.parameters, x).toFixed(6))
        const pdfMax = Math.max(...pdfVals)
        if (pdfMax <= 0) continue

        const isSelected = selectedFamily === fit.family
        const isBest = bestFit?.family === fit.family
        const color = FAMILY_COLORS[fit.family] ?? '#888'

        const hasSelection = selectedFamily !== null
        const lineOpacity = hasSelection ? (isSelected ? 1 : 0.15) : isBest ? 1 : 0.6
        const lineWidth = isSelected ? 3 : isBest && !hasSelection ? 2.5 : 1.5

        series.push({
          name: fit.family.replace('_', ' '),
          type: 'line',
          data: pdfVals,
          smooth: true,
          symbol: 'none',
          lineStyle: { color, width: lineWidth, opacity: lineOpacity },
          itemStyle: { color },
          z: isSelected ? 4 : isBest ? 3 : 2,
        })
      }
    }

    const p0 = result.p0_135
    const p50 = result.p50
    const p99 = result.p99_865

    return {
      grid: { top: 30, right: 20, bottom: 40, left: 50 },
      tooltip: {
        trigger: 'axis' as const,
        textStyle: { fontSize: 11, color: tooltipTextColor },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        confine: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any[]) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const idx = params[0].dataIndex
          const lo = hist.bin_edges[idx]
          const hi = hist.bin_edges[idx + 1]
          const count = hist.counts[idx]
          let tip = `<b>${lo.toFixed(2)} – ${hi.toFixed(2)}</b><br/>Count: ${count}`
          for (const p of params) {
            if (p.seriesName !== 'Data') {
              tip += `<br/><span style="color:${p.color}">\u25CF</span> ${p.seriesName}: ${(p.value as number).toFixed(4)}`
            }
          }
          return tip
        },
      },
      legend:
        fits.length > 0
          ? {
              bottom: 0,
              textStyle: { fontSize: 9, color: legendTextColor },
              itemWidth: 14,
              itemHeight: 8,
              data: fits.map((f) => f.family.replace('_', ' ')),
            }
          : undefined,
      xAxis: {
        type: 'category' as const,
        data: bins,
        axisLabel: { fontSize: 9, rotate: 45, color: axisLabelColor },
        name: 'Value',
        nameLocation: 'middle' as const,
        nameGap: 30,
        nameTextStyle: { fontSize: 10, color: axisNameColor },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 9, color: axisLabelColor },
        name: `Density (bin width = ${binWidth.toFixed(3)})`,
        nameTextStyle: { fontSize: 10, color: axisNameColor },
      },
      series,
      graphic:
        p0 !== null && p50 !== null && p99 !== null
          ? [
              {
                type: 'text' as const,
                left: 'center',
                top: 5,
                style: {
                  text: `n=${result.sample_count} | P0.135=${p0.toFixed(3)} | P50=${p50.toFixed(3)} | P99.865=${p99.toFixed(3)}`,
                  fontSize: 10,
                  fill: cssVar('--color-muted-foreground'),
                },
              },
            ]
          : [],
    }
  }, [result, fits, bestFit, selectedFamily, isDark])

  const { containerRef } = useECharts({ option, notMerge: true })
  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{
        height: fits.length > 0 ? 300 : 256,
        visibility: option ? 'visible' : 'hidden',
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Q-Q plot with best fit quantile overlay
// ---------------------------------------------------------------------------

interface QQPlotProps {
  result: NonNormalCapabilityResult
  bestFit: DistributionFitResultData | null
  selectedFamily: string | null
  fits: DistributionFitResultData[]
}

function QQPlot({ result, bestFit, selectedFamily, fits }: QQPlotProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Determine which fit to display: selected family takes priority, then best fit
  const displayFit = selectedFamily ? (fits.find((f) => f.family === selectedFamily) ?? bestFit) : bestFit

  const option = useMemo(() => {
    // Use backend-computed Q-Q points: prefer fit-specific, fall back to nonnormal result
    const qqSource = displayFit?.qq_points ?? result.qq_points
    if (!qqSource || qqSource.theoretical_quantiles.length === 0) return null

    const qqData: [number, number][] = qqSource.theoretical_quantiles.map((tq, i) => [
      +tq.toFixed(4),
      +qqSource.sample_quantiles[i].toFixed(4),
    ])

    const familyLabel = displayFit?.family.replace('_', ' ') ?? 'normal'
    const xLabel = `Theoretical Quantiles (${familyLabel})`
    const yLabel = 'Sample Quantiles'

    const allVals = qqData.flatMap(([a, b]) => [a, b])
    let minVal = Math.min(...allVals)
    let maxVal = Math.max(...allVals)
    const pad = (maxVal - minVal) * 0.1 || 0.5
    minVal -= pad
    maxVal += pad

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = [
      {
        name: 'Q-Q',
        type: 'scatter',
        data: qqData,
        symbolSize: 6,
        itemStyle: { color: cssVar('--color-primary') },
      },
      {
        name: 'Reference Line',
        type: 'line',
        data: [
          [minVal, minVal],
          [maxVal, maxVal],
        ],
        lineStyle: { color: cssVar('--color-destructive'), type: 'dashed', width: 1 },
        symbol: 'none',
      },
    ]

    // Theme-aware colors
    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const axisNameColor = isDark ? 'hsl(220, 5%, 65%)' : undefined
    const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    const tooltipTextColor = isDark ? '#e5e5e5' : '#333'
    const tooltipBorder = isDark ? 'hsl(220, 12%, 26%)' : 'hsl(210, 15%, 88%)'
    const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : undefined

    return {
      grid: { top: 20, right: 20, bottom: 40, left: 50 },
      tooltip: {
        trigger: 'item' as const,
        textStyle: { fontSize: 11, color: tooltipTextColor },
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        confine: true,
      },
      xAxis: {
        type: 'value' as const,
        min: minVal,
        max: maxVal,
        axisLabel: { fontSize: 9, color: axisLabelColor },
        name: xLabel,
        nameLocation: 'middle' as const,
        nameGap: 28,
        nameTextStyle: { fontSize: 10, color: axisNameColor },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      yAxis: {
        type: 'value' as const,
        min: minVal,
        max: maxVal,
        axisLabel: { fontSize: 9, color: axisLabelColor },
        name: yLabel,
        nameTextStyle: { fontSize: 10, color: axisNameColor },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series,
    }
  }, [result, displayFit, isDark])

  const { containerRef } = useECharts({ option, notMerge: true })

  // No Q-Q data available — show guidance
  const qqSource = displayFit?.qq_points ?? result.qq_points
  if (!qqSource) {
    return (
      <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
        Click &ldquo;Fit Distributions&rdquo; to generate Q-Q plot
      </div>
    )
  }

  return <div ref={containerRef} className="w-full" style={{ height: 300, visibility: option ? 'visible' : 'hidden' }} />
}

