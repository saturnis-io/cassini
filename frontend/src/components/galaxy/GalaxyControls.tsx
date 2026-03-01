import { cn } from '@/lib/utils'

interface GalaxyControlsProps {
  visible: boolean
  showTrace: boolean
  showSpokes: boolean
  onToggleTrace: () => void
  onToggleSpokes: () => void
}

export function GalaxyControls({
  visible,
  showTrace,
  showSpokes,
  onToggleTrace,
  onToggleSpokes,
}: GalaxyControlsProps) {
  if (!visible) return null

  return (
    <div className="absolute right-4 bottom-4 z-20 flex gap-2">
      <button
        onClick={onToggleTrace}
        className={cn(
          'rounded-lg border px-3 py-1.5 text-sm font-medium backdrop-blur-md transition-colors',
          'cursor-pointer',
          showTrace
            ? 'border-primary/40 bg-primary/20 text-primary'
            : 'border-border bg-card/80 text-muted-foreground hover:text-foreground',
        )}
      >
        Trace
      </button>
      <button
        onClick={onToggleSpokes}
        className={cn(
          'rounded-lg border px-3 py-1.5 text-sm font-medium backdrop-blur-md transition-colors',
          'cursor-pointer',
          showSpokes
            ? 'border-primary/40 bg-primary/20 text-primary'
            : 'border-border bg-card/80 text-muted-foreground hover:text-foreground',
        )}
      >
        Spokes
      </button>
    </div>
  )
}
