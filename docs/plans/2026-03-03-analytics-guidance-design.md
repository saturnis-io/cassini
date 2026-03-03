# Analytics Guidance — Progressive Disclosure Toolkit

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the analytics page approachable for non-SPC-experts by adding three layered guidance mechanisms — guided empty states, contextual hints, and dynamic result interpretation — without bloating the UI for power users.

**Architecture:** Three new reusable components (`GuidedEmptyState`, `ContextualHint`, `InterpretResult`) backed by a `lib/guidance.ts` module containing interpretation functions. A small Zustand store (`stores/guidanceStore.ts`) persists dismissed hint IDs. Components use existing Cassini design tokens and work in both light/dark themes.

**Tech Stack:** React 19, TypeScript 5.9, Zustand v5 (persist middleware), Tailwind CSS v4, lucide-react icons.

---

## File Inventory

### New Files (6)
| File | Purpose |
|------|---------|
| `frontend/src/lib/guidance.ts` | Interpretation functions + empty state content registry |
| `frontend/src/stores/guidanceStore.ts` | Zustand store for dismissed hint IDs (localStorage) |
| `frontend/src/components/GuidedEmptyState.tsx` | Reusable empty state with purpose, use-cases, CTA |
| `frontend/src/components/ContextualHint.tsx` | Dismissible card-style hint at decision points |
| `frontend/src/components/InterpretResult.tsx` | Collapsible "What does this mean?" panel |
| `frontend/src/hooks/useGuidance.ts` | Convenience hook wrapping the store |

### Modified Files (6)
| File | Change |
|------|--------|
| `frontend/src/components/analytics/CorrelationTab.tsx` | Add GuidedEmptyState, ContextualHint on method selector, InterpretResult below heatmap |
| `frontend/src/components/analytics/MultivariateTab.tsx` | Add GuidedEmptyState, ContextualHint on Phase I/Freeze, InterpretResult below T² chart |
| `frontend/src/components/analytics/PredictionsTab.tsx` | Replace bare empty state with GuidedEmptyState, InterpretResult on expanded forecasts |
| `frontend/src/components/analytics/AIInsightsTab.tsx` | Add GuidedEmptyState when no characteristics selected |
| `frontend/src/components/capability/CapabilityCard.tsx` | Add InterpretResult below index cards grid |
| `frontend/src/components/doe/DOEStudyEditor.tsx` | Add ContextualHint on design type selector |

---

## Task 1: Guidance Store + Hook

**Files:**
- Create: `frontend/src/stores/guidanceStore.ts`
- Create: `frontend/src/hooks/useGuidance.ts`

**Step 1: Create the Zustand store**

```typescript
// frontend/src/stores/guidanceStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GuidanceState {
  /** Set of hint IDs the user has dismissed */
  dismissedHints: string[]
  /** Dismiss a hint by ID */
  dismissHint: (id: string) => void
  /** Check if a hint is dismissed */
  isHintDismissed: (id: string) => boolean
  /** Reset all dismissed hints (for testing/settings) */
  resetHints: () => void
}

export const useGuidanceStore = create<GuidanceState>()(
  persist(
    (set, get) => ({
      dismissedHints: [],
      dismissHint: (id) =>
        set((s) => ({
          dismissedHints: s.dismissedHints.includes(id)
            ? s.dismissedHints
            : [...s.dismissedHints, id],
        })),
      isHintDismissed: (id) => get().dismissedHints.includes(id),
      resetHints: () => set({ dismissedHints: [] }),
    }),
    {
      name: 'cassini-guidance',
      partialize: (state) => ({ dismissedHints: state.dismissedHints }),
    },
  ),
)
```

**Step 2: Create the convenience hook**

```typescript
// frontend/src/hooks/useGuidance.ts
import { useGuidanceStore } from '@/stores/guidanceStore'

/**
 * Hook for guidance hint visibility.
 * Returns whether a hint should be shown and a function to dismiss it.
 */
export function useHintVisible(hintId: string) {
  const dismissed = useGuidanceStore((s) => s.dismissedHints.includes(hintId))
  const dismiss = useGuidanceStore((s) => s.dismissHint)
  return { visible: !dismissed, dismiss: () => dismiss(hintId) }
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors from these two new files.

**Step 4: Commit**

```
feat(guidance): add guidance store and useHintVisible hook

Zustand store persists dismissed hint IDs in localStorage
under `cassini-guidance` key. useHintVisible hook provides
simple visible/dismiss API for ContextualHint component.
```

---

## Task 2: Guidance Content + Interpretation Functions

**Files:**
- Create: `frontend/src/lib/guidance.ts`

This module contains three things:
1. Empty state content definitions (per analytics tab)
2. Contextual hint definitions (per decision point)
3. Dynamic interpretation functions (per result type)

**Step 1: Create the module**

```typescript
// frontend/src/lib/guidance.ts

// ── Empty State Content ──

