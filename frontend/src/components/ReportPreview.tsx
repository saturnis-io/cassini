import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { useChartData, useViolations, useCharacteristic, useAnnotations } from '@/api/hooks'
import { useTheme } from '@/providers/ThemeProvider'
import type { ReportTemplate, ReportSection } from '@/lib/report-templates'
import type { ChartData, Violation, Annotation } from '@/types'
import {
  ReportHeader,
  ReportExecutiveSummary,
  ReportControlChart,
  ReportStatistics,
  ReportViolationsList,
  ReportViolationStats,
  ReportViolationTable,
  ReportCapabilitySection,
  ReportHistogramSection,
  ReportInterpretationSection,
  ReportTrendSection,
  ReportViolationTrendSection,
  ReportAnnotations,
  ReportSamples,
  ReportCapabilityScorecard,
  ReportRiskRanking,
  ReportTrendNarrative,
  ReportMeasurementSystemHealth,
  ReportDOEFindings,
  ReportFAIStatus,
} from '@/components/report-sections'

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
  const { formatDateTime } = useDateFormat()

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
  const isPlantScoped = template.scope === 'plant'

  if (!primaryCharId && !isPlantScoped) {
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

  if (isLoading && !isPlantScoped) {
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
            <div>Generated: {formatDateTime(new Date())}</div>
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
        <ReportHeader
          template={template}
          characteristic={characteristic}
          characteristicIds={characteristicIds}
        />
      )
    case 'executiveSummary':
      return (
        <ReportExecutiveSummary
          chartData={chartData}
          violations={violations}
          characteristicId={characteristicId}
          chartOptions={chartOptions}
        />
      )
    case 'capabilityScorecard':
      return <ReportCapabilityScorecard />
    case 'riskRanking':
      return <ReportRiskRanking />
    case 'controlChart':
      return (
        <ReportControlChart
          chartData={chartData}
          characteristicIds={characteristicIds}
          chartOptions={chartOptions}
        />
      )
    case 'statistics':
      return <ReportStatistics chartData={chartData} />
    case 'violations':
      return <ReportViolationsList violations={violations} />
    case 'violationStats':
      return <ReportViolationStats violations={violations} />
    case 'violationTable':
      return <ReportViolationTable violations={violations} />
    case 'histogram':
      if (!chartData) return null
      return <ReportHistogramSection chartData={chartData} characteristicId={characteristicId} />
    case 'capabilityMetrics':
      return (
        <ReportCapabilitySection
          characteristicId={characteristicId}
          chartData={chartData}
          chartOptions={chartOptions}
        />
      )
    case 'interpretation':
      if (!chartData) return null
      return <ReportInterpretationSection chartData={chartData} />
    case 'trendChart':
      if (!chartData) return null
      return <ReportTrendSection chartData={chartData} />
    case 'violationTrend':
      return <ReportViolationTrendSection violations={violations} />
    case 'annotations':
      return <ReportAnnotations annotations={annotations} />
    case 'samples':
      return <ReportSamples chartData={chartData} />
    case 'trendNarrative':
      return <ReportTrendNarrative chartData={chartData} />
    case 'measurementSystemHealth':
      return <ReportMeasurementSystemHealth characteristicId={characteristicId} />
    case 'doeFindings':
      return <ReportDOEFindings characteristicId={characteristicId} />
    case 'faiStatus':
      return <ReportFAIStatus characteristicId={characteristicId} />
    default:
      return null
  }
}

export default ReportPreview
