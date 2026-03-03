import { useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useTheme } from '@/providers/ThemeProvider'

interface CorrelationHeatmapProps {
  /** NxN correlation matrix (row-major) */
  matrix: number[][]
  /** Characteristic labels for axes */
  labels: string[]
  /** Optional NxN p-value matrix */
  pValues?: number[][]
  /** Number of samples used */
  sampleCount?: number
}

/**
 * ECharts heatmap showing a correlation matrix.
 *
 * Color scale: -1 (blue) to 0 (white) to +1 (red).
 * Cell labels show r values to 2 decimal places.
 * Tooltip shows r, p-value, and sample count.
 */
export function CorrelationHeatmap({ matrix, labels, pValues, sampleCount }: CorrelationHeatmapProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const option = useMemo(() => {
    if (!matrix || matrix.length === 0 || !labels || labels.length === 0) return null

    // Build heatmap data: [xIndex, yIndex, value]
    const data: [number, number, number][] = []
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix[i].length; j++) {
        data.push([j, i, matrix[i][j]])
      }
    }

    // Truncate long labels
    const truncatedLabels = labels.map((l) => (l.length > 20 ? l.slice(0, 18) + '...' : l))

    // Theme-aware colors
    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    const tooltipTextColor = isDark ? '#e5e5e5' : '#333'
    const tooltipBorder = isDark ? 'hsl(220, 12%, 26%)' : 'hsl(210, 15%, 88%)'
    const cellLabelColor = isDark ? 'hsl(0, 0%, 90%)' : 'hsl(0, 0%, 15%)'
    // VisualMap center: use card background so the neutral zone blends with chart bg
    const neutralColor = isDark ? 'hsl(220, 22%, 15%)' : '#ffffff'
    const splitAreaColor = isDark
      ? ['rgba(255,255,255,0.02)', 'rgba(255,255,255,0.05)']
      : ['rgba(250,250,250,1)', 'rgba(230,230,230,0.3)']

    return {
      tooltip: {
        position: 'top' as const,
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipTextColor, fontSize: 12 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const [xIdx, yIdx, value] = params.data as [number, number, number]
          const xLabel = labels[xIdx] ?? ''
          const yLabel = labels[yIdx] ?? ''
          const rStr = value.toFixed(4)
          let tooltip = `<strong>${yLabel} vs ${xLabel}</strong><br/>r = ${rStr}`
          if (pValues && pValues[yIdx]?.[xIdx] != null) {
            const pVal = pValues[yIdx][xIdx]
            tooltip += `<br/>p-value = ${pVal < 0.001 ? pVal.toExponential(2) : pVal.toFixed(4)}`
          }
          if (sampleCount != null) {
            tooltip += `<br/>n = ${sampleCount}`
          }
          return tooltip
        },
      },
      grid: {
        top: 10,
        left: 120,
        right: 60,
        bottom: 80,
      },
      xAxis: {
        type: 'category' as const,
        data: truncatedLabels,
        axisLabel: {
          rotate: 45,
          fontSize: 11,
          color: axisLabelColor,
        },
        splitArea: {
          show: true,
          areaStyle: { color: splitAreaColor },
        },
      },
      yAxis: {
        type: 'category' as const,
        data: truncatedLabels,
        axisLabel: {
          fontSize: 11,
          color: axisLabelColor,
        },
        splitArea: {
          show: true,
          areaStyle: { color: splitAreaColor },
        },
      },
      visualMap: {
        min: -1,
        max: 1,
        calculable: true,
        orient: 'vertical' as const,
        right: 0,
        top: 'center' as const,
        inRange: {
          color: ['#3b82f6', '#93c5fd', neutralColor, '#fca5a5', '#ef4444'],
        },
        text: ['+1', '-1'],
        textStyle: {
          fontSize: 11,
          color: axisLabelColor,
        },
      },
      series: [
        {
          type: 'heatmap' as const,
          data,
          label: {
            show: true,
            fontSize: 11,
            color: cellLabelColor,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter: (params: any) => {
              const val = (params.data as [number, number, number])[2]
              return val.toFixed(2)
            },
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.2)',
            },
          },
        },
      ],
    }
  }, [matrix, labels, pValues, sampleCount, isDark])

  const { containerRef } = useECharts({ option })

  return <div ref={containerRef} className="h-[400px] w-full" />
}
