import { useMemo } from 'react'
import { BookOpen, AlertTriangle, BarChart3, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useECharts } from '@/hooks/useECharts'
import { useT2Decomposition } from '@/api/hooks/analytics'
import { useShowYourWorkStore } from '@/stores/showYourWorkStore'
import type { ECOption } from '@/lib/echarts'

interface DecompositionTerm {
  variable_index: number
  variable_name: string
  conditional_t2: number
  unconditional_t2: number
  proportion: number
}

interface DecompositionStep {
  label: string
  formula_latex: string
  substitution_latex: string
  result: number
  note: string | null
}

interface DecompositionCitation {
  standard: string
  reference: string
  section: string | null
}

interface DecompositionData {
  group_id: number
  group_name: string
  observation_index: number
  total_t2: number
  ucl: number
  terms: DecompositionTerm[]
  characteristic_names: string[]
  timestamp: string | null
  steps: DecompositionStep[]
  inputs: Record<string, number | string>
  citation: DecompositionCitation | null
  warnings: string[]
}

interface T2DecompositionPanelProps {
  groupId: number
  observationIndex: number | null
  onClose?: () => void
  className?: string
}

function ContributionChart({ terms }: { terms: DecompositionTerm[] }) {
  const chartOption = useMemo<ECOption | null>(() => {
    if (!terms.length) return null

    const style = getComputedStyle(document.documentElement)
    const primaryColor = style.getPropertyValue('--color-primary').trim()
    const mutedFgColor = style.getPropertyValue('--color-muted-foreground').trim()
    const borderColor = style.getPropertyValue('--color-border').trim()

    // Use oklch colors with fallback
    const primary = primaryColor ? `oklch(${primaryColor})` : '#6366f1'
    const mutedFg = mutedFgColor ? `oklch(${mutedFgColor})` : '#9ca3af'
    const border = borderColor ? `oklch(${borderColor})` : '#374151'

    const names = terms.map((t) => t.variable_name)
    const proportions = terms.map((t) => t.proportion * 100)

    return {
      grid: {
        top: 8,
        right: 16,
        bottom: 24,
        left: 8,
        containLabel: true,
      },
      xAxis: {
        type: 'category' as const,
        data: names,
        axisLabel: {
          color: mutedFg,
          fontSize: 11,
          rotate: names.length > 5 ? 30 : 0,
        },
        axisLine: { lineStyle: { color: border } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        name: '% Contribution',
        nameTextStyle: { color: mutedFg, fontSize: 10 },
        axisLabel: {
          color: mutedFg,
          fontSize: 10,
          formatter: '{value}%',
        },
        splitLine: { lineStyle: { color: border, type: 'dashed' as const } },
        max: 100,
        min: 0,
      },
      tooltip: {
        trigger: 'axis' as const,
        formatter: (params: unknown) => {
          const p = (params as { name: string; value: number }[])[0]
          if (!p) return ''
          const term = terms.find((t) => t.variable_name === p.name)
          if (!term) return p.name
          return [
            `<strong>${p.name}</strong>`,
            `Proportion: ${(term.proportion * 100).toFixed(1)}%`,
            `Conditional T\u00b2: ${term.conditional_t2.toFixed(4)}`,
            `Unconditional T\u00b2: ${term.unconditional_t2.toFixed(4)}`,
          ].join('<br/>')
        },
      },
      series: [
        {
          type: 'bar' as const,
          data: proportions,
          itemStyle: {
            color: primary,
            borderRadius: [3, 3, 0, 0],
          },
          barMaxWidth: 48,
        },
      ],
    }
  }, [terms])

  const { containerRef } = useECharts({
    option: chartOption,
    notMerge: true,
  })

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: 200, visibility: chartOption ? 'visible' : 'hidden' }}
    />
  )
}