export interface EmptyStateContent {
  title: string
  purpose: string
  useCases: string[]
  ctaLabel: string
  /** Icon name from lucide-react (rendered by component) */
  icon: string
}

export const emptyStates: Record<string, EmptyStateContent> = {
  correlation: {
    title: 'Correlation Analysis',
    purpose:
      'Discover hidden relationships between your quality characteristics. Correlation analysis reveals which measurements move together, helping you find root causes faster and monitor fewer variables.',
    useCases: [
      'You suspect two or more measurements are related (e.g., temperature and thickness)',
      'You want to reduce the number of characteristics you monitor daily',
      'You need to identify which variables contribute most to variation (PCA)',
      'A root cause investigation needs data-driven evidence of relationships',
    ],
    ctaLabel: 'Select Characteristics to Begin',
    icon: 'GitCompareArrows',
  },
  multivariate: {
    title: 'Multivariate SPC',
    purpose:
      'Monitor multiple correlated characteristics simultaneously. When variables are related, a multivariate chart detects shifts that individual charts would miss — catching problems earlier with fewer false alarms.',
    useCases: [
      'You have 2+ characteristics that are physically correlated (e.g., dimensions of a machined part)',
      'Individual control charts are showing frequent false alarms on related variables',
      'You need to detect subtle process shifts that affect multiple outputs at once',
      'You want a single chart to replace monitoring several related charts',
    ],
    ctaLabel: 'Create a Multivariate Group',
    icon: 'BarChart3',
  },
  predictions: {
    title: 'Predictive Analytics',
    purpose:
      'Forecast future process behavior using time-series models. Predictions alert you before a process goes out of control — giving you time to act rather than react.',
    useCases: [
      'You want early warning of trends before they cause out-of-control conditions',
      'You need to plan maintenance windows based on predicted process drift',
      'You want to compare how different characteristics are trending',
      'You need to justify process adjustments with data-driven forecasts',
    ],
    ctaLabel: 'Enable Predictions in Configuration',
    icon: 'TrendingUp',
  },
  'ai-insights': {
    title: 'AI Insights',
    purpose:
      'Get AI-powered analysis of your SPC data. The AI examines patterns, violations, capability trends, and anomalies across your characteristics — then provides plain-English summaries with actionable recommendations.',
    useCases: [
      'You want a quick summary of which characteristics need attention',
      'You need to explain process behavior to non-technical stakeholders',
      'You want to identify patterns that are hard to spot manually across many charts',
      'You need a starting point for root cause investigation',
    ],
    ctaLabel: 'Select a Characteristic to Analyze',
    icon: 'Sparkles',
  },
}

// ── Contextual Hint Content ──

export interface HintContent {
  id: string
  text: string
}

export const hints: Record<string, HintContent> = {
  correlationMethod: {
    id: 'hint-correlation-method',
    text: 'Pearson measures linear relationships and assumes normally distributed data. If your characteristics are skewed or have outliers, switch to Spearman for a more robust rank-based measure.',
  },
  correlationPCA: {
    id: 'hint-correlation-pca',
    text: 'PCA reduces many variables into a few principal components that capture the most variation. Enable this to see which characteristics contribute most to overall process variation.',
  },
  multivariatePhaseI: {
    id: 'hint-multivariate-phase-i',
    text: 'Phase I collects baseline data to estimate the process center and covariance. Collect at least 20\u201330 stable subgroups before freezing. Remove any known special-cause points first \u2014 they\'ll bias your control limits.',
  },
  multivariateFreeze: {
    id: 'hint-multivariate-freeze',
    text: 'Freezing locks the mean vector and covariance matrix from Phase I data. After freezing, the chart switches to Phase II monitoring \u2014 new points are compared against this baseline. Only freeze when Phase I data is stable and representative.',
  },
  doeDesignType: {
    id: 'hint-doe-design-type',
    text: 'Full Factorial tests every combination (best for 2\u20134 factors). Fractional Factorial uses fewer runs with aliasing (4\u20137 factors). Plackett-Burman is a quick screening design. Central Composite adds curvature detection for optimization.',
  },
  capabilityCpVsCpk: {
    id: 'hint-capability-cp-vs-cpk',
    text: 'Compare Cp and Cpk: if Cp is much higher than Cpk, the process is capable but off-center \u2014 centering it could significantly improve yield. If both are similar, the process is well-centered.',
  },
  capabilityCpkVsPpk: {
    id: 'hint-capability-cpk-vs-ppk',
    text: 'Compare Cpk (short-term) and Ppk (long-term): if Ppk is much lower, the process has significant variation between shifts, batches, or time periods. Investigate what changes between your short-term and long-term data.',
  },
}

// ── Interpretation Functions ──

export interface Interpretation {
  summary: string
  highlights: InterpretHighlight[]
  actions: string[]
}

export interface InterpretHighlight {
  value: string
  color: 'success' | 'warning' | 'destructive' | 'accent'
}

