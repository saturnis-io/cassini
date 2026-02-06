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
import { useChartData, useHierarchyPath } from '@/api/hooks'
import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'
import { ViolationLegend, NELSON_RULES, getPrimaryViolationRule } from './ViolationLegend'
import { useChartHoverSync } from '@/contexts/ChartHoverContext'

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
  /** Shared Y-axis domain for alignment with other charts */
  yAxisDomain?: [number, number]
  /** Callback when hovering over a data point - passes the mean value or null on leave */
  onHoverValue?: (value: number | null) => void
  /** Range [min, max] from histogram bar hover to highlight corresponding points */
  highlightedRange?: [number, number] | null
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
  yAxisDomain: externalDomain,
  onHoverValue,
  highlightedRange,
}: ControlChartProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, chartOptions ?? { limit: 50 })
  const chartColors = useChartColors()
  const hierarchyPath = useHierarchyPath(characteristicId)

  // Cross-chart hover sync using sample IDs
  const { hoveredSampleIds, onHoverSample, onLeaveSample } = useChartHoverSync(characteristicId)

  // Collect all violated rules across all data points for legend
  // This hook must be called unconditionally (before early returns)
  const dataPoints = chartData?.data_points
  const allViolatedRules = useMemo(() => {
    if (!dataPoints) return []
    const rules = new Set<number>()
    dataPoints.forEach((point) => {
      point.violation_rules?.forEach((rule) => rules.add(rule))
    })
    return Array.from(rules).sort((a, b) => a - b)
  }, [dataPoints])

  // Color scheme overrides for comparison mode - uses Sepasoft brand colors from preset
  const lineGradientId = `chartLineGradient-${characteristicId}-${colorScheme}`
  const lineColors = colorScheme === 'secondary'
    ? { start: chartColors.secondaryLineGradientStart, end: chartColors.secondaryLineGradientEnd }
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
  // In Mode A, filter out points without z_score to prevent raw means from
  // appearing on the Z-score axis (which would blow up the scale)
  const validPoints = isModeA
    ? data_points.filter((p) => p.z_score != null)
    : data_points

  const data = validPoints.map((point, index) => ({
    index: index + 1,
    sample_id: point.sample_id, // Stable identifier for cross-chart sync
    // For Mode A, plot z_score; for Mode B/C, plot mean
    mean: isModeA ? point.z_score! : point.mean,
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
  // Use external domain if provided (for alignment with histogram), otherwise calculate
  let yMin: number, yMax: number, yAxisLabel: string

  if (isModeA && externalDomain) {
    // Mode A with shared domain from parent
    yMin = externalDomain[0]
    yMax = externalDomain[1]
    yAxisLabel = 'Z-Score'
  } else if (isModeA) {
    // Mode A standalone: dynamic domain from z-score data + ±3 limits
    const zValues = data.map((p) => p.mean) // already mapped to z_score above
    const allZLimits = [...zValues, 3, -3]
    const zMin = Math.min(...allZLimits)
    const zMax = Math.max(...allZLimits)
    const zPadding = (zMax - zMin) * 0.1
    yMin = zMin - zPadding
    yMax = zMax + zPadding
    yAxisLabel = 'Z-Score'
  } else if (externalDomain) {
    // Use shared domain from parent for alignment
    yMin = externalDomain[0]
    yMax = externalDomain[1]
    yAxisLabel = 'Value'
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

  // Build breadcrumb from hierarchy path
  const breadcrumb = hierarchyPath.length > 0
    ? [...hierarchyPath, chartData.characteristic_name].join(' / ')
    : chartData.characteristic_name

  return (
    <div className="h-full bg-card border border-border rounded-2xl p-5 flex flex-col">
      {/* Header - fixed height to match DistributionHistogram header exactly */}
      <div className="flex justify-between items-center mb-4 h-5 flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {label && (
              <span className="text-xs font-medium px-1.5 py-0.5 bg-primary/10 text-primary rounded flex-shrink-0">
                {label}
              </span>
            )}
            <h3 className="font-semibold text-sm leading-5 truncate" title={breadcrumb}>
              <span className="text-muted-foreground">{hierarchyPath.join(' / ')}{hierarchyPath.length > 0 && ' / '}</span>
              <span>{chartData.characteristic_name}</span>
              <span className="text-muted-foreground font-normal"> - {chartTypeLabel}</span>
            </h3>
          </div>
          {allViolatedRules.length > 0 && (
            <ViolationLegend violatedRules={allViolatedRules} compact className="ml-2" />
          )}
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground leading-5">
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

      {/* Chart area - flex-1 to fill remaining space */}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 20, right: 60, left: 20, bottom: 20 }}
          onMouseMove={(state) => {
            if (state?.activeTooltipIndex != null) {
              const index = Number(state.activeTooltipIndex)
              const point = data[index]
              if (point) {
                // Broadcast sample_id to cross-chart hover context
                onHoverSample(point.sample_id)
                // Also call local callback if provided
                onHoverValue?.(point.displayValue ?? point.mean)
              }
            }
          }}
          onMouseLeave={() => {
            onLeaveSample()
            onHoverValue?.(null)
          }}
        >
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

          {/* Zone shading - colored bands for visual context */}
          {isModeA ? (
            <>
              {/* Zone C: Within ±1σ - green (stable) */}
              <ReferenceArea y1={-1} y2={1} fill={chartColors.zoneC} fillOpacity={0.08} />
              {/* Zone B: ±1σ to ±2σ - yellow (caution) */}
              <ReferenceArea y1={1} y2={2} fill={chartColors.zoneB} fillOpacity={0.1} />
              <ReferenceArea y1={-2} y2={-1} fill={chartColors.zoneB} fillOpacity={0.1} />
              {/* Zone A: ±2σ to ±3σ - orange (warning) */}
              <ReferenceArea y1={2} y2={3} fill={chartColors.zoneA} fillOpacity={0.12} />
              <ReferenceArea y1={-3} y2={-2} fill={chartColors.zoneA} fillOpacity={0.12} />
              {/* Out of control: Beyond ±3σ */}
              <ReferenceArea y1={3} y2={yMax} fill="url(#oocPattern)" />
              <ReferenceArea y1={yMin} y2={-3} fill="url(#oocPattern)" />
            </>
          ) : (
            <>
              {/* Zone shading using zone boundaries from backend */}
              {zone_boundaries.plus_1_sigma != null && zone_boundaries.minus_1_sigma != null && (
                /* Zone C: Within ±1σ - green (stable) */
                <ReferenceArea
                  y1={zone_boundaries.minus_1_sigma}
                  y2={zone_boundaries.plus_1_sigma}
                  fill={chartColors.zoneC}
                  fillOpacity={0.08}
                />
              )}
              {zone_boundaries.plus_1_sigma != null && zone_boundaries.plus_2_sigma != null && (
                /* Zone B upper: +1σ to +2σ - yellow (caution) */
                <ReferenceArea
                  y1={zone_boundaries.plus_1_sigma}
                  y2={zone_boundaries.plus_2_sigma}
                  fill={chartColors.zoneB}
                  fillOpacity={0.1}
                />
              )}
              {zone_boundaries.minus_2_sigma != null && zone_boundaries.minus_1_sigma != null && (
                /* Zone B lower: -2σ to -1σ - yellow (caution) */
                <ReferenceArea
                  y1={zone_boundaries.minus_2_sigma}
                  y2={zone_boundaries.minus_1_sigma}
                  fill={chartColors.zoneB}
                  fillOpacity={0.1}
                />
              )}
              {zone_boundaries.plus_2_sigma != null && control_limits.ucl != null && (
                /* Zone A upper: +2σ to UCL - orange (warning) */
                <ReferenceArea
                  y1={zone_boundaries.plus_2_sigma}
                  y2={control_limits.ucl}
                  fill={chartColors.zoneA}
                  fillOpacity={0.12}
                />
              )}
              {control_limits.lcl != null && zone_boundaries.minus_2_sigma != null && (
                /* Zone A lower: LCL to -2σ - orange (warning) */
                <ReferenceArea
                  y1={control_limits.lcl}
                  y2={zone_boundaries.minus_2_sigma}
                  fill={chartColors.zoneA}
                  fillOpacity={0.12}
                />
              )}
              {/* Out of control zones */}
              {control_limits.ucl && (
                <ReferenceArea y1={control_limits.ucl} y2={yMax} fill="url(#oocPattern)" />
              )}
              {control_limits.lcl && (
                <ReferenceArea y1={yMin} y2={control_limits.lcl} fill="url(#oocPattern)" />
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
                    <div className="text-destructive font-medium">
                      Violation detected
                      <div className="text-xs text-muted-foreground">(Rule details unavailable - refresh page)</div>
                    </div>
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

              // Check if this point is highlighted from histogram hover (legacy prop)
              const pointValue = payload.displayValue ?? payload.mean
              const isHighlightedFromHistogram = highlightedRange &&
                pointValue >= highlightedRange[0] &&
                pointValue < highlightedRange[1]

              // Check if this point is highlighted from cross-chart hover using sample_id
              const isHighlightedFromCrossChart = hoveredSampleIds?.has(payload.sample_id) ?? false

              // Combined highlight state
              const isHighlighted = isHighlightedFromHistogram || isHighlightedFromCrossChart

              // Determine fill color using preset colors (override with gold if highlighted)
              const fillColor = isHighlighted
                ? 'hsl(45, 100%, 50%)'  // Gold highlight color
                : isExcluded
                  ? chartColors.excludedPoint
                  : isViolation
                    ? chartColors.violationPoint
                    : isUndersized
                      ? chartColors.undersizedPoint
                      : chartColors.normalPoint

              // Base radius (larger when highlighted)
              const baseRadius = isHighlighted ? 7 : isViolation ? 6 : isUndersized ? 5 : 4

              return (
                <g key={payload.index}>
                  {/* Highlight glow ring for cross-chart highlighted points */}
                  {isHighlighted && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={baseRadius + 4}
                      fill="none"
                      stroke="hsl(45, 100%, 50%)"
                      strokeWidth={2}
                      opacity={0.5}
                    />
                  )}
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
                      stroke={isHighlighted ? 'hsl(35, 100%, 45%)' : chartColors.undersizedPoint}
                      strokeWidth={1.5}
                    />
                  ) : (
                    // Circle for normal points
                    <circle
                      cx={cx}
                      cy={cy}
                      r={baseRadius}
                      fill={fillColor}
                      stroke={isHighlighted ? 'hsl(35, 100%, 45%)' : undefined}
                      strokeWidth={isHighlighted ? 2 : 0}
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
    </div>
  )
}
