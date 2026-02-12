import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRetentionPolicy } from './utils'

export interface InheritanceStep {
  nodeType: 'characteristic' | 'hierarchy' | 'plant'
  nodeId: number
  nodeName: string
  hasOverride: boolean
  retentionType: string | null
  retentionValue: number | null
  retentionUnit: string | null
}

interface InheritanceChainProps {
  steps: InheritanceStep[]
}

export function InheritanceChain({ steps }: InheritanceChainProps) {
  if (steps.length === 0) return null

  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Inheritance Chain
      </h4>
      {steps.map((step, i) => (
        <div
          key={`${step.nodeType}-${step.nodeId}`}
          className="flex items-center gap-2 text-xs"
          style={{ paddingLeft: `${i * 16}px` }}
        >
          {i > 0 && <ArrowLeft className="h-3 w-3 text-muted-foreground shrink-0" />}
          <span className={cn(
            'font-medium',
            step.hasOverride ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {step.nodeName}
          </span>
          {step.hasOverride && step.retentionType && (
            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-primary/10 text-primary">
              {formatRetentionPolicy(step.retentionType, step.retentionValue, step.retentionUnit)}
            </span>
          )}
          {!step.hasOverride && (
            <span className="text-[10px] text-muted-foreground italic">inherited</span>
          )}
        </div>
      ))}
    </div>
  )
}
