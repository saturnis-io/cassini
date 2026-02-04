import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useChartData, useViolations, useCharacteristic } from '@/api/hooks'
import { ControlChart } from '@/components/ControlChart'
import type { ReportTemplate, ReportSection } from '@/lib/report-templates'
import type { ChartData, Violation } from '@/types'

interface ReportPreviewProps {
  template: ReportTemplate
  characteristicIds: number[]
  className?: string
}

/**
 * Report preview component that renders report sections based on template
 */
export function ReportPreview({ template, characteristicIds, className }: ReportPreviewProps) {
  const primaryCharId = characteristicIds[0]

  // Fetch data for primary characteristic
  const { data: chartData, isLoading: chartLoading } = useChartData(primaryCharId || 0)
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
        {template.sections.map((section) => (
          <ReportSectionComponent
            key={section}
            section={section}
            template={template}
            chartData={chartData}
            characteristic={characteristic}
            violations={violations?.items || []}
            characteristicIds={characteristicIds}
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
}

function ReportSectionComponent({
  section,
  template,
  chartData,
  characteristic,
  violations,
  characteristicIds,
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
      if (!chartData) return null
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Control Chart</h2>
          <div className="h-64">
            <ControlChart data={chartData} showViolationAnnotations={true} />
          </div>
        </div>
      )

    case 'statistics':
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

    case 'violationStats':
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
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Distribution Histogram</h2>
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            [Histogram visualization - coming soon]
          </div>
        </div>
      )

    case 'capabilityMetrics':
      // Placeholder for capability calculations
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Process Capability</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Cp" value="-" />
            <StatCard label="Cpk" value="-" />
            <StatCard label="Pp" value="-" />
            <StatCard label="Ppk" value="-" />
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Capability metrics require specification limits (USL/LSL) to be defined.
          </p>
        </div>
      )

    case 'interpretation':
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Interpretation</h2>
          <p className="text-muted-foreground">
            Automated interpretation and recommendations will appear here based on the analysis results.
          </p>
        </div>
      )

    case 'trendChart':
      return (
        <div className="border border-border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">Trend Analysis</h2>
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            [Trend chart with moving average - coming soon]
          </div>
        </div>
      )

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
                    {dp.violation_rules.length > 0 ? (
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
  const oocCount = chartData.data_points.filter((dp) => dp.violation_rules.length > 0).length
  const inControlPct = ((values.length - oocCount) / values.length) * 100

  return { mean, stdDev, range, oocCount, inControlPct }
}

export default ReportPreview
