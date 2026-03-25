import { useState, useMemo } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import { useECharts } from '@/hooks/useECharts'
import type { ECOption } from '@/lib/echarts'

interface FactorRange {
  name: string
  low: number
  high: number
}

interface ContourPlotProps {
  coefficients: Record<string, number>
  factorRanges: FactorRange[]
  optimalSettings: Record<string, number> | null
  responseName: string | null
}

/** Grid resolution for the contour heatmap */
const GRID_SIZE = 50

/**
 * Evaluate the regression model at a given point.
 *
 * Coefficient keys follow the convention:
 *   - 'Intercept' for b0
 *   - 'A', 'B', 'C', ... for linear terms (factor name)
 *   - 'A*B' for interaction terms
 *   - 'A^2' for quadratic terms
 */
function evaluateModel(
  coefficients: Record<string, number>,
  factorValues: Record<string, number>,
): number {
  let result = coefficients['Intercept'] ?? 0

  for (const [term, coeff] of Object.entries(coefficients)) {
    if (term === 'Intercept') continue

    if (term.includes('*')) {
      // Interaction term: 'A*B'
      const parts = term.split('*')
      let product = coeff
      for (const part of parts) {
        product *= factorValues[part] ?? 0
      }
      result += product
    } else if (term.includes('^')) {
      // Quadratic term: 'A^2'
      const [factorName, power] = term.split('^')
      const val = factorValues[factorName] ?? 0
      result += coeff * Math.pow(val, Number(power))
    } else {
      // Linear term: 'A'
      result += coeff * (factorValues[term] ?? 0)
    }
  }

  return result
}

