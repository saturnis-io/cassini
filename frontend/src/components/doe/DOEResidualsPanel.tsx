import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useECharts } from '@/hooks/useECharts'
import { useTheme } from '@/providers/ThemeProvider'
import { normalQuantile } from '@/lib/statistics-utils'
import type { ECOption } from '@/lib/echarts'
import type { DOEAnalysis } from '@/api/doe.api'

interface DOEResidualsPanelProps {
  analysis: DOEAnalysis
}

// --- Normality badge ---

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

// --- Theme helpers ---

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
      outlier: '#ef4444',
      line: isDark ? 'hsl(220, 5%, 55%)' : 'hsl(220, 10%, 60%)',
      bar: '#6366f1',
      curve: '#f59e0b',
    }),
    [isDark],
  )
}

// --- Sub-chart components using useECharts ---

function QQPlot({
  residuals,
  outlierIndices,
}: {
  residuals: number[]
  outlierIndices: number[]
}) {
  const colors = useChartColors()

  const option = useMemo<ECOption>(() => {
    const n = residuals.length
    const sorted = [...residuals].sort((a, b) => a - b)
    const outlierSet = new Set(outlierIndices)

    // Map sorted residuals back to original indices for outlier detection
    // Sort indices by residual value to align with sorted residuals
    const sortedOrigIndices = residuals
      .map((v, i) => ({ v, i }))
      .sort((a, b) => a.v - b.v)
      .map((x) => x.i)

    const theoretical = sorted.map((_, i) => {
      const p = (i + 1 - 0.375) / (n + 0.25) // Blom formula (matches R qqnorm / Minitab)
      return normalQuantile(p)
    })

    // Reference line (45-degree through Q1 and Q3)
    const q1Idx = Math.floor(n * 0.25)
    const q3Idx = Math.floor(n * 0.75)
    const slope =
      q3Idx !== q1Idx
        ? (sorted[q3Idx] - sorted[q1Idx]) / (theoretical[q3Idx] - theoretical[q1Idx])
        : 1
    const intercept = sorted[q1Idx] - slope * theoretical[q1Idx]
    const xMin = theoretical[0]
    const xMax = theoretical[n - 1]

    // Split data into normal and outlier points
    const normalData: [number, number][] = []
    const outlierData: [number, number][] = []
    for (let i = 0; i < n; i++) {
      const point: [number, number] = [theoretical[i], sorted[i]]
      if (outlierSet.has(sortedOrigIndices[i])) {
        outlierData.push(point)
      } else {
        normalData.push(point)
      }
    }

    return {
      title: {
        text: 'Normal Q-Q Plot',
        left: 'center',
        textStyle: { fontSize: 13, fontWeight: 500, color: colors.axisLabel },
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: { data?: [number, number] }) => {
          const d = params.data
          if (!d) return ''
          return `Theoretical: ${d[0].toFixed(3)}<br/>Residual: ${d[1].toFixed(4)}`
        },
      },
      grid: { top: 40, right: 20, bottom: 40, left: 50, containLabel: true },
      xAxis: {
        type: 'value' as const,
        name: 'Theoretical Quantiles',
        nameLocation: 'middle' as const,
        nameGap: 25,
        nameTextStyle: { color: colors.axisName, fontSize: 11 },
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Residuals',
        nameTextStyle: { color: colors.axisName, fontSize: 11 },
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      series: [
        {
          type: 'scatter' as const,
          name: 'Residuals',
          data: normalData,
          symbolSize: 6,
          itemStyle: { color: colors.point },
        },
        ...(outlierData.length > 0
          ? [
              {
                type: 'scatter' as const,
                name: 'Outliers',
                data: outlierData,
                symbolSize: 8,
                itemStyle: { color: colors.outlier },
              },
            ]
          : []),
        {
          type: 'line' as const,
          name: 'Reference',
          data: [
            [xMin, slope * xMin + intercept],
            [xMax, slope * xMax + intercept],
          ],
          lineStyle: { color: colors.line, type: 'dashed' as const, width: 1.5 },
          symbol: 'none',
          silent: true,
        },
      ],
    }
  }, [residuals, outlierIndices, colors])

  const { containerRef } = useECharts({ option })

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 280 }}
    />
  )
}

