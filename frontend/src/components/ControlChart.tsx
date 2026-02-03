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
import { cn } from '@/lib/utils'

interface ControlChartProps {
  characteristicId: number
}

export function ControlChart({ characteristicId }: ControlChartProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, 50)

  if (isLoading) {
    return (
      <div className="h-full border rounded-lg bg-card flex items-center justify-center">
        <div className="text-muted-foreground">Loading chart data...</div>
      </div>
    )
  }

  if (!chartData || chartData.data_points.length === 0) {
    return (
      <div className="h-full border rounded-lg bg-card flex items-center justify-center">
        <div className="text-muted-foreground">No data available</div>
      </div>
    )
  }

  const { control_limits, spec_limits, zone_boundaries, data_points } = chartData

  // Prepare chart data
  const data = data_points.map((point, index) => ({
    index: index + 1,
    mean: point.mean,
    hasViolation: point.violation_ids.length > 0,
    excluded: point.excluded,
    timestamp: new Date(point.timestamp).toLocaleTimeString(),
  }))

  // Calculate Y-axis domain
  const values = data_points.map((p) => p.mean)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const ucl = control_limits.ucl ?? maxVal
  const lcl = control_limits.lcl ?? minVal
  const padding = (ucl - lcl) * 0.1
  const yMin = Math.min(minVal, lcl) - padding
  const yMax = Math.max(maxVal, ucl) + padding

  return (
    <div className="h-full border rounded-lg bg-card p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">{chartData.characteristic_name} - X-Bar Chart</h3>
        <div className="flex gap-4 text-sm text-muted-foreground">
          {control_limits.ucl && <span>UCL: {control_limits.ucl.toFixed(3)}</span>}
          {control_limits.center_line && <span>CL: {control_limits.center_line.toFixed(3)}</span>}
          {control_limits.lcl && <span>LCL: {control_limits.lcl.toFixed(3)}</span>}
        </div>
      </div>

      <ResponsiveContainer width="100%" height="90%">
        <ComposedChart data={data} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />

          {/* Zone backgrounds */}
          {zone_boundaries.plus_1_sigma && zone_boundaries.minus_1_sigma && (
            <ReferenceArea
              y1={zone_boundaries.minus_1_sigma}
              y2={zone_boundaries.plus_1_sigma}
              fill="hsl(var(--zone-c))"
              fillOpacity={0.2}
            />
          )}
          {zone_boundaries.plus_2_sigma && zone_boundaries.plus_1_sigma && (
            <ReferenceArea
              y1={zone_boundaries.plus_1_sigma}
              y2={zone_boundaries.plus_2_sigma}
              fill="hsl(var(--zone-b))"
              fillOpacity={0.2}
            />
          )}
          {zone_boundaries.minus_1_sigma && zone_boundaries.minus_2_sigma && (
            <ReferenceArea
              y1={zone_boundaries.minus_2_sigma}
              y2={zone_boundaries.minus_1_sigma}
              fill="hsl(var(--zone-b))"
              fillOpacity={0.2}
            />
          )}
          {zone_boundaries.plus_3_sigma && zone_boundaries.plus_2_sigma && (
            <ReferenceArea
              y1={zone_boundaries.plus_2_sigma}
              y2={zone_boundaries.plus_3_sigma}
              fill="hsl(var(--zone-a))"
              fillOpacity={0.2}
            />
          )}
          {zone_boundaries.minus_2_sigma && zone_boundaries.minus_3_sigma && (
            <ReferenceArea
              y1={zone_boundaries.minus_3_sigma}
              y2={zone_boundaries.minus_2_sigma}
              fill="hsl(var(--zone-a))"
              fillOpacity={0.2}
            />
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
            tickFormatter={(value) => value.toFixed(2)}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const point = payload[0].payload
              return (
                <div className="bg-popover border rounded-lg p-2 text-sm shadow-lg">
                  <div className="font-medium">Sample #{point.index}</div>
                  <div>Value: {point.mean.toFixed(4)}</div>
                  <div className="text-muted-foreground">{point.timestamp}</div>
                  {point.hasViolation && (
                    <div className="text-destructive font-medium">Violation!</div>
                  )}
                </div>
              )
            }}
          />

          {/* Control limits */}
          {control_limits.ucl && (
            <ReferenceLine
              y={control_limits.ucl}
              stroke="hsl(var(--destructive))"
              strokeDasharray="5 5"
              label={{
                value: 'UCL',
                position: 'right',
                fill: 'hsl(var(--destructive))',
                fontSize: 12,
              }}
            />
          )}
          {control_limits.center_line && (
            <ReferenceLine
              y={control_limits.center_line}
              stroke="hsl(var(--primary))"
              label={{
                value: 'CL',
                position: 'right',
                fill: 'hsl(var(--primary))',
                fontSize: 12,
              }}
            />
          )}
          {control_limits.lcl && (
            <ReferenceLine
              y={control_limits.lcl}
              stroke="hsl(var(--destructive))"
              strokeDasharray="5 5"
              label={{
                value: 'LCL',
                position: 'right',
                fill: 'hsl(var(--destructive))',
                fontSize: 12,
              }}
            />
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
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={({ cx, cy, payload }) => (
              <circle
                key={payload.index}
                cx={cx}
                cy={cy}
                r={payload.hasViolation ? 6 : 4}
                fill={
                  payload.excluded
                    ? 'hsl(var(--muted))'
                    : payload.hasViolation
                      ? 'hsl(var(--destructive))'
                      : 'hsl(var(--primary))'
                }
                stroke={payload.hasViolation ? 'hsl(var(--destructive))' : 'none'}
                strokeWidth={payload.hasViolation ? 2 : 0}
                className={cn(payload.hasViolation && 'violation-pulse')}
              />
            )}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
