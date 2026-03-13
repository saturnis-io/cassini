import { useMemo, useCallback } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useChartColors } from '@/hooks/useChartColors'
import { useTheme } from '@/providers/ThemeProvider'
import { useDateFormat } from '@/hooks/useDateFormat'
import { applyFormat } from '@/lib/date-format'
import type { EChartsMouseEvent } from '@/hooks/useECharts'

interface T2DataPoint {
  timestamp: string
  t_squared: number
  in_control: boolean
  ucl: number
  decomposition?: {
    variable: string
    contribution: number
    pct_of_total: number
    unconditional_t2?: number
  }[]
}

interface T2ChartProps {
  data: T2DataPoint[]
  onOOCClick?: (point: T2DataPoint) => void
}

/**
 * Hotelling T-squared chart — line chart with UCL markLine,
 * OOC scatter overlay with click-to-decompose, dataZoom for panning,
 * and a summary strip showing point count and OOC count.
 */
export function T2Chart({ data, onOOCClick }: T2ChartProps) {
  const { datetimeFormat } = useDateFormat()
  const chartColors = useChartColors()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const oocCount = useMemo(() => data?.filter((p) => !p.in_control).length ?? 0, [data])

  const option = useMemo(() => {
    if (!data || data.length === 0) return null

    const ucl = data[0]?.ucl ?? 0

    // Categories (timestamps)
    const xData = data.map((p) => applyFormat(new Date(p.timestamp), datetimeFormat))

    // T2 values
    const t2Values = data.map((p) => p.t_squared)

    // OOC scatter points
    const oocData: (number | null)[] = data.map((p) =>
      p.in_control === false ? p.t_squared : null,
    )

    // Y-axis max: give 15% headroom above the larger of UCL or max T²,
    // then round up to a clean number to avoid ugly decimals
    const maxT2 = Math.max(...t2Values, ucl)
    const rawMax = maxT2 * 1.15
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax || 1)))
    const step = magnitude / 2 // round up to nearest half-magnitude
    const yMax = Math.ceil(rawMax / step) * step

    const lineColor = chartColors.lineGradientStart
    const violationColor = chartColors.violationPoint
    const uclColor = chartColors.uclLine
    const textColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const gridColor = isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 88%)'
    const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(0, 0, 0, 0.85)'
    const tooltipBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.1)'
    const oocBorderColor = isDark ? 'hsl(220, 25%, 13%)' : '#fff'

    return {
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: Record<string, unknown> | Record<string, unknown>[]) => {
          const items = Array.isArray(params) ? params : [params]
          const idx = (items[0]?.dataIndex ?? 0) as number
          const point = data[idx]
          if (!point) return ''
          let html = `<div style="font-weight:600;margin-bottom:4px">${xData[idx]}</div>`
          html += `<div>T\u00B2 = <strong>${point.t_squared.toFixed(3)}</strong></div>`
          html += `<div style="opacity:0.7">UCL = ${ucl.toFixed(3)}</div>`
          if (point.in_control) {
            html += '<div style="color:#22c55e;margin-top:4px">In Control</div>'
          } else {
            html += '<div style="color:#ef4444;font-weight:600;margin-top:4px">Out of Control</div>'
            if (point.decomposition && point.decomposition.length > 0) {
              html += '<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.15);font-size:11px;opacity:0.8">Click for decomposition</div>'
            }
          }
          return html
        },
      },
      grid: {
        top: 35,
        left: 65,
        right: 25,
        bottom: 60,
      },
      xAxis: {
        type: 'category' as const,
        data: xData,
        axisLabel: {
          rotate: 35,
          fontSize: 10,
          color: textColor,
          // Show fewer labels when data is dense to avoid overlap
          interval: data.length <= 20 ? 0 : data.length <= 50 ? 2 : Math.floor(data.length / 15),
          hideOverlap: true,
        },
        axisLine: { lineStyle: { color: gridColor } },
        axisTick: { lineStyle: { color: gridColor } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        name: 'T\u00B2',
        nameTextStyle: { fontSize: 11, color: textColor, padding: [0, 0, 0, -10] },
        min: 0,
        max: yMax,
        axisLabel: {
          fontSize: 10,
          color: textColor,
          formatter: (v: number) => {
            if (v >= 1000) return v.toFixed(0)
            if (v >= 10) return v.toFixed(1)
            if (v >= 1) return v.toFixed(2)
            return v.toFixed(3)
          },
        },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: gridColor, type: 'dashed' as const } },
      },
      dataZoom: [
        {
          type: 'inside' as const,
          minSpan: Math.max((2 / data.length) * 100, 0.5),
          zoomOnMouseWheel: true,
          moveOnMouseWheel: 'shift' as const,
          moveOnMouseMove: false,
          preventDefaultMouseMove: false,
        },
      ],
      series: [
        // T² line
        {
          type: 'line' as const,
          name: 'T\u00B2',
          data: t2Values,
          symbol: 'circle',
          symbolSize: (value: number) => (value > ucl ? 0 : 4),
          lineStyle: { color: lineColor, width: 2 },
          itemStyle: { color: lineColor },
          areaStyle: {
            color: lineColor,
            opacity: 0.08,
          },
          markLine: {
            silent: true,
            symbol: 'none',
            precision: 10,
            data: [
              {
                yAxis: ucl,
                lineStyle: { color: uclColor, width: 2, type: 'dashed' as const },
                label: {
                  show: true,
                  formatter: `UCL = ${ucl.toFixed(2)}`,
                  position: 'insideEndTop' as const,
                  fontSize: 10,
                  fontWeight: 600,
                  color: uclColor,
                },
              },
            ],
          },
        },
        // OOC scatter overlay
        {
          type: 'scatter' as const,
          name: 'OOC',
          data: oocData,
          symbolSize: 10,
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
      ],
    }
  }, [data, datetimeFormat, chartColors, isDark])

  const handleClick = useCallback(
    (params: EChartsMouseEvent) => {
      if (!onOOCClick || !data) return
      const idx = params.dataIndex
      const point = data[idx]
      if (point && !point.in_control) {
        onOOCClick(point)
      }
    },
    [data, onOOCClick],
  )

  const { containerRef } = useECharts({
    option,
    onClick: handleClick,
  })

  if (!data || data.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
        No chart data available. Click &ldquo;Compute&rdquo; to generate.
      </div>
    )
  }

  return (
    <div>
      {/* Summary strip */}
      <div className="mb-1 flex items-center gap-4 text-[11px]">
        <span className="text-muted-foreground">
          <span className="text-foreground font-medium">{data.length}</span> samples
        </span>
        {oocCount > 0 ? (
          <span className="text-destructive font-medium">
            {oocCount} out of control
          </span>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400">All in control</span>
        )}
        <span className="text-muted-foreground">
          UCL = <span className="text-foreground font-medium">{(data[0]?.ucl ?? 0).toFixed(2)}</span>
        </span>
      </div>
      <div ref={containerRef} className="h-[400px] w-full" />
    </div>
  )
}