function ResidualsVsFitted({
  residuals,
  fittedValues,
  outlierIndices,
}: {
  residuals: number[]
  fittedValues: number[]
  outlierIndices: number[]
}) {
  const colors = useChartColors()

  const option = useMemo<ECOption>(() => {
    const outlierSet = new Set(outlierIndices)
    const normalData: [number, number][] = []
    const outlierData: [number, number][] = []

    for (let i = 0; i < residuals.length; i++) {
      const point: [number, number] = [fittedValues[i], residuals[i]]
      if (outlierSet.has(i)) {
        outlierData.push(point)
      } else {
        normalData.push(point)
      }
    }

    const fMin = Math.min(...fittedValues)
    const fMax = Math.max(...fittedValues)

    return {
      title: {
        text: 'Residuals vs Fitted Values',
        left: 'center',
        textStyle: { fontSize: 13, fontWeight: 500, color: colors.axisLabel },
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: { data?: [number, number] }) => {
          const d = params.data
          if (!d) return ''
          return `Fitted: ${d[0].toFixed(4)}<br/>Residual: ${d[1].toFixed(4)}`
        },
      },
      grid: { top: 40, right: 20, bottom: 40, left: 50, containLabel: true },
      xAxis: {
        type: 'value' as const,
        name: 'Fitted Values',
        nameLocation: 'middle' as const,
        nameGap: 25,
        nameTextStyle: { color: colors.axisName, fontSize: 11 },
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Residuals',
        nameTextStyle: { color: colors.axisName, fontSize: 11 },
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      series: [
        {
          type: 'scatter' as const,
          name: 'Residuals',
          data: normalData,
          symbolSize: 6,
          itemStyle: { color: colors.point },
        },
        ...(outlierData.length > 0
          ? [
              {
                type: 'scatter' as const,
                name: 'Outliers',
                data: outlierData,
                symbolSize: 8,
                itemStyle: { color: colors.outlier },
              },
            ]
          : []),
        {
          type: 'line' as const,
          name: 'Zero',
          data: [
            [fMin, 0],
            [fMax, 0],
          ],
          lineStyle: { color: colors.line, type: 'dashed' as const, width: 1.5 },
          symbol: 'none',
          silent: true,
        },
      ],
    }
  }, [residuals, fittedValues, outlierIndices, colors])

  const { containerRef } = useECharts({ option })

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 280 }}
    />
  )
}

function ResidualsVsOrder({
  residuals,
  outlierIndices,
}: {
  residuals: number[]
  outlierIndices: number[]
}) {
  const colors = useChartColors()

  const option = useMemo<ECOption>(() => {
    const outlierSet = new Set(outlierIndices)
    const normalData: [number, number][] = []
    const outlierData: [number, number][] = []

    for (let i = 0; i < residuals.length; i++) {
      const point: [number, number] = [i + 1, residuals[i]]
      if (outlierSet.has(i)) {
        outlierData.push(point)
      } else {
        normalData.push(point)
      }
    }

    return {
      title: {
        text: 'Residuals vs Run Order',
        left: 'center',
        textStyle: { fontSize: 13, fontWeight: 500, color: colors.axisLabel },
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: { data?: [number, number] }) => {
          const d = params.data
          if (!d) return ''
          return `Run: ${d[0]}<br/>Residual: ${d[1].toFixed(4)}`
        },
      },
      grid: { top: 40, right: 20, bottom: 40, left: 50, containLabel: true },
      xAxis: {
        type: 'value' as const,
        name: 'Observation Order',
        nameLocation: 'middle' as const,
        nameGap: 25,
        nameTextStyle: { color: colors.axisName, fontSize: 11 },
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
        min: 0.5,
        max: residuals.length + 0.5,
      },
      yAxis: {
        type: 'value' as const,
        name: 'Residuals',
        nameTextStyle: { color: colors.axisName, fontSize: 11 },
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      series: [
        {
          type: 'scatter' as const,
          name: 'Residuals',
          data: normalData,
          symbolSize: 6,
          itemStyle: { color: colors.point },
        },
        ...(outlierData.length > 0
          ? [
              {
                type: 'scatter' as const,
                name: 'Outliers',
                data: outlierData,
                symbolSize: 8,
                itemStyle: { color: colors.outlier },
              },
            ]
          : []),
        {
          type: 'line' as const,
          name: 'Zero',
          data: [
            [0.5, 0],
            [residuals.length + 0.5, 0],
          ],
          lineStyle: { color: colors.line, type: 'dashed' as const, width: 1.5 },
          symbol: 'none',
          silent: true,
        },
      ],
    }
  }, [residuals, outlierIndices, colors])

  const { containerRef } = useECharts({ option })

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 280 }}
    />
  )
}