/**
 * Interpret capability indices.
 * Returns plain-English summary with actionable guidance.
 */
export function interpretCapability(data: {
  cp: number | null
  cpk: number | null
  pp: number | null
  ppk: number | null
  cpm: number | null
}): Interpretation | null {
  const { cp, cpk, pp, ppk } = data
  if (cpk === null) return null

  const highlights: InterpretHighlight[] = []
  const actions: string[] = []

  // Cpk assessment
  let summary: string
  if (cpk < 1.0) {
    summary = `Your Cpk of ${cpk.toFixed(2)} indicates the process cannot consistently meet specifications. The process spread is wider than the tolerance band, meaning defective parts are likely being produced.`
    highlights.push({ value: cpk.toFixed(2), color: 'destructive' })
    actions.push(
      'Investigate the largest sources of variation (machine, material, operator, environment)',
      'Check if the process mean can be re-centered to the target value',
    )
  } else if (cpk < 1.33) {
    summary = `Your Cpk of ${cpk.toFixed(2)} is marginal \u2014 the process is barely capable. Most automotive and aerospace standards require Cpk \u2265 1.33 for production approval.`
    highlights.push({ value: cpk.toFixed(2), color: 'warning' })
    actions.push(
      'Prioritize centering the process closer to the target value',
      'Investigate sources of variation that could be reduced',
    )
  } else {
    summary = `Your Cpk of ${cpk.toFixed(2)} indicates a capable process. The specification limits are comfortably within the process spread.`
    highlights.push({ value: cpk.toFixed(2), color: 'success' })
  }

  // Cp vs Cpk centering analysis
  if (cp !== null && cpk !== null && cp - cpk > 0.2) {
    summary += ` Cp of ${cp.toFixed(2)} is noticeably higher than Cpk, suggesting the process is capable but off-center \u2014 a centering adjustment could improve yield.`
    actions.push('Adjust the process mean toward the target to close the Cp\u2013Cpk gap')
  }

  // Cpk vs Ppk stability analysis
  if (cpk !== null && ppk !== null && cpk - ppk > 0.15) {
    summary += ` Ppk of ${ppk.toFixed(2)} is lower than Cpk, indicating long-term variation is larger than short-term \u2014 investigate what changes between shifts, batches, or time periods.`
    actions.push('Investigate sources of long-term variation (shift changes, tool changes, batch effects)')
  }

  // General guidance for capable processes
  if (cpk >= 1.33 && actions.length === 0) {
    if (cpk >= 2.0) {
      actions.push('Process is performing well \u2014 maintain current controls and monitor for drift')
    } else {
      actions.push(
        'Monitor the Cpk trend chart for any downward drift over time',
        'Consider whether reducing variation further would improve yield',
      )
    }
  }

  // Add MSA suggestion for borderline cases
  if (cpk < 1.33 && cpk >= 0.8) {
    actions.push(
      'Consider a Gage R&R study to confirm your measurement system isn\'t inflating apparent variation',
    )
  }

  return { summary, highlights, actions }
}

/**
 * Interpret correlation coefficient.
 */
export function interpretCorrelation(data: {
  r: number
  pValue?: number
  method: 'pearson' | 'spearman'
  label1: string
  label2: string
}): Interpretation | null {
  const { r, pValue, method, label1, label2 } = data
  const absR = Math.abs(r)
  const direction = r > 0 ? 'positive' : 'negative'
  const rSquared = Math.round(r * r * 100)

  let strength: string
  let color: InterpretHighlight['color']
  if (absR >= 0.8) { strength = 'strong'; color = 'accent' }
  else if (absR >= 0.5) { strength = 'moderate'; color = 'warning' }
  else if (absR >= 0.3) { strength = 'weak'; color = 'warning' }
  else { strength = 'negligible'; color = 'success' }

  const highlights: InterpretHighlight[] = [{ value: r.toFixed(2), color }]
  const actions: string[] = []
  let summary: string

  if (absR >= 0.7) {
    summary = `The ${method} correlation between ${label1} and ${label2} is ${strength} ${direction} (r = ${r.toFixed(2)}). This explains ${rSquared}% of the shared variation.`
    if (r > 0) {
      summary += ` As ${label1} increases, ${label2} tends to increase proportionally.`
    } else {
      summary += ` As ${label1} increases, ${label2} tends to decrease.`
    }
    actions.push(
      `Investigate the physical mechanism linking ${label1} and ${label2}`,
      `Consider monitoring ${label1} as a leading indicator for ${label2} shifts`,
      'A Hotelling T\u00B2 chart may be more effective than monitoring these separately',
    )
  } else if (absR >= 0.3) {
    summary = `The correlation between ${label1} and ${label2} is ${strength} ${direction} (r = ${r.toFixed(2)}), explaining only ${rSquared}% of the variation. Other factors likely dominate.`
    actions.push(
      'The relationship exists but is not strong enough to rely on for prediction',
      'Investigate other potential factors that may explain more variation',
    )
  } else {
    summary = `The correlation between ${label1} and ${label2} is ${strength} (r = ${r.toFixed(2)}). These characteristics appear to vary independently.`
    actions.push(
      'These variables can be monitored independently with standard control charts',
    )
  }

  if (pValue !== undefined) {
    if (pValue < 0.01) {
      summary += ' This result is statistically significant (p < 0.01).'
    } else if (pValue < 0.05) {
      summary += ` This result is statistically significant (p = ${pValue.toFixed(3)}).`
    } else {
      summary += ` However, this result is not statistically significant (p = ${pValue.toFixed(3)}) \u2014 the observed correlation may be due to chance.`
    }
  }

  return { summary, highlights, actions }
}

