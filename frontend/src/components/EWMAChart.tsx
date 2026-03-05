import { useCallback, useMemo } from 'react'
import { graphic } from '@/lib/echarts'
import type { RenderItemParams, RenderItemAPI } from '@/lib/echarts'
import { useECharts } from '@/hooks/useECharts'
import { useChartData, useHierarchyPath } from '@/api/hooks'
import { useChartColors } from '@/hooks/useChartColors'
import { useDateFormat } from '@/hooks/useDateFormat'
import { applyFormat } from '@/lib/date-format'
import { ViolationLegend, getPrimaryViolationRule } from './ViolationLegend'
import { StatNote } from './StatNote'
import type { EChartsMouseEvent } from '@/hooks/useECharts'
import type { EWMAChartSample } from '@/types'

interface EWMAChartProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  /** Callback when a data point is clicked — opens Sample Inspector */
  onPointAnnotation?: (sampleId: number) => void
  /** Highlight a specific sample on the chart (e.g. the inspected violation) */
  highlightSampleId?: number
}

export function EWMAChart({ characteristicId, chartOptions, onPointAnnotation, highlightSampleId }: EWMAChartProps) {
  const { data: chartData, isLoading } = useChartData(
    characteristicId,
    { ...(chartOptions ?? { limit: 50 }), chartType: 'ewma' },
  )
  const hierarchyPath = useHierarchyPath(characteristicId)
  const chartColors = useChartColors()
  const { datetimeFormat } = useDateFormat()

  const ewmaPoints = chartData?.ewma_data_points ?? []
  const controlLimits = chartData?.control_limits

  // Collect all violated rules for the legend
  const allViolatedRules = useMemo(() => {
    const rules = new Set<number>()
    ewmaPoints.forEach((pt) => {
      pt.violation_rules?.forEach((r) => rules.add(r))
    })
    return Array.from(rules).sort((a, b) => a - b)
  }, [ewmaPoints])

  const echartsOption = useMemo(() => {
    if (!chartData || !ewmaPoints.length || !controlLimits) return null

    const decimalPrecision = chartData.decimal_precision ?? 4
    const ucl = controlLimits.ucl
    const lcl = controlLimits.lcl
    const centerLine = controlLimits.center_line

    const formatVal = (v: number | null | undefined) =>
      v == null ? 'N/A' : v.toFixed(decimalPrecision)

    // X-axis categories
    const categories = ewmaPoints.map((pt, i) => pt.display_key || `#${i + 1}`)

    // Data series
    const ewmaValues = ewmaPoints.map((pt) => pt.ewma_value)

    // Y-axis domain
    const allValues = [
      ...ewmaValues,
      ...(ucl != null ? [ucl] : []),
      ...(lcl != null ? [lcl] : []),
      ...(centerLine != null ? [centerLine] : []),
    ]
    const yMin = Math.min(...allValues)
    const yMax = Math.max(...allValues)
    const padding = (yMax - yMin) * 0.15 || 0.01
    const yAxisMin = yMin - padding
    const yAxisMax = yMax + padding

    // Custom renderItem for data points (violation markers)
    const localPoints = ewmaPoints
    const localColors = chartColors
    const localHighlightSampleId = highlightSampleId

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customRenderItem = (_params: RenderItemParams, api: RenderItemAPI) => {
      const arrIndex = api.value(2) as number
      if (arrIndex < 0 || arrIndex >= localPoints.length)
        return { type: 'group', children: [] } as unknown
      const point = localPoints[arrIndex]

      const coord = api.coord([api.value(0), api.value(1)])
      const cx = coord[0]
      const cy = coord[1]

      const isViolation = point.violation_rules.length > 0
      const isAcked = isViolation && point.unacknowledged_violation_ids.length === 0
      const isExcluded = point.excluded
      const isInspected = localHighlightSampleId != null && point.sample_id === localHighlightSampleId
      const primaryRule = getPrimaryViolationRule(point.violation_rules)

      const ackedColor = 'hsl(357, 30%, 55%)'
      const fillColor = isInspected
        ? 'hsl(180, 100%, 50%)'
        : isExcluded
          ? localColors.excludedPoint
          : isViolation && isAcked
            ? ackedColor
            : isViolation
              ? localColors.violationPoint
              : localColors.normalPoint

      const baseRadius = isInspected ? 7 : isViolation ? 6 : 4
      const children: Record<string, unknown>[] = []

      // Inspected point glow rings
      if (isInspected) {
        const ringColor = 'hsl(180, 100%, 50%)'
        children.push(
          {
            type: 'circle',
            shape: { cx, cy, r: baseRadius + 6 },
            style: { fill: 'none', stroke: ringColor, lineWidth: 2.5, opacity: 0.8, shadowBlur: 8, shadowColor: ringColor },
          },
          {
            type: 'circle',
            shape: { cx, cy, r: baseRadius + 10 },
            style: { fill: 'none', stroke: ringColor, lineWidth: 1, opacity: 0.3 },
          },
        )
      }

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
        name: 'EWMA',
        nameLocation: 'middle' as const,
        nameGap: 45,
        nameTextStyle: { fontSize: 12 },
        axisLabel: { fontSize: 12, formatter: (value: number) => value.toFixed(decimalPrecision) },
        splitLine: { lineStyle: { type: 'dashed' as const, opacity: 0.3 } },
      },
      tooltip: {
        trigger: 'item' as const,
        appendTo: () => document.body,
        transitionDuration: 0,
        formatter: (params: unknown) => {
          const p = params as { dataIndex: number; seriesType: string }
          if (p.seriesType === 'line') return ''
          const point = localPoints[p.dataIndex]
          if (!point) return ''

          let html = `<div style="font-size:13px;font-weight:500">Sample ${point.display_key || '#' + (p.dataIndex + 1)}</div>`
          html += `<div>Measurement: ${formatVal(point.measurement)}</div>`
          html += `<div>EWMA: ${formatVal(point.ewma_value)}</div>`
          if (ucl != null) html += `<div>UCL: ${formatVal(ucl)}</div>`
          if (lcl != null) html += `<div>LCL: ${formatVal(lcl)}</div>`
          html += `<div style="opacity:0.7">${applyFormat(new Date(point.timestamp), datetimeFormat)}</div>`

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
          minSpan: Math.max((2 / Math.max(ewmaPoints.length, 1)) * 100, 0.5),
          zoomOnMouseWheel: true,
          moveOnMouseWheel: 'shift' as const,
        },
      ],
      series: [
        // EWMA value line
        {
          name: 'EWMA',
          type: 'line' as const,
          data: ewmaValues,
          lineStyle: {
            width: 2.5,
            color: new graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: chartColors.lineGradientStart },
              { offset: 1, color: chartColors.lineGradientEnd },
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
              ...(ucl != null
                ? [
                    {
                      yAxis: ucl,
                      lineStyle: {
                        color: chartColors.uclLine,
                        type: 'dashed' as const,
                        width: 1.5,
                      },
                      label: {
                        formatter: `UCL: ${formatVal(ucl)}`,
                        position: 'end' as const,
                        color: chartColors.uclLine,
                        fontSize: 11,
                        fontWeight: 500,
                      },
                    },
                  ]
                : []),
              ...(centerLine != null
                ? [
                    {
                      yAxis: centerLine,
                      lineStyle: {
                        color: chartColors.centerLine,
                        type: 'solid' as const,
                        width: 2.5,
                      },
                      label: {
                        formatter: `Target: ${formatVal(centerLine)}`,
                        position: 'end' as const,
                        color: chartColors.centerLine,
                        fontSize: 11,
                        fontWeight: 600,
                      },
                    },
                  ]
                : []),
              ...(lcl != null
                ? [
                    {
                      yAxis: lcl,
                      lineStyle: {
                        color: chartColors.lclLine,
                        type: 'dashed' as const,
                        width: 1.5,
                      },
                      label: {
                        formatter: `LCL: ${formatVal(lcl)}`,
                        position: 'end' as const,
                        color: chartColors.lclLine,
                        fontSize: 11,
                        fontWeight: 500,
                      },
                    },
                  ]
                : []),
            ] as never[],
          },
        },
        // Custom series for data point symbols
        {
          type: 'custom' as const,
          data: ewmaPoints.map((pt, i) => [i, pt.ewma_value, i, pt.sample_id]),
          renderItem: customRenderItem,
          coordinateSystem: 'cartesian2d' as const,
          encode: { x: 0, y: 1 },
          z: 10,
          silent: false,
        },
      ],
    }

    return option
  }, [chartData, ewmaPoints, controlLimits, chartColors, highlightSampleId])

  const handleClick = useCallback(
    (params: EChartsMouseEvent) => {
      if (!onPointAnnotation) return
      const pointData = params.data as unknown as number[]
      const sampleId = pointData?.[3]
      if (sampleId) onPointAnnotation(sampleId)
    },
    [onPointAnnotation],
  )

  const { containerRef } = useECharts({
    option: echartsOption,
    notMerge: true,
    onClick: handleClick,
  })

  const hasData = ewmaPoints.length > 0

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
                EWMA
              </span>
              <StatNote>
                EWMA smooths data using exponential weighting (&lambda;). Individual
                outliers may not trigger alarms if the overall trend is stable.
              </StatNote>
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

      {/* EWMA parameters and notes */}
      {hasData && (
        <div className="mb-1 flex flex-wrap items-center gap-3">
          {chartData?.ewma_lambda != null && (
            <span className="text-xs text-zinc-400">
              &lambda; = {chartData.ewma_lambda}, L = {chartData.ewma_l ?? 3}
            </span>
          )}
          <span className="text-xs text-zinc-400 flex items-center gap-1">
            <StatNote>
              EWMA control limits are time-varying &mdash; they start narrow and
              widen to steady-state as more data accumulates. This funnel shape is
              statistically correct.
            </StatNote>
          </span>
          {(chartData?.nominal_subgroup_size ?? 1) > 1 && (
            <span className="text-xs text-zinc-400 flex items-center gap-1">
              <StatNote>
                Control limits use &sigma;/&radic;n &mdash; larger subgroups
                produce tighter limits.
              </StatNote>
            </span>
          )}
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