export function ContourPlot({
  coefficients,
  factorRanges,
  optimalSettings,
  responseName,
}: ContourPlotProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Factor pair selection (when >2 factors)
  const [factorAIndex, setFactorAIndex] = useState(0)
  const [factorBIndex, setFactorBIndex] = useState(
    factorRanges.length > 1 ? 1 : 0,
  )

  const factorA = factorRanges[factorAIndex]
  const factorB = factorRanges[factorBIndex]

  // Compute the grid data and ECharts option
  const option = useMemo((): ECOption | null => {
    if (!factorA || !factorB || factorA.name === factorB.name) return null

    // Theme-aware colors
    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const axisLineColor = isDark ? 'hsl(220, 10%, 30%)' : 'hsl(210, 15%, 80%)'
    const axisNameColor = isDark ? 'hsl(220, 5%, 65%)' : 'hsl(220, 15%, 40%)'
    const tooltipBg = isDark
      ? 'rgba(30, 37, 55, 0.95)'
      : 'rgba(255, 255, 255, 0.95)'
    const tooltipTextColor = isDark ? '#e5e5e5' : '#333'
    const tooltipBorder = isDark
      ? 'hsl(220, 12%, 26%)'
      : 'hsl(210, 15%, 88%)'

    // Generate axis tick values
    const xValues: number[] = []
    const yValues: number[] = []
    for (let i = 0; i < GRID_SIZE; i++) {
      xValues.push(factorA.low + (i / (GRID_SIZE - 1)) * (factorA.high - factorA.low))
      yValues.push(factorB.low + (i / (GRID_SIZE - 1)) * (factorB.high - factorB.low))
    }

    // Axis labels (show fewer labels for readability)
    const xLabels = xValues.map((v) => v.toFixed(2))
    const yLabels = yValues.map((v) => v.toFixed(2))

    // Compute midpoint values for held factors
    const heldFactorValues: Record<string, number> = {}
    for (const fr of factorRanges) {
      if (fr.name !== factorA.name && fr.name !== factorB.name) {
        heldFactorValues[fr.name] = (fr.low + fr.high) / 2
      }
    }

    // Generate heatmap data: [xIndex, yIndex, value]
    const gridData: [number, number, number][] = []
    let minVal = Infinity
    let maxVal = -Infinity

    for (let xi = 0; xi < GRID_SIZE; xi++) {
      for (let yi = 0; yi < GRID_SIZE; yi++) {
        const factorValues: Record<string, number> = {
          ...heldFactorValues,
          [factorA.name]: xValues[xi],
          [factorB.name]: yValues[yi],
        }
        const predicted = evaluateModel(coefficients, factorValues)
        gridData.push([xi, yi, predicted])
        if (predicted < minVal) minVal = predicted
        if (predicted > maxVal) maxVal = predicted
      }
    }

    // Optimal point marker
    const scatterData: { value: [number, number]; label: string }[] = []
    if (optimalSettings && factorA.name in optimalSettings && factorB.name in optimalSettings) {
      const optX = optimalSettings[factorA.name]
      const optY = optimalSettings[factorB.name]
      // Find closest grid indices
      const xIdx = xValues.reduce(
        (best, v, i) => (Math.abs(v - optX) < Math.abs(xValues[best] - optX) ? i : best),
        0,
      )
      const yIdx = yValues.reduce(
        (best, v, i) => (Math.abs(v - optY) < Math.abs(yValues[best] - optY) ? i : best),
        0,
      )
      scatterData.push({
        value: [xIdx, yIdx],
        label: `Optimal: ${factorA.name}=${optX.toFixed(2)}, ${factorB.name}=${optY.toFixed(2)}`,
      })
    }

    // Contour-like gradient (blue → cyan → green → yellow → red)
    const gradientColors = isDark
      ? ['#1e3a5f', '#1a6b6a', '#2d7d3e', '#b8a030', '#b84030']
      : ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#fee090', '#fdae61', '#f46d43', '#d73027']

    return {
      tooltip: {
        trigger: 'item',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipTextColor, fontSize: 12 },
        formatter: (
          params: { data?: [number, number, number]; seriesType?: string; marker?: string },
        ) => {
          if (!params.data) return ''
          if (params.seriesType === 'scatter') {
            const item = scatterData[0]
            return item ? `<b>Optimal Point</b><br/>${item.label}` : ''
          }
          const [xi, yi, val] = params.data
          return [
            `<b>${factorA.name}:</b> ${xValues[xi].toFixed(3)}`,
            `<b>${factorB.name}:</b> ${yValues[yi].toFixed(3)}`,
            `<b>${responseName ?? 'Response'}:</b> ${val.toFixed(4)}`,
          ].join('<br/>')
        },
      },
      grid: {
        top: 30,
        right: 90,
        bottom: 50,
        left: 70,
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        name: factorA.name,
        nameLocation: 'middle',
        nameGap: 32,
        nameTextStyle: { color: axisNameColor, fontWeight: 'bold' },
        axisLabel: {
          color: axisLabelColor,
          fontSize: 10,
          interval: Math.floor(GRID_SIZE / 5) - 1,
          rotate: 0,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: yLabels,
        name: factorB.name,
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: { color: axisNameColor, fontWeight: 'bold' },
        axisLabel: {
          color: axisLabelColor,
          fontSize: 10,
          interval: Math.floor(GRID_SIZE / 5) - 1,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      visualMap: {
        type: 'continuous',
        min: minVal,
        max: maxVal,
        calculable: true,
        orient: 'vertical',
        right: 0,
        top: 'center',
        itemHeight: 200,
        text: [maxVal.toFixed(2), minVal.toFixed(2)],
        textStyle: { color: axisLabelColor, fontSize: 10 },
        inRange: {
          color: gradientColors,
        },
      },
      series: [
        {
          type: 'heatmap',
          data: gridData,
          emphasis: {
            itemStyle: {
              borderColor: isDark ? '#fff' : '#333',
              borderWidth: 1,
            },
          },
        },
        ...(scatterData.length > 0
          ? [
              {
                type: 'scatter' as const,
                data: scatterData.map((d) => d.value),
                symbolSize: 14,
                symbol: 'diamond',
                itemStyle: {
                  color: isDark ? '#fbbf24' : '#d97706',
                  borderColor: isDark ? '#fff' : '#000',
                  borderWidth: 2,
                },
                z: 10,
              },
            ]
          : []),
      ],
    }
  }, [coefficients, factorA, factorB, factorRanges, optimalSettings, responseName, isDark])

  const { containerRef } = useECharts({
    option,
    notMerge: true,
  })

  if (factorRanges.length < 2) {
    return (
      <div className="border-border flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground text-sm">
          At least 2 factors are required for a contour plot.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Response Surface</h3>
        {factorRanges.length > 2 && (
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">X-axis:</span>
              <select
                value={factorAIndex}
                onChange={(e) => {
                  const idx = Number(e.target.value)
                  setFactorAIndex(idx)
                  if (idx === factorBIndex) {
                    // Swap to avoid selecting the same factor
                    setFactorBIndex(factorAIndex)
                  }
                }}
                className="bg-background border-border rounded border px-2 py-1 text-xs"
              >
                {factorRanges.map((fr, i) => (
                  <option key={fr.name} value={i}>
                    {fr.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-xs">Y-axis:</span>
              <select
                value={factorBIndex}
                onChange={(e) => {
                  const idx = Number(e.target.value)
                  setFactorBIndex(idx)
                  if (idx === factorAIndex) {
                    setFactorAIndex(factorBIndex)
                  }
                }}
                className="bg-background border-border rounded border px-2 py-1 text-xs"
              >
                {factorRanges.map((fr, i) => (
                  <option key={fr.name} value={i}>
                    {fr.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-muted-foreground text-xs">
              (others held at midpoint)
            </span>
          </div>
        )}
      </div>
      {/* ECharts container MUST always be in DOM - never conditionally render */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: 400,
          visibility: option ? 'visible' : 'hidden',
        }}
      />
      {optimalSettings && (
        <div className="flex items-center gap-2 text-xs">
          <span
            className="inline-block h-3 w-3 rotate-45 border-2"
            style={{
              backgroundColor: isDark ? '#fbbf24' : '#d97706',
              borderColor: isDark ? '#fff' : '#000',
            }}
          />
          <span className="text-muted-foreground">Optimal point</span>
        </div>
      )}
    </div>
  )
}
