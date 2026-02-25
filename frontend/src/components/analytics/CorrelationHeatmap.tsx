import { useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'

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

    return {
      tooltip: {
        position: 'top' as const,
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
        },
        splitArea: {
          show: true,
        },
      },
      yAxis: {
        type: 'category' as const,
        data: truncatedLabels,
        axisLabel: {
          fontSize: 11,
        },
        splitArea: {
          show: true,
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
          color: ['#3b82f6', '#93c5fd', '#ffffff', '#fca5a5', '#ef4444'],
        },
        text: ['+1', '-1'],
        textStyle: {
          fontSize: 11,
        },
      },
      series: [
        {
          type: 'heatmap' as const,
          data,
          label: {
            show: true,
            fontSize: 11,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter: (params: any) => {
              const val = (params.data as [number, number, number])[2]
              return val.toFixed(2)
            },
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.2)',
            },
          },
        },
      ],
    }
  }, [matrix, labels, pValues, sampleCount])

  const { containerRef } = useECharts({ option })

  return <div ref={containerRef} className="h-[400px] w-full" />
}
