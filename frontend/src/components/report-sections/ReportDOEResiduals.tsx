import { useMemo } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import { useDOEAnalysis } from '@/api/hooks'
import { useStaticChart } from '@/hooks/useStaticChart'
import { normalQuantile } from '@/lib/statistics-utils'
import { cn } from '@/lib/utils'

interface ReportDOEResidualsProps {
  studyId?: number
}

/**
 * DOE residual diagnostics for report context.
 *
 * Shows a 2x2 grid: Q-Q plot, residuals vs fitted, residuals vs order,
 * and a residual histogram with a normality badge. Renders as static
 * images for print reliability.
 */
export function ReportDOEResiduals({ studyId }: ReportDOEResidualsProps) {
  const { data: analysis } = useDOEAnalysis(studyId ?? 0)

  if (!analysis) return null

  const hasResiduals =
    analysis.residuals != null &&
    analysis.fitted_values != null &&
    analysis.residuals.length > 0

  if (!hasResiduals) return null

  const residuals = analysis.residuals!
  const fittedValues = analysis.fitted_values!

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Residual Diagnostics</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <QQPlotChart residuals={residuals} />
        <ResidualsVsFittedChart residuals={residuals} fittedValues={fittedValues} />
        <ResidualsVsOrderChart residuals={residuals} />
        <ResidualHistogramChart residuals={residuals} />
      </div>
      {analysis.residual_stats && (
        <div className="bg-muted/30 mt-4 grid grid-cols-2 gap-2 rounded-lg p-3 sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground text-xs">Mean</div>
            <div className="font-mono text-sm">{analysis.residual_stats.mean.toFixed(6)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Std Dev</div>
            <div className="font-mono text-sm">{analysis.residual_stats.std.toFixed(6)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Min</div>
            <div className="font-mono text-sm">{analysis.residual_stats.min.toFixed(6)}</div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Max</div>
            <div className="font-mono text-sm">{analysis.residual_stats.max.toFixed(6)}</div>
          </div>
        </div>
      )}
      {analysis.normality_test && (
        <div className="mt-2 text-right">
          <NormalityBadge pValue={analysis.normality_test.p_value} />
        </div>
      )}
    </div>
  )
}

function NormalityBadge({ pValue }: { pValue: number }) {
  let label: string
  let colorClasses: string

  if (pValue > 0.05) {
    label = 'Normality: OK'
    colorClasses = 'bg-green-500/10 text-green-600 dark:text-green-400'
  } else if (pValue > 0.01) {
    label = 'Normality: Marginal'
    colorClasses = 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
  } else {
    label = 'Normality: Rejected'
    colorClasses = 'bg-red-500/10 text-red-600 dark:text-red-400'
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colorClasses,
      )}
    >
      {label} (p={pValue.toFixed(4)})
    </span>
  )
}

function useChartColors() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  return useMemo(
    () => ({
      axisLabel: isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)',
      axisLine: isDark ? 'hsl(220, 10%, 30%)' : 'hsl(210, 15%, 80%)',
      axisName: isDark ? 'hsl(220, 5%, 65%)' : 'hsl(220, 15%, 40%)',
      splitLine: isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 90%)',
      point: '#3b82f6',
      line: isDark ? 'hsl(220, 5%, 55%)' : 'hsl(220, 10%, 60%)',
      bar: '#6366f1',
      curve: '#f59e0b',
    }),
    [isDark],
  )
}

