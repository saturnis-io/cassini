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

export function GuidedEmptyState({ content, onAction, className }: GuidedEmptyStateProps) {
  const Icon = ICON_MAP[content.icon] ?? Sparkles

  return (
    <div className={cn('flex flex-col items-center justify-center py-16', className)}>
      <Icon className="text-muted-foreground/25 h-16 w-16" strokeWidth={1.5} />

      <h2 className="text-foreground mt-5 text-lg font-semibold">{content.title}</h2>

      <p className="text-muted-foreground mt-2 max-w-md text-center text-sm leading-relaxed">
        {content.purpose}
      </p>

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
