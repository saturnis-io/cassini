import { useMemo } from 'react'
import {
  assessTrend,
  type NarrativeItem,
  type NarrativeSeverity,
} from '@/lib/narrative-engine'
import type { ChartData } from '@/types'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const SEVERITY_ICONS: Record<NarrativeSeverity, typeof CheckCircle2> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
}

const SEVERITY_COLORS: Record<NarrativeSeverity, string> = {
  good: 'text-success',
  warning: 'text-warning',
  critical: 'text-destructive',
}

interface ReportTrendNarrativeProps {
  chartData?: ChartData
}

export function ReportTrendNarrative({ chartData }: ReportTrendNarrativeProps) {
  const items = useMemo(() => {
    if (!chartData) return []
    return assessTrend(chartData)
  }, [chartData])

  if (!chartData || items.length === 0) return null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <TrendingUp className="h-5 w-5" />
        Trend Analysis
      </h2>

      <div className="space-y-2">
        {items.map((item, i) => (
          <TrendNarrativeRow key={i} item={item} />
        ))}
      </div>
    </div>
  )
}

function TrendNarrativeRow({ item }: { item: NarrativeItem }) {
  const Icon = SEVERITY_ICONS[item.severity]
  const color = SEVERITY_COLORS[item.severity]

  return (
    <div className="flex items-start gap-2 rounded-md px-2 py-1.5">
      <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', color)} />
      <span className="text-foreground text-sm">{item.text}</span>
    </div>
  )
}
