import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

// Nelson rule definitions
export const NELSON_RULES: Record<number, { name: string; description: string }> = {
  1: {
    name: 'Beyond 3σ',
    description: 'One point beyond 3 standard deviations from the center line',
  },
  2: {
    name: '9 Same Side',
    description: '9 consecutive points on the same side of the center line',
  },
  3: {
    name: '6 Trending',
    description: '6 consecutive points steadily increasing or decreasing',
  },
  4: {
    name: '14 Alternating',
    description: '14 consecutive points alternating up and down',
  },
  5: {
    name: '2 of 3 Beyond 2σ',
    description: '2 out of 3 consecutive points beyond 2σ on same side',
  },
  6: {
    name: '4 of 5 Beyond 1σ',
    description: '4 out of 5 consecutive points beyond 1σ on same side',
  },
  7: {
    name: '15 Within 1σ',
    description: '15 consecutive points within 1σ of center line (stratification)',
  },
  8: {
    name: '8 Beyond 1σ',
    description: '8 consecutive points beyond 1σ on either side (mixture)',
  },
}

interface ViolationLegendProps {
  /** Array of violation rule numbers present on the chart */
  violatedRules: number[]
  /** Compact mode for sidebar display */
  compact?: boolean
  /** Additional class names */
  className?: string
}

export function ViolationLegend({
  violatedRules,
  compact = false,
  className,
}: ViolationLegendProps) {
  // Get unique, sorted rules
  const uniqueRules = [...new Set(violatedRules)].sort((a, b) => a - b)

  if (uniqueRules.length === 0) {
    return null
  }

  if (compact) {
    return (
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        <AlertTriangle className="text-destructive h-3.5 w-3.5" />
        <span className="text-muted-foreground text-xs">Rules:</span>
        {uniqueRules.map((ruleId) => (
          <span
            key={ruleId}
            className="bg-destructive/10 text-destructive inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold"
            title={NELSON_RULES[ruleId]?.description || `Rule ${ruleId}`}
          >
            {ruleId}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('bg-card border-border rounded-lg border p-3', className)}>
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="text-destructive h-4 w-4" />
        <span className="text-sm font-medium">Violations Detected</span>
      </div>
      <div className="space-y-1.5">
        {uniqueRules.map((ruleId) => {
          const rule = NELSON_RULES[ruleId]
          return (
            <div key={ruleId} className="flex items-start gap-2 text-xs">
              <span className="bg-destructive/10 text-destructive inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                {ruleId}
              </span>
              <div className="text-muted-foreground">
                <span className="text-foreground font-medium">
                  {rule?.name || `Rule ${ruleId}`}
                </span>
                {rule?.description && <span className="mt-0.5 block">{rule.description}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Get the primary rule to display on a chart marker (lowest numbered) */
export function getPrimaryViolationRule(rules: number[]): number | null {
  if (!rules || rules.length === 0) return null
  return Math.min(...rules)
}

/** Format violation rules as a compact string for tooltips */
export function formatViolationRules(rules: number[]): string {
  if (!rules || rules.length === 0) return ''
  const sorted = [...rules].sort((a, b) => a - b)
  return sorted.map((r) => `Rule ${r}`).join(', ')
}
