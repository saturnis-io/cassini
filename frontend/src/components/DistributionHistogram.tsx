import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { useChartData } from '@/api/hooks'

interface DistributionHistogramProps {
  characteristicId: number
}

function calculateHistogramBins(values: number[], binCount: number = 15) {
  if (values.length === 0) return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  const binWidth = (max - min) / binCount || 1

  const bins = Array.from({ length: binCount }, (_, i) => ({
    binStart: min + i * binWidth,
    binEnd: min + (i + 1) * binWidth,
    binCenter: min + (i + 0.5) * binWidth,
    count: 0,
  }))

  values.forEach((value) => {
    const binIndex = Math.min(
      Math.floor((value - min) / binWidth),
      binCount - 1
    )
    if (binIndex >= 0) {
      bins[binIndex].count++
    }
  })

  return bins
}

function calculateStatistics(values: number[]) {
  if (values.length === 0) return { mean: 0, stdDev: 0, cp: 0, cpk: 0 }

  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1)
  const stdDev = Math.sqrt(variance)

  return { mean, stdDev, n }
}

export function DistributionHistogram({ characteristicId }: DistributionHistogramProps) {
  const { data: chartData, isLoading } = useChartData(characteristicId, 100)

  if (isLoading) {
    return (
      <div className="h-full border rounded-lg bg-card flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!chartData || chartData.data_points.length === 0) {
    return (
      <div className="h-full border rounded-lg bg-card flex items-center justify-center">
        <div className="text-muted-foreground">No data</div>
      </div>
    )
  }

  const values = chartData.data_points.filter((p) => !p.excluded).map((p) => p.mean)
  const bins = calculateHistogramBins(values)
  const stats = calculateStatistics(values)

  const { spec_limits } = chartData
  const usl = spec_limits.usl
  const lsl = spec_limits.lsl

  // Calculate Cp and Cpk if we have spec limits
  let cp = 0
  let cpk = 0
  if (usl && lsl && stats.stdDev > 0) {
    cp = (usl - lsl) / (6 * stats.stdDev)
    const cpu = (usl - stats.mean) / (3 * stats.stdDev)
    const cpl = (stats.mean - lsl) / (3 * stats.stdDev)
    cpk = Math.min(cpu, cpl)
  }

  return (
    <div className="h-full border rounded-lg bg-card p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-sm">Distribution</h3>
        <div className="flex gap-4 text-xs text-muted-foreground">
          {cp > 0 && <span>Cp: {cp.toFixed(2)}</span>}
          {cpk > 0 && <span>Cpk: {cpk.toFixed(2)}</span>}
          <span>n: {stats.n}</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={bins} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="binCenter"
            tick={{ fontSize: 10 }}
            tickFormatter={(value) => value.toFixed(2)}
          />
          <YAxis tick={{ fontSize: 10 }} />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const bin = payload[0].payload
              return (
                <div className="bg-popover border rounded-lg p-2 text-xs shadow-lg">
                  <div>Range: {bin.binStart.toFixed(3)} - {bin.binEnd.toFixed(3)}</div>
                  <div>Count: {bin.count}</div>
                </div>
              )
            }}
          />

          {/* Spec limits */}
          {lsl && (
            <ReferenceLine
              x={lsl}
              stroke="hsl(var(--destructive))"
              strokeDasharray="5 5"
              label={{ value: 'LSL', position: 'top', fontSize: 10 }}
            />
          )}
          {usl && (
            <ReferenceLine
              x={usl}
              stroke="hsl(var(--destructive))"
              strokeDasharray="5 5"
              label={{ value: 'USL', position: 'top', fontSize: 10 }}
            />
          )}

          <Bar
            dataKey="count"
            fill="hsl(var(--primary))"
            fillOpacity={0.7}
            stroke="hsl(var(--primary))"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
