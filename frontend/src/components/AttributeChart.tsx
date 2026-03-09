import { useCallback, useMemo } from 'react'
import { graphic } from '@/lib/echarts'
import type { RenderItemParams, RenderItemAPI } from '@/lib/echarts'
import { useECharts } from '@/hooks/useECharts'
import { useChartData, useHierarchyPath } from '@/api/hooks'
import { useChartColors } from '@/hooks/useChartColors'
import { useDateFormat } from '@/hooks/useDateFormat'
import { applyFormat } from '@/lib/date-format'
import { ViolationLegend, NELSON_RULES, getPrimaryViolationRule } from './ViolationLegend'
import { Explainable } from '@/components/Explainable'
import { cn } from '@/lib/utils'
import { StatNote } from './StatNote'
import { useTheme } from '@/providers/ThemeProvider'
import type { EChartsMouseEvent } from '@/hooks/useECharts'

interface AttributeChartProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
    materialId?: number
  }
  /** Callback when a data point is clicked — opens Sample Inspector */
  onPointAnnotation?: (sampleId: number) => void
  /** Highlight a specific sample on the chart (e.g. the inspected violation) */
  highlightSampleId?: number
}

const Y_AXIS_LABELS: Record<string, string> = {
  p: 'Proportion (%)',
  np: 'Defective Count',
  c: 'Defect Count',
  u: 'Defects / Unit',
}

const CHART_TYPE_NAMES: Record<string, string> = {
  p: 'p-chart',
  np: 'np-chart',
  c: 'c-chart',
  u: 'u-chart',
}

