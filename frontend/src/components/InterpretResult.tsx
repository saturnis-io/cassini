import { useState } from 'react'
import { Info, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Interpretation, InterpretHighlight } from '@/lib/guidance'

const HIGHLIGHT_COLORS: Record<InterpretHighlight['color'], string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  destructive: 'bg-destructive/10 text-destructive',
  accent: 'bg-chart-tertiary/10 text-chart-tertiary',
}

interface InterpretResultProps {
  interpretation: Interpretation | null
  className?: string
}

export function InterpretResult({ interpretation, className }: InterpretResultProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (!interpretation) return null

  return (
    <div
      className={cn(
        'border-foreground/10 overflow-hidden border-t',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        aria-expanded={isOpen}
        aria-label="Interpretation details"
        className="bg-foreground/[0.03] hover:bg-foreground/[0.05] flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition-colors"
      >
        <Info className="h-4 w-4 shrink-0 text-chart-tertiary" />
        <span className="flex-1 text-sm font-medium text-chart-tertiary">
          What does this mean?
        </span>
        {interpretation.highlights.length > 0 && (
          <span className="flex items-center gap-1.5">
            {interpretation.highlights.map((h, i) => (
              <span
                key={i}
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  HIGHLIGHT_COLORS[h.color],
                )}
              >
                {h.value}
              </span>
            ))}
          </span>
        )}
        <ChevronDown
          className={cn(
            'text-muted-foreground h-4 w-4 shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {isOpen && (
        <div className="border-foreground/10 border-t px-4 py-3.5">
          <p className="text-foreground text-sm leading-relaxed">
            {interpretation.summary}
          </p>

          {interpretation.actions.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-chart-tertiary">
                Suggested Next Steps
              </div>
              <ol className="mt-2 space-y-1.5">
                {interpretation.actions.map((action, i) => (
                  <li
                    key={i}
                    className="text-foreground flex items-start gap-2.5 text-sm leading-relaxed"
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-chart-tertiary text-[10px] font-bold text-white">
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
