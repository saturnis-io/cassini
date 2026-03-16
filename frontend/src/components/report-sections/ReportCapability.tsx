import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/providers/ThemeProvider'
import { useCapability } from '@/api/hooks'
import { useStaticChart } from '@/hooks/useStaticChart'
import { Explainable } from '@/components/Explainable'
import { getChartMeasurements } from '@/lib/report-utils'
import type { ExplainChartOptions } from '@/api/explain.api'
import type { ChartData } from '@/types'

interface ReportCapabilitySectionProps {
  characteristicId?: number
  chartData?: ChartData
  chartOptions?: { limit?: number; startDate?: string; endDate?: string }
}

export function ReportCapabilitySection({
  characteristicId,
  chartData,
  chartOptions: _chartOptions,
}: ReportCapabilitySectionProps) {
  const { data: capability, isLoading, error } = useCapability(characteristicId ?? 0, { includeCi: true })

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

  // Capability values are from useCapability() which uses stored sigma (no chart options).
  // Do NOT pass chartOptions to Explainable — that would trigger the chart-view path
  // in the explain API, which computes different values using subgroup means + sample std dev.
  // See L-007: explain API path must match the display path.
  const explainOpts: ExplainChartOptions | undefined = undefined

  const capMetrics: Array<{ key: string; label: string; value: number | null }> = [
    { key: 'cp', label: 'Cp', value: cp },
    { key: 'cpk', label: 'Cpk', value: cpk },
    { key: 'pp', label: 'Pp', value: pp },
    { key: 'ppk', label: 'Ppk', value: ppk },
  ]

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
        {capMetrics.map((m) => (
          <div key={m.key} className="bg-muted/50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold">
              <Explainable
                metric={m.key}
                resourceId={characteristicId!}
                chartOptions={explainOpts}
              >
                {formatValue(m.value)}
              </Explainable>
            </div>
            <div className="text-muted-foreground text-sm">{m.label}</div>
            <div className={cn('text-xs', getCapabilityStatus(m.value).color)}>
              {getCapabilityStatus(m.value).text}
            </div>
          </div>
        ))}
      </div>
      {/* Cpk Confidence Interval */}
      {capability.cpk_ci && (
        <div className="bg-muted/30 mt-4 rounded-lg p-3">
          <h3 className="mb-1 text-sm font-medium">Cpk Confidence Interval</h3>
          <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
            <span>
              {(capability.ci_confidence ?? 0.95) * 100}% CI: [{capability.cpk_ci[0].toFixed(3)}, {capability.cpk_ci[1].toFixed(3)}]
            </span>
            {capability.ci_method && (
              <span className="text-xs">Method: {capability.ci_method}</span>
            )}
          </div>
        </div>
      )}
      {/* Expected PPM (ISO 3534) */}
      {(capability.ppm_within_expected != null || capability.ppm_overall_expected != null) && (
        <div className="bg-muted/30 mt-3 rounded-lg p-3">
          <h3 className="mb-1 text-sm font-medium">Expected PPM (ISO 3534)</h3>
          <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
            {capability.ppm_within_expected != null && (
              <Explainable
                metric="cpk"
                resourceId={characteristicId!}
                chartOptions={explainOpts}
              >
                <span>Within: {capability.ppm_within_expected.toFixed(1)} PPM</span>
              </Explainable>
            )}
            {capability.ppm_overall_expected != null && (
              <Explainable
                metric="ppk"
                resourceId={characteristicId!}
                chartOptions={explainOpts}
              >
                <span>Overall: {capability.ppm_overall_expected.toFixed(1)} PPM</span>
              </Explainable>
            )}
          </div>
        </div>
      )}
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
 * Histogram section for reports (ECharts).
 * Always uses RAW measurement values (not Z-score transformed) so the
 * histogram is in natural units. Spec limits come from the capability API
 * (raw) rather than chartData (which may be Z-score transformed for
 * short-run standardized mode).
 */
export function ReportHistogramSection({
  chartData,
  characteristicId,
}: {
  chartData: ChartData
  characteristicId?: number
}) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

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

    // Adaptive bin count: fewer bins for small datasets to keep bars visible
    const binCount = values.length < 30 ? Math.max(5, Math.ceil(Math.sqrt(values.length))) : 15
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
    const yMax = Math.ceil(maxCount * 1.1)

    // Theme-aware colors for markLines
    const meanColor = isDark ? 'hsl(212 100% 65%)' : 'hsl(212 100% 35%)'
    const controlColor = isDark ? 'hsl(179 70% 65%)' : 'hsl(179 50% 45%)'
    const specColor = isDark ? 'hsl(357 90% 65%)' : 'hsl(357 80% 52%)'

    // Convert a data value to a fractional category index for markLine placement
    const valueToCategoryIdx = (v: number): number => {
      return (v - binMin) / binWidth - 0.5
    }

    // Single-point xAxis markLines — ECharts draws these full chart height
    const markLineData: Array<{
      xAxis: number
      lineStyle: { color: string; width: number; type: string }
      label: { show: boolean }
    }> = [
      { xAxis: valueToCategoryIdx(mean), lineStyle: { color: meanColor, width: 2, type: 'dashed' }, label: { show: false } },
      { xAxis: valueToCategoryIdx(rawLCL), lineStyle: { color: controlColor, width: 1.5, type: 'dashed' }, label: { show: false } },
      { xAxis: valueToCategoryIdx(rawUCL), lineStyle: { color: controlColor, width: 1.5, type: 'dashed' }, label: { show: false } },
    ]
    if (rawLSL != null)
      markLineData.push({ xAxis: valueToCategoryIdx(rawLSL), lineStyle: { color: specColor, width: 2, type: 'solid' }, label: { show: false } })
    if (rawUSL != null)
      markLineData.push({ xAxis: valueToCategoryIdx(rawUSL), lineStyle: { color: specColor, width: 2, type: 'solid' }, label: { show: false } })

    const axisColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 10%, 40%)'
    const axisLineColor = isDark ? 'hsl(220, 10%, 35%)' : 'hsl(220, 10%, 80%)'

    // Use category axis for proper bar widths; labels show bin center values
    const categories = bins.map((b) => b.binCenter.toFixed(2))

    return {
      grid: { top: 10, right: 30, left: 40, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: categories,
        axisLabel: {
          fontSize: 10,
          color: axisColor,
          interval: Math.max(0, Math.floor(binCount / 8) - 1),
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        axisTick: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value' as const,
        max: yMax,
        axisLabel: { fontSize: 10, color: axisColor },
        axisLine: { lineStyle: { color: axisLineColor } },
        axisTick: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { type: 'dashed' as const, color: isDark ? 'hsl(220, 10%, 25%)' : 'hsl(240 6% 90%)' } },
      },
      tooltip: {
        trigger: 'item' as const,
        formatter: (params: { data: number; name: string }) => {
          return `Value: ${params.name}<br/>Count: ${params.data}`
        },
      },
      series: [
        {
          type: 'bar' as const,
          data: bins.map((b) => b.count),
          barCategoryGap: '10%',
          itemStyle: { color: isDark ? 'hsl(46, 70%, 58%)' : 'hsl(212 100% 45%)', opacity: 0.85 },
          markLine: {
            silent: true,
            symbol: 'none',
            precision: 10,
            data: markLineData,
          },
        },
      ],
    }
  }, [values, capability, isDark])

  const { containerRef, dataURL, lightDataURL } = useStaticChart({ option, notMerge: true })

  if (values.length === 0) return null

  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const rawLSL = capability?.lsl ?? null
  const rawUSL = capability?.usl ?? null
  const sigmaWithin = capability?.sigma_within ?? null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 text-lg font-semibold">Distribution Histogram</h2>
      <div className="relative h-72">
        {/* Hidden canvas for chart capture; static image shown for print reliability */}
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: dataURL ? 'hidden' : 'visible' }}
        />
        {dataURL && (
          <img
            src={dataURL}
            data-light-src={lightDataURL ?? undefined}
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
