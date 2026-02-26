import { useMemo, useCallback } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useDateFormat } from '@/hooks/useDateFormat'
import { applyFormat } from '@/lib/date-format'
import type { EChartsMouseEvent } from '@/hooks/useECharts'

interface T2DataPoint {
  timestamp: string
  t2_value: number
  in_control: boolean
  ucl: number
  decomposition?: {
    variable: string
    contribution: number
    pct_of_total: number
    unconditional_t2?: number
  }[]
}

interface T2ChartData {
  points?: T2DataPoint[]
  ucl?: number
  chart_type?: string
}

interface T2ChartProps {
  data: T2ChartData
  onOOCClick?: (point: T2DataPoint) => void
}

/**
 * Hotelling T-squared chart — line chart with UCL as red dashed line,
 * OOC points highlighted in red, and click handler for decomposition.
 */
export function T2Chart({ data, onOOCClick }: T2ChartProps) {
  const { datetimeFormat } = useDateFormat()
  const option = useMemo(() => {
    const points = data?.points ?? []
    if (points.length === 0) return null

    const ucl = data?.ucl ?? points[0]?.ucl ?? 0

    // Categories (timestamps)
    const xData = points.map((p) => applyFormat(new Date(p.timestamp), datetimeFormat))

    // T2 values
    const t2Values = points.map((p) => p.t2_value)

    // OOC scatter points
    const oocData: (number | null)[] = points.map((p) =>
      p.in_control === false ? p.t2_value : null,
    )

    return {
      tooltip: {
        trigger: 'axis' as const,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          const items = Array.isArray(params) ? params : [params]
          const idx = items[0]?.dataIndex ?? 0
          const point = points[idx]
          if (!point) return ''
          let html = `<strong>${xData[idx]}</strong><br/>`
          html += `T\u00B2 = ${point.t2_value.toFixed(3)}<br/>`
          html += `UCL = ${ucl.toFixed(3)}<br/>`
          html += point.in_control
            ? '<span style="color:#22c55e">In Control</span>'
            : '<span style="color:#ef4444;font-weight:bold">Out of Control</span>'
          return html
        },
      },
      grid: {
        top: 30,
        left: 60,
        right: 30,
        bottom: 50,
      },
      xAxis: {
        type: 'category' as const,
        data: xData,
        axisLabel: {
          rotate: 30,
          fontSize: 10,
        },
      },
      yAxis: {
        type: 'value' as const,
        name: 'T\u00B2',
        nameTextStyle: { fontSize: 12 },
        min: 0,
      },
      series: [
        // T2 line
        {
          type: 'line' as const,
          name: 'T\u00B2',
          data: t2Values,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: '#3b82f6', width: 2 },
          itemStyle: { color: '#3b82f6' },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                yAxis: ucl,
                lineStyle: { color: '#ef4444', width: 2, type: 'dashed' as const },
                label: {
                  show: true,
                  formatter: `UCL = ${ucl.toFixed(2)}`,
                  position: 'insideEndTop' as const,
                  fontSize: 10,
                  color: '#ef4444',
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
            color: '#ef4444',
            borderColor: '#fff',
            borderWidth: 1,
          },
          z: 10,
        },
      ],
    }
  }, [data, datetimeFormat])

  const handleClick = useCallback(
    (params: EChartsMouseEvent) => {
      if (!onOOCClick || !data?.points) return
      const idx = params.dataIndex
      const point = data.points[idx]
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

  if (!data?.points || data.points.length === 0) {
    return (
      <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
        No chart data available
      </div>
    )
  }

  return <div ref={containerRef} className="h-[400px] w-full" />
}