function QQPlotChart({ residuals }: { residuals: number[] }) {
  const colors = useChartColors()

  const option = useMemo(() => {
    const n = residuals.length
    const sorted = [...residuals].sort((a, b) => a - b)
    const theoretical = sorted.map((_, i) => {
      const p = (i + 1 - 0.375) / (n + 0.25)
      return normalQuantile(p)
    })

    const q1Idx = Math.floor(n * 0.25)
    const q3Idx = Math.floor(n * 0.75)
    const slope =
      q3Idx !== q1Idx
        ? (sorted[q3Idx] - sorted[q1Idx]) / (theoretical[q3Idx] - theoretical[q1Idx])
        : 1
    const intercept = sorted[q1Idx] - slope * theoretical[q1Idx]
    const xMin = theoretical[0]
    const xMax = theoretical[n - 1]

    const data: [number, number][] = theoretical.map((t, i) => [t, sorted[i]])

    return {
      title: { text: 'Normal Q-Q Plot', left: 'center', textStyle: { fontSize: 12, color: colors.axisLabel } },
      grid: { top: 35, right: 15, bottom: 35, left: 45, containLabel: true },
      tooltip: { trigger: 'item' as const },
      xAxis: {
        type: 'value' as const,
        name: 'Theoretical',
        nameLocation: 'middle' as const,
        nameGap: 22,
        nameTextStyle: { color: colors.axisName, fontSize: 10 },
        axisLabel: { color: colors.axisLabel, fontSize: 10 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Residuals',
        nameTextStyle: { color: colors.axisName, fontSize: 10 },
        axisLabel: { color: colors.axisLabel, fontSize: 10 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      series: [
        { type: 'scatter' as const, data, symbolSize: 5, itemStyle: { color: colors.point } },
        {
          type: 'line' as const,
          data: [[xMin, slope * xMin + intercept], [xMax, slope * xMax + intercept]],
          lineStyle: { color: colors.line, type: 'dashed' as const, width: 1.5 },
          symbol: 'none',
          silent: true,
        },
      ],
    }
  }, [residuals, colors])

  const { containerRef, dataURL, lightDataURL } = useStaticChart({ option, notMerge: true })

  return (
    <div className="relative h-56">
      <div ref={containerRef} className="absolute inset-0" style={{ visibility: dataURL ? 'hidden' : 'visible' }} />
      {dataURL && (
        <img src={dataURL} data-light-src={lightDataURL ?? undefined} alt="Q-Q Plot" className="absolute inset-0 h-full w-full object-contain" />
      )}
    </div>
  )
}

function ResidualsVsFittedChart({ residuals, fittedValues }: { residuals: number[]; fittedValues: number[] }) {
  const colors = useChartColors()

  const option = useMemo(() => {
    const data: [number, number][] = fittedValues.map((f, i) => [f, residuals[i]])
    const fMin = Math.min(...fittedValues)
    const fMax = Math.max(...fittedValues)

    return {
      title: { text: 'Residuals vs Fitted', left: 'center', textStyle: { fontSize: 12, color: colors.axisLabel } },
      grid: { top: 35, right: 15, bottom: 35, left: 45, containLabel: true },
      tooltip: { trigger: 'item' as const },
      xAxis: {
        type: 'value' as const,
        name: 'Fitted',
        nameLocation: 'middle' as const,
        nameGap: 22,
        nameTextStyle: { color: colors.axisName, fontSize: 10 },
        axisLabel: { color: colors.axisLabel, fontSize: 10 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Residuals',
        nameTextStyle: { color: colors.axisName, fontSize: 10 },
        axisLabel: { color: colors.axisLabel, fontSize: 10 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      series: [
        { type: 'scatter' as const, data, symbolSize: 5, itemStyle: { color: colors.point } },
        {
          type: 'line' as const,
          data: [[fMin, 0], [fMax, 0]],
          lineStyle: { color: colors.line, type: 'dashed' as const, width: 1.5 },
          symbol: 'none',
          silent: true,
        },
      ],
    }
  }, [residuals, fittedValues, colors])

  const { containerRef, dataURL, lightDataURL } = useStaticChart({ option, notMerge: true })

  return (
    <div className="relative h-56">
      <div ref={containerRef} className="absolute inset-0" style={{ visibility: dataURL ? 'hidden' : 'visible' }} />
      {dataURL && (
        <img src={dataURL} data-light-src={lightDataURL ?? undefined} alt="Residuals vs Fitted" className="absolute inset-0 h-full w-full object-contain" />
      )}
    </div>
  )
}

function ResidualsVsOrderChart({ residuals }: { residuals: number[] }) {
  const colors = useChartColors()

  const option = useMemo(() => {
    const data: [number, number][] = residuals.map((r, i) => [i + 1, r])

    return {
      title: { text: 'Residuals vs Order', left: 'center', textStyle: { fontSize: 12, color: colors.axisLabel } },
      grid: { top: 35, right: 15, bottom: 35, left: 45, containLabel: true },
      tooltip: { trigger: 'item' as const },
      xAxis: {
        type: 'value' as const,
        name: 'Order',
        nameLocation: 'middle' as const,
        nameGap: 22,
        nameTextStyle: { color: colors.axisName, fontSize: 10 },
        axisLabel: { color: colors.axisLabel, fontSize: 10 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
        min: 0.5,
        max: residuals.length + 0.5,
      },
      yAxis: {
        type: 'value' as const,
        name: 'Residuals',
        nameTextStyle: { color: colors.axisName, fontSize: 10 },
        axisLabel: { color: colors.axisLabel, fontSize: 10 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      series: [
        { type: 'scatter' as const, data, symbolSize: 5, itemStyle: { color: colors.point } },
        {
          type: 'line' as const,
          data: [[0.5, 0], [residuals.length + 0.5, 0]],
          lineStyle: { color: colors.line, type: 'dashed' as const, width: 1.5 },
          symbol: 'none',
          silent: true,
        },
      ],
    }
  }, [residuals, colors])

  const { containerRef, dataURL, lightDataURL } = useStaticChart({ option, notMerge: true })

  return (
    <div className="relative h-56">
      <div ref={containerRef} className="absolute inset-0" style={{ visibility: dataURL ? 'hidden' : 'visible' }} />
      {dataURL && (
        <img src={dataURL} data-light-src={lightDataURL ?? undefined} alt="Residuals vs Order" className="absolute inset-0 h-full w-full object-contain" />
      )}
    </div>
  )
}

function ResidualHistogramChart({ residuals }: { residuals: number[] }) {
  const colors = useChartColors()

  const option = useMemo(() => {
    const n = residuals.length
    const sorted = [...residuals].sort((a, b) => a - b)
    const q1 = sorted[Math.floor(n * 0.25)]
    const q3 = sorted[Math.floor(n * 0.75)]
    const iqr = q3 - q1
    const rMin = sorted[0]
    const rMax = sorted[n - 1]
    const range = rMax - rMin

    let nBins: number
    if (iqr > 0) {
      const binWidth = 2 * iqr * Math.pow(n, -1 / 3)
      nBins = Math.max(3, Math.ceil(range / binWidth))
    } else {
      nBins = Math.max(3, Math.ceil(1 + Math.log2(n)))
    }
    nBins = Math.min(nBins, 30)

    const binWidth = range / nBins || 1
    const bins: number[] = new Array(nBins).fill(0)
    const binCenters: number[] = []

    for (let i = 0; i < nBins; i++) {
      binCenters.push(rMin + binWidth * (i + 0.5))
    }

    for (const r of residuals) {
      let idx = Math.floor((r - rMin) / binWidth)
      if (idx >= nBins) idx = nBins - 1
      if (idx < 0) idx = 0
      bins[idx]++
    }

    const mean = residuals.reduce((s, v) => s + v, 0) / n
    const std = Math.sqrt(residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
    let curveValues: number[] = []
    if (std > 1e-10) {
      curveValues = binCenters.map(
        (x) =>
          ((n * binWidth) / (std * Math.sqrt(2 * Math.PI))) *
          Math.exp(-0.5 * ((x - mean) / std) ** 2),
      )
    }

    return {
      title: { text: 'Residual Distribution', left: 'center', textStyle: { fontSize: 12, color: colors.axisLabel } },
      grid: { top: 35, right: 15, bottom: 35, left: 45, containLabel: true },
      tooltip: { trigger: 'axis' as const, axisPointer: { type: 'shadow' as const } },
      xAxis: {
        type: 'category' as const,
        data: binCenters.map((c) => c.toFixed(3)),
        axisLabel: { color: colors.axisLabel, fontSize: 9, rotate: binCenters.length > 10 ? 45 : 0 },
        axisLine: { lineStyle: { color: colors.axisLine } },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Frequency',
        nameTextStyle: { color: colors.axisName, fontSize: 10 },
        axisLabel: { color: colors.axisLabel, fontSize: 10 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      series: [
        { type: 'bar' as const, data: bins, barMaxWidth: 35, itemStyle: { color: colors.bar, opacity: 0.7 } },
        ...(curveValues.length > 0
          ? [{
              type: 'line' as const,
              data: curveValues,
              smooth: true,
              symbol: 'none',
              lineStyle: { color: colors.curve, width: 2 },
            }]
          : []),
      ],
    }
  }, [residuals, colors])

  const { containerRef, dataURL, lightDataURL } = useStaticChart({ option, notMerge: true })

  return (
    <div className="relative h-56">
      <div ref={containerRef} className="absolute inset-0" style={{ visibility: dataURL ? 'hidden' : 'visible' }} />
      {dataURL && (
        <img src={dataURL} data-light-src={lightDataURL ?? undefined} alt="Residual histogram" className="absolute inset-0 h-full w-full object-contain" />
      )}
    </div>
  )
}