/**
 * Interpret multivariate T-squared results.
 */
export function interpretMultivariate(data: {
  oocCount: number
  totalPoints: number
  phase: 'phase_i' | 'phase_ii'
  chartType: string
}): Interpretation | null {
  const { oocCount, totalPoints, phase, chartType } = data
  const oocPct = totalPoints > 0 ? ((oocCount / totalPoints) * 100).toFixed(1) : '0'

  const highlights: InterpretHighlight[] = []
  const actions: string[] = []
  let summary: string

  const chartLabel = chartType === 'mewma' ? 'MEWMA' : 'T\u00B2'

  if (oocCount === 0) {
    summary = `All ${totalPoints} points are within the ${chartLabel} upper control limit. The process appears stable across all monitored characteristics.`
    highlights.push({ value: '0 OOC', color: 'success' })
    if (phase === 'phase_i') {
      actions.push(
        'If you have collected enough stable data (20\u201330+ subgroups), consider freezing Phase I',
        'After freezing, the chart switches to Phase II monitoring with locked control limits',
      )
    } else {
      actions.push('Continue routine monitoring \u2014 no action required')
    }
  } else {
    summary = `${oocCount} of ${totalPoints} points (${oocPct}%) exceed the ${chartLabel} upper control limit, indicating the process moved away from its established center in a multivariate sense.`
    highlights.push({
      value: `${oocCount} OOC`,
      color: oocCount > 3 ? 'destructive' : 'warning',
    })
    actions.push(
      'Click out-of-control points to see the decomposition \u2014 it shows which variables drove each signal',
      'If one variable dominates the decomposition, investigate that variable first',
      'Check if OOC points cluster in time \u2014 this suggests a process event rather than random variation',
    )
    if (phase === 'phase_i') {
      actions.push(
        'Consider removing known special-cause points and recomputing before freezing',
      )
    } else {
      actions.push('Once root causes are resolved, consider re-estimating Phase I parameters')
    }
  }

  return { summary, highlights, actions }
}

/**
 * Interpret prediction/forecast results.
 */
