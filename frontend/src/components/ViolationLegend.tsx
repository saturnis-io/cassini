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

export function ViolationLegend({ violatedRules, compact = false, className }: ViolationLegendProps) {
  // Get unique, sorted rules
  const uniqueRules = [...new Set(violatedRules)].sort((a, b) => a - b)

  if (uniqueRules.length === 0) {
    return null
  }

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 flex-wrap', className)}>
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
        <span className="text-xs text-muted-foreground">Rules:</span>
        {uniqueRules.map((ruleId) => (
          <span
            key={ruleId}
            className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold rounded-full bg-destructive/10 text-destructive"
            title={NELSON_RULES[ruleId]?.description || `Rule ${ruleId}`}
          >
            {ruleId}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className={cn('bg-card border border-border rounded-lg p-3', className)}>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <span className="text-sm font-medium">Violations Detected</span>
      </div>
      <div className="space-y-1.5">
        {uniqueRules.map((ruleId) => {
          const rule = NELSON_RULES[ruleId]
          return (
            <div key={ruleId} className="flex items-start gap-2 text-xs">
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold rounded-full bg-destructive/10 text-destructive flex-shrink-0">
                {ruleId}
              </span>
              <div className="text-muted-foreground">
                <span className="font-medium text-foreground">{rule?.name || `Rule ${ruleId}`}</span>
                {rule?.description && (
                  <span className="block mt-0.5">{rule.description}</span>
                )}
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
