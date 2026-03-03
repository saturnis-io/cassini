import { useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useTheme } from '@/providers/ThemeProvider'

interface PCAData {
  /** Explained variance ratio per component [pc1_ratio, pc2_ratio, ...] */
  explained_variance_ratio: number[]
  /** Score matrix: each row is a sample, columns are PC scores */
  scores?: number[][]
  /** Loading matrix: each row is a variable, columns are PC loadings */
  loadings?: number[][]
  /** Variable/characteristic names */
  feature_names?: string[]
}

interface PCABiplotProps {
  pca: PCAData
}

/**
 * PCA Biplot — 2D scatter of PC1 vs PC2 scores with loading vectors as arrows.
 *
 * Axis labels show explained variance percentages.
 * Loading vectors drawn from origin as arrows with labels.
 */
export function PCABiplot({ pca }: PCABiplotProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const option = useMemo(() => {
    if (!pca) return null

    // Theme-aware colors
    const scatterColor = isDark ? 'hsl(210, 90%, 65%)' : '#3b82f6'
    const loadingColor = isDark ? 'hsl(32, 90%, 60%)' : '#f97316'
    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : undefined
    const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    const tooltipTextColor = isDark ? '#e5e5e5' : '#333'
    const tooltipBorder = isDark ? 'hsl(220, 12%, 26%)' : 'hsl(210, 15%, 88%)'

    const varRatio = pca.explained_variance_ratio ?? []
    const pc1Pct = varRatio[0] != null ? (varRatio[0] * 100).toFixed(1) : '?'
    const pc2Pct = varRatio[1] != null ? (varRatio[1] * 100).toFixed(1) : '?'

    // Score scatter data (PC1, PC2)
    const scoreData: [number, number][] = (pca.scores ?? []).map((row) => [
      row[0] ?? 0,
      row[1] ?? 0,
    ])

    // Auto-range for axes
    const allX = scoreData.map((d) => d[0])
    const allY = scoreData.map((d) => d[1])

    // Loading vectors — scale them relative to score spread
    const loadings = pca.loadings ?? []
    const featureNames = pca.feature_names ?? []

    // We scale loadings to span about 60% of the score range
    let loadingScale = 1
    if (allX.length > 0) {
      const xRange = Math.max(...allX) - Math.min(...allX) || 1
      const yRange = Math.max(...allY) - Math.min(...allY) || 1
      const maxLoadingMag = Math.max(
        ...loadings.map((row) => Math.sqrt((row[0] ?? 0) ** 2 + (row[1] ?? 0) ** 2)),
        0.01,
      )
      loadingScale = (Math.max(xRange, yRange) * 0.3) / maxLoadingMag
    }

    // Build graphic elements for loading arrows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arrowElements: any[] = []
    for (let i = 0; i < loadings.length; i++) {
      const lx = (loadings[i][0] ?? 0) * loadingScale
      const ly = (loadings[i][1] ?? 0) * loadingScale
      const name = featureNames[i] ?? `Var ${i + 1}`

      // Line from origin to loading endpoint
      arrowElements.push({
        type: 'line',
        shape: { x1: 0, y1: 0, x2: lx, y2: ly },
        style: {
          stroke: loadingColor,
          lineWidth: 2,
        },
      })

      // Label
      arrowElements.push({
        type: 'text',
        style: {
          text: name.length > 15 ? name.slice(0, 13) + '..' : name,
          x: lx,
          y: ly,
          fill: loadingColor,
          fontSize: 11,
          fontWeight: 'bold',
        },
      })
    }

    // Build loading vector overlay as additional scatter series with markLines
    // (Since graphic elements don't convert chart coords, use markLine from the series)
    const loadingMarkLines = loadings.map((row, i) => ({
      silent: true,
      lineStyle: { color: loadingColor, width: 2, type: 'solid' as const },
      symbol: ['none', 'arrow'],
      symbolSize: 8,
      label: {
        show: true,
        formatter: featureNames[i]
          ? featureNames[i].length > 15
            ? featureNames[i].slice(0, 13) + '..'
            : featureNames[i]
          : `Var ${i + 1}`,
        fontSize: 10,
        color: loadingColor,
        fontWeight: 'bold' as const,
      },
      data: [
        [
          { coord: [0, 0] },
          { coord: [(row[0] ?? 0) * loadingScale, (row[1] ?? 0) * loadingScale] },
        ],
      ],
    }))

    return {
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipTextColor, fontSize: 12 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const d = params.data as [number, number]
          return `PC1: ${d[0].toFixed(3)}<br/>PC2: ${d[1].toFixed(3)}`
        },
      },
      grid: {
        top: 30,
        left: 60,
        right: 30,
        bottom: 50,
      },
      xAxis: {
        type: 'value' as const,
        name: `PC1 (${pc1Pct}%)`,
        nameLocation: 'center' as const,
        nameGap: 30,
        nameTextStyle: { fontSize: 12, fontWeight: 'bold' as const, color: axisLabelColor },
        axisLabel: { color: axisLabelColor },
        splitLine: { lineStyle: { type: 'dashed' as const, opacity: 0.3, color: splitLineColor } },
      },
      yAxis: {
        type: 'value' as const,
        name: `PC2 (${pc2Pct}%)`,
        nameLocation: 'center' as const,
        nameGap: 40,
        nameTextStyle: { fontSize: 12, fontWeight: 'bold' as const, color: axisLabelColor },
        axisLabel: { color: axisLabelColor },
        splitLine: { lineStyle: { type: 'dashed' as const, opacity: 0.3, color: splitLineColor } },
      },
      series: [
        {
          type: 'scatter' as const,
          name: 'Scores',
          data: scoreData,
          symbolSize: 6,
          itemStyle: {
            color: scatterColor,
            opacity: 0.7,
          },
          markLine: {
            silent: true,
            animation: false,
            data: loadingMarkLines.flatMap((ml) => ml.data),
            lineStyle: { color: loadingColor, width: 2, type: 'solid' as const },
            symbol: ['none', 'arrow'],
            symbolSize: 8,
            label: { show: false },
          },
        },
        // Invisible series just for individually-labeled loading arrows
        ...loadings.map((row, i) => ({
          type: 'scatter' as const,
          name: featureNames[i] ?? `Var ${i + 1}`,
          data: [] as [number, number][],
          symbolSize: 0,
          markLine: {
            silent: true,
            animation: false,
            symbol: ['none', 'arrow'],
            symbolSize: 8,
            lineStyle: { color: loadingColor, width: 2, type: 'solid' as const },
            label: {
              show: true,
              formatter: featureNames[i]
                ? featureNames[i].length > 15
                  ? featureNames[i].slice(0, 13) + '..'
                  : featureNames[i]
                : `Var ${i + 1}`,
              fontSize: 10,
              color: loadingColor,
              fontWeight: 'bold' as const,
              position: 'end' as const,
            },
            data: [
              [
                { coord: [0, 0] },
                {
                  coord: [
                    (row[0] ?? 0) * loadingScale,
                    (row[1] ?? 0) * loadingScale,
                  ],
                },
              ],
            ],
          },
        })),
      ],
    }
  }, [pca, isDark])

  const { containerRef } = useECharts({ option })

  if (!pca?.scores || pca.scores.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
        No PCA score data available
      </div>
    )
  }

  return <div ref={containerRef} className="h-[400px] w-full" />
}
