import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useECharts } from '@/hooks/useECharts'
import { useCharacteristic, useFitDistribution, useNonNormalCapability, useUpdateDistributionConfig } from '@/api/hooks'
import { cn } from '@/lib/utils'
import type { DistributionFitResultData, NonNormalCapabilityResult } from '@/types'
import { X, BarChart3, CheckCircle, ArrowDownUp, Save, AlertTriangle, HelpCircle } from 'lucide-react'

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
  aic: 'Akaike Information Criterion \u2014 lower is better. Measures relative quality of fit; the best distribution has the lowest AIC.',
  ad_stat: 'Anderson-Darling test statistic \u2014 lower is better. Measures how well the data fits the distribution.',
  p_value: 'Statistical significance \u2014 higher is better (\u22650.05 means adequate fit). Probability the data came from this distribution.',
}

// ---------------------------------------------------------------------------
// PDF evaluation helpers (client-side approximations)
// ---------------------------------------------------------------------------

/**
 * Evaluate the probability density function for a given distribution family
 * at value x using the fitted parameters.
 */
function evaluatePDF(family: string, params: Record<string, number>, x: number): number {
  const TWO_PI = 2 * Math.PI

  switch (family) {
    case 'normal': {
      const mu = params.loc
      const sigma = params.scale
      if (sigma <= 0) return 0
      const z = (x - mu) / sigma
      return (1 / (sigma * Math.sqrt(TWO_PI))) * Math.exp(-0.5 * z * z)
    }

    case 'lognormal': {
      const s = params.s
      const loc = params.loc
      const scale = params.scale
      const y = x - loc
      if (y <= 0 || s <= 0 || scale <= 0) return 0
      const lnY = Math.log(y) - Math.log(scale)
      return (1 / (y * s * Math.sqrt(TWO_PI))) * Math.exp(-0.5 * (lnY / s) ** 2)
    }

    case 'weibull': {
      const c = params.c
      const loc = params.loc
      const scale = params.scale
      const y = x - loc
      if (y <= 0 || c <= 0 || scale <= 0) return 0
      const yNorm = y / scale
      return (c / scale) * Math.pow(yNorm, c - 1) * Math.exp(-Math.pow(yNorm, c))
    }

    case 'gamma': {
      const a = params.a
      const loc = params.loc
      const scale = params.scale
      const y = x - loc
      if (y <= 0 || a <= 0 || scale <= 0) return 0
      // Use Stirling's approximation for the gamma function:
      // ln(Gamma(a)) approximated via Lanczos
      const lnPdf = (a - 1) * Math.log(y) - y / scale - a * Math.log(scale) - lnGamma(a)
      return Math.exp(lnPdf)
    }

    case 'johnson_su': {
      // Johnson SU: f(x) = (b / (scale * sqrt(2pi) * sqrt(z^2 + 1))) * exp(-0.5 * (a + b * asinh(z))^2)
      // where z = (x - loc) / scale
      const a = params.a
      const b = params.b
      const loc = params.loc
      const scale = params.scale
      if (scale <= 0 || b <= 0) return 0
      const z = (x - loc) / scale
      const w = a + b * Math.asinh(z)
      return (b / (scale * Math.sqrt(TWO_PI) * Math.sqrt(z * z + 1))) * Math.exp(-0.5 * w * w)
    }

    case 'johnson_sb': {
      // Johnson SB: f(x) = (b / (scale * sqrt(2pi))) * (1 / (z * (1 - z))) * exp(-0.5 * (a + b * ln(z/(1-z)))^2)
      // where z = (x - loc) / scale, 0 < z < 1
      const a = params.a
      const b = params.b
      const loc = params.loc
      const scale = params.scale
      if (scale <= 0 || b <= 0) return 0
      const z = (x - loc) / scale
      if (z <= 0 || z >= 1) return 0
      const w = a + b * Math.log(z / (1 - z))
      return (b / (scale * Math.sqrt(TWO_PI) * z * (1 - z))) * Math.exp(-0.5 * w * w)
    }

    default:
      return 0
  }
}

/**
 * Compute the quantile (inverse CDF) for a fitted distribution at probability p.
 * Uses bisection search since we don't have closed-form inverses for all families.
 * Falls back to numeric integration of the PDF.
 */
