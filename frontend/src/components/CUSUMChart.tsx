import { useMemo } from 'react'
import { graphic } from '@/lib/echarts'
import { useECharts } from '@/hooks/useECharts'
import { useChartData, useHierarchyPath } from '@/api/hooks'
import { getStoredChartColors } from '@/lib/theme-presets'
import { ViolationLegend, getPrimaryViolationRule } from './ViolationLegend'
import type { CUSUMChartSample } from '@/types'

interface CUSUMChartProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
}

export function CUSUMChart({ characteristicId, chartOptions }: CUSUMChartProps) {
  const { data: chartData, isLoading } = useChartData(
    characteristicId,
    chartOptions ?? { limit: 50 },
  )
  const hierarchyPath = useHierarchyPath(characteristicId)
  const chartColors = getStoredChartColors()

  const cusumPoints = chartData?.cusum_data_points ?? []
  const h = chartData?.cusum_h ?? 5

  console.log('[CUSUMChart] points:', cusumPoints.length, 'h:', h,
    'first 3 cusum_high:', cusumPoints.slice(0, 3).map(p => p.cusum_high),
    'first 3 cusum_low:', cusumPoints.slice(0, 3).map(p => p.cusum_low),
    'first 3 measurement:', cusumPoints.slice(0, 3).map(p => p.measurement))

  // Collect all violated rules for the legend
  const allViolatedRules = useMemo(() => {
    const rules = new Set<number>()
    cusumPoints.forEach((pt) => {
      pt.violation_rules?.forEach((r) => rules.add(r))
    })
    return Array.from(rules).sort((a, b) => a - b)
  }, [cusumPoints])

  const echartsOption = useMemo(() => {
    if (!chartData || !cusumPoints.length) return null

    const decimalPrecision = chartData.decimal_precision ?? 4

    const formatVal = (v: number | null | undefined) =>
      v == null ? 'N/A' : v.toFixed(decimalPrecision)

    // X-axis categories
    const categories = cusumPoints.map((pt, i) => pt.display_key || `#${i + 1}`)

    // Data series
    const cusumHighValues = cusumPoints.map((pt) => pt.cusum_high)
    const cusumLowValues = cusumPoints.map((pt) => -pt.cusum_low) // Negate for display below zero

    // Y-axis domain
    const allValues = [
      ...cusumHighValues,
      ...cusumLowValues,
      h,
      -h,
      0,
    ]
    const yMin = Math.min(...allValues)
    const yMax = Math.max(...allValues)
    const padding = (yMax - yMin) * 0.15 || 1
    const yAxisMin = yMin - padding
    const yAxisMax = yMax + padding

    // Custom renderItem for data points (violation markers)
    const localPoints = cusumPoints
    const localColors = chartColors

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customRenderItem = (_params: any, api: any) => {
      const arrIndex = api.value(2) as number
      if (arrIndex < 0 || arrIndex >= localPoints.length)
        return { type: 'group', children: [] } as unknown
      const point = localPoints[arrIndex]

      // Render marker at CUSUM+ position
      const coord = api.coord([api.value(0), api.value(1)])
      const cx = coord[0]
      const cy = coord[1]

      const isViolation = point.violation_rules.length > 0
      const isAcked = isViolation && point.unacknowledged_violation_ids.length === 0
      const isExcluded = point.excluded
      const primaryRule = getPrimaryViolationRule(point.violation_rules)

      const ackedColor = 'hsl(357, 30%, 55%)'
      const fillColor = isExcluded
        ? localColors.excludedPoint
        : isViolation && isAcked
          ? ackedColor
          : isViolation
            ? localColors.violationPoint
            : localColors.normalPoint

      const baseRadius = isViolation ? 6 : 4
      const children: Record<string, unknown>[] = []

      if (isViolation) {
        if (isAcked) {
          children.push({
            type: 'polygon',
            shape: {
              points: [
                [cx, cy - baseRadius],
                [cx + baseRadius, cy],
                [cx, cy + baseRadius],
                [cx - baseRadius, cy],
              ],
            },
            style: { fill: 'none', stroke: fillColor, lineWidth: 2 },
          })
        } else {
          children.push({
            type: 'polygon',
            shape: {
              points: [
                [cx, cy - baseRadius],
                [cx + baseRadius, cy],
                [cx, cy + baseRadius],
                [cx - baseRadius, cy],
              ],
            },
            style: { fill: fillColor, shadowBlur: 4, shadowColor: fillColor },
          })
        }
      } else {
        children.push({
          type: 'circle',
          shape: { cx, cy, r: baseRadius },
          style: { fill: fillColor },
        })
      }

      // Violation badge
      if (isViolation && primaryRule) {
        const badgeFill = isAcked ? 'hsl(357, 25%, 48%)' : 'hsl(357, 80%, 52%)'
        const badgeTextFill = isAcked ? 'hsl(0, 0%, 80%)' : '#fff'
        children.push(
          {
            type: 'circle',
            shape: { cx, cy: cy - baseRadius - 8, r: 7 },
            style: { fill: badgeFill, stroke: isAcked ? 'hsl(0, 0%, 50%)' : '#fff', lineWidth: 1 },
          },
          {
            type: 'text',
            style: {
              x: cx,
              y: cy - baseRadius - 8,
              text: String(primaryRule),
              fill: badgeTextFill,
              fontSize: 9,
              fontWeight: 700,
              textAlign: 'center',
              textVerticalAlign: 'middle',
            },
          },
        )
        if (point.violation_rules.length > 1) {
          children.push({
            type: 'text',
            style: {
              x: cx + 7,
              y: cy - baseRadius - 12,
              text: `+${point.violation_rules.length - 1}`,
              fill: isAcked ? 'hsl(357, 20%, 48%)' : 'hsl(357, 80%, 45%)',
              fontSize: 8,
              fontWeight: 600,
            },
          })
        }
      }

      return { type: 'group', children } as unknown
    }

    const option = {
      animation: false,
      grid: { top: 20, right: 60, left: 60, bottom: 30, containLabel: false },
      xAxis: {
        type: 'category' as const,
        boundaryGap: false,
        data: categories,
        axisLabel: { fontSize: 12 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        min: yAxisMin,
        max: yAxisMax,
        name: 'CUSUM',
        nameLocation: 'middle' as const,
        nameGap: 45,
        nameTextStyle: { fontSize: 12 },
        axisLabel: { fontSize: 12, formatter: (value: number) => value.toFixed(decimalPrecision) },
        splitLine: { lineStyle: { type: 'dashed' as const, opacity: 0.3 } },
      },
      tooltip: {
        trigger: 'item' as const,
        transitionDuration: 0,
        formatter: (params: unknown) => {
          const p = params as { dataIndex: number; seriesType: string; seriesName: string }
          if (p.seriesType === 'line') {
            const point = localPoints[p.dataIndex]
            if (!point) return ''
            const label = p.seriesName
            const value = label === 'CUSUM+' ? point.cusum_high : point.cusum_low
            return `<div style="font-size:13px;font-weight:500">${label}: ${formatVal(value)}</div>
                    <div style="font-size:11px;opacity:0.7">${point.display_key || '#' + (p.dataIndex + 1)}</div>`
          }
          if (p.seriesType !== 'custom') return ''
          const point = localPoints[p.dataIndex]
          if (!point) return ''

          let html = `<div style="font-size:13px;font-weight:500">Sample ${point.display_key || '#' + (p.dataIndex + 1)}</div>`
          html += `<div>Measurement: ${formatVal(point.measurement)}</div>`
          html += `<div>CUSUM+: ${formatVal(point.cusum_high)}</div>`
          html += `<div>CUSUM-: ${formatVal(point.cusum_low)}</div>`
          html += `<div>H: ${formatVal(h)}</div>`
          html += `<div style="opacity:0.7">${new Date(point.timestamp).toLocaleString()}</div>`

          if (point.violation_rules.length > 0) {
            html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(128,128,128,0.3)">`
            const allAcked = point.unacknowledged_violation_ids.length === 0
            const vColor = allAcked ? 'hsl(357,25%,55%)' : 'hsl(357,80%,52%)'
            html += `<div style="color:${vColor};font-weight:500">Violations:</div>`
            html += `</div>`
          }
          return html
        },
      },
      dataZoom: [
        {
          type: 'inside' as const,
          start: 0,
          end: 100,
          minSpan: Math.max((2 / Math.max(cusumPoints.length, 1)) * 100, 0.5),
          zoomOnMouseWheel: true,
          moveOnMouseWheel: 'shift' as const,
        },
      ],
      series: [
        // CUSUM+ line (upper)
        {
          name: 'CUSUM+',
          type: 'line' as const,
          data: cusumHighValues,
          lineStyle: {
            width: 2.5,
            color: new graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: chartColors.uclLine },
              { offset: 1, color: chartColors.uclLine },
            ]),
          },
          symbol: 'none',
          showSymbol: false,
          silent: true,
          z: 5,
          markLine: {
            symbol: 'none',
            silent: true,
            data: [
              {
                yAxis: h,
                lineStyle: {
                  color: chartColors.uclLine,
                  type: 'dashed' as const,
                  width: 1.5,
                },
                label: {
                  formatter: `+H: ${formatVal(h)}`,
                  position: 'end' as const,
                  color: chartColors.uclLine,
                  fontSize: 11,
                  fontWeight: 500,
                },
              },
              {
                yAxis: 0,
                lineStyle: {
                  color: chartColors.centerLine,
                  type: 'solid' as const,
                  width: 2,
                },
                label: {
                  formatter: 'CL: 0',
                  position: 'end' as const,
                  color: chartColors.centerLine,
                  fontSize: 11,
                  fontWeight: 600,
                },
              },
              {
                yAxis: -h,
                lineStyle: {
                  color: chartColors.lclLine,
                  type: 'dashed' as const,
                  width: 1.5,
                },
                label: {
                  formatter: `-H: ${formatVal(-h)}`,
                  position: 'end' as const,
                  color: chartColors.lclLine,
                  fontSize: 11,
                  fontWeight: 500,
                },
              },
            ] as never[],
          },
        },
        // CUSUM- line (lower, negated for display)
        {
          name: 'CUSUM-',
          type: 'line' as const,
          data: cusumLowValues,
          lineStyle: {
            width: 2.5,
            color: new graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: chartColors.lclLine },
              { offset: 1, color: chartColors.lclLine },
            ]),
          },
          symbol: 'none',
          showSymbol: false,
          silent: true,
          z: 5,
        },
        // Custom series for CUSUM+ data point symbols
        {
          type: 'custom' as const,
          data: cusumPoints.map((pt, i) => [i, pt.cusum_high, i]),
          renderItem: customRenderItem,
          coordinateSystem: 'cartesian2d' as const,
          encode: { x: 0, y: 1 },
          z: 10,
          silent: false,
        },
        // Custom series for CUSUM- data point symbols (negated)
        {
          type: 'custom' as const,
          data: cusumPoints.map((pt, i) => [i, -pt.cusum_low, i]),
          renderItem: customRenderItem,
          coordinateSystem: 'cartesian2d' as const,
          encode: { x: 0, y: 1 },
          z: 10,
          silent: false,
        },
      ],
    }

    return option
  }, [chartData, cusumPoints, h, chartColors])

  const { containerRef } = useECharts({
    option: echartsOption,
    notMerge: true,
  })

  const hasData = cusumPoints.length > 0

  const hierarchyNames = hierarchyPath.map((h) => h.name)
  const breadcrumb =
    hierarchyNames.length > 0
      ? [...hierarchyNames, chartData?.characteristic_name].filter(Boolean).join(' / ')
      : (chartData?.characteristic_name ?? '')

  return (
    <div className="bg-card border-border flex h-full flex-col rounded-2xl border p-5">
      {/* Header */}
      {hasData && (
        <div className="mb-4 flex h-5 flex-shrink-0 items-center justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="bg-primary/10 text-primary flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
                CUSUM
              </span>
              <h3
                className="text-foreground truncate text-sm leading-5 font-semibold"
                title={breadcrumb}
              >
                <span className="text-muted-foreground">
                  {hierarchyNames.join(' / ')}
                  {hierarchyNames.length > 0 && ' / '}
                </span>
                <span>{chartData?.characteristic_name}</span>
              </h3>
            </div>
            {allViolatedRules.length > 0 && (
              <ViolationLegend violatedRules={allViolatedRules} compact className="ml-2" />
            )}
          </div>
        </div>
      )}

      {/* Chart container */}
      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: hasData ? 'visible' : 'hidden' }}
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground text-sm">Loading chart data...</div>
          </div>
        )}
        {!isLoading && !hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-muted-foreground text-sm">No data available</div>
          </div>
        )}
      </div>
    </div>
  )
}
