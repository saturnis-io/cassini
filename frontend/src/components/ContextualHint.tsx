import { Lightbulb, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHintVisible } from '@/hooks/useGuidance'

interface ContextualHintProps {
  hintId: string
  children: React.ReactNode
  className?: string
}

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
