import { useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useChartColors } from '@/hooks/useChartColors'
import { useTheme } from '@/providers/ThemeProvider'

interface BivariateScatterPoint {
  x: number
  y: number
  t2: number
  ooc: boolean
}

interface BivariateData {
  group_id: number
  char_names: string[]
  scatter_points: BivariateScatterPoint[]
  ellipse_boundary: number[][]
  center: number[]
  ucl: number
  ooc_count: number
  total_count: number
}

interface T2BivariatePlotProps {
  data: BivariateData
}

/**
 * T2BivariatePlot -- 2D scatter plot with Hotelling T-squared confidence
 * ellipse boundary. In-control points are shown in blue/gray, OOC points
 * in red. The ellipse boundary traces the T-squared = UCL contour.
 */
export function T2BivariatePlot({ data }: T2BivariatePlotProps) {
  const chartColors = useChartColors()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const option = useMemo(() => {
    if (!data || data.scatter_points.length === 0) return null

    const inControl = data.scatter_points
      .filter((p) => !p.ooc)
      .map((p) => [p.x, p.y, p.t2])
    const ooc = data.scatter_points
      .filter((p) => p.ooc)
      .map((p) => [p.x, p.y, p.t2])

    const lineColor = chartColors.lineGradientStart
    const violationColor = chartColors.violationPoint
    const uclColor = chartColors.uclLine
    const textColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const gridColor = isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 88%)'
    const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(0, 0, 0, 0.85)'
    const tooltipBorder = isDark
      ? 'rgba(255, 255, 255, 0.12)'
      : 'rgba(255, 255, 255, 0.1)'
    const oocBorderColor = isDark ? 'hsl(220, 25%, 13%)' : '#fff'

    // Compute axis ranges from data + ellipse boundary with padding
    const allX = [
      ...data.scatter_points.map((p) => p.x),
      ...data.ellipse_boundary.map((p) => p[0]),
    ]
    const allY = [
      ...data.scatter_points.map((p) => p.y),
      ...data.ellipse_boundary.map((p) => p[1]),
    ]
    const xMin = Math.min(...allX)
    const xMax = Math.max(...allX)
    const yMin = Math.min(...allY)
    const yMax = Math.max(...allY)
    const xPad = (xMax - xMin) * 0.1 || 1
    const yPad = (yMax - yMin) * 0.1 || 1

    return {
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: Record<string, unknown>) => {
          const value = params.value as number[] | undefined
          if (!value || value.length < 3) return ''
          const seriesName = params.seriesName as string
          if (seriesName === 'Ellipse' || seriesName === 'Center') return ''
          const xVal = value[0].toFixed(4)
          const yVal = value[1].toFixed(4)
          const t2Val = value[2].toFixed(3)
          const isOOC = seriesName === 'OOC'
          let html = `<div style="font-weight:600;margin-bottom:4px">${data.char_names[0]}: ${xVal}</div>`
          html += `<div>${data.char_names[1]}: ${yVal}</div>`
          html += `<div style="margin-top:4px">T\u00B2 = <strong>${t2Val}</strong></div>`
          html += `<div style="opacity:0.7">UCL = ${data.ucl.toFixed(3)}</div>`
          if (isOOC) {
            html +=
              '<div style="color:#ef4444;font-weight:600;margin-top:4px">Out of Control</div>'
          } else {
            html +=
              '<div style="color:#22c55e;margin-top:4px">In Control</div>'
          }
          return html
        },
      },
      grid: {
        top: 40,
        left: 70,
        right: 30,
        bottom: 50,
      },
      xAxis: {
        type: 'value' as const,
        name: data.char_names[0],
        nameLocation: 'middle' as const,
        nameGap: 30,
        nameTextStyle: { fontSize: 12, color: textColor, fontWeight: 500 },
        min: xMin - xPad,
        max: xMax + xPad,
        axisLabel: { fontSize: 10, color: textColor },
        axisLine: { lineStyle: { color: gridColor } },
        splitLine: {
          lineStyle: { color: gridColor, type: 'dashed' as const },
        },
      },
      yAxis: {
        type: 'value' as const,
        name: data.char_names[1],
        nameLocation: 'middle' as const,
        nameGap: 50,
        nameTextStyle: { fontSize: 12, color: textColor, fontWeight: 500 },
        min: yMin - yPad,
        max: yMax + yPad,
        axisLabel: { fontSize: 10, color: textColor },
        axisLine: { show: false },
        splitLine: {
          lineStyle: { color: gridColor, type: 'dashed' as const },
        },
      },
      series: [
        // Ellipse boundary
        {
          type: 'line' as const,
          name: 'Ellipse',
          data: data.ellipse_boundary,
          symbol: 'none',
          lineStyle: {
            color: uclColor,
            width: 2,
            type: 'dashed' as const,
          },
          silent: true,
          z: 5,
        },
        // In-control scatter
        {
          type: 'scatter' as const,
          name: 'In Control',
          data: inControl,
          symbolSize: 7,
          itemStyle: {
            color: lineColor,
            opacity: 0.75,
          },
          emphasis: {
            scale: 1.5,
            itemStyle: {
              shadowBlur: 6,
              shadowColor: lineColor,
            },
          },
          z: 8,
        },
        // OOC scatter
        {
          type: 'scatter' as const,
          name: 'OOC',
          data: ooc,
          symbolSize: 11,
          itemStyle: {
            color: violationColor,
            borderColor: oocBorderColor,
            borderWidth: 1.5,
          },
          emphasis: {
            scale: 1.4,
            itemStyle: {
              shadowBlur: 8,
              shadowColor: violationColor,
            },
          },
          z: 10,
        },
        // Center point
        {
          type: 'scatter' as const,
          name: 'Center',
          data: [[data.center[0], data.center[1]]],
          symbol: 'diamond',
          symbolSize: 12,
          itemStyle: {
            color: uclColor,
            borderColor: isDark ? 'hsl(220, 25%, 13%)' : '#fff',
            borderWidth: 2,
          },
          silent: true,
          z: 9,
        },
      ],
    }
  }, [data, chartColors, isDark])

  const { containerRef } = useECharts({ option })

  if (!data || data.scatter_points.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
        No bivariate data available. Click &ldquo;Compute&rdquo; first.
      </div>
    )
  }

  return (
    <div>
      {/* Summary strip */}
      <div className="mb-1 flex items-center gap-4 text-[11px]">
        <span className="text-muted-foreground">
          <span className="text-foreground font-medium">{data.total_count}</span> samples
        </span>
        {data.ooc_count > 0 ? (
          <span className="text-destructive font-medium">
            {data.ooc_count} out of control
          </span>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400">All in control</span>
        )}
        <span className="text-muted-foreground">
          UCL ={' '}
          <span className="text-foreground font-medium">{data.ucl.toFixed(2)}</span>
        </span>
      </div>
      <div ref={containerRef} className="h-[400px] w-full" />
    </div>
  )
}
