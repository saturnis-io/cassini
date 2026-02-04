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

interface ControlChartProps {
  characteristicId: number
}

export function ControlChart({ characteristicId }: ControlChartProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, 50)

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
  const chartTitle = isModeA
    ? `${chartData.characteristic_name} - Z-Score Chart`
    : isModeB
      ? `${chartData.characteristic_name} - Variable Limits Chart`
      : `${chartData.characteristic_name} - X-Bar Chart`

  return (
    <div className="h-full bg-card border border-border rounded-2xl p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">{chartTitle}</h3>
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
            <linearGradient id="chartLineGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(212 100% 35%)" />
              <stop offset="100%" stopColor="hsl(179 50% 55%)" />
            </linearGradient>
            <filter id="violationGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />

          {/* Out-of-control zones - red semi-transparent overlay */}
          {isModeA ? (
            <>
              {/* Above +3 sigma */}
              <ReferenceArea
                y1={3}
                y2={yMax}
                fill="hsl(var(--destructive))"
                fillOpacity={0.08}
              />
              {/* Below -3 sigma */}
              <ReferenceArea
                y1={yMin}
                y2={-3}
                fill="hsl(var(--destructive))"
                fillOpacity={0.08}
              />
            </>
          ) : (
            <>
              {/* Above UCL */}
              {control_limits.ucl && (
                <ReferenceArea
                  y1={control_limits.ucl}
                  y2={yMax}
                  fill="hsl(var(--destructive))"
                  fillOpacity={0.08}
                />
              )}
              {/* Below LCL */}
              {control_limits.lcl && (
                <ReferenceArea
                  y1={yMin}
                  y2={control_limits.lcl}
                  fill="hsl(var(--destructive))"
                  fillOpacity={0.08}
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
                  {point.hasViolation && (
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
                stroke="hsl(var(--destructive))"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{ value: '+3σ (UCL)', position: 'right', fill: 'hsl(var(--destructive))', fontSize: 11, fontWeight: 500 }}
              />
              <ReferenceLine y={2} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine
                y={0}
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                label={{ value: 'CL', position: 'right', fill: 'hsl(var(--primary))', fontSize: 12, fontWeight: 600 }}
              />
              <ReferenceLine y={-1} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine y={-2} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
              <ReferenceLine
                y={-3}
                stroke="hsl(var(--destructive))"
                strokeDasharray="5 5"
                strokeWidth={1.5}
                label={{ value: '-3σ (LCL)', position: 'right', fill: 'hsl(var(--destructive))', fontSize: 11, fontWeight: 500 }}
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
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{
                    value: 'UCL',
                    position: 'right',
                    fill: 'hsl(var(--destructive))',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                />
              )}
              {/* Center Line */}
              {control_limits.center_line && (
                <ReferenceLine
                  y={control_limits.center_line}
                  stroke="hsl(var(--primary))"
                  strokeWidth={2.5}
                  label={{
                    value: 'CL',
                    position: 'right',
                    fill: 'hsl(var(--primary))',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                />
              )}
              {/* LCL */}
              {control_limits.lcl && (
                <ReferenceLine
                  y={control_limits.lcl}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{
                    value: 'LCL',
                    position: 'right',
                    fill: 'hsl(var(--destructive))',
                    fontSize: 12,
                    fontWeight: 500,
                  }}
                />
              )}
            </>
          )}

          {/* Spec limits (if different from control limits) */}
          {spec_limits.usl && spec_limits.usl !== control_limits.ucl && (
            <ReferenceLine
              y={spec_limits.usl}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="2 2"
            />
          )}
          {spec_limits.lsl && spec_limits.lsl !== control_limits.lcl && (
            <ReferenceLine
              y={spec_limits.lsl}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="2 2"
            />
          )}

          {/* Data line */}
          <Line
            type="linear"
            dataKey="mean"
            stroke="url(#chartLineGradient)"
            strokeWidth={2.5}
            dot={({ cx, cy, payload }) => {
              const isViolation = payload.hasViolation
              const isUndersized = payload.is_undersized
              const isExcluded = payload.excluded

              // Determine fill color
              const fillColor = isExcluded
                ? 'hsl(var(--muted))'
                : isViolation
                  ? 'hsl(var(--destructive))'
                  : 'hsl(var(--primary))'

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
                      stroke="hsl(var(--warning))"
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
                  {/* Undersized indicator ring */}
                  {isUndersized && !isViolation && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={baseRadius + 3}
                      fill="none"
                      stroke="hsl(var(--warning))"
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
