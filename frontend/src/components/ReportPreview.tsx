import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useChartData, useViolations, useCharacteristic } from '@/api/hooks'
import { useTheme } from '@/providers/ThemeProvider'
import { ControlChart } from '@/components/ControlChart'
import { useECharts } from '@/hooks/useECharts'
import type { ReportTemplate, ReportSection } from '@/lib/report-templates'
import type { ChartData, Violation } from '@/types'

interface ReportPreviewProps {
  template: ReportTemplate
  characteristicIds: number[]
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
  className?: string
}

/**
 * Report preview component that renders report sections based on template
 */
export function ReportPreview({ template, characteristicIds, chartOptions, className }: ReportPreviewProps) {
  const primaryCharId = characteristicIds[0]
  const { brandConfig } = useTheme()

  // Fetch data for primary characteristic using the provided chart options
  const { data: chartData, isLoading: chartLoading } = useChartData(primaryCharId || 0, chartOptions)
  const { data: characteristic } = useCharacteristic(primaryCharId || 0)
  const { data: violations, isLoading: violationsLoading } = useViolations({
    characteristic_id: primaryCharId || undefined,
    per_page: 50,
  })

  const isLoading = chartLoading || violationsLoading

  if (!primaryCharId) {
    return (
      <div className={cn('bg-card border border-border rounded-xl p-8 text-center text-muted-foreground', className)}>
        Select at least one characteristic to preview the report
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={cn('bg-card border border-border rounded-xl p-8 text-center text-muted-foreground', className)}>
        Loading report data...
      </div>
    )
  }

  return (
    <div className={cn('bg-white dark:bg-card border border-border rounded-xl shadow-sm overflow-hidden', className)}>
      <div className="p-6 space-y-6" id="report-content">
        {/* Report Header with Brand Logo */}
        <div className="flex items-center justify-between border-b border-border pb-4 mb-6">
          <div className="flex items-center gap-3">
            <img
              src={brandConfig.logoUrl || '/openspc-isometric-light.png'}
              alt={`${brandConfig.appName} logo`}
              className="h-8 w-8 object-contain"
            />
            <div>
              <h1 className="text-lg font-bold">{brandConfig.appName}</h1>
              <p className="text-xs text-muted-foreground">SPC Report</p>
            </div>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>Generated: {new Date().toLocaleString()}</div>
            {characteristic && <div>Characteristic: {characteristic.name}</div>}
          </div>
        </div>

        {template.sections.map((section) => (
          <ReportSectionComponent
            key={section}
            section={section}
            template={template}
            chartData={chartData}
            characteristic={characteristic}
            violations={violations?.items || []}
            characteristicIds={characteristicIds}
            chartOptions={chartOptions}
          />
        ))}
      </div>
    </div>
  )
}

interface SectionProps {
  section: ReportSection
  template: ReportTemplate
  chartData?: ChartData
  characteristic?: { name: string; id: number }
  violations: Violation[]
  characteristicIds: number[]
  chartOptions?: {
    limit?: number
    startDate?: string
    endDate?: string
  }
}