function ContributionTable({ terms, totalT2 }: { terms: DecompositionTerm[]; totalT2: number }) {
  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-border bg-muted/50 border-b">
            <th className="text-muted-foreground px-3 py-1.5 text-xs font-semibold">Variable</th>
            <th className="text-muted-foreground px-3 py-1.5 text-right text-xs font-semibold">
              Conditional T{'\u00b2'}
            </th>
            <th className="text-muted-foreground px-3 py-1.5 text-right text-xs font-semibold">
              Proportion
            </th>
            <th className="text-muted-foreground px-3 py-1.5 text-right text-xs font-semibold">
              Marginal T{'\u00b2'}
            </th>
          </tr>
        </thead>
        <tbody>
          {terms.map((term) => (
            <tr key={term.variable_index} className="border-border border-b last:border-0">
              <td className="text-foreground px-3 py-1.5 font-medium">{term.variable_name}</td>
              <td className="text-foreground tabular-nums px-3 py-1.5 text-right font-mono text-xs">
                {term.conditional_t2.toFixed(4)}
              </td>
              <td className="text-primary tabular-nums px-3 py-1.5 text-right font-mono text-xs font-semibold">
                {(term.proportion * 100).toFixed(1)}%
              </td>
              <td className="text-muted-foreground tabular-nums px-3 py-1.5 text-right font-mono text-xs">
                {term.unconditional_t2.toFixed(4)}
              </td>
            </tr>
          ))}
          <tr className="bg-muted/30">
            <td className="text-foreground px-3 py-1.5 font-semibold">Total</td>
            <td className="text-foreground tabular-nums px-3 py-1.5 text-right font-mono text-xs font-semibold">
              {totalT2.toFixed(4)}
            </td>
            <td className="text-primary tabular-nums px-3 py-1.5 text-right font-mono text-xs font-semibold">
              100.0%
            </td>
            <td className="px-3 py-1.5" />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function SYWStepCard({ step, index }: { step: DecompositionStep; index: number }) {
  const showYourWorkEnabled = useShowYourWorkStore((s) => s.enabled)
  if (!showYourWorkEnabled) return null

  return (
    <div className="border-border bg-card rounded-lg border p-3">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="bg-primary/10 text-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
          {index + 1}
        </span>
        <span
          className={cn(
            'text-foreground text-sm font-medium',
            'decoration-primary/50 underline decoration-dotted underline-offset-4',
          )}
        >
          {step.label}
        </span>
      </div>
      <div className="space-y-1 pl-7">
        <div className="text-primary tabular-nums text-sm font-bold">= {step.result.toFixed(4)}</div>
        {step.note && (
          <div className="text-muted-foreground text-[11px] italic">{step.note}</div>
        )}
      </div>
    </div>
  )
}

export function T2DecompositionPanel({
  groupId,
  observationIndex,
  onClose,
  className,
}: T2DecompositionPanelProps) {
  const { data, isLoading, error } = useT2Decomposition(groupId, observationIndex)
  const showYourWorkEnabled = useShowYourWorkStore((s) => s.enabled)

  // Cast the untyped API response to our known shape
  const decomp = data as DecompositionData | undefined

  if (observationIndex == null) {
    return (
      <div className={cn('border-border bg-card rounded-lg border p-6 text-center', className)}>
        <BarChart3 className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
        <p className="text-muted-foreground text-sm">
          Click an out-of-control point on the T{'\u00b2'} chart to decompose its variable
          contributions.
        </p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={cn('border-border bg-card rounded-lg border p-6', className)}>
        <div className="animate-pulse space-y-3">
          <div className="bg-muted h-5 w-2/3 rounded" />
          <div className="bg-muted h-[200px] rounded" />
          <div className="bg-muted h-24 rounded" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('border-border bg-card rounded-lg border p-6', className)}>
        <div className="text-destructive flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4" />
          <span>Failed to load decomposition</span>
        </div>
      </div>
    )
  }

  if (!decomp) return null

  const isOOC = decomp.total_t2 > decomp.ucl

  return (
    <div className={cn('border-border bg-card space-y-4 rounded-lg border p-4', className)}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-foreground flex items-center gap-2 text-sm font-semibold">
            <Table2 className="h-4 w-4" />
            T{'\u00b2'} Decomposition
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Observation #{decomp.observation_index}
            {decomp.timestamp ? ` \u2014 ${new Date(decomp.timestamp).toLocaleString()}` : ''}
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs"
            aria-label="Close decomposition panel"
          >
            Close
          </button>
        )}
      </div>

      {/* T² summary */}
      <div className="flex items-center gap-4">
        <div>
          <span className="text-muted-foreground text-xs">Total T{'\u00b2'}</span>
          <div
            className={cn(
              'tabular-nums text-lg font-bold',
              isOOC ? 'text-destructive' : 'text-foreground',
            )}
          >
            {decomp.total_t2.toFixed(4)}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">UCL</span>
          <div className="text-muted-foreground tabular-nums text-lg font-bold">
            {decomp.ucl.toFixed(4)}
          </div>
        </div>
        <div>
          {isOOC ? (
            <span className="bg-destructive/10 text-destructive rounded-full px-2 py-0.5 text-xs font-medium">
              Out of Control
            </span>
          ) : (
            <span className="bg-success/10 text-success rounded-full px-2 py-0.5 text-xs font-medium">
              In Control
            </span>
          )}
        </div>
      </div>

      {/* Bar chart */}
      <div>
        <h4 className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
          Variable Contributions
        </h4>
        <ContributionChart terms={decomp.terms} />
      </div>

      {/* Table */}
      <ContributionTable terms={decomp.terms} totalT2={decomp.total_t2} />

      {/* Show Your Work steps */}
      {showYourWorkEnabled && decomp.steps.length > 0 && (
        <div>
          <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Step-by-step (Show Your Work)
          </h4>
          <div className="space-y-2">
            {decomp.steps.map((step, i) => (
              <SYWStepCard key={i} step={step} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {decomp.warnings.length > 0 && (
        <div className="space-y-1">
          {decomp.warnings.map((w, i) => (
            <div key={i} className="text-warning flex items-center gap-1.5 text-xs">
              <AlertTriangle className="h-3 w-3" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Citation */}
      {showYourWorkEnabled && decomp.citation && (
        <div className="bg-muted/30 border-border rounded-lg border p-3">
          <div className="flex items-start gap-2">
            <BookOpen className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <div className="text-foreground text-xs font-medium">
                {decomp.citation.reference}
              </div>
              {decomp.citation.section && (
                <div className="text-muted-foreground text-[11px]">
                  {decomp.citation.section}
                </div>
              )}
              <div className="bg-primary/10 text-primary mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium">
                {decomp.citation.standard}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
