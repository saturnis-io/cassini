import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useCapability } from '@/api/hooks'
import { Explainable } from '@/components/Explainable'
import {
  generateExecutiveSummary,
  type NarrativeItem,
  type NarrativeSeverity,
} from '@/lib/narrative-engine'
import type { ExplainChartOptions } from '@/api/explain.api'
import type { ChartData, Violation } from '@/types'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  TrendingDown,
  Activity,
} from 'lucide-react'

const SEVERITY_CONFIG: Record<
  NarrativeSeverity,
  { icon: typeof CheckCircle2; color: string; bg: string; label: string }
> = {
  good: {
    icon: CheckCircle2,
    color: 'text-success',
    bg: 'bg-success/10 border-success/30',
    label: 'Healthy',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-warning',
    bg: 'bg-warning/10 border-warning/30',
    label: 'Needs Attention',
  },
  critical: {
    icon: XCircle,
    color: 'text-destructive',
    bg: 'bg-destructive/10 border-destructive/30',
    label: 'Action Required',
  },
}

const CATEGORY_ICONS: Record<string, typeof Activity> = {
  stability: Activity,
  capability: TrendingDown,
  centering: TrendingDown,
  variation: Activity,
  measurement: Activity,
  violations: AlertTriangle,
  trend: TrendingDown,
}

interface ReportExecutiveSummaryProps {
  chartData?: ChartData
  violations: Violation[]
  characteristicId?: number
  chartOptions?: { limit?: number; startDate?: string; endDate?: string }
}

export function ReportExecutiveSummary({
  chartData,
  violations,
  characteristicId,
  chartOptions: _chartOptions,
}: ReportExecutiveSummaryProps) {
  const { data: capability } = useCapability(characteristicId ?? 0)

  const summary = useMemo(() => {
    if (!chartData) return null

    return generateExecutiveSummary(
      chartData,
      capability ?? {
        cp: null,
        cpk: null,
        pp: null,
        ppk: null,
        sample_count: 0,
        sigma_within: null,
        usl: null,
        lsl: null,
      },
      violations.map((v) => ({
        rule_id: v.rule_id,
        rule_name: v.rule_name,
        severity: v.severity,
        acknowledged: v.acknowledged,
        created_at: v.created_at,
      })),
    )
  }, [chartData, capability, violations])

  if (!summary) return null

  const config = SEVERITY_CONFIG[summary.overallHealth]
  const StatusIcon = config.icon

  // Capability values come from useCapability() which uses stored sigma (no chart options).
  // Do NOT pass chartOptions — that triggers the chart-view explain path which computes
  // different values. See L-007 / L-013.
  const explainOpts: ExplainChartOptions | undefined = undefined

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <ShieldCheck className="h-5 w-5" />
        Executive Summary
      </h2>

      {/* Overall health indicator */}
      <div
        className={cn(
          'mb-4 flex items-center gap-3 rounded-lg border px-4 py-3',
          config.bg,
        )}
      >
        <StatusIcon className={cn('h-6 w-6 shrink-0', config.color)} />
        <div>
          <div className={cn('text-sm font-bold', config.color)}>
            {config.label}
          </div>
          <div className="text-foreground text-sm">{summary.recommendation}</div>
        </div>
      </div>

      {/* Narrative items */}
      <div className="space-y-2">
        {summary.items.map((item, i) => (
          <NarrativeRow
            key={i}
            item={item}
            characteristicId={characteristicId}
            explainOpts={explainOpts}
          />
        ))}
      </div>
    </div>
  )
}

function NarrativeRow({
  item,
  characteristicId,
  explainOpts,
}: {
  item: NarrativeItem
  characteristicId?: number
  explainOpts?: ExplainChartOptions
}) {
  const severityConfig = SEVERITY_CONFIG[item.severity]
  const SeverityIcon = severityConfig.icon
  const CategoryIcon = CATEGORY_ICONS[item.category] ?? Activity

  // Wrap the metric value in Explainable if we have a recognized metric + characteristic
  const explainableMetrics = ['Cpk', 'Ppk', 'Cp', 'Pp', 'Cpm']
  const canExplain =
    characteristicId && item.metric && explainableMetrics.includes(item.metric)

  return (
    <div className="flex items-start gap-2 rounded-md px-2 py-1.5">
      <SeverityIcon
        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', severityConfig.color)}
      />
      <CategoryIcon className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="text-foreground text-sm">
        {canExplain && item.value != null ? (
          <ExplainableNarrative
            text={item.text}
            metric={item.metric!}
            value={item.value}
            characteristicId={characteristicId!}
            explainOpts={explainOpts}
          />
        ) : (
          item.text
        )}
      </span>
    </div>
  )
}

/**
 * Wraps the metric value within the narrative text in an Explainable component.
 * Finds the metric mention (e.g., "Cpk = 1.23") and makes it clickable.
 */
function ExplainableNarrative({
  text,
  metric,
  value,
  characteristicId,
  explainOpts,
}: {
  text: string
  metric: string
  value: number
  characteristicId: number
  explainOpts?: ExplainChartOptions
}) {
  // Find the metric value pattern in the text (e.g., "Cpk = 1.23")
  const valueStr = value.toFixed(2)
  const pattern = `${metric} = ${valueStr}`
  const idx = text.indexOf(pattern)

  if (idx === -1) {
    // Fallback: wrap the whole text
    return <>{text}</>
  }

  const before = text.slice(0, idx)
  const after = text.slice(idx + pattern.length)

  return (
    <>
      {before}
      <Explainable
        metric={metric.toLowerCase()}
        resourceId={characteristicId}
        chartOptions={explainOpts}
      >
        {pattern}
      </Explainable>
      {after}
    </>
  )
}