export function interpretPrediction(data: {
  forecastSteps: number
  predictedOOCCount: number
  modelType: string
  aic?: number | null
}): Interpretation | null {
  const { forecastSteps, predictedOOCCount, modelType, aic } = data

  const highlights: InterpretHighlight[] = []
  const actions: string[] = []
  let summary: string

  if (predictedOOCCount === 0) {
    summary = `The ${modelType} model forecasts ${forecastSteps} steps ahead with all predictions within control limits. No out-of-control conditions are anticipated.`
    highlights.push({ value: 'All in control', color: 'success' })
    actions.push('Continue routine monitoring \u2014 no preemptive action needed')
  } else {
    summary = `The ${modelType} model predicts ${predictedOOCCount} out-of-control point${predictedOOCCount > 1 ? 's' : ''} within the next ${forecastSteps} steps. This is an early warning \u2014 the process may drift beyond control limits.`
    highlights.push({ value: `${predictedOOCCount} predicted OOC`, color: 'warning' })
    actions.push(
      'Review the predicted OOC points on the forecast chart to understand timing',
      'Investigate whether current trends (tool wear, material changes) could cause this drift',
      'Consider preemptive adjustments or increased monitoring frequency',
    )
  }

  if (forecastSteps > 30) {
    summary += ' Note: longer forecast horizons have wider prediction intervals and are less reliable.'
    actions.push('For higher confidence, focus on the first 10\u201320 forecast steps')
  }

  if (aic !== null && aic !== undefined) {
    summary += ` Model fit: AIC = ${aic.toFixed(1)} (lower is better).`
  }

  return { summary, highlights, actions }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```
feat(guidance): add guidance content registry and interpretation functions

lib/guidance.ts contains empty state content for 4 analytics tabs,
7 contextual hint definitions, and 4 interpretation functions
(capability, correlation, multivariate, predictions) that produce
dynamic plain-English summaries with actionable next steps.
```

---

## Task 3: GuidedEmptyState Component

**Files:**
- Create: `frontend/src/components/GuidedEmptyState.tsx`

**Step 1: Create the component**

```typescript
// frontend/src/components/GuidedEmptyState.tsx
import { cn } from '@/lib/utils'
import {
  GitCompareArrows,
  BarChart3,
  TrendingUp,
  Sparkles,
  Info,
  type LucideIcon,
} from 'lucide-react'
import type { EmptyStateContent } from '@/lib/guidance'

const ICON_MAP: Record<string, LucideIcon> = {
  GitCompareArrows,
  BarChart3,
  TrendingUp,
  Sparkles,
}

interface GuidedEmptyStateProps {
  content: EmptyStateContent
  onAction?: () => void
  className?: string
}

/**
 * Rich empty state for analytics tabs.
 * Shows purpose, use cases, and a CTA button.
 * Displayed when a tool has no data; hidden once the user engages.
 */
export function GuidedEmptyState({ content, onAction, className }: GuidedEmptyStateProps) {
  const Icon = ICON_MAP[content.icon] ?? Sparkles

  return (
    <div className={cn('flex flex-col items-center justify-center py-16', className)}>
      <Icon className="text-muted-foreground/25 h-16 w-16" strokeWidth={1.5} />

      <h2 className="text-foreground mt-5 text-lg font-semibold">{content.title}</h2>

      <p className="text-muted-foreground mt-2 max-w-md text-center text-sm leading-relaxed">
        {content.purpose}
      </p>

      {/* When to use */}
      <div className="bg-primary/8 border-primary/25 mt-5 w-full max-w-md rounded-xl border p-4">
        <div className="text-primary flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
          <Info className="h-3.5 w-3.5" />
          When to use this
        </div>
        <ul className="mt-2.5 space-y-1.5">
          {content.useCases.map((useCase, i) => (
            <li key={i} className="text-foreground flex items-start gap-2 text-sm leading-relaxed">
              <span className="bg-primary/40 mt-2 h-1.5 w-1.5 shrink-0 rounded-full" />
              {useCase}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      {onAction && (
        <button
          onClick={onAction}
          className="bg-primary text-primary-foreground hover:bg-primary/90 mt-5 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
        >
          {content.ctaLabel}
        </button>
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```
feat(guidance): add GuidedEmptyState component

Reusable empty state with icon, purpose text, bulleted
"When to use this" card, and optional CTA button. Uses
primary/8 background and primary/25 border for the
use-case card.
```

---

## Task 4: ContextualHint Component

**Files:**
- Create: `frontend/src/components/ContextualHint.tsx`

**Step 1: Create the component**

```typescript
// frontend/src/components/ContextualHint.tsx
import { Lightbulb, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHintVisible } from '@/hooks/useGuidance'

interface ContextualHintProps {
  /** Unique hint ID (persisted in localStorage when dismissed) */
  hintId: string
  /** Hint message text */
  children: React.ReactNode
  className?: string
}

/**
 * Dismissible card-style hint at decision points.
 * Gold-tinted background, lightbulb icon, x dismiss button.
 * Dismissal is persisted in localStorage via guidanceStore.
 */
export function ContextualHint({ hintId, children, className }: ContextualHintProps) {
  const { visible, dismiss } = useHintVisible(hintId)

  if (!visible) return null

  return (
    <div
      className={cn(
        'bg-primary/8 border-primary/25 group relative flex items-start gap-2.5 rounded-lg border p-3',
        className,
      )}
    >
      <span className="bg-primary mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
        <Lightbulb className="text-primary-foreground h-3 w-3" />
      </span>

      <span className="text-foreground pr-6 text-sm leading-relaxed">{children}</span>

      <button
        type="button"
        onClick={dismiss}
        className="text-muted-foreground hover:text-foreground hover:bg-primary/10 absolute top-2 right-2 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Dismiss hint"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```
feat(guidance): add ContextualHint component

Card-style hint with lightbulb icon and dismiss-on-hover x button.
Uses primary/8 bg and primary/25 border (Cassini Gold tint).
Dismissed state persisted in localStorage via guidanceStore.
```

---

## Task 5: InterpretResult Component

**Files:**
- Create: `frontend/src/components/InterpretResult.tsx`

**Step 1: Create the component**

```typescript
// frontend/src/components/InterpretResult.tsx
import { useState } from 'react'
import { Info, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Interpretation } from '@/lib/guidance'

interface InterpretResultProps {
  interpretation: Interpretation | null
  className?: string
}

const COLOR_MAP = {
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  accent: 'text-chart-tertiary',
} as const

/**
 * Collapsible "What does this mean?" panel below computed results.
 * Contains dynamic interpretation with color-coded highlights
 * and numbered action steps.
 */
export function InterpretResult({ interpretation, className }: InterpretResultProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!interpretation) return null

  return (
    <div
      className={cn(
        'border-foreground/10 overflow-hidden rounded-lg border',
        className,
      )}
    >
      {/* Header — always visible, clickable */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="bg-foreground/[0.03] hover:bg-foreground/[0.05] flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors"
      >
        <Info className="h-4 w-4 shrink-0 text-[hsl(248_33%_59%)]" />
        <span className="flex-1 text-sm font-medium text-[hsl(248_33%_59%)]">
          What does this mean?
        </span>
        <ChevronDown
          className={cn(
            'text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Body — collapsible */}
      {isOpen && (
        <div className="bg-card border-foreground/10 border-t px-4 py-3.5">
          {/* Summary */}
          <p className="text-foreground text-sm leading-relaxed">
            {interpretation.summary}
          </p>

          {/* Action steps */}
          {interpretation.actions.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(248_33%_59%)]">
                Suggested Next Steps
              </div>
              <ol className="mt-2 space-y-1.5">
                {interpretation.actions.map((action, i) => (
                  <li
                    key={i}
                    className="text-foreground flex items-start gap-2.5 text-sm leading-relaxed"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[hsl(248_33%_59%)] text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc --noEmit`

**Step 3: Commit**

```
feat(guidance): add InterpretResult component

Collapsible "What does this mean?" panel with chart-tertiary
(#7473C0) accent. Shows dynamic interpretation summary and
numbered action steps. Collapsed by default.
```

---

## Task 6: Integrate into CorrelationTab

**Files:**
- Modify: `frontend/src/components/analytics/CorrelationTab.tsx`

**Step 1: Add imports and empty state**

Add to imports at top:
```typescript
import { GuidedEmptyState } from '@/components/GuidedEmptyState'
import { ContextualHint } from '@/components/ContextualHint'
import { InterpretResult } from '@/components/InterpretResult'
import { emptyStates, hints, interpretCorrelation } from '@/lib/guidance'
```

Replace the existing "No correlation results yet" empty state in the "Recent Results" section (around line 230) AND add a `GuidedEmptyState` shown when there are no results and no active result:

Before the configuration panel (`<div className="space-y-6">`), add:
```typescript
// Show guided empty state when no results exist at all
if (!activeResult && (!recentResults || (Array.isArray(recentResults) && recentResults.length === 0)) && !isLoadingRecent) {
  return (
    <div className="space-y-6">
      <GuidedEmptyState content={emptyStates.correlation} />
      {/* Still show the config panel below so user can start */}
      <div className="bg-card border-border rounded-lg border p-5">
        {/* ... existing config panel JSX ... */}
      </div>
    </div>
  )
}
```

**IMPORTANT:** The cleaner approach is to show the GuidedEmptyState _above_ the existing config panel when there are zero recent results. Wrap the entire return in a condition: if no recent results exist AND no active result, render the GuidedEmptyState followed by the config panel. Once any result exists, the empty state disappears.

**Step 2: Add ContextualHint next to method selector**

Below the method `<select>` (after line 148), add:
```typescript
<ContextualHint hintId={hints.correlationMethod.id} className="mt-2">
  <strong>Tip:</strong> {hints.correlationMethod.text}
</ContextualHint>
```

Below the PCA checkbox (after line 159), add:
```typescript
{includePCA && (
  <ContextualHint hintId={hints.correlationPCA.id} className="mt-1">
    <strong>Tip:</strong> {hints.correlationPCA.text}
  </ContextualHint>
)}
```

**Step 3: Add InterpretResult below heatmap**

After the CorrelationHeatmap component (after line 201 in the heatmap card), add an InterpretResult. Compute the interpretation from activeResult:

```typescript
{activeResult?.matrix && (() => {
  // Find the strongest off-diagonal correlation for interpretation
  const names = activeResult.characteristic_names ?? selectedCharNames
  let maxR = 0
  let maxI = 0
  let maxJ = 1
  const matrix = activeResult.matrix as number[][]
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < matrix[i].length; j++) {
      if (Math.abs(matrix[i][j]) > Math.abs(maxR)) {
        maxR = matrix[i][j]
        maxI = i
        maxJ = j
      }
    }
  }

  const pVal = activeResult.p_values
    ? (activeResult.p_values as number[][])[maxI]?.[maxJ]
    : undefined

  const interpretation = interpretCorrelation({
    r: maxR,
    pValue: pVal,
    method,
    label1: String(names[maxI] ?? 'Variable A'),
    label2: String(names[maxJ] ?? 'Variable B'),
  })

  return <InterpretResult interpretation={interpretation} className="mt-3" />
})()}
```

**Step 4: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`

```
feat(guidance): integrate guidance into CorrelationTab

- GuidedEmptyState shown when no correlation results exist
- ContextualHint on method selector (Pearson vs Spearman)
- ContextualHint on PCA toggle (when enabled)
- InterpretResult below heatmap with dynamic interpretation
  of strongest correlation pair
```

---

## Task 7: Integrate into MultivariateTab

**Files:**
- Modify: `frontend/src/components/analytics/MultivariateTab.tsx`

**Step 1: Add imports**

```typescript
import { GuidedEmptyState } from '@/components/GuidedEmptyState'
import { ContextualHint } from '@/components/ContextualHint'
import { InterpretResult } from '@/components/InterpretResult'
import { emptyStates, hints, interpretMultivariate } from '@/lib/guidance'
```

**Step 2: Add GuidedEmptyState**

Before the GroupManager component (line 59), add a condition:
```typescript
{/* Guided empty state when no groups exist */}
{(!groups || (Array.isArray(groups) && groups.length === 0)) && (
  <GuidedEmptyState
    content={emptyStates.multivariate}
    onAction={() => {
      // The GroupManager handles creation, so this is just a scroll hint
      document.getElementById('group-manager')?.scrollIntoView({ behavior: 'smooth' })
    }}
  />
)}
```

**Step 3: Add ContextualHint for Phase I**

Inside the chart controls section (after line 87, after the Phase I/II badge), add:
```typescript
{selectedGroup?.phase === 'phase_i' && (
  <ContextualHint hintId={hints.multivariatePhaseI.id} className="mt-3">
    <strong>Phase I:</strong> {hints.multivariatePhaseI.text}
  </ContextualHint>
)}
```

Before the "Freeze Phase I" button (line 96), add a ContextualHint that shows when the user is about to freeze:
```typescript
{/* No extra hint here — the Phase I hint above covers this */}
```

**Step 4: Add InterpretResult below T2Chart**

After the T2Chart render (after line 131), add:
```typescript
{chartData && (() => {
  const points = Array.isArray(chartData.points) ? chartData.points : []
  const oocCount = points.filter((p: { ooc?: boolean }) => p.ooc).length

  const interpretation = interpretMultivariate({
    oocCount,
    totalPoints: points.length,
    phase: selectedGroup?.phase ?? 'phase_i',
    chartType: selectedGroup?.chart_type ?? 't2',
  })

  return <InterpretResult interpretation={interpretation} className="mt-3" />
})()}
```

**Step 5: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`

```
feat(guidance): integrate guidance into MultivariateTab

- GuidedEmptyState when no multivariate groups exist
- ContextualHint for Phase I data collection guidance
- InterpretResult below T² chart with OOC count + phase advice
```

---

## Task 8: Integrate into PredictionsTab

**Files:**
- Modify: `frontend/src/components/analytics/PredictionsTab.tsx`

**Step 1: Add imports**

```typescript
import { GuidedEmptyState } from '@/components/GuidedEmptyState'
import { InterpretResult } from '@/components/InterpretResult'
import { emptyStates, interpretPrediction } from '@/lib/guidance'
```

**Step 2: Replace the existing empty state**

Replace the `items.length === 0` return block (lines 45-55) with:
```typescript
if (items.length === 0) {
  return <GuidedEmptyState content={emptyStates.predictions} />
}
```

**Step 3: Add InterpretResult in ExpandedForecast**

In the `ExpandedForecast` component, after the PredictionOverlay (line 264), add:
```typescript
{(() => {
  const oocPoints = forecast.filter((p) => p.predicted_ooc)
  const interpretation = interpretPrediction({
    forecastSteps: forecast.length,
    predictedOOCCount: oocPoints.length,
    modelType: forecastResult.model_type ?? 'Auto',
    aic: forecastResult.aic,
  })
  return <InterpretResult interpretation={interpretation} className="mt-3" />
})()}
```

Note: The `forecastResult` variable needs fields `model_type` and `aic`. Check the actual shape — if these come from the API response, they should already be there. If the type doesn't include `aic`, skip it (`aic: null`).

**Step 4: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`

```
feat(guidance): integrate guidance into PredictionsTab

- GuidedEmptyState replaces bare empty state when no predictions
- InterpretResult in expanded forecast with OOC prediction context
```

---

## Task 9: Integrate into AIInsightsTab

**Files:**
- Modify: `frontend/src/components/analytics/AIInsightsTab.tsx`

**Step 1: Add imports**

```typescript
import { GuidedEmptyState } from '@/components/GuidedEmptyState'
import { emptyStates } from '@/lib/guidance'
```

**Step 2: Add GuidedEmptyState**

The AIInsightsTab has a three-panel layout. When no characteristic is selected in the center panel, show the GuidedEmptyState. Find the center panel's "no selection" state and replace/supplement it with:

```typescript
{!selectedCharacteristic && (
  <GuidedEmptyState content={emptyStates['ai-insights']} />
)}
```

This should replace whatever existing "select a characteristic" message exists in the center panel.

**Step 3: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`

```
feat(guidance): integrate GuidedEmptyState into AIInsightsTab

Shows guided empty state with purpose, use cases, and CTA
when no characteristic is selected for AI analysis.
```

---

## Task 10: Integrate into CapabilityCard

**Files:**
- Modify: `frontend/src/components/capability/CapabilityCard.tsx`

**Step 1: Add imports**

```typescript
import { InterpretResult } from '@/components/InterpretResult'
import { ContextualHint } from '@/components/ContextualHint'
import { interpretCapability, hints } from '@/lib/guidance'
```

**Step 2: Add InterpretResult after the index cards grid**

After the index grid render (after line 356, after the grid closing `</div>`), add:

```typescript
{/* Capability interpretation */}
{(() => {
  const interpretation = interpretCapability({
    cp: capability.cp,
    cpk: capability.cpk,
    pp: capability.pp,
    ppk: capability.ppk,
    cpm: capability.cpm,
  })
  return <InterpretResult interpretation={interpretation} />
})()}
```

**Step 3: Add ContextualHint for Cp vs Cpk**

After the InterpretResult (which covers the detailed interpretation), add a hint that shows when the gap between Cp and Cpk is significant:

```typescript
{capability.cp !== null && capability.cpk !== null && capability.cp - capability.cpk > 0.2 && (
  <ContextualHint hintId={hints.capabilityCpVsCpk.id}>
    <strong>Tip:</strong> {hints.capabilityCpVsCpk.text}
  </ContextualHint>
)}
```

And when Cpk vs Ppk gap is significant:
```typescript
{capability.cpk !== null && capability.ppk !== null && capability.cpk - capability.ppk > 0.15 && (
  <ContextualHint hintId={hints.capabilityCpkVsPpk.id}>
    <strong>Tip:</strong> {hints.capabilityCpkVsPpk.text}
  </ContextualHint>
)}
```

**Step 4: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`

```
feat(guidance): integrate guidance into CapabilityCard

- InterpretResult below capability index grid with dynamic
  Cpk/centering/stability interpretation
- ContextualHint for Cp vs Cpk centering gap (when >0.2)
- ContextualHint for Cpk vs Ppk stability gap (when >0.15)
```

---

## Task 11: Integrate into DOEStudyEditor

**Files:**
- Modify: `frontend/src/components/doe/DOEStudyEditor.tsx`

**Step 1: Add imports**

```typescript
import { ContextualHint } from '@/components/ContextualHint'
import { hints } from '@/lib/guidance'
```

**Step 2: Add ContextualHint below design type selector**

After the design type grid (after line 234, after the closing `</div>` of the grid), add:
```typescript
<ContextualHint hintId={hints.doeDesignType.id} className="mt-2">
  <strong>Tip:</strong> {hints.doeDesignType.text}
</ContextualHint>
```

**Step 3: Verify and commit**

Run: `cd frontend && npx tsc --noEmit`

```
feat(guidance): add design type hint to DOEStudyEditor

ContextualHint below design type selector explaining when to
use Full Factorial vs Fractional vs Plackett-Burman vs CCD.
```

---

## Task 12: Add chart-tertiary CSS token

**Files:**
- Modify: `frontend/src/index.css` (only if `text-chart-tertiary` doesn't resolve)

The InterpretResult component uses `text-[hsl(248_33%_59%)]` for the accent color. This matches the existing `--color-chart-tertiary` CSS variable. Verify that Tailwind can resolve `text-chart-tertiary` from the `@theme` block. If not, the hardcoded HSL values in the component are fine — they match the design token exactly.

Check: `grep 'chart-tertiary' frontend/src/index.css` — if the variable exists in `@theme`, Tailwind v4 auto-generates the utility class.

If it works, replace the hardcoded `text-[hsl(248_33%_59%)]` in InterpretResult.tsx with `text-chart-tertiary`.

**Step 1: Verify and optionally update**

Run: `cd frontend && npx tsc --noEmit && npm run build`

**Step 2: Final commit**

```
feat(guidance): verify chart-tertiary token and build

Full build passes with all guidance components integrated.
```

---

## Task 13: Clean up playground file

**Files:**
- Delete: `analytics-guidance-playground.html` (root of repo)

This was a design exploration artifact. Remove it before merging.

```
chore: remove analytics guidance playground

Design exploration artifact no longer needed.
```

---

## Summary

| Task | Component | Files | Est. |
|------|-----------|-------|------|
| 1 | Guidance store + hook | 2 new | Small |
| 2 | guidance.ts (content + interpreters) | 1 new | Medium |
| 3 | GuidedEmptyState | 1 new | Small |
| 4 | ContextualHint | 1 new | Small |
| 5 | InterpretResult | 1 new | Small |
| 6 | CorrelationTab integration | 1 mod | Medium |
| 7 | MultivariateTab integration | 1 mod | Medium |
| 8 | PredictionsTab integration | 1 mod | Small |
| 9 | AIInsightsTab integration | 1 mod | Small |
| 10 | CapabilityCard integration | 1 mod | Medium |
| 11 | DOEStudyEditor integration | 1 mod | Small |
| 12 | Token verification + build | 0-1 mod | Small |
| 13 | Cleanup playground | 1 del | Trivial |

**Total: 6 new files, 6 modified files, 1 deleted file.**