export function AttributeChart({ characteristicId, chartOptions, onPointAnnotation, highlightSampleId }: AttributeChartProps) {
  const { data: chartData, isLoading } = useChartData(
    characteristicId,
    chartOptions ?? { limit: 50 },
  )
  const hierarchyPath = useHierarchyPath(characteristicId)
  const chartColors = useChartColors()
  const { datetimeFormat } = useDateFormat()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const attrType = chartData?.attribute_chart_type ?? ''
  const attrPoints = chartData?.attribute_data_points ?? []
  const hasVariableLimits = attrType === 'p' || attrType === 'u'

  // Collect all violated rules for the legend
  const allViolatedRules = useMemo(() => {
    const rules = new Set<number>()
    attrPoints.forEach((pt) => {
      pt.violation_rules?.forEach((r) => rules.add(r))
    })
    return Array.from(rules).sort((a, b) => a - b)
  }, [attrPoints])

  const echartsOption = useMemo(() => {
    if (!chartData || !attrPoints.length) return null

    const controlLimits = chartData.control_limits
    const decimalPrecision = chartData.decimal_precision ?? 4
    const isPChart = attrType === 'p'

    const formatVal = (v: number | null | undefined) =>
      v == null ? 'N/A' : isPChart ? (v * 100).toFixed(Math.max(decimalPrecision - 2, 1)) + '%' : v.toFixed(decimalPrecision)

    // Theme-aware axis colors — raw HSL required because ECharts canvas
    // renderer cannot resolve CSS custom properties (L-001 exception)
    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const axisLineColor = isDark ? 'hsl(220, 10%, 30%)' : 'hsl(210, 15%, 80%)'
    const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : 'hsl(210, 10%, 90%)'
    const axisNameColor = isDark ? 'hsl(220, 5%, 65%)' : 'hsl(220, 15%, 40%)'

    // X-axis categories
    const categories = attrPoints.map((pt, i) => pt.display_key || `#${i + 1}`)

    // Data series
    const plottedValues = attrPoints.map((pt) => pt.plotted_value)
    const uclValues = attrPoints.map((pt) =>
      hasVariableLimits ? (pt.effective_ucl ?? controlLimits.ucl) : controlLimits.ucl,
    )
    const lclValues = attrPoints.map((pt) =>
      hasVariableLimits ? (pt.effective_lcl ?? controlLimits.lcl) : controlLimits.lcl,
    )
    const centerLineValues = attrPoints.map(() => controlLimits.center_line)

    // Y-axis domain
    const allValues = [
      ...plottedValues,
      ...uclValues.filter((v): v is number => v != null),
      ...lclValues.filter((v): v is number => v != null),
      ...(controlLimits.center_line != null ? [controlLimits.center_line] : []),
    ]
    const yMin = Math.min(...allValues)
    const yMax = Math.max(...allValues)
    const padding = (yMax - yMin) * 0.15 || 0.01
    const yAxisMin = Math.max(0, yMin - padding)
    const yAxisMax = yMax + padding

    // Custom renderItem for data points (violation markers)
    const localPoints = attrPoints
    const localColors = chartColors
    const localHighlightSampleId = highlightSampleId
    const localAttrType = attrType

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
        axisLabel: { fontSize: 12, color: axisLabelColor },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        min: yAxisMin,
        max: yAxisMax,
        name: Y_AXIS_LABELS[attrType] ?? 'Value',
        nameLocation: 'middle' as const,
        nameGap: 45,
        nameTextStyle: { fontSize: 12, color: axisNameColor },
        axisLabel: {
          fontSize: 12,
          color: axisLabelColor,
          formatter: isPChart
            ? (value: number) => (value * 100).toFixed(Math.max(decimalPrecision - 2, 1)) + '%'
            : (value: number) => value.toFixed(decimalPrecision),
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { type: 'dashed' as const, color: splitLineColor, opacity: isDark ? 0.5 : 0.3 } },
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
          html += `<div>${localAttrType === 'p' ? 'Proportion' : 'Value'}: ${formatVal(point.plotted_value)}</div>`
          const countLabel = localAttrType === 'p' || localAttrType === 'np' ? 'Defective items' : 'Defects'
          html += `<div>${countLabel}: ${point.defect_count}</div>`
          if (point.sample_size != null) html += `<div>Sample size: ${point.sample_size}</div>`
          if (point.units_inspected != null)
            html += `<div>Units inspected: ${point.units_inspected}</div>`
          html += `<div style="opacity:0.7">${applyFormat(new Date(point.timestamp), datetimeFormat)}</div>`

          if (point.violation_rules.length > 0) {
            html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(128,128,128,0.3)">`
            const allAcked = point.unacknowledged_violation_ids.length === 0
            const vColor = allAcked ? 'hsl(357,25%,55%)' : 'hsl(357,80%,52%)'
            const vLabel = allAcked ? 'Violations (acknowledged):' : 'Violations:'
            html += `<div style="color:${vColor};font-weight:500;margin-bottom:4px">${vLabel}</div>`
            for (const ruleId of point.violation_rules) {
              html += `<div style="font-size:11px;opacity:0.8">${ruleId}: ${NELSON_RULES[ruleId]?.name || `Rule ${ruleId}`}</div>`
            }
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
          minSpan: Math.max((2 / Math.max(attrPoints.length, 1)) * 100, 0.5),
          zoomOnMouseWheel: true,
          moveOnMouseWheel: 'shift' as const,
        },
      ],
      series: [
        // Main value line
        {
          name: 'Value',
          type: 'line' as const,
          data: plottedValues,
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
          // Add control limit markLines for constant-limit charts (np, c)
          ...(!hasVariableLimits
            ? {
                markLine: {
                  symbol: 'none',
                  silent: true,
                  data: [
                    ...(controlLimits.ucl != null
                      ? [
                          {
                            yAxis: controlLimits.ucl,
                            lineStyle: {
                              color: chartColors.uclLine,
                              type: 'dashed' as const,
                              width: 1.5,
                            },
                            label: {
                              formatter: `UCL: ${formatVal(controlLimits.ucl)}`,
                              position: 'end' as const,
                              color: chartColors.uclLine,
                              fontSize: 11,
                              fontWeight: 500,
                            },
                          },
                        ]
                      : []),
                    ...(controlLimits.center_line != null
                      ? [
                          {
                            yAxis: controlLimits.center_line,
                            lineStyle: {
                              color: chartColors.centerLine,
                              type: 'solid' as const,
                              width: 2.5,
                            },
                            label: {
                              formatter: `CL: ${formatVal(controlLimits.center_line)}`,
                              position: 'end' as const,
                              color: chartColors.centerLine,
                              fontSize: 11,
                              fontWeight: 600,
                            },
                          },
                        ]
                      : []),
                    ...(controlLimits.lcl != null
                      ? [
                          {
                            yAxis: controlLimits.lcl,
                            lineStyle: {
                              color: chartColors.lclLine,
                              type: 'dashed' as const,
                              width: 1.5,
                            },
                            label: {
                              formatter: `LCL: ${formatVal(controlLimits.lcl)}`,
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
              }
            : {}),
        },
        // UCL line (variable for p/u charts, constant handled by markLine above)
        ...(hasVariableLimits
          ? [
              {
                name: 'UCL',
                type: 'line' as const,
                data: uclValues,
                lineStyle: { type: 'dashed' as const, color: chartColors.uclLine, width: 1.5 },
                symbol: 'none' as const,
                showSymbol: false,
                silent: true,
                z: 4,
              },
            ]
          : []),
        // LCL line (variable for p/u charts)
        ...(hasVariableLimits
          ? [
              {
                name: 'LCL',
                type: 'line' as const,
                data: lclValues,
                lineStyle: { type: 'dashed' as const, color: chartColors.lclLine, width: 1.5 },
                symbol: 'none' as const,
                showSymbol: false,
                silent: true,
                z: 4,
              },
            ]
          : []),
        // Center line (always a separate series for variable-limit charts)
        ...(hasVariableLimits
          ? [
              {
                name: 'CL',
                type: 'line' as const,
                data: centerLineValues,
                lineStyle: { type: 'dashed' as const, color: chartColors.centerLine, width: 2 },
                symbol: 'none' as const,
                showSymbol: false,
                silent: true,
                z: 4,
              },
            ]
          : []),
        // Custom series for data point symbols
        {
          type: 'custom' as const,
          data: attrPoints.map((pt, i) => [i, pt.plotted_value, i, pt.sample_id]),
          renderItem: customRenderItem,
          coordinateSystem: 'cartesian2d' as const,
          encode: { x: 0, y: 1 },
          z: 10,
          silent: false,
        },
      ],
    }

    return option
  }, [chartData, attrPoints, attrType, hasVariableLimits, chartColors, highlightSampleId, isDark])

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

  const hasData = attrPoints.length > 0
  const chartTypeName = CHART_TYPE_NAMES[attrType] ?? 'Attribute Chart'

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
                {chartTypeName}
              </span>
              {chartData?.sigma_z != null && (
                <Explainable metric="sigma_z" resourceId={characteristicId} resourceType="attribute">
                  <span className="flex flex-shrink-0 items-center gap-1">
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 font-mono text-xs",
                      chartData.sigma_z > 1.1 ? "border-amber-700/30 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" :
                      chartData.sigma_z < 0.9 ? "border-blue-700/30 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200" :
                      "border-green-700/30 bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200"
                    )}>
                      <span>&#963;</span><sub>z</sub> = {chartData.sigma_z.toFixed(3)}
                      {chartData.sigma_z > 1.1 ? ' (overdispersion)' :
                       chartData.sigma_z < 0.9 ? ' (underdispersion)' : ' (nominal)'}
                    </span>
                    <StatNote>
                      Laney p&prime;/u&prime; correction adjusts for
                      over/underdispersion. &sigma;<sub>z</sub> &gt; 1 means data
                      has more variation than the model assumes; &sigma;<sub>z</sub>{' '}
                      &lt; 1 means less.
                    </StatNote>
                  </span>
                </Explainable>
              )}
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
            {chartData?.active_material_name && (
              <span className="bg-accent/10 text-accent-foreground flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-medium">
                Limits: {chartData.active_material_name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Attribute chart notes */}
      {hasData && (
        <div className="mb-1 flex flex-wrap items-center gap-3">
          {hasVariableLimits && (
            <span className="flex items-center gap-1 text-xs text-zinc-400">
              <StatNote>
                Attribute chart limits vary per sample point based on sample size
                (n). Larger samples produce tighter limits. This is expected
                behavior.
              </StatNote>
            </span>
          )}
          {attrType === 'p' &&
            chartData?.control_limits?.ucl != null &&
            chartData.control_limits.ucl >= 0.999 && (
              <span className="flex items-center gap-1 text-xs text-zinc-400">
                <StatNote>
                  UCL capped at 1.0 &mdash; a proportion cannot exceed 100%.
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