function evaluateQuantile(family: string, params: Record<string, number>, p: number): number | null {
  // For normal, we have a direct formula
  if (family === 'normal') {
    return params.loc + params.scale * normalQuantile(p)
  }

  // For others, use bisection on the CDF (numerically integrated from PDF)
  // First, find reasonable bounds
  const mu = params.loc ?? 0
  const scale = params.scale ?? 1
  let lo = mu - 10 * scale
  let hi = mu + 10 * scale

  // For positive-support distributions, clamp lo
  if (family === 'lognormal' || family === 'weibull' || family === 'gamma') {
    lo = Math.max(lo, (params.loc ?? 0) + 1e-10)
  }
  if (family === 'johnson_sb') {
    lo = Math.max(lo, (params.loc ?? 0) + 1e-10)
    hi = Math.min(hi, (params.loc ?? 0) + (params.scale ?? 1) - 1e-10)
  }

  // Bisection: find x such that CDF(x) ~ p
  // CDF is estimated by trapezoidal integration of the PDF
  const numericCDF = (x: number): number => {
    const steps = 200
    const start = lo
    const dx = (x - start) / steps
    if (dx <= 0) return 0
    let sum = 0
    for (let i = 0; i < steps; i++) {
      const x0 = start + i * dx
      const x1 = x0 + dx
      sum += (evaluatePDF(family, params, x0) + evaluatePDF(family, params, x1)) * 0.5 * dx
    }
    return Math.min(1, Math.max(0, sum))
  }

  // 30 iterations of bisection gives ~1e-9 precision
  for (let iter = 0; iter < 30; iter++) {
    const mid = (lo + hi) / 2
    const cdfMid = numericCDF(mid)
    if (cdfMid < p) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return (lo + hi) / 2
}

/**
 * Lanczos approximation for ln(Gamma(z)) for z > 0.
 */
function lnGamma(z: number): number {
  if (z <= 0) return Infinity
  const g = 7
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ]
  if (z < 0.5) {
    // Reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z)
  }
  z -= 1
  let x = c[0]
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i)
  }
  const t = z + g + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
}

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
                      <th className="px-3 py-2 text-right font-medium">
                        <span className="inline-flex items-center">
                          AIC
                          <InfoTooltip text={METRIC_TOOLTIPS.aic} />
                        </span>
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        <span className="inline-flex items-center">
                          AD Stat
                          <InfoTooltip text={METRIC_TOOLTIPS.ad_stat} />
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
  const option = useMemo(() => {
    const p0 = result.p0_135
    const p50 = result.p50
    const p99 = result.p99_865
    if (p0 === null || p50 === null || p99 === null) return null

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

    // Build series array: histogram bar + PDF overlay lines
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = [
      {
        name: 'Distribution',
        type: 'bar',
        data: normalizedHeights,
        itemStyle: { color: 'rgba(59, 130, 246, 0.4)' },
        barWidth: '90%',
        z: 1,
      },
    ]

    // PDF overlays for each fitted distribution
    if (fits.length > 0) {
      // Compute raw PDF values for each fit at bin centers
      const fitPdfArrays = fits.map((fit) =>
        binCenters.map((x) => evaluatePDF(fit.family, fit.parameters, x)),
      )

      // Scale PDF values to match the histogram's normalized heights.
      // The histogram heights are normalized so max=1. For each PDF, we scale
      // so its max aligns with the histogram max (1.0). This gives a visual
      // overlay that matches the shape comparison.
      for (let fi = 0; fi < fits.length; fi++) {
        const fit = fits[fi]
        const pdfVals = fitPdfArrays[fi]
        const pdfMax = Math.max(...pdfVals)
        if (pdfMax <= 0) continue

        const scaledPdf = pdfVals.map((v) => +(v / pdfMax).toFixed(4))
        const isSelected = selectedFamily === fit.family
        const isBest = bestFit?.family === fit.family
        const color = FAMILY_COLORS[fit.family] ?? '#888'

        // When a family is selected, highlight it and dim others
        const hasSelection = selectedFamily !== null
        const lineOpacity = hasSelection
          ? (isSelected ? 1 : 0.15)
          : (isBest ? 1 : 0.6)
        const lineWidth = isSelected ? 3 : (isBest && !hasSelection ? 2.5 : 1.5)

        series.push({
          name: fit.family.replace('_', ' '),
          type: 'line',
          data: scaledPdf,
          smooth: true,
          symbol: 'none',
          lineStyle: {
            color,
            width: lineWidth,
            opacity: lineOpacity,
          },
          itemStyle: { color },
          z: isSelected ? 4 : (isBest ? 3 : 2),
        })
      }
    }

    return {
      grid: { top: 30, right: 20, bottom: 40, left: 50 },
      tooltip: {
        trigger: 'axis' as const,
        textStyle: { fontSize: 11 },
        confine: true,
      },
      legend: fits.length > 0
        ? {
            bottom: 0,
            textStyle: { fontSize: 9 },
            itemWidth: 14,
            itemHeight: 8,
            data: fits.map((f) => f.family.replace('_', ' ')),
          }
        : undefined,
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
      series,
      graphic: [
        {
          type: 'text' as const,
          left: 'center',
          top: 5,
          style: {
            text: `P0.135=${p0.toFixed(3)} | P50=${p50.toFixed(3)} | P99.865=${p99.toFixed(3)}`,
            fontSize: 10,
            fill: cssVar('--color-muted-foreground'),
          },
        },
      ],
    }
  }, [result, fits, bestFit, selectedFamily])

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
  const option = useMemo(() => {
    // Determine which fit to display: selected family takes priority, then best fit
    const displayFit = selectedFamily
      ? fits.find((f) => f.family === selectedFamily) ?? bestFit
      : bestFit

    // Prefer backend-computed Q-Q points (Blom plotting positions) from the display fit
    const qqSource = displayFit?.qq_points

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let qqData: [number, number][]
    let xLabel: string
    let yLabel: string

    if (qqSource && qqSource.theoretical_quantiles.length > 0) {
      // Backend provides proper Blom-position Q-Q points in the distribution's native scale
      qqData = qqSource.theoretical_quantiles.map((tq, i) => [
        +tq.toFixed(4),
        +qqSource.sample_quantiles[i].toFixed(4),
      ])
      xLabel = `Theoretical Quantiles (${displayFit?.family.replace('_', ' ') ?? 'fitted'})`
      yLabel = 'Sample Quantiles'
    } else {
      // Fallback: compute Q-Q from percentile summary (legacy behavior)
      const p0 = result.p0_135
      const p50 = result.p50
      const p99 = result.p99_865
      if (p0 === null || p50 === null || p99 === null) return null

      const sigma = (p99 - p0) / 6
      if (sigma <= 0) return null

      const percentiles = [0.135, 2.5, 5, 10, 25, 50, 75, 90, 95, 97.5, 99.865]
      qqData = percentiles.map((pct) => {
        const zTheory = normalQuantile(pct / 100)
        const dataQ = p0! + ((pct - 0.135) / (99.865 - 0.135)) * (p99! - p0!)
        const zData = (dataQ - p50!) / sigma
        return [+zTheory.toFixed(4), +zData.toFixed(4)]
      })
      xLabel = 'Theoretical Quantiles'
      yLabel = 'Sample Quantiles'
    }

    if (qqData.length === 0) return null

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

    // If we have a non-normal fit with backend Q-Q points, overlay the fit line
    // using the theoretical quantiles mapped against themselves (perfect fit line)
    // The scatter already shows sample vs theoretical, so the reference line is the
    // 45-degree line (perfect fit). For an additional non-normal overlay when the
    // fallback path is active, use the client-side evaluateQuantile.
    if (!qqSource && displayFit && displayFit.family !== 'normal') {
      const p0 = result.p0_135
      const p50 = result.p50
      const p99 = result.p99_865
      if (p0 !== null && p50 !== null && p99 !== null) {
        const sigma = (p99 - p0) / 6
        if (sigma > 0) {
          const percentiles = [0.135, 2.5, 5, 10, 25, 50, 75, 90, 95, 97.5, 99.865]
          const fitQQData: [number, number][] = []
          for (const pct of percentiles) {
            const zTheory = normalQuantile(pct / 100)
            const fitQuantile = evaluateQuantile(displayFit.family, displayFit.parameters, pct / 100)
            if (fitQuantile !== null) {
              const zFit = (fitQuantile - p50) / sigma
              fitQQData.push([+zTheory.toFixed(4), +zFit.toFixed(4)])
            }
          }

          if (fitQQData.length > 0) {
            const fitVals = fitQQData.flatMap(([a, b]) => [a, b])
            minVal = Math.min(minVal, ...fitVals) - 0.2
            maxVal = Math.max(maxVal, ...fitVals) + 0.2

            const fitColor = FAMILY_COLORS[displayFit.family] ?? '#888'
            series.push({
              name: `${displayFit.family.replace('_', ' ')} fit`,
              type: 'line',
              data: fitQQData,
              smooth: true,
              symbol: 'none',
              lineStyle: { color: fitColor, width: 2, type: 'solid' },
              itemStyle: { color: fitColor },
            })

            series[1].data = [
              [minVal, minVal],
              [maxVal, maxVal],
            ]
          }
        }
      }
    }

    return {
      grid: { top: 20, right: 20, bottom: 40, left: 50 },
      tooltip: {
        trigger: 'item' as const,
        textStyle: { fontSize: 11 },
        confine: true,
      },
      legend: displayFit && displayFit.family !== 'normal'
        ? {
            bottom: 0,
            textStyle: { fontSize: 9 },
            itemWidth: 14,
            itemHeight: 8,
          }
        : undefined,
      xAxis: {
        type: 'value' as const,
        min: minVal,
        max: maxVal,
        axisLabel: { fontSize: 9 },
        name: xLabel,
        nameLocation: 'middle' as const,
        nameGap: 28,
        nameTextStyle: { fontSize: 10 },
      },
      yAxis: {
        type: 'value' as const,
        min: minVal,
        max: maxVal,
        axisLabel: { fontSize: 9 },
        name: yLabel,
        nameTextStyle: { fontSize: 10 },
      },
      series,
    }
  }, [result, bestFit, selectedFamily, fits])

  const displayFit = selectedFamily
    ? fits.find((f) => f.family === selectedFamily) ?? bestFit
    : bestFit

  const { containerRef } = useECharts({ option, notMerge: true })
  return (
    <div
      ref={containerRef}
      className="w-full"
      style={{
        height: displayFit && displayFit.family !== 'normal' ? 300 : 256,
        visibility: option ? 'visible' : 'hidden',
      }}
    />
  )
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
