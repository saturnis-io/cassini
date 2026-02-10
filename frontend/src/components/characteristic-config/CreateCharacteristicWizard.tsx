import { useState } from 'react'
import {
  X,
  ChevronLeft,
  Loader2,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateCharacteristic } from '@/api/hooks'
import { NumberInput } from '@/components/NumberInput'

interface CreateCharacteristicWizardProps {
  isOpen: boolean
  onClose: () => void
  selectedNodeId: number
  plantId: number | null
}

export function CreateCharacteristicWizard({
  isOpen,
  onClose,
  selectedNodeId,
}: CreateCharacteristicWizardProps) {
  // Step state
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1: Basics
  const [name, setName] = useState('')
  const [subgroupSize, setSubgroupSize] = useState('5')

  // Step 2: Limits
  const [target, setTarget] = useState('')
  const [usl, setUSL] = useState('')
  const [lsl, setLSL] = useState('')

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const createChar = useCreateCharacteristic()

  const totalSteps = 2
  const stepLabels = ['Basics', 'Limits']

  // Validation
  const isStep1Valid = name.trim().length > 0 && parseInt(subgroupSize) >= 1 && parseInt(subgroupSize) <= 25
  const isCurrentStepValid = () => {
    if (currentStep === 1) return isStep1Valid
    return true // Limits step is always valid (all optional)
  }

  const isLastStep = currentStep === totalSteps

  const handleNext = () => {
    if (!isCurrentStepValid()) return
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      setSubmitError(null)
    }
  }

  const handleSubmit = async () => {
    if (!isCurrentStepValid()) return
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      await createChar.mutateAsync({
        name: name.trim(),
        hierarchy_id: selectedNodeId,
        subgroup_size: parseInt(subgroupSize) || 5,
        target_value: target ? parseFloat(target) : null,
        usl: usl ? parseFloat(usl) : null,
        lsl: lsl ? parseFloat(lsl) : null,
      })

      handleClose()
    } catch (err) {
      // createChar.mutateAsync already shows toast via hook onError
      setSubmitError(err instanceof Error ? err.message : 'Failed to create characteristic')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    // Reset all state
    setCurrentStep(1)
    setName('')
    setSubgroupSize('5')
    setTarget('')
    setUSL('')
    setLSL('')
    setIsSubmitting(false)
    setSubmitError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-2xl max-w-2xl w-full mx-4 shadow-xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 shrink-0">
          <h3 className="text-lg font-semibold">Add Characteristic</h3>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <StepIndicator
          currentStep={currentStep}
          totalSteps={totalSteps}
          labels={stepLabels}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {currentStep === 1 && (
            <Step1Basics
              name={name}
              onNameChange={setName}
              subgroupSize={subgroupSize}
              onSubgroupSizeChange={setSubgroupSize}
            />
          )}

          {currentStep === 2 && (
            <Step2Limits
              target={target}
              onTargetChange={setTarget}
              usl={usl}
              onUSLChange={setUSL}
              lsl={lsl}
              onLSLChange={setLSL}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 pt-4 border-t border-border shrink-0">
          <div>
            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                disabled={isSubmitting}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            )}
            {isLastStep ? (
              <button
                onClick={handleSubmit}
                disabled={!isCurrentStepValid() || isSubmitting}
                className={cn(
                  'flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-lg transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Create
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={!isCurrentStepValid()}
                className={cn(
                  'flex items-center gap-1 px-5 py-2 text-sm font-medium rounded-lg transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step Indicator
 * ----------------------------------------------------------------------- */

function StepIndicator({
  currentStep,
  totalSteps,
  labels,
}: {
  currentStep: number
  totalSteps: number
  labels: string[]
}) {
  return (
    <div className="flex items-center justify-center gap-2 px-6 pb-2">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1
        const isActive = step === currentStep
        const isCompleted = step < currentStep

        return (
          <div key={step} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={cn(
                  'w-8 h-px',
                  isCompleted ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                  isActive && 'bg-primary text-primary-foreground',
                  isCompleted && 'bg-primary/20 text-primary',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : step}
              </div>
              <span
                className={cn(
                  'text-xs font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {labels[i]}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 1: Basics
 * ----------------------------------------------------------------------- */

function Step1Basics({
  name,
  onNameChange,
  subgroupSize,
  onSubgroupSizeChange,
}: {
  name: string
  onNameChange: (v: string) => void
  subgroupSize: string
  onSubgroupSizeChange: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">
          Name <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g., Temperature"
          className="w-full mt-1 px-3 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
      </div>

      <div>
        <label className="text-sm font-medium">Subgroup Size</label>
        <NumberInput
          min={1}
          max={25}
          value={subgroupSize}
          onChange={onSubgroupSizeChange}
          className="w-full mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Number of measurements per sample (1-25)
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Data sources (MQTT, OPC-UA) can be configured after creation via the Connectivity Hub.
      </p>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 2: Limits
 * ----------------------------------------------------------------------- */

function Step2Limits({
  target,
  onTargetChange,
  usl,
  onUSLChange,
  lsl,
  onLSLChange,
}: {
  target: string
  onTargetChange: (v: string) => void
  usl: string
  onUSLChange: (v: string) => void
  lsl: string
  onLSLChange: (v: string) => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        All limits are optional and can be configured later.
      </p>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium">Target</label>
          <NumberInput
            step="any"
            value={target}
            onChange={onTargetChange}
            placeholder="Optional"
            className="w-full mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">USL</label>
          <NumberInput
            step="any"
            value={usl}
            onChange={onUSLChange}
            placeholder="Optional"
            className="w-full mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium">LSL</label>
          <NumberInput
            step="any"
            value={lsl}
            onChange={onLSLChange}
            placeholder="Optional"
            className="w-full mt-1"
          />
        </div>
      </div>
    </div>
  )
}