function ResidualHistogram({
  residuals,
  normalityTest,
}: {
  residuals: number[]
  normalityTest: DOEAnalysis['normality_test']
}) {
  const colors = useChartColors()

  const option = useMemo<ECOption>(() => {
    const n = residuals.length
    // Freedman-Diaconis bin width
    const sorted = [...residuals].sort((a, b) => a - b)
    const q1 = sorted[Math.floor(n * 0.25)]
    const q3 = sorted[Math.floor(n * 0.75)]
    const iqr = q3 - q1
    const rMin = sorted[0]
    const rMax = sorted[n - 1]
    const range = rMax - rMin

    // Number of bins: use Freedman-Diaconis or Sturges as fallback
    let nBins: number
    if (iqr > 0) {
      const binWidth = 2 * iqr * Math.pow(n, -1 / 3)
      nBins = Math.max(3, Math.ceil(range / binWidth))
    } else {
      nBins = Math.max(3, Math.ceil(1 + Math.log2(n)))
    }
    nBins = Math.min(nBins, 30) // cap

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

    // Normal curve overlay evaluated at bin centers (same category axis)
    const mean = residuals.reduce((s, v) => s + v, 0) / n
    const std = Math.sqrt(residuals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1))
    let curveValues: number[] = []
    if (std > 1e-10) {
      curveValues = binCenters.map((x) =>
        (n * binWidth) / (std * Math.sqrt(2 * Math.PI)) *
        Math.exp(-0.5 * ((x - mean) / std) ** 2),
      )
    }

    return {
      title: {
        text: 'Residual Distribution',
        left: 'center',
        textStyle: { fontSize: 13, fontWeight: 500, color: colors.axisLabel },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' as const },
      },
      grid: { top: 40, right: 20, bottom: 40, left: 50, containLabel: true },
      xAxis: {
        type: 'category' as const,
        data: binCenters.map((c) => c.toFixed(3)),
        name: 'Residual',
        nameLocation: 'middle' as const,
        nameGap: 25,
        nameTextStyle: { color: colors.axisName, fontSize: 11 },
        axisLabel: {
          color: colors.axisLabel,
          fontSize: 10,
          rotate: binCenters.length > 10 ? 45 : 0,
        },
        axisLine: { lineStyle: { color: colors.axisLine } },
      },
      yAxis: {
        type: 'value' as const,
        name: 'Frequency',
        nameTextStyle: { color: colors.axisName, fontSize: 11 },
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.axisLine } },
        splitLine: { lineStyle: { color: colors.splitLine } },
      },
      series: [
        {
          type: 'bar' as const,
          name: 'Count',
          data: bins,
          barMaxWidth: 40,
          itemStyle: { color: colors.bar, opacity: 0.7 },
        },
        ...(curveValues.length > 0
          ? [
              {
                type: 'line' as const,
                name: 'Normal Fit',
                data: curveValues,
                smooth: true,
                symbol: 'none',
                lineStyle: { color: colors.curve, width: 2 },
              },
            ]
          : []),
      ],
    }
  }, [residuals, colors])

  // normalityTest is only for the badge display outside the chart
  void normalityTest

  const { containerRef } = useECharts({ option, notMerge: true })

  return (
    <div className="relative">
      <div
        ref={containerRef}
        style={{ width: '100%', height: 280 }}
      />
      {normalityTest && (
        <div className="absolute right-2 top-1">
          <NormalityBadge pValue={normalityTest.p_value} />
        </div>
      )}
    </div>
  )
}

// --- Main panel ---

export function DOEResidualsPanel({ analysis }: DOEResidualsPanelProps) {
  const [expanded, setExpanded] = useState(true)

  const hasResiduals =
    analysis.residuals != null &&
    analysis.fitted_values != null &&
    analysis.residuals.length > 0

  if (!hasResiduals) return null

  const residuals = analysis.residuals!
  const fittedValues = analysis.fitted_values!
  const outlierIndices = analysis.outlier_indices ?? []

  return (
    <div className="border-border rounded-xl border">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="bg-muted/50 border-border flex w-full items-center justify-between border-b px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <h3 className="text-sm font-medium">Residual Diagnostics</h3>
          {analysis.normality_test && (
            <NormalityBadge pValue={analysis.normality_test.p_value} />
          )}
        </div>
        {analysis.residual_stats && (
          <div className="text-muted-foreground flex gap-4 text-xs">
            <span>
              n={residuals.length}
            </span>
            <span>
              Std={analysis.residual_stats.std.toFixed(4)}
            </span>
            {outlierIndices.length > 0 && (
              <span className="text-red-500">
                {outlierIndices.length} outlier{outlierIndices.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </button>

      {/* 2x2 grid of diagnostic plots */}
      <div
        className={cn(
          'transition-all duration-200',
          expanded ? 'p-4' : 'h-0 overflow-hidden p-0',
        )}
        style={{ visibility: expanded ? 'visible' : 'hidden' }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <QQPlot residuals={residuals} outlierIndices={outlierIndices} />
          <ResidualsVsFitted
            residuals={residuals}
            fittedValues={fittedValues}
            outlierIndices={outlierIndices}
          />
          <ResidualsVsOrder residuals={residuals} outlierIndices={outlierIndices} />
          <ResidualHistogram
            residuals={residuals}
            normalityTest={analysis.normality_test}
          />
        </div>

        {/* Summary stats footer */}
        {analysis.residual_stats && (
          <div className="bg-muted/30 mt-4 grid grid-cols-2 gap-2 rounded-lg p-3 sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground text-xs">Mean</div>
              <div className="font-mono text-sm">
                {analysis.residual_stats.mean.toFixed(6)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Std Dev</div>
              <div className="font-mono text-sm">
                {analysis.residual_stats.std.toFixed(6)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Min</div>
              <div className="font-mono text-sm">
                {analysis.residual_stats.min.toFixed(6)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">Max</div>
              <div className="font-mono text-sm">
                {analysis.residual_stats.max.toFixed(6)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
