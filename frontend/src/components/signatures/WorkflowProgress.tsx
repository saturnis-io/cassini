import { Check, X, Clock, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SignatureWorkflowStep, ElectronicSignature } from '@/types/signature'

interface WorkflowProgressProps {
  steps: SignatureWorkflowStep[]
  currentStep: number
  status: 'pending' | 'in_progress' | 'completed' | 'rejected' | 'expired'
  signatures: ElectronicSignature[]
  rejectionReason?: string | null
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function WorkflowProgress({
  steps,
  currentStep,
  status,
  signatures,
  rejectionReason,
}: WorkflowProgressProps) {
  const sortedSteps = [...steps].sort((a, b) => a.step_order - b.step_order)

  return (
    <div className="space-y-1">
      {sortedSteps.map((step, index) => {
        const stepSig = signatures.find((s) => s.workflow_step_id === step.id)
        const isComplete = !!stepSig
        const isCurrent = step.step_order === currentStep && status !== 'completed'
        const isRejected = status === 'rejected' && step.step_order === currentStep
        const isPending = step.step_order > currentStep || (isCurrent && !isComplete)

        let stepStatus: 'complete' | 'current' | 'rejected' | 'pending'
        if (isRejected) stepStatus = 'rejected'
        else if (isComplete) stepStatus = 'complete'
        else if (isCurrent) stepStatus = 'current'
        else stepStatus = 'pending'

        return (
          <div key={step.id} className="flex items-start gap-3">
            {/* Step indicator */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2',
                  stepStatus === 'complete' && 'border-green-500 bg-green-500 text-white',
                  stepStatus === 'current' && 'border-primary bg-primary/10 text-primary',
                  stepStatus === 'rejected' && 'border-destructive bg-destructive text-white',
                  stepStatus === 'pending' && 'border-border bg-muted text-muted-foreground',
                )}
              >
                {stepStatus === 'complete' && <Check className="h-3.5 w-3.5" />}
                {stepStatus === 'current' && <PenLine className="h-3.5 w-3.5" />}
                {stepStatus === 'rejected' && <X className="h-3.5 w-3.5" />}
                {stepStatus === 'pending' && (
                  <Clock className="h-3.5 w-3.5" />
                )}
              </div>
              {/* Connector line */}
              {index < sortedSteps.length - 1 && (
                <div
                  className={cn(
                    'w-0.5 flex-1 min-h-4',
                    isComplete ? 'bg-green-500' : 'bg-border',
                  )}
                />
              )}
            </div>

            {/* Step content */}
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-medium',
                    isPending ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {step.name}
                </span>
                <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-[10px]">
                  {step.min_role}+
                </span>
              </div>

              {/* Completed step details */}
              {stepSig && (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {stepSig.full_name || stepSig.username} - {stepSig.meaning_display} -{' '}
                  {formatDate(stepSig.timestamp)}
                </p>
              )}

              {/* Rejection info */}
              {isRejected && rejectionReason && (
                <p className="text-destructive mt-0.5 text-xs">Reason: {rejectionReason}</p>
              )}

              {/* Current step indicator */}
              {isCurrent && !isRejected && !isComplete && (
                <p className="text-primary mt-0.5 text-xs">Awaiting signature...</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
