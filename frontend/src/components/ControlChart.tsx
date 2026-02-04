import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts'
import { useChartData } from '@/api/hooks'
import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'
import { ViolationLegend, NELSON_RULES, getPrimaryViolationRule } from './ViolationLegend'

interface ControlChartProps {
  characteristicId: number
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  label?: string
  showSpecLimits?: boolean
  colorScheme?: 'primary' | 'secondary'
}

// Hook to subscribe to chart color changes
function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(getStoredChartColors)

  const updateColors = useCallback(() => {
    setColors(getStoredChartColors())
  }, [])

  useEffect(() => {
    // Listen for storage events (when settings change in another tab or same tab)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'openspc-chart-colors' || e.key === 'openspc-chart-preset') {
        updateColors()
      }
    }

    // Listen for custom event dispatched when colors change in same tab
    const handleColorChange = () => updateColors()

    window.addEventListener('storage', handleStorage)
    window.addEventListener('chart-colors-changed', handleColorChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('chart-colors-changed', handleColorChange)
    }
  }, [updateColors])

  return colors
}

export function ControlChart({
  characteristicId,
  chartOptions,
  label,
  showSpecLimits = true,
  colorScheme = 'primary',
}: ControlChartProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, chartOptions ?? { limit: 50 })
  const chartColors = useChartColors()

  // Collect all violated rules across all data points for legend
  // This hook must be called unconditionally (before early returns)
  const allViolatedRules = useMemo(() => {
    if (!chartData?.data_points) return []
    const rules = new Set<number>()
    chartData.data_points.forEach((point) => {
      point.violation_rules?.forEach((rule) => rules.add(rule))
    })
    return Array.from(rules).sort((a, b) => a - b)
  }, [chartData?.data_points])

  // Color scheme overrides for comparison mode
  const lineGradientId = `chartLineGradient-${characteristicId}-${colorScheme}`
  const lineColors = colorScheme === 'secondary'
    ? { start: 'hsl(280, 87%, 55%)', end: 'hsl(320, 70%, 55%)' }
    : { start: chartColors.lineGradientStart, end: chartColors.lineGradientEnd }

  if (isLoading) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading chart data...</div>
      </div>
    )
  }

  if (!chartData || !chartData.data_points || chartData.data_points.length === 0) {
    return (
      <div className="h-full bg-card border border-border rounded-2xl flex items-center justify-center">
        <div className="text-muted-foreground text-sm">No data available</div>
      </div>
    )
  }

  const { control_limits, spec_limits, zone_boundaries, data_points, subgroup_mode, nominal_subgroup_size, decimal_precision = 3 } = chartData

  // Helper to format values with decimal precision
  const formatValue = (value: number | null | undefined) => {
    if (value == null) return 'N/A'
    return value.toFixed(decimal_precision)
  }

  // Determine if we're in a special mode
  const isModeA = subgroup_mode === 'STANDARDIZED'
  const isModeB = subgroup_mode === 'VARIABLE_LIMITS'

  // Prepare chart data with mode-specific display values
  const data = data_points.map((point, index) => ({
    index: index + 1,
    // For Mode A, plot z_score; for Mode B/C, plot mean
    mean: isModeA ? (point.z_score ?? point.mean) : point.mean,
    displayValue: point.display_value ?? point.mean,
    hasViolation: point.violation_ids.length > 0,
    violationRules: point.violation_rules ?? [],
    excluded: point.excluded,
    timestamp: new Date(point.timestamp).toLocaleTimeString(),
    // Mode-specific fields
    actual_n: point.actual_n ?? nominal_subgroup_size,
    is_undersized: point.is_undersized ?? false,
    effective_ucl: point.effective_ucl,
    effective_lcl: point.effective_lcl,
    z_score: point.z_score,
  }))

  // Calculate Y-axis domain based on mode
  let yMin: number, yMax: number, yAxisLabel: string

  if (isModeA) {
    // Mode A: Fixed domain for Z-scores
    yMin = -4
    yMax = 4
    yAxisLabel = 'Z-Score'
  } else {
    // Mode B/C: Dynamic domain based on values and limits
    const values = data.map((p) => p.mean)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const ucl = control_limits.ucl ?? maxVal
    const lcl = control_limits.lcl ?? minVal
    const padding = (ucl - lcl) * 0.2
    yMin = Math.min(minVal, lcl) - padding
    yMax = Math.max(maxVal, ucl) + padding
    yAxisLabel = 'Value'
  }

  // Determine chart title based on mode
  const chartTypeLabel = isModeA
    ? 'Z-Score Chart'
    : isModeB
      ? 'Variable Limits Chart'
      : 'X-Bar Chart'
  const chartTitle = label
    ? `${label}: ${chartData.characteristic_name} - ${chartTypeLabel}`
    : `${chartData.characteristic_name} - ${chartTypeLabel}`

  return (
    <div className="h-full bg-card border border-border rounded-2xl p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold text-sm">{chartTitle}</h3>
          {allViolatedRules.length > 0 && (
            <ViolationLegend violatedRules={allViolatedRules} compact className="ml-2" />
          )}
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          {isModeA ? (
            <>
              <span>UCL: +3</span>
              <span>CL: 0</span>
              <span>LCL: -3</span>
            </>
          ) : (
            <>
              {control_limits.ucl && <span>UCL: {formatValue(control_limits.ucl)}</span>}
              {control_limits.center_line && <span>CL: {formatValue(control_limits.center_line)}</span>}
              {control_limits.lcl && <span>LCL: {formatValue(control_limits.lcl)}</span>}
            </>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={data} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
          {/* Gradient and filter definitions */}
          <defs>
            <linearGradient id={lineGradientId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={lineColors.start} />
              <stop offset="100%" stopColor={lineColors.end} />
            </linearGradient>
            <filter id="violationGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Out-of-control zone fill - uses preset color */}
            <pattern id="oocPattern" patternUnits="userSpaceOnUse" width="8" height="8">
              <rect width="8" height="8" fill={chartColors.outOfControl} fillOpacity="0.15" />
              <line x1="0" y1="8" x2="8" y2="0" stroke={chartColors.outOfControl} strokeWidth="0.5" strokeOpacity="0.3" />
            </pattern>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />

          {/* Out-of-control zones - striped red pattern for visibility */}
          {isModeA ? (
            <>
              {/* Above +3 sigma */}
              <ReferenceArea
                y1={3}
                y2={yMax}
                fill="url(#oocPattern)"
              />
              {/* Below -3 sigma */}
              <ReferenceArea
                y1={yMin}
                y2={-3}
                fill="url(#oocPattern)"
              />
            </>
          ) : (
            <>
              {/* Above UCL */}
              {control_limits.ucl && (
                <ReferenceArea
                  y1={control_limits.ucl}
                  y2={yMax}
                  fill="url(#oocPattern)"
                />
              )}
              {/* Below LCL */}
              {control_limits.lcl && (
                <ReferenceArea
                  y1={yMin}
                  y2={control_limits.lcl}
                  fill="url(#oocPattern)"
                />
              )}
            </>
          )}

          <XAxis
            dataKey="index"
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 12 }}
            className="text-muted-foreground"
            tickFormatter={(value) => value.toFixed(decimal_precision)}
            label={{ value: yAxisLabel, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload
              return (
                <div className="bg-popover border border-border rounded-xl p-3 text-sm shadow-xl">
                  <div className="font-medium">Sample #{point.index}</div>
                  <div>n = {point.actual_n}</div>
                  {isModeA ? (
                    <div>Z-Score: {formatValue(point.z_score ?? point.mean)}</div>
                  ) : isModeB && point.effective_ucl ? (
                    <>
                      <div>Value: {formatValue(point.displayValue ?? point.mean)}</div>
                      <div className="text-muted-foreground">
                        UCL: {formatValue(point.effective_ucl)}
                      </div>
                      <div className="text-muted-foreground">
                        LCL: {formatValue(point.effective_lcl)}
                      </div>
                    </>
                  ) : (
                    <div>Value: {formatValue(point.mean)}</div>
                  )}
                  <div className="text-muted-foreground">{point.timestamp}</div>
                  {point.is_undersized && (
                    <div className="text-warning font-medium">Undersized sample</div>
                  )}
                  {point.hasViolation && point.violationRules?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <div className="text-destructive font-medium mb-1">Violations:</div>
                      {point.violationRules.map((ruleId: number) => (
                        <div key={ruleId} className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold rounded-full bg-destructive/20 text-destructive">
                            {ruleId}
                          </span>
                          <span>{NELSON_RULES[ruleId]?.name || `Rule ${ruleId}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {point.hasViolation && (!point.violationRules || point.violationRules.length === 0) && (
                    <div className="text-destructive font-medium">Violation!</div>
                  )}
                </div>
              )
            }}
          />

          {/* Control limits and zone lines */}
          {isModeA ? (
            <>
              {/* Fixed +/-3, +/-2, +/-1, 0 lines for Z-score chart */}
              <ReferenceLine
                y={3}
                stroke={chartColors.uclLine}
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{ value: '+3σ (UCL)', position: 'right', fill: chartColors.uclLine, fontSize: 11, fontWeight: 500 }}
              />
              <ReferenceLine y={2} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine
                y={0}
                stroke={chartColors.centerLine}
                strokeWidth={2.5}
                label={{ value: 'CL', position: 'right', fill: chartColors.centerLine, fontSize: 12, fontWeight: 600 }}
              />
              <ReferenceLine y={-1} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={-2} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine
                y={-3}
                stroke={chartColors.lclLine}
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{ value: '-3σ (LCL)', position: 'right', fill: chartColors.lclLine, fontSize: 11, fontWeight: 500 }}
              />
            </>
          ) : (
            <>
              {/* Zone boundary lines (1σ, 2σ) */}
              {zone_boundaries.plus_1_sigma && (
                <ReferenceLine y={zone_boundaries.plus_1_sigma} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.4} />
              )}
              {zone_boundaries.plus_2_sigma && (
                <ReferenceLine y={zone_boundaries.plus_2_sigma} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.4} />
              )}
              {zone_boundaries.minus_1_sigma && (
                <ReferenceLine y={zone_boundaries.minus_1_sigma} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.4} />
              )}
              {zone_boundaries.minus_2_sigma && (
                <ReferenceLine y={zone_boundaries.minus_2_sigma} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.4} />
              )}

              {/* UCL */}
              {control_limits.ucl && (
                <ReferenceLine
                  y={control_limits.ucl}
                  stroke={chartColors.uclLine}
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{
                    value: 'UCL',
                    position: 'right',
                    fill: chartColors.uclLine,
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                />
              )}
              {/* Center Line */}
              {control_limits.center_line && (
                <ReferenceLine
                  y={control_limits.center_line}
                  stroke={chartColors.centerLine}
                  strokeWidth={2.5}
                  label={{
                    value: 'CL',
                    position: 'right',
                    fill: chartColors.centerLine,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                />
              )}
              {/* LCL */}
              {control_limits.lcl && (
                <ReferenceLine
                  y={control_limits.lcl}
                  stroke={chartColors.lclLine}
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{
                    value: 'LCL',
                    position: 'right',
                    fill: chartColors.lclLine,
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                />
              )}
            </>
          )}

          {/* Spec limits - visible when showSpecLimits is true */}
          {showSpecLimits && spec_limits.usl != null && (
            <ReferenceLine
              y={spec_limits.usl}
              stroke="hsl(357 80% 52%)"
              strokeWidth={2}
              strokeDasharray="8 4"
              label={{
                value: `USL: ${formatValue(spec_limits.usl)}`,
                position: 'right',
                fill: 'hsl(357 80% 45%)',
                fontSize: 10,
                fontWeight: 500,
              }}
            />
          )}
          {showSpecLimits && spec_limits.lsl != null && (
            <ReferenceLine
              y={spec_limits.lsl}
              stroke="hsl(357 80% 52%)"
              strokeWidth={2}
              strokeDasharray="8 4"
              label={{
                value: `LSL: ${formatValue(spec_limits.lsl)}`,
                position: 'right',
                fill: 'hsl(357 80% 45%)',
                fontSize: 10,
                fontWeight: 500,
              }}
            />
          )}

          {/* Data line */}
          <Line
            type="linear"
            dataKey="mean"
            stroke={`url(#${lineGradientId})`}
            strokeWidth={2.5}
            dot={({ cx, cy, payload }) => {
              // Guard against undefined coordinates
              if (cx === undefined || cy === undefined) return null

              const isViolation = payload.hasViolation
              const isUndersized = payload.is_undersized
              const isExcluded = payload.excluded
              const violationRules: number[] = payload.violationRules || []
              const primaryRule = getPrimaryViolationRule(violationRules)

              // Determine fill color using preset colors
              const fillColor = isExcluded
                ? chartColors.excludedPoint
                : isViolation
                  ? chartColors.violationPoint
                  : isUndersized
                    ? chartColors.undersizedPoint
                    : chartColors.normalPoint

              // Base radius
              const baseRadius = isViolation ? 6 : isUndersized ? 5 : 4

              return (
                <g key={payload.index}>
                  {isViolation ? (
                    // Diamond shape for violations
                    <path
                      d={`M ${cx} ${cy - baseRadius} L ${cx + baseRadius} ${cy} L ${cx} ${cy + baseRadius} L ${cx - baseRadius} ${cy} Z`}
                      fill={fillColor}
                      filter="url(#violationGlow)"
                    />
                  ) : isUndersized ? (
                    // Triangle shape for undersized
                    <path
                      d={`M ${cx} ${cy - baseRadius} L ${cx + baseRadius} ${cy + baseRadius * 0.7} L ${cx - baseRadius} ${cy + baseRadius * 0.7} Z`}
                      fill={fillColor}
                      stroke={chartColors.undersizedPoint}
                      strokeWidth={1.5}
                    />
                  ) : (
                    // Circle for normal points
                    <circle
                      cx={cx}
                      cy={cy}
                      r={baseRadius}
                      fill={fillColor}
                    />
                  )}
                  {/* Violation rule number badge */}
                  {isViolation && primaryRule && (
                    <>
                      {/* Badge background */}
                      <circle
                        cx={cx}
                        cy={cy - baseRadius - 8}
                        r={7}
                        fill="hsl(357 80% 52%)"
                        stroke="white"
                        strokeWidth={1}
                      />
                      {/* Rule number */}
                      <text
                        x={cx}
                        y={cy - baseRadius - 8}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="white"
                        fontSize={9}
                        fontWeight={700}
                      >
                        {primaryRule}
                      </text>
                      {/* Multiple violations indicator */}
                      {violationRules.length > 1 && (
                        <text
                          x={cx + 7}
                          y={cy - baseRadius - 12}
                          fill="hsl(357 80% 45%)"
                          fontSize={8}
                          fontWeight={600}
                        >
                          +{violationRules.length - 1}
                        </text>
                      )}
                    </>
                  )}
                  {/* Undersized indicator ring */}
                  {isUndersized && !isViolation && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={baseRadius + 3}
                      fill="none"
                      stroke={chartColors.undersizedPoint}
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                    />
                  )}
                </g>
              )
            }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
