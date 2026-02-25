import { useMemo, useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useChartData, useViolations, useCharacteristic, useAnnotations, useCapability } from '@/api/hooks'
import { useTheme } from '@/providers/ThemeProvider'
import { ControlChart } from '@/components/ControlChart'
import { CUSUMChart } from '@/components/CUSUMChart'
import { EWMAChart } from '@/components/EWMAChart'
import { useECharts } from '@/hooks/useECharts'
import type { ReportTemplate, ReportSection } from '@/lib/report-templates'
import type { ChartData, Violation, Annotation } from '@/types'

/**
 * Extract measurement values from chart data regardless of chart type.
 * CUSUM/EWMA charts return data in separate arrays with a `measurement` field
 * rather than the standard `data_points[].mean`.
 */
function getChartMeasurements(chartData: ChartData): number[] {
  if (chartData.chart_type === 'cusum' && chartData.cusum_data_points?.length) {
    return chartData.cusum_data_points
      .filter((p) => !p.excluded)
      .map((p) => p.measurement)
  }
  if (chartData.chart_type === 'ewma' && chartData.ewma_data_points?.length) {
    return chartData.ewma_data_points
      .filter((p) => !p.excluded)
      .map((p) => p.measurement)
  }
  return chartData.data_points.filter((p) => !p.excluded).map((p) => p.mean)
}

/** Check whether chart data has any renderable points (any chart type). */
function hasChartPoints(chartData: ChartData): boolean {
  return (
    chartData.data_points.length > 0 ||
    (chartData.cusum_data_points?.length ?? 0) > 0 ||
    (chartData.ewma_data_points?.length ?? 0) > 0
  )
}

/**
 * Hook that wraps useECharts and captures a static PNG data URL from the chart
 * once it renders. For print/report contexts, canvas-based ECharts don't
 * reliably print, so we render a static <img> fallback alongside the
 * hidden canvas container (which drives the capture).
 */
