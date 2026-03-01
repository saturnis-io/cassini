import { Check, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StudyStep {
  key: string
  label: string
  icon: LucideIcon
  completed?: boolean
  disabled?: boolean
}

interface StudyStepsProps {
  steps: StudyStep[]
  activeKey: string
  onStepClick: (key: string) => void
}

export function StudySteps({ steps, activeKey, onStepClick }: StudyStepsProps) {
  return (
    <div className="flex items-center gap-1" role="tablist">
      {steps.map((step, index) => {
        const isActive = step.key === activeKey
        const Icon = step.icon

        return (
          <div key={step.key} className="flex items-center">
            {index > 0 && (
              <ChevronRight className="text-muted-foreground mx-1 h-4 w-4 shrink-0" />
            )}
            <button
              role="tab"
              aria-selected={isActive}
              disabled={step.disabled}
              onClick={() => !step.disabled && onStepClick(step.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : step.completed
                    ? 'bg-primary/10 text-primary hover:bg-primary/20'
                    : 'bg-muted text-muted-foreground',
                step.disabled && 'cursor-not-allowed opacity-50',
                !step.disabled && !isActive && 'cursor-pointer',
              )}
            >
              {step.completed && !isActive ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Icon className="h-3.5 w-3.5" />
              )}
              {step.label}
            </button>
          </div>
        )
      })}
    </div>
  )
}
