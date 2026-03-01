import { useEffect, useRef } from 'react'
import { X, BookOpen, AlertTriangle } from 'lucide-react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { cn } from '@/lib/utils'
import { useShowYourWorkStore } from '@/stores/showYourWorkStore'
import { useExplanation } from '@/api/hooks'
import type { ExplanationStep, Citation } from '@/api/explain.api'

/** Renders a LaTeX string safely. Falls back to raw text on error. */
function KaTeX({ latex, displayMode = false }: { latex: string; displayMode?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!ref.current) return
    try {
      katex.render(latex, ref.current, {
        displayMode,
        throwOnError: false,
        trust: true,
      })
    } catch {
      ref.current.textContent = latex
    }
  }, [latex, displayMode])

  return <span ref={ref} />
}

function StepCard({ step, index }: { step: ExplanationStep; index: number }) {
  return (
    <div className="border-border bg-card rounded-lg border p-3">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="bg-primary/10 text-primary flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold">
          {index + 1}
        </span>
        <span className="text-foreground text-sm font-medium">{step.label}</span>
      </div>
      <div className="space-y-1.5 pl-7">
        <div className="text-muted-foreground text-xs">
          <KaTeX latex={step.formula_latex} />
        </div>
        <div className="text-foreground text-sm">
          <KaTeX latex={step.substitution_latex} displayMode />
        </div>
        <div className="text-primary tabular-nums text-sm font-bold">
          = {step.result.toFixed(4)}
        </div>
        {step.note && (
          <div className="text-muted-foreground mt-1 text-[11px] italic">{step.note}</div>
        )}
      </div>
    </div>
  )
}

function InputsTable({ inputs }: { inputs: Record<string, number | string> }) {
  const entries = Object.entries(inputs)
  if (entries.length === 0) return null

  return (
    <div>
      <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
        Inputs
      </h4>
      <div className="border-border rounded-lg border">
        {entries.map(([key, value], i) => (
          <div
            key={key}
            className={cn(
              'flex items-center justify-between px-3 py-1.5 text-sm',
              i > 0 && 'border-border border-t',
            )}
          >
            <span className="text-muted-foreground">{key}</span>
            <span className="text-foreground tabular-nums font-medium">
              {typeof value === 'number' ? value.toFixed(6) : value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CitationBlock({ citation }: { citation: Citation }) {
  return (
    <div className="bg-muted/30 border-border rounded-lg border p-3">
      <div className="flex items-start gap-2">
        <BookOpen className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          <div className="text-foreground text-xs font-medium">{citation.reference}</div>
          {citation.section && (
            <div className="text-muted-foreground text-[11px]">{citation.section}</div>
          )}
          <div className="bg-primary/10 text-primary mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium">
            {citation.standard}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ExplanationPanel() {
  const activeMetric = useShowYourWorkStore((s) => s.activeMetric)
  const close = useShowYourWorkStore((s) => s.close)

  const { data, isLoading, error } = useExplanation(
    activeMetric?.type ?? null,
    activeMetric?.resourceId ?? null,
    activeMetric?.resourceType,
    activeMetric?.chartOptions,
  )

  if (!activeMetric) return null

  return (
    <div
      className={cn(
        'border-border bg-card fixed top-12 right-0 bottom-0 z-[60] w-[360px] border-l shadow-lg',
        'explanation-panel-slide-in',
        'flex flex-col overflow-hidden',
        'max-md:top-auto max-md:right-0 max-md:bottom-0 max-md:left-0 max-md:h-[60vh] max-md:w-full max-md:rounded-t-xl max-md:border-t max-md:border-l-0',
      )}
    >
      {/* Header */}
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="text-primary h-4 w-4" />
          <span className="text-sm font-semibold">Show Your Work</span>
        </div>
        <button
          onClick={close}
          className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1 transition-colors"
          aria-label="Close explanation panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && (
          <div className="animate-pulse space-y-3">
            <div className="bg-muted h-6 w-2/3 rounded" />
            <div className="bg-muted h-20 rounded" />
            <div className="bg-muted h-20 rounded" />
          </div>
        )}

        {error && (
          <div className="text-destructive flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>Failed to load explanation</span>
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* Metric name + value */}
            <div>
              <h3 className="text-foreground text-base font-semibold">{data.display_name}</h3>
              <div className="text-primary mt-1 text-2xl font-bold tabular-nums">
                {data.value.toFixed(4)}
              </div>
              {data.method && data.method !== 'normal' && (
                <span className="bg-secondary text-secondary-foreground mt-1 inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium">
                  {data.method}
                </span>
              )}
            </div>

            {/* General formula */}
            <div className="bg-muted/30 border-border rounded-lg border p-3 text-center">
              <KaTeX latex={data.formula_latex} displayMode />
            </div>

            {/* Steps */}
            {data.steps.length > 0 && (
              <div>
                <h4 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
                  Step-by-step
                </h4>
                <div className="space-y-2">
                  {data.steps.map((step, i) => (
                    <StepCard key={i} step={step} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Inputs */}
            <InputsTable inputs={data.inputs} />

            {/* Warnings */}
            {data.warnings.length > 0 && (
              <div className="space-y-1">
                {data.warnings.map((w, i) => (
                  <div key={i} className="text-warning flex items-center gap-1.5 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            {/* Citation */}
            {data.citation && <CitationBlock citation={data.citation} />}
          </div>
        )}
      </div>
    </div>
  )
}