function useStaticChart(opts: Parameters<typeof useECharts>[0]) {
  const { containerRef, chartRef } = useECharts(opts)
  const [dataURL, setDataURL] = useState<string | null>(null)

  // Capture a static image after the chart has rendered
  useEffect(() => {
    // Small delay so ECharts finishes its animation/render cycle
    const timer = setTimeout(() => {
      const chart = chartRef.current
      if (!chart) return
      try {
        const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
        setDataURL(url)
      } catch {
        // Chart may not be ready yet
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [chartRef, opts.option])

  return { containerRef, dataURL }
}

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
export function ReportPreview({
  template,
  characteristicIds,
  chartOptions,
  className,
}: ReportPreviewProps) {
  const primaryCharId = characteristicIds[0]
  const { brandConfig } = useTheme()

  // Fetch data for primary characteristic using the provided chart options
  const { data: chartData, isLoading: chartLoading } = useChartData(
    primaryCharId || 0,
    chartOptions,
  )
  const { data: characteristic } = useCharacteristic(primaryCharId || 0)
  const { data: violations, isLoading: violationsLoading } = useViolations({
    characteristic_id: primaryCharId || undefined,
    per_page: 50,
  })
  const { data: annotations } = useAnnotations(primaryCharId || 0, !!primaryCharId)

  const isLoading = chartLoading || violationsLoading

  if (!primaryCharId) {
    return (
      <div
        className={cn(
          'bg-card border-border text-muted-foreground rounded-xl border p-8 text-center',
          className,
        )}
      >
        Select at least one characteristic to preview the report
      </div>
    )
  }

  if (isLoading) {
    return (
      <div
        className={cn(
          'bg-card border-border text-muted-foreground rounded-xl border p-8 text-center',
          className,
        )}
      >
        Loading report data...
      </div>
    )
  }

  return (
    <div
      className={cn('bg-card border-border overflow-hidden rounded-xl border shadow-sm', className)}
    >
      <div className="space-y-6 p-6" id="report-content">
        {/* Report Header with Brand Logo */}
        <div className="border-border mb-6 flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-3">
            <img
              src={brandConfig.logoUrl || '/header-logo.svg'}
              alt={`${brandConfig.appName} logo`}
              className="h-12 w-12 object-contain"
            />
            <div>
              <h1 className="text-lg font-bold">{brandConfig.appName}</h1>
              <p className="text-muted-foreground text-xs">SPC Report</p>
            </div>
          </div>
          <div className="text-muted-foreground text-right text-sm">
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
            annotations={annotations || []}
            characteristicIds={characteristicIds}
            characteristicId={primaryCharId}
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
  annotations: Annotation[]
  characteristicIds: number[]
  characteristicId?: number
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
  annotations,
  characteristicIds,
  characteristicId,
  chartOptions,
}: SectionProps) {
  switch (section) {
    case 'header':
      return (
        <div className="border-border border-b pb-4">
          <h1 className="text-2xl font-bold">{template.name}</h1>
          <p className="text-muted-foreground mt-1">{template.description}</p>
          <div className="text-muted-foreground mt-2 text-sm">
            {characteristic && (
              <span>
                Characteristic:{' '}
                <span className="text-foreground font-medium">{characteristic.name}</span>
              </span>
            )}
            {characteristicIds.length > 1 && (
              <span className="ml-4">+ {characteristicIds.length - 1} more</span>
            )}
          </div>
          <div className="text-muted-foreground mt-1 text-xs">
            Generated: {new Date().toLocaleString()}
          </div>
        </div>
      )

    case 'controlChart':
      if (!chartData || characteristicIds.length === 0) return null
      return (
        <div className="border-border rounded-lg border p-4">
          <h2 className="mb-4 text-lg font-semibold">
            {chartData.chart_type === 'cusum'
              ? 'CUSUM Chart'
              : chartData.chart_type === 'ewma'
                ? 'EWMA Chart'
                : 'Control Chart'}
          </h2>
          <div className="h-64">
            {chartData.chart_type === 'cusum' ? (
              <CUSUMChart characteristicId={characteristicIds[0]} chartOptions={chartOptions} />
            ) : chartData.chart_type === 'ewma' ? (
              <EWMAChart characteristicId={characteristicIds[0]} chartOptions={chartOptions} />
            ) : (
              <ControlChart characteristicId={characteristicIds[0]} chartOptions={chartOptions} />
            )}
          </div>
        </div>
      )

    case 'statistics': {
      if (!chartData || !hasChartPoints(chartData)) return null
      const stats = calculateStatistics(chartData)
      const sampleCount =
        chartData.chart_type === 'cusum'
          ? (chartData.cusum_data_points?.length ?? 0)
          : chartData.chart_type === 'ewma'
            ? (chartData.ewma_data_points?.length ?? 0)
            : chartData.data_points.length
      return (
        <div className="border-border rounded-lg border p-4">
          <h2 className="mb-4 text-lg font-semibold">Statistics</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Mean" value={stats.mean?.toFixed(4) || '-'} />
            <StatCard label="Std Dev" value={stats.stdDev?.toFixed(4) || '-'} />
            <StatCard label="UCL" value={chartData.control_limits.ucl?.toFixed(4) || '-'} />
            <StatCard label="LCL" value={chartData.control_limits.lcl?.toFixed(4) || '-'} />
            <StatCard label="Samples" value={String(sampleCount)} />
            <StatCard label="In Control" value={`${stats.inControlPct.toFixed(1)}%`} />
            <StatCard label="OOC Points" value={String(stats.oocCount)} />
            <StatCard label="Range" value={stats.range?.toFixed(4) || '-'} />
          </div>
        </div>
      )
    }

    case 'violations':
      return (
        <div className="border-border rounded-lg border p-4">
          <h2 className="mb-4 text-lg font-semibold">Recent Violations</h2>
          {violations.length === 0 ? (
            <p className="text-muted-foreground">No violations recorded</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="py-2 text-left">Date</th>
                  <th className="py-2 text-left">Rule</th>
                  <th className="py-2 text-left">Severity</th>
                  <th className="py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {violations.slice(0, 10).map((v) => (
                  <tr key={v.id} className="border-border/50 border-b">
                    <td className="py-2">
                      {v.created_at ? new Date(v.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-2">
                      Rule {v.rule_id}: {v.rule_name}
                    </td>
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
        bySeverity: violations.reduce(
          (acc, v) => {
            acc[v.severity] = (acc[v.severity] || 0) + 1
            return acc
          },
          {} as Record<string, number>,
        ),
      }
      return (
        <div className="border-border rounded-lg border p-4">
          <h2 className="mb-4 text-lg font-semibold">Violation Statistics</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
        <div className="border-border rounded-lg border p-4">
          <h2 className="mb-4 text-lg font-semibold">Violation Details</h2>
          {violations.length === 0 ? (
            <p className="text-muted-foreground">No violations found</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="py-2 text-left">Date</th>
                  <th className="py-2 text-left">Characteristic</th>
                  <th className="py-2 text-left">Rule</th>
                  <th className="py-2 text-left">Severity</th>
                  <th className="py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => (
                  <tr key={v.id} className="border-border/50 border-b">
                    <td className="py-2">
                      {v.created_at ? new Date(v.created_at).toLocaleDateString() : '-'}
                    </td>
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
      return <ReportHistogramSection chartData={chartData} characteristicId={characteristicId} />

    case 'capabilityMetrics':
      return <ReportCapabilitySection characteristicId={characteristicId} chartData={chartData} />

    case 'interpretation':
      if (!chartData) return null
      return <ReportInterpretationSection chartData={chartData} />

    case 'trendChart':
      if (!chartData) return null
      return <ReportTrendSection chartData={chartData} />

    case 'annotations':
      return (
        <div className="border-border rounded-lg border p-4">
          <h2 className="mb-4 text-lg font-semibold">Annotations</h2>
          {annotations.length === 0 ? (
            <p className="text-muted-foreground text-sm">No annotations recorded</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b">
                <tr>
                  <th className="py-2 text-left">Date</th>
                  <th className="py-2 text-left">Type</th>
                  <th className="py-2 text-left">Note</th>
                  <th className="py-2 text-left">Time Range</th>
                  <th className="py-2 text-left">Author</th>
                </tr>
              </thead>
              <tbody>
                {annotations.map((a) => (
                  <tr key={a.id} className="border-border/50 border-b">
                    <td className="py-2">{new Date(a.created_at).toLocaleDateString()}</td>
                    <td className="py-2">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
                          a.annotation_type === 'point'
                            ? 'bg-warning/15 text-warning'
                            : 'bg-primary/15 text-primary',
                        )}
                      >
                        {a.annotation_type === 'point' ? 'Point' : 'Period'}
                      </span>
                    </td>
                    <td className="max-w-[200px] truncate py-2" title={a.text}>
                      {a.text}
                    </td>
                    <td className="text-muted-foreground py-2 text-xs">
                      {a.annotation_type === 'period' && a.start_time && a.end_time ? (
                        <>
                          {new Date(a.start_time).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                          {' — '}
                          {new Date(a.end_time).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </>
                      ) : a.annotation_type === 'point' ? (
                        <span>Sample #{a.sample_id}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-muted-foreground py-2">{a.created_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )

    case 'samples': {
      if (!chartData || !hasChartPoints(chartData)) return null
      // Build a uniform array of {sample_id, timestamp, value, violation_rules} from any chart type
      const sampleRows = (() => {
        if (chartData.chart_type === 'cusum' && chartData.cusum_data_points?.length) {
          return chartData.cusum_data_points.slice(-10).reverse().map((dp) => ({
            sample_id: dp.sample_id,
            timestamp: dp.timestamp,
            value: dp.measurement,
            extra: `C+: ${dp.cusum_high.toFixed(2)} C-: ${dp.cusum_low.toFixed(2)}`,
            violation_rules: dp.violation_rules,
          }))
        }
        if (chartData.chart_type === 'ewma' && chartData.ewma_data_points?.length) {
          return chartData.ewma_data_points.slice(-10).reverse().map((dp) => ({
            sample_id: dp.sample_id,
            timestamp: dp.timestamp,
            value: dp.measurement,
            extra: `EWMA: ${dp.ewma_value.toFixed(4)}`,
            violation_rules: dp.violation_rules,
          }))
        }
        return chartData.data_points.slice(-10).reverse().map((dp) => ({
          sample_id: dp.sample_id,
          timestamp: dp.timestamp,
          value: dp.mean,
          extra: dp.zone?.replace('_', ' ') ?? '',
          violation_rules: dp.violation_rules,
        }))
      })()
      const extraHeader = chartData.chart_type === 'cusum'
        ? 'CUSUM'
        : chartData.chart_type === 'ewma'
          ? 'EWMA'
          : 'Zone'
      return (
        <div className="border-border rounded-lg border p-4">
          <h2 className="mb-4 text-lg font-semibold">Recent Samples</h2>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-2 text-left">Timestamp</th>
                <th className="py-2 text-right">Value</th>
                <th className="py-2 text-right">{extraHeader}</th>
                <th className="py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((dp) => (
                <tr key={dp.sample_id} className="border-border/50 border-b">
                  <td className="py-2">{new Date(dp.timestamp).toLocaleString()}</td>
                  <td className="py-2 text-right font-mono">{dp.value.toFixed(4)}</td>
                  <td className="py-2 text-right">{dp.extra}</td>
                  <td className="py-2 text-center">
                    {dp.violation_rules?.length > 0 ? (
                      <span className="text-destructive">OOC</span>
                    ) : (
                      <span className="text-success">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

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
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={cn(
          'mt-1 text-lg font-semibold',
          highlight === 'destructive' && 'text-destructive',
          highlight === 'warning' && 'text-warning',
        )}
      >
        {value}
      </div>
    </div>
  )
}

function calculateStatistics(chartData: ChartData) {
  const values = getChartMeasurements(chartData)
  if (values.length === 0) {
    return { mean: null, stdDev: null, range: null, oocCount: 0, inControlPct: 100 }
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
  const stdDev = Math.sqrt(variance)
  const range = Math.max(...values) - Math.min(...values)

  // Count OOC from whichever data array is populated
  let oocCount = 0
  if (chartData.chart_type === 'cusum' && chartData.cusum_data_points?.length) {
    oocCount = chartData.cusum_data_points.filter((dp) => dp.violation_rules?.length > 0).length
  } else if (chartData.chart_type === 'ewma' && chartData.ewma_data_points?.length) {
    oocCount = chartData.ewma_data_points.filter((dp) => dp.violation_rules?.length > 0).length
  } else {
    oocCount = chartData.data_points.filter((dp) => dp.violation_rules?.length > 0).length
  }
  const inControlPct = ((values.length - oocCount) / values.length) * 100

  return { mean, stdDev, range, oocCount, inControlPct }
}

/**
 * Histogram section for reports (ECharts).
 * Always uses RAW measurement values (not Z-score transformed) so the
 * histogram is in natural units. Spec limits come from the capability API
 * (raw) rather than chartData (which may be Z-score transformed for
 * short-run standardized mode).
 */
function ReportHistogramSection({
  chartData,
  characteristicId,
}: {
  chartData: ChartData
  characteristicId?: number
}) {
  // Always use raw measurements for the histogram
  const values = getChartMeasurements(chartData)

  // Get raw spec limits and sigma from the capability API
  const { data: capability } = useCapability(characteristicId ?? 0)

  const option = useMemo(() => {
    if (values.length === 0) return null

    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)

    // Use raw limits from capability API (unaffected by short-run transforms)
    const rawLSL = capability?.lsl ?? null
    const rawUSL = capability?.usl ?? null
    const sigmaWithin = capability?.sigma_within ?? stdDev

    // Compute raw control limits: mean ± 3*sigma_within
    const rawLCL = mean - 3 * sigmaWithin
    const rawUCL = mean + 3 * sigmaWithin

    // Domain: data + control limits + spec limits (when within reasonable range)
    const domainValues = [...values, rawLCL, rawUCL]
    const dataSpread = Math.max(...values) - Math.min(...values) || 1
    const specThreshold = dataSpread * 4
    if (rawLSL != null && rawLSL >= Math.min(...values) - specThreshold) {
      domainValues.push(rawLSL)
    }
    if (rawUSL != null && rawUSL <= Math.max(...values) + specThreshold) {
      domainValues.push(rawUSL)
    }

    const domainMin = Math.min(...domainValues)
    const domainMax = Math.max(...domainValues)
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

    const maxCount = Math.max(...bins.map((b) => b.count))

    // Build reference markLines
    const markLineData: Array<{
      xAxis: number
      lineStyle: { color: string; width: number; type: string }
      label?: { show: boolean }
    }> = [
      {
        xAxis: mean,
        lineStyle: { color: 'hsl(212 100% 35%)', width: 2, type: 'dashed' },
        label: { show: false },
      },
      {
        xAxis: rawLCL,
        lineStyle: { color: 'hsl(179 50% 59%)', width: 1.5, type: 'dashed' },
        label: { show: false },
      },
      {
        xAxis: rawUCL,
        lineStyle: { color: 'hsl(179 50% 59%)', width: 1.5, type: 'dashed' },
        label: { show: false },
      },
    ]
    if (rawLSL != null)
      markLineData.push({
        xAxis: rawLSL,
        lineStyle: { color: 'hsl(357 80% 52%)', width: 2, type: 'solid' },
        label: { show: false },
      })
    if (rawUSL != null)
      markLineData.push({
        xAxis: rawUSL,
        lineStyle: { color: 'hsl(357 80% 52%)', width: 2, type: 'solid' },
        label: { show: false },
      })

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
  }, [values, capability])

  const { containerRef, dataURL } = useStaticChart({ option, notMerge: true })

  if (values.length === 0) return null

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const rawLSL = capability?.lsl ?? null
  const rawUSL = capability?.usl ?? null
  const sigmaWithin = capability?.sigma_within ?? null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Distribution Histogram</h2>
      <div className="relative h-48">
        {/* Hidden canvas for chart capture; static image shown for print reliability */}
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: dataURL ? 'hidden' : 'visible' }}
        />
        {dataURL && (
          <img
            src={dataURL}
            alt="Distribution histogram"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      <div className="text-muted-foreground mt-2 flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs">
        <span>Mean: {mean.toFixed(4)}</span>
        {sigmaWithin != null && (
          <>
            <span className="text-accent">LCL: {(mean - 3 * sigmaWithin).toFixed(4)}</span>
            <span className="text-accent">UCL: {(mean + 3 * sigmaWithin).toFixed(4)}</span>
          </>
        )}
        {rawLSL != null && (
          <span className="text-destructive">LSL: {rawLSL}</span>
        )}
        {rawUSL != null && (
          <span className="text-destructive">USL: {rawUSL}</span>
        )}
      </div>
    </div>
  )
}

/**
 * Capability metrics section for reports.
 * Uses the backend capability API (stored_sigma) instead of client-side
 * zone_boundary arithmetic, which produces wrong values for short-run modes.
 */
function ReportCapabilitySection({
  characteristicId,
  chartData,
}: {
  characteristicId?: number
  chartData?: ChartData
}) {
  const { data: capability, isLoading, error } = useCapability(characteristicId ?? 0)

  // Compute overall sigma from chart data for the footer (sample std dev)
  const sigmaOverall = useMemo(() => {
    if (!chartData) return null
    const values = getChartMeasurements(chartData)
    if (values.length < 2) return null
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1)
    return Math.sqrt(variance)
  }, [chartData])

  const getCapabilityStatus = (value: number | null) => {
    if (value == null) return { text: '-', color: 'text-muted-foreground' }
    if (value >= 1.33) return { text: 'Capable', color: 'text-success' }
    if (value >= 1.0) return { text: 'Marginal', color: 'text-warning' }
    return { text: 'Not Capable', color: 'text-destructive' }
  }

  if (!characteristicId) return null

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Process Capability</h2>
        <p className="text-muted-foreground text-sm">Loading capability data...</p>
      </div>
    )
  }

  if (error || !capability) {
    // API returned an error — likely no spec limits defined
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Process Capability</h2>
        <p className="text-muted-foreground text-sm">
          Capability metrics require specification limits (USL/LSL) to be defined.
        </p>
      </div>
    )
  }

  const { cp, cpk, pp, ppk, sample_count, sigma_within, usl, lsl, short_run_mode } = capability

  if (usl == null && lsl == null) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 text-lg font-semibold">Process Capability</h2>
        <p className="text-muted-foreground text-sm">
          Capability metrics require specification limits (USL/LSL) to be defined.
        </p>
      </div>
    )
  }

  const formatValue = (v: number | null) => (v != null ? v.toFixed(2) : '-')

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">
        Process Capability
        {short_run_mode && (
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            ({short_run_mode === 'deviation' ? 'Deviation' : 'Standardized'} mode)
          </span>
        )}
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{formatValue(cp)}</div>
          <div className="text-muted-foreground text-sm">Cp</div>
          <div className={cn('text-xs', getCapabilityStatus(cp).color)}>
            {getCapabilityStatus(cp).text}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{formatValue(cpk)}</div>
          <div className="text-muted-foreground text-sm">Cpk</div>
          <div className={cn('text-xs', getCapabilityStatus(cpk).color)}>
            {getCapabilityStatus(cpk).text}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{formatValue(pp)}</div>
          <div className="text-muted-foreground text-sm">Pp</div>
          <div className={cn('text-xs', getCapabilityStatus(pp).color)}>
            {getCapabilityStatus(pp).text}
          </div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{formatValue(ppk)}</div>
          <div className="text-muted-foreground text-sm">Ppk</div>
          <div className={cn('text-xs', getCapabilityStatus(ppk).color)}>
            {getCapabilityStatus(ppk).text}
          </div>
        </div>
      </div>
      <div className="text-muted-foreground mt-4 text-sm">
        <div className="flex gap-4">
          <span>σ (within): {sigma_within != null ? sigma_within.toFixed(4) : '-'}</span>
          <span>σ (overall): {sigmaOverall != null ? sigmaOverall.toFixed(4) : '-'}</span>
          <span>n = {sample_count}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Interpretation section for reports
 */
function ReportInterpretationSection({ chartData }: { chartData: ChartData }) {
  const values = getChartMeasurements(chartData)
  if (values.length < 2) return null

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1)
  const stdDev = Math.sqrt(variance)

  const { spec_limits } = chartData
  let oocCount = 0
  if (chartData.chart_type === 'cusum' && chartData.cusum_data_points?.length) {
    oocCount = chartData.cusum_data_points.filter((dp) => dp.violation_rules?.length > 0).length
  } else if (chartData.chart_type === 'ewma' && chartData.ewma_data_points?.length) {
    oocCount = chartData.ewma_data_points.filter((dp) => dp.violation_rules?.length > 0).length
  } else {
    oocCount = chartData.data_points.filter((dp) => dp.violation_rules?.length > 0).length
  }
  const inControlPct = ((values.length - oocCount) / values.length) * 100

  const interpretations: string[] = []

  // Process stability
  if (inControlPct >= 95) {
    interpretations.push(
      '✓ Process is stable with ' + inControlPct.toFixed(1) + '% of points in control.',
    )
  } else if (inControlPct >= 80) {
    interpretations.push(
      '⚠ Process shows some instability with ' +
        (100 - inControlPct).toFixed(1) +
        '% out-of-control points.',
    )
  } else {
    interpretations.push(
      '✗ Process is unstable with ' +
        (100 - inControlPct).toFixed(1) +
        '% out-of-control points. Investigation recommended.',
    )
  }

  // Centering
  if (spec_limits.target) {
    const offset = Math.abs(mean - spec_limits.target)
    const tolerance =
      spec_limits.usl && spec_limits.lsl ? (spec_limits.usl - spec_limits.lsl) / 2 : null
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
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Interpretation</h2>
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
  // Build a unified array of {timestamp, value} from whichever data source is populated
  const trendPoints = useMemo(() => {
    if (chartData.chart_type === 'cusum' && chartData.cusum_data_points?.length) {
      return chartData.cusum_data_points
        .filter((p) => !p.excluded)
        .map((p) => ({ timestamp: p.timestamp, value: p.measurement }))
    }
    if (chartData.chart_type === 'ewma' && chartData.ewma_data_points?.length) {
      return chartData.ewma_data_points
        .filter((p) => !p.excluded)
        .map((p) => ({ timestamp: p.timestamp, value: p.measurement }))
    }
    return chartData.data_points
      .filter((p) => !p.excluded)
      .map((p) => ({ timestamp: p.timestamp, value: p.mean }))
  }, [chartData])
  const windowSize = 5

  const option = useMemo(() => {
    if (trendPoints.length < 5) return null

    // Calculate moving average (5-point)
    const trendData = trendPoints.map((dp, i) => {
      const windowStart = Math.max(0, i - windowSize + 1)
      const windowSlice = trendPoints.slice(windowStart, i + 1)
      const ma = windowSlice.reduce((sum, p) => sum + p.value, 0) / windowSlice.length
      return {
        date: new Date(dp.timestamp).toLocaleDateString(),
        timestamp: dp.timestamp,
        value: dp.value,
        ma: i >= windowSize - 1 ? ma : null,
      }
    })

    const { control_limits } = chartData
    const values = trendPoints.map((p) => p.value)
    const minVal = Math.min(...values, control_limits.lcl ?? Infinity)
    const maxVal = Math.max(...values, control_limits.ucl ?? -Infinity)
    const padding = (maxVal - minVal) * 0.1

    // Build markLine data for control limits
    const markLineData: Array<{
      yAxis: number
      lineStyle: { color: string; width: number; type: string }
      label?: { show: boolean }
    }> = []
    if (control_limits.ucl != null)
      markLineData.push({
        yAxis: control_limits.ucl,
        lineStyle: { color: 'hsl(179 50% 59%)', width: 1.5, type: 'dashed' },
        label: { show: false },
      })
    if (control_limits.lcl != null)
      markLineData.push({
        yAxis: control_limits.lcl,
        lineStyle: { color: 'hsl(179 50% 59%)', width: 1.5, type: 'dashed' },
        label: { show: false },
      })
    if (control_limits.center_line != null)
      markLineData.push({
        yAxis: control_limits.center_line,
        lineStyle: { color: 'hsl(104 55% 40%)', width: 1, type: 'dashed' },
        label: { show: false },
      })

    return {
      grid: { top: 10, right: 20, left: 40, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        boundaryGap: false,
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
        formatter: (
          params: Array<{ data: number | null; seriesName: string; axisValue: string }>,
        ) => {
          const item =
            trendData[
              params[0]?.axisValue ? trendData.findIndex((d) => d.date === params[0].axisValue) : 0
            ]
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
          markLine:
            markLineData.length > 0
              ? { silent: true, symbol: 'none', data: markLineData }
              : undefined,
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
  }, [trendPoints, chartData])

  const { containerRef, dataURL } = useStaticChart({ option, notMerge: true })

  if (trendPoints.length < 5) return null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Trend Analysis</h2>
      <div className="relative h-48">
        {/* Hidden canvas for chart capture; static image shown for print reliability */}
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: dataURL ? 'hidden' : 'visible' }}
        />
        {dataURL && (
          <img
            src={dataURL}
            alt="Trend analysis chart"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      <div className="text-muted-foreground mt-2 flex justify-center gap-6 text-xs">
        <span className="flex items-center gap-1">
          <span className="bg-primary inline-block h-0.5 w-3" /> Values
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-warning inline-block h-0.5 w-3" /> {windowSize}-Point Moving Avg
        </span>
      </div>
    </div>
  )
}

export default ReportPreview