function ReportSectionComponent({
  section,
  template,
  chartData,
  characteristic,
  violations,
  characteristicIds,
  chartOptions,
}: SectionProps) {
  switch (section) {
    case 'header':
      return (
        <div className="border-b border-border pb-4">
          <h1 className="text-2xl font-bold">{template.name}</h1>
          <p className="text-muted-foreground mt-1">{template.description}</p>
          <div className="mt-2 text-sm text-muted-foreground">
            {characteristic && (
              <span>Characteristic: <span className="font-medium text-foreground">{characteristic.name}</span></span>
            )}
            {characteristicIds.length > 1 && (
              <span className="ml-4">+ {characteristicIds.length - 1} more</span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Generated: {new Date().toLocaleString()}
          </div>
        </div>
      )

    case 'controlChart':
      if (!chartData || characteristicIds.length === 0) return null
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Control Chart</h2>
          <div className="h-64">
            <ControlChart characteristicId={characteristicIds[0]} chartOptions={chartOptions} />
          </div>
        </div>
      )

    case 'statistics': {
      if (!chartData) return null
      const stats = calculateStatistics(chartData)
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Mean" value={stats.mean?.toFixed(4) || '-'} />
            <StatCard label="Std Dev" value={stats.stdDev?.toFixed(4) || '-'} />
            <StatCard label="UCL" value={chartData.control_limits.ucl?.toFixed(4) || '-'} />
            <StatCard label="LCL" value={chartData.control_limits.lcl?.toFixed(4) || '-'} />
            <StatCard label="Samples" value={String(chartData.data_points.length)} />
            <StatCard label="In Control" value={`${stats.inControlPct.toFixed(1)}%`} />
            <StatCard label="OOC Points" value={String(stats.oocCount)} />
            <StatCard label="Range" value={stats.range?.toFixed(4) || '-'} />
          </div>
        </div>
      )
    }

    case 'violations':
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Recent Violations</h2>
          {violations.length === 0 ? (
            <p className="text-muted-foreground">No violations recorded</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Rule</th>
                  <th className="text-left py-2">Severity</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {violations.slice(0, 10).map((v) => (
                  <tr key={v.id} className="border-b border-border/50">
                    <td className="py-2">{v.created_at ? new Date(v.created_at).toLocaleDateString() : '-'}</td>
                    <td className="py-2">Rule {v.rule_id}: {v.rule_name}</td>
                    <td className="py-2">{v.severity}</td>
                    <td className="py-2">{v.acknowledged ? 'Acknowledged' : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )

    case 'violationStats': {
      const vStats = {
        total: violations.length,
        pending: violations.filter((v) => !v.acknowledged).length,
        acknowledged: violations.filter((v) => v.acknowledged).length,
        bySeverity: violations.reduce((acc, v) => {
          acc[v.severity] = (acc[v.severity] || 0) + 1
          return acc
        }, {} as Record<string, number>),
      }
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Violation Statistics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Violations" value={String(vStats.total)} />
            <StatCard label="Pending" value={String(vStats.pending)} highlight="destructive" />
            <StatCard label="Acknowledged" value={String(vStats.acknowledged)} />
            <StatCard label="Critical" value={String(vStats.bySeverity['CRITICAL'] || 0)} />
          </div>
        </div>
      )
    }

    case 'violationTable':
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Violation Details</h2>
          {violations.length === 0 ? (
            <p className="text-muted-foreground">No violations found</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Characteristic</th>
                  <th className="text-left py-2">Rule</th>
                  <th className="text-left py-2">Severity</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => (
                  <tr key={v.id} className="border-b border-border/50">
                    <td className="py-2">{v.created_at ? new Date(v.created_at).toLocaleDateString() : '-'}</td>
                    <td className="py-2">{v.characteristic_name || '-'}</td>
                    <td className="py-2">Rule {v.rule_id}</td>
                    <td className="py-2">{v.severity}</td>
                    <td className="py-2">{v.acknowledged ? 'Ack' : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )

    case 'histogram':
      if (!chartData) return null
      return <ReportHistogramSection chartData={chartData} />

    case 'capabilityMetrics':
      if (!chartData) return null
      return <ReportCapabilitySection chartData={chartData} />

    case 'interpretation':
      if (!chartData) return null
      return <ReportInterpretationSection chartData={chartData} />

    case 'trendChart':
      if (!chartData) return null
      return <ReportTrendSection chartData={chartData} />

    case 'samples':
      if (!chartData) return null
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Recent Samples</h2>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="text-left py-2">Timestamp</th>
                <th className="text-right py-2">Mean</th>
                <th className="text-right py-2">Zone</th>
                <th className="text-center py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {chartData.data_points.slice(-10).reverse().map((dp) => (
                <tr key={dp.sample_id} className="border-b border-border/50">
                  <td className="py-2">{new Date(dp.timestamp).toLocaleString()}</td>
                  <td className="py-2 text-right font-mono">{dp.mean.toFixed(4)}</td>
                  <td className="py-2 text-right">{dp.zone.replace('_', ' ')}</td>
                  <td className="py-2 text-center">
                    {dp.violation_rules?.length > 0 ? (
                      <span className="text-destructive">OOC</span>
                    ) : (
                      <span className="text-green-600">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    default:
      return null
  }
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: 'destructive' | 'warning'
}) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          'text-lg font-semibold mt-1',
          highlight === 'destructive' && 'text-destructive',
          highlight === 'warning' && 'text-yellow-600'
        )}
      >
        {value}
      </div>
    </div>
  )
}

function calculateStatistics(chartData: ChartData) {
  const values = chartData.data_points.map((dp) => dp.mean)
  if (values.length === 0) {
    return { mean: null, stdDev: null, range: null, oocCount: 0, inControlPct: 100 }
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)
  const range = Math.max(...values) - Math.min(...values)
  const oocCount = chartData.data_points.filter((dp) => dp.violation_rules?.length > 0).length
  const inControlPct = ((values.length - oocCount) / values.length) * 100

  return { mean, stdDev, range, oocCount, inControlPct }
}

/**
 * Histogram section for reports (ECharts)
 */
function ReportHistogramSection({ chartData }: { chartData: ChartData }) {
  const values = chartData.data_points.filter((p) => !p.excluded).map((p) => p.mean)

  const option = useMemo(() => {
    if (values.length === 0) return null

    const { spec_limits, control_limits } = chartData

    // Calculate domain including all limits so they're always visible
    const allValues = [
      ...values,
      ...(spec_limits.lsl != null ? [spec_limits.lsl] : []),
      ...(spec_limits.usl != null ? [spec_limits.usl] : []),
      ...(control_limits.lcl != null ? [control_limits.lcl] : []),
      ...(control_limits.ucl != null ? [control_limits.ucl] : []),
    ]
    const domainMin = Math.min(...allValues)
    const domainMax = Math.max(...allValues)
    const domainPadding = (domainMax - domainMin) * 0.1

    // Calculate histogram bins
    const binCount = 15
    const binMin = domainMin - domainPadding
    const binMax = domainMax + domainPadding
    const binWidth = (binMax - binMin) / binCount || 1

    const bins = Array.from({ length: binCount }, (_, i) => ({
      binCenter: binMin + (i + 0.5) * binWidth,
      count: 0,
    }))

    values.forEach((value) => {
      const binIndex = Math.min(Math.max(0, Math.floor((value - binMin) / binWidth)), binCount - 1)
      bins[binIndex].count++
    })

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const maxCount = Math.max(...bins.map((b) => b.count))

    // Build reference markLines
    const markLineData: Array<{ xAxis: number; lineStyle: { color: string; width: number; type: string }; label?: { show: boolean } }> = [
      { xAxis: mean, lineStyle: { color: 'hsl(212 100% 35%)', width: 2, type: 'dashed' }, label: { show: false } },
    ]
    if (control_limits.lcl != null)
      markLineData.push({ xAxis: control_limits.lcl, lineStyle: { color: 'hsl(179 50% 59%)', width: 1.5, type: 'dashed' }, label: { show: false } })
    if (control_limits.ucl != null)
      markLineData.push({ xAxis: control_limits.ucl, lineStyle: { color: 'hsl(179 50% 59%)', width: 1.5, type: 'dashed' }, label: { show: false } })
    if (spec_limits.lsl != null)
      markLineData.push({ xAxis: spec_limits.lsl, lineStyle: { color: 'hsl(357 80% 52%)', width: 2, type: 'solid' }, label: { show: false } })
    if (spec_limits.usl != null)
      markLineData.push({ xAxis: spec_limits.usl, lineStyle: { color: 'hsl(357 80% 52%)', width: 2, type: 'solid' }, label: { show: false } })

    return {
      grid: { top: 10, right: 30, left: 40, bottom: 30 },
      xAxis: {
        type: 'value' as const,
        min: binMin,
        max: binMax,
        axisLabel: { fontSize: 10, formatter: (v: number) => v.toFixed(2) },
        splitLine: { show: true, lineStyle: { type: 'dashed' as const, color: 'hsl(240 6% 90%)' } },
      },
      yAxis: {
        type: 'value' as const,
        max: Math.ceil(maxCount * 1.1),
        axisLabel: { fontSize: 10 },
      },
      tooltip: {
        trigger: 'item' as const,
        formatter: (params: { data: [number, number] }) => {
          return `Value: ${params.data[0].toFixed(3)}<br/>Count: ${params.data[1]}`
        },
      },
      series: [
        {
          type: 'bar' as const,
          data: bins.map((b) => [b.binCenter, b.count]),
          barWidth: `${(100 / binCount) * 0.8}%`,
          itemStyle: { color: 'hsl(212 100% 45%)', opacity: 0.7 },
          markLine: {
            silent: true,
            symbol: 'none',
            data: markLineData,
          },
        },
      ],
    }
  }, [values, chartData])

  const { containerRef } = useECharts({ option, notMerge: true })

  if (values.length === 0) return null

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const { spec_limits, control_limits } = chartData

  return (
    <div className="border border-border rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">Distribution Histogram</h2>
      <div className="h-48 relative">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
      <div className="flex justify-center gap-6 mt-2 text-xs text-muted-foreground">
        <span>Mean: {mean.toFixed(4)}</span>
        {control_limits.lcl != null && <span className="text-teal-600">LCL: {control_limits.lcl.toFixed(4)}</span>}
        {control_limits.ucl != null && <span className="text-teal-600">UCL: {control_limits.ucl.toFixed(4)}</span>}
        {spec_limits.lsl != null && <span className="text-destructive">LSL: {spec_limits.lsl}</span>}
        {spec_limits.usl != null && <span className="text-destructive">USL: {spec_limits.usl}</span>}
      </div>
    </div>
  )
}

/**
 * Capability metrics section for reports
 */
function ReportCapabilitySection({ chartData }: { chartData: ChartData }) {
  const values = chartData.data_points.filter((p) => !p.excluded).map((p) => p.mean)
  if (values.length < 2) return null

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1)
  const stdDev = Math.sqrt(variance)

  const { spec_limits, control_limits, zone_boundaries } = chartData
  const usl = spec_limits.usl
  const lsl = spec_limits.lsl
  const centerLine = control_limits.center_line

  let cp = 0, cpk = 0, pp = 0, ppk = 0

  if (usl !== null && lsl !== null && stdDev > 0) {
    // Within sigma (from control chart)
    const withinSigma = zone_boundaries.plus_1_sigma && centerLine
      ? zone_boundaries.plus_1_sigma - centerLine
      : stdDev

    // Cp/Cpk (potential capability)
    cp = (usl - lsl) / (6 * withinSigma)
    const cpu = (usl - mean) / (3 * withinSigma)
    const cpl = (mean - lsl) / (3 * withinSigma)
    cpk = Math.min(cpu, cpl)

    // Pp/Ppk (overall performance)
    pp = (usl - lsl) / (6 * stdDev)
    const ppu = (usl - mean) / (3 * stdDev)
    const ppl = (mean - lsl) / (3 * stdDev)
    ppk = Math.min(ppu, ppl)
  }

  const getCapabilityStatus = (value: number) => {
    if (value >= 1.33) return { text: 'Capable', color: 'text-green-600' }
    if (value >= 1.0) return { text: 'Marginal', color: 'text-yellow-600' }
    return { text: 'Not Capable', color: 'text-destructive' }
  }

  if (!usl || !lsl) {
    return (
      <div className="border border-border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">Process Capability</h2>
        <p className="text-sm text-muted-foreground">
          Capability metrics require specification limits (USL/LSL) to be defined.
        </p>
      </div>
    )
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">Process Capability</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-2xl font-bold">{cp.toFixed(2)}</div>
          <div className="text-sm text-muted-foreground">Cp</div>
          <div className={cn('text-xs', getCapabilityStatus(cp).color)}>{getCapabilityStatus(cp).text}</div>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-2xl font-bold">{cpk.toFixed(2)}</div>
          <div className="text-sm text-muted-foreground">Cpk</div>
          <div className={cn('text-xs', getCapabilityStatus(cpk).color)}>{getCapabilityStatus(cpk).text}</div>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-2xl font-bold">{pp.toFixed(2)}</div>
          <div className="text-sm text-muted-foreground">Pp</div>
          <div className={cn('text-xs', getCapabilityStatus(pp).color)}>{getCapabilityStatus(pp).text}</div>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-2xl font-bold">{ppk.toFixed(2)}</div>
          <div className="text-sm text-muted-foreground">Ppk</div>
          <div className={cn('text-xs', getCapabilityStatus(ppk).color)}>{getCapabilityStatus(ppk).text}</div>
        </div>
      </div>
      <div className="mt-4 text-sm text-muted-foreground">
        <div className="flex gap-4">
          <span>σ (within): {(zone_boundaries.plus_1_sigma && centerLine ? zone_boundaries.plus_1_sigma - centerLine : stdDev).toFixed(4)}</span>
          <span>σ (overall): {stdDev.toFixed(4)}</span>
          <span>n = {values.length}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Interpretation section for reports
 */
function ReportInterpretationSection({ chartData }: { chartData: ChartData }) {
  const values = chartData.data_points.filter((p) => !p.excluded).map((p) => p.mean)
  if (values.length < 2) return null

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1)
  const stdDev = Math.sqrt(variance)

  const { spec_limits } = chartData
  const oocCount = chartData.data_points.filter((dp) => dp.violation_rules?.length > 0).length
  const inControlPct = ((values.length - oocCount) / values.length) * 100

  const interpretations: string[] = []

  // Process stability
  if (inControlPct >= 95) {
    interpretations.push('✓ Process is stable with ' + inControlPct.toFixed(1) + '% of points in control.')
  } else if (inControlPct >= 80) {
    interpretations.push('⚠ Process shows some instability with ' + (100 - inControlPct).toFixed(1) + '% out-of-control points.')
  } else {
    interpretations.push('✗ Process is unstable with ' + (100 - inControlPct).toFixed(1) + '% out-of-control points. Investigation recommended.')
  }

  // Centering
  if (spec_limits.target) {
    const offset = Math.abs(mean - spec_limits.target)
    const tolerance = spec_limits.usl && spec_limits.lsl ? (spec_limits.usl - spec_limits.lsl) / 2 : null
    if (tolerance && offset < tolerance * 0.1) {
      interpretations.push('✓ Process is well-centered on target.')
    } else if (tolerance && offset < tolerance * 0.25) {
      interpretations.push('⚠ Process is slightly off-center from target.')
    } else {
      interpretations.push('✗ Process is significantly off-center. Adjustment recommended.')
    }
  }

  // Variation
  if (spec_limits.usl && spec_limits.lsl) {
    const tolerance = spec_limits.usl - spec_limits.lsl
    const processSpread = 6 * stdDev
    if (processSpread < tolerance * 0.5) {
      interpretations.push('✓ Process variation is well within specification limits.')
    } else if (processSpread < tolerance * 0.8) {
      interpretations.push('⚠ Process variation is acceptable but should be monitored.')
    } else {
      interpretations.push('✗ Process variation is too high relative to specifications.')
    }
  }

  return (
    <div className="border border-border rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">Interpretation</h2>
      <ul className="space-y-2 text-sm">
        {interpretations.map((text, i) => (
          <li key={i}>{text}</li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Trend chart section for reports (ECharts)
 */
function ReportTrendSection({ chartData }: { chartData: ChartData }) {
  const dataPoints = chartData.data_points.filter((p) => !p.excluded)
  const windowSize = 5

  const option = useMemo(() => {
    if (dataPoints.length < 5) return null

    // Calculate moving average (5-point)
    const trendData = dataPoints.map((dp, i) => {
      const windowStart = Math.max(0, i - windowSize + 1)
      const windowSlice = dataPoints.slice(windowStart, i + 1)
      const ma = windowSlice.reduce((sum, p) => sum + p.mean, 0) / windowSlice.length
      return {
        date: new Date(dp.timestamp).toLocaleDateString(),
        timestamp: dp.timestamp,
        value: dp.mean,
        ma: i >= windowSize - 1 ? ma : null,
      }
    })

    const { control_limits } = chartData
    const values = dataPoints.map((p) => p.mean)
    const minVal = Math.min(...values, control_limits.lcl ?? Infinity)
    const maxVal = Math.max(...values, control_limits.ucl ?? -Infinity)
    const padding = (maxVal - minVal) * 0.1

    // Build markLine data for control limits
    const markLineData: Array<{ yAxis: number; lineStyle: { color: string; width: number; type: string }; label?: { show: boolean } }> = []
    if (control_limits.ucl != null)
      markLineData.push({ yAxis: control_limits.ucl, lineStyle: { color: 'hsl(179 50% 59%)', width: 1.5, type: 'dashed' }, label: { show: false } })
    if (control_limits.lcl != null)
      markLineData.push({ yAxis: control_limits.lcl, lineStyle: { color: 'hsl(179 50% 59%)', width: 1.5, type: 'dashed' }, label: { show: false } })
    if (control_limits.center_line != null)
      markLineData.push({ yAxis: control_limits.center_line, lineStyle: { color: 'hsl(104 55% 40%)', width: 1, type: 'dashed' }, label: { show: false } })

    return {
      grid: { top: 10, right: 20, left: 40, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: trendData.map((d) => d.date),
        axisLabel: { fontSize: 9, interval: Math.max(0, Math.floor(trendData.length / 6)) },
      },
      yAxis: {
        type: 'value' as const,
        min: minVal - padding,
        max: maxVal + padding,
        axisLabel: { fontSize: 10, formatter: (v: number) => v.toFixed(2) },
        splitLine: { lineStyle: { type: 'dashed' as const, color: 'hsl(240 6% 90%)' } },
      },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: Array<{ data: number | null; seriesName: string; axisValue: string }>) => {
          const item = trendData[params[0]?.axisValue ? trendData.findIndex((d) => d.date === params[0].axisValue) : 0]
          if (!item) return ''
          let html = `${new Date(item.timestamp).toLocaleString()}<br/>Value: ${item.value.toFixed(4)}`
          if (item.ma != null) html += `<br/>MA(${windowSize}): ${item.ma.toFixed(4)}`
          return html
        },
      },
      series: [
        {
          name: 'Value',
          type: 'line' as const,
          data: trendData.map((d) => d.value),
          smooth: false,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: { color: 'hsl(212 100% 45%)', width: 1 },
          itemStyle: { color: 'hsl(212 100% 45%)' },
          markLine: markLineData.length > 0 ? { silent: true, symbol: 'none', data: markLineData } : undefined,
        },
        {
          name: 'Moving Avg',
          type: 'line' as const,
          data: trendData.map((d) => d.ma),
          smooth: true,
          symbol: 'none',
          lineStyle: { color: 'hsl(25 95% 53%)', width: 2 },
          itemStyle: { color: 'hsl(25 95% 53%)' },
        },
      ],
    }
  }, [dataPoints, chartData])

  const { containerRef } = useECharts({ option, notMerge: true })

  if (dataPoints.length < 5) return null

  return (
    <div className="border border-border rounded-lg p-4">
      <h2 className="text-lg font-semibold mb-4">Trend Analysis</h2>
      <div className="h-48 relative">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
      <div className="flex justify-center gap-6 mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-blue-500 inline-block" /> Values
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-orange-500 inline-block" /> {windowSize}-Point Moving Avg
        </span>
      </div>
    </div>
  )
}

export default ReportPreview
