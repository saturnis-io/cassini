import { useState } from 'react'
import {
  X,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Eye,
  Lightbulb,
  Clock,
  Cpu,
  Zap,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpTooltip } from '@/components/HelpTooltip'
import { useDateFormat } from '@/hooks/useDateFormat'
import { useLatestInsight, useInsightHistory, useAnalyzeChart } from '@/api/hooks'

interface AIInsightPanelProps {
  charId: number
  onClose?: () => void
}

/**
 * AIInsightPanel -- detailed display of the latest AI insight for a characteristic.
 * Shows summary, collapsible sections for patterns/risks/recommendations, and metadata.
 */
export function AIInsightPanel({ charId, onClose }: AIInsightPanelProps) {
  const { formatDateTime } = useDateFormat()
  const { data: insight, isLoading } = useLatestInsight(charId)
  const { data: history } = useInsightHistory(charId)
  const analyzeMutation = useAnalyzeChart()

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    patterns: true,
    risks: true,
    recommendations: true,
  })

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="bg-muted h-5 w-32 animate-pulse rounded" />
          {onClose && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-4 space-y-3">
          <div className="bg-muted h-3 w-full animate-pulse rounded" />
          <div className="bg-muted h-3 w-5/6 animate-pulse rounded" />
          <div className="bg-muted h-3 w-3/4 animate-pulse rounded" />
          <div className="mt-4 bg-muted h-20 w-full animate-pulse rounded" />
          <div className="bg-muted h-20 w-full animate-pulse rounded" />
        </div>
      </div>
    )
  }

  // No insight available
  if (!insight) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-foreground text-sm font-medium">AI Insight</h3>
          {onClose && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex flex-col items-center py-8">
          <Sparkles className="text-muted-foreground/40 h-10 w-10" />
          <p className="text-muted-foreground mt-3 text-center text-sm">
            No AI analysis available yet.
          </p>
          <button
            onClick={() => analyzeMutation.mutate(charId)}
            disabled={analyzeMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium"
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Run Analysis
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
          AI Insight
          <HelpTooltip helpKey="ai-insights" />
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => analyzeMutation.mutate(charId)}
            disabled={analyzeMutation.isPending}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
          >
            {analyzeMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Re-analyze
          </button>
          {onClose && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="border-b border-border p-4">
        <p className="text-foreground text-sm leading-relaxed">{insight.summary}</p>
      </div>

      {/* Collapsible sections */}
      <div className="divide-y divide-border">
        {/* Patterns */}
        <CollapsibleSection
          title="Patterns"
          icon={<Eye className="h-3.5 w-3.5" />}
          items={insight.patterns}
          isExpanded={expandedSections.patterns}
          onToggle={() => toggleSection('patterns')}
        />

        {/* Risks */}
        <CollapsibleSection
          title="Risks"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          items={insight.risks}
          isExpanded={expandedSections.risks}
          onToggle={() => toggleSection('risks')}
          itemClassName="text-amber-700 dark:text-amber-400"
        />

        {/* Recommendations */}
        <CollapsibleSection
          title="Recommendations"
          icon={<Lightbulb className="h-3.5 w-3.5" />}
          items={insight.recommendations}
          isExpanded={expandedSections.recommendations}
          onToggle={() => toggleSection('recommendations')}
          itemClassName="text-emerald-700 dark:text-emerald-400"
        />
      </div>

      {/* Footer: metadata */}
      <div className="border-t border-border bg-muted/30 px-4 py-3">
        <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-[10px]">
          <span className="inline-flex items-center gap-1">
            <Cpu className="h-3 w-3" />
            {insight.provider} / {insight.model}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDateTime(insight.created_at)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {insight.tokens_used} tokens
          </span>
          <span>{insight.latency_ms}ms</span>
        </div>
      </div>

      {/* History count */}
      {history && history.length > 1 && (
        <div className="border-t border-border px-4 py-2">
          <p className="text-muted-foreground text-[10px]">
            {history.length} previous analyses available
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CollapsibleSection
// ---------------------------------------------------------------------------

interface CollapsibleSectionProps {
  title: string
  icon: React.ReactNode
  items: string[]
  isExpanded: boolean
  onToggle: () => void
  itemClassName?: string
}

function CollapsibleSection({
  title,
  icon,
  items,
  isExpanded,
  onToggle,
  itemClassName,
}: CollapsibleSectionProps) {
  if (!items || items.length === 0) return null

  return (
    <div>
      <button
        onClick={onToggle}
        className="hover:bg-muted/50 flex w-full items-center gap-2 px-4 py-2.5 text-left transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="text-muted-foreground h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
        )}
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-foreground text-xs font-medium">{title}</span>
        <span className="text-muted-foreground text-[10px]">({items.length})</span>
      </button>

      {isExpanded && (
        <ul className="space-y-1 px-4 pb-3 pl-10">
          {items.map((item, i) => (
            <li
              key={i}
              className={cn('text-foreground text-xs leading-relaxed', itemClassName)}
            >
              <span className="text-muted-foreground mr-1.5">&#8226;</span>
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
