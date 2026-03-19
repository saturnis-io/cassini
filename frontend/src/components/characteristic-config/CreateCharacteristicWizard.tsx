import { useState, useEffect, useCallback, useId } from 'react'
import { X, ChevronLeft, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateCharacteristic } from '@/api/hooks'
import { useFormValidation } from '@/hooks/useFormValidation'
import {
  wizardStep1Schema,
  wizardStep2LimitsSchema,
  wizardStep2CUSUMSchema,
  wizardStep2EWMASchema,
} from '@/schemas/characteristics'
import {
  type DataType,
  type VariableChartType,
  type AttributeChartType,
  type CountingWhat,
  deriveChartType,
  StepIndicator,
  Step1Basics,
  Step2Limits,
  Step2CUSUM,
  Step2EWMA,
} from './WizardStepComponents'

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
  const titleId = useId()

  // Step state
  const [currentStep, setCurrentStep] = useState(1)

  // Step 1: Basics
  const [name, setName] = useState('')
  const [dataType, setDataType] = useState<DataType>('variable')

  // Variable-specific
  const [subgroupSize, setSubgroupSize] = useState('5')
  const [variableChartType, setVariableChartType] = useState<VariableChartType>('standard')

  // CUSUM parameters
  const [cusumTarget, setCusumTarget] = useState('')
  const [cusumK, setCusumK] = useState('0.5')
  const [cusumH, setCusumH] = useState('5')

  // EWMA parameters
  const [ewmaLambda, setEwmaLambda] = useState('0.2')
  const [ewmaL, setEwmaL] = useState('2.7')

  // Attribute-specific (guided)
  const [countingWhat, setCountingWhat] = useState<CountingWhat>('defectives')
  const [sizeVaries, setSizeVaries] = useState(false)
  const [defaultSampleSize, setDefaultSampleSize] = useState('100')

  // Step 2: Limits (variable only)
  const [target, setTarget] = useState('')
  const [usl, setUSL] = useState('')
  const [lsl, setLSL] = useState('')

  // Submit state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const createChar = useCreateCharacteristic()

  // Validation
  const step1Validation = useFormValidation(wizardStep1Schema)
  const limitsValidation = useFormValidation(wizardStep2LimitsSchema)
  const cusumValidation = useFormValidation(wizardStep2CUSUMSchema)
  const ewmaValidation = useFormValidation(wizardStep2EWMASchema)

  const derivedChartType = deriveChartType(countingWhat, sizeVaries)
  const needsSampleSize = derivedChartType !== 'c'

  // Attribute completes in 1 step (all decisions on step 1, derived badge is the review).
  // Variable uses 2 steps (basics → spec limits / CUSUM/EWMA params).
  const totalSteps = dataType === 'variable' ? 2 : 1
  const step2Label = variableChartType === 'cusum' ? 'CUSUM' : variableChartType === 'ewma' ? 'EWMA' : 'Limits'
  const stepLabels = dataType === 'variable' ? ['Basics', step2Label] : ['Basics']

  // Clamp step when switching data types while on step 2
  useEffect(() => {
    if (currentStep > totalSteps) setCurrentStep(totalSteps)
  }, [totalSteps, currentStep])

  const isLastStep = currentStep === totalSteps

  /** Clear all step validation errors. */
  const clearAllErrors = useCallback(() => {
    step1Validation.clearErrors()
    limitsValidation.clearErrors()
    cusumValidation.clearErrors()
    ewmaValidation.clearErrors()
  }, [step1Validation, limitsValidation, cusumValidation, ewmaValidation])

  /** Validate step 1 via schema. Returns true if valid. */
  const validateStep1 = () => {
    return !!step1Validation.validate({
      name,
      dataType,
      subgroupSize,
      needsSampleSize,
      defaultSampleSize,
    })
  }

  /** Validate step 2 via the appropriate sub-schema. Returns true if valid. */
  const validateStep2 = () => {
    if (variableChartType === 'standard') {
      return !!limitsValidation.validate({ target, usl, lsl })
    }
    if (variableChartType === 'cusum') {
      return !!cusumValidation.validate({ cusumTarget, cusumK, cusumH })
    }
    if (variableChartType === 'ewma') {
      return !!ewmaValidation.validate({ ewmaTarget: cusumTarget, ewmaLambda, ewmaL })
    }
    return true
  }

  const handleNext = () => {
    if (currentStep === 1 && !validateStep1()) return
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
      setSubmitError(null)
      clearAllErrors()
    }
  }

  const handleSubmit = async () => {
    // For attribute (single step) or variable step 1 on last step
    if (currentStep === 1 && !validateStep1()) return
    // For variable step 2
    if (currentStep === 2 && !validateStep2()) return
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      const payload: Parameters<typeof createChar.mutateAsync>[0] = {
        name: name.trim(),
        hierarchy_id: selectedNodeId,
        subgroup_size: dataType === 'variable' ? parseInt(subgroupSize) || 5 : 1,
        data_type: dataType,
      }

      if (dataType === 'variable') {
        payload.target_value = target ? parseFloat(target) : null
        payload.usl = usl ? parseFloat(usl) : null
        payload.lsl = lsl ? parseFloat(lsl) : null

        if (variableChartType === 'cusum') {
          ;(payload as Record<string, unknown>).chart_type = 'cusum'
          ;(payload as Record<string, unknown>).cusum_target = cusumTarget ? parseFloat(cusumTarget) : null
          ;(payload as Record<string, unknown>).cusum_k = cusumK ? parseFloat(cusumK) : 0.5
          ;(payload as Record<string, unknown>).cusum_h = cusumH ? parseFloat(cusumH) : 5
        } else if (variableChartType === 'ewma') {
          ;(payload as Record<string, unknown>).chart_type = 'ewma'
          ;(payload as Record<string, unknown>).cusum_target = cusumTarget ? parseFloat(cusumTarget) : null // reused as target
          ;(payload as Record<string, unknown>).ewma_lambda = ewmaLambda ? parseFloat(ewmaLambda) : 0.2
          ;(payload as Record<string, unknown>).ewma_l = ewmaL ? parseFloat(ewmaL) : 2.7
        }
      } else {
        payload.attribute_chart_type = derivedChartType
        payload.default_sample_size = needsSampleSize ? parseInt(defaultSampleSize) || 100 : null
      }

      await createChar.mutateAsync(payload)
      handleClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create characteristic')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = useCallback(() => {
    setCurrentStep(1)
    setName('')
    setDataType('variable')
    setSubgroupSize('5')
    setVariableChartType('standard')
    setCusumTarget('')
    setCusumK('0.5')
    setCusumH('5')
    setEwmaLambda('0.2')
    setEwmaL('2.7')
    setCountingWhat('defectives')
    setSizeVaries(false)
    setDefaultSampleSize('100')
    setTarget('')
    setUSL('')
    setLSL('')
    setIsSubmitting(false)
    setSubmitError(null)
    clearAllErrors()
    onClose()
  }, [onClose, clearAllErrors])

  // Escape key to close
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, isSubmitting, handleClose])

  if (!isOpen) return null

  return (
    // Backdrop — click outside to close
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) handleClose()
      }}
    >
      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-card border-border mx-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border shadow-xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between p-6 pb-4">
          <h3 id={titleId} className="text-lg font-semibold">
            Add Characteristic
          </h3>
          <button
            onClick={handleClose}
            aria-label="Close dialog"
            className="hover:bg-muted rounded-lg p-1.5 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step Indicator — only shown for multi-step flows */}
        {totalSteps > 1 && (
          <StepIndicator currentStep={currentStep} totalSteps={totalSteps} labels={stepLabels} />
        )}

        {/* Content — keyed for fade transition */}
        <div
          key={`step-${currentStep}`}
          className="flex-1 animate-[wizard-fade-in_150ms_ease-out] overflow-y-auto px-6 py-4"
        >
          {currentStep === 1 && (
            <Step1Basics
              name={name}
              onNameChange={setName}
              dataType={dataType}
              onDataTypeChange={setDataType}
              subgroupSize={subgroupSize}
              onSubgroupSizeChange={setSubgroupSize}
              variableChartType={variableChartType}
              onVariableChartTypeChange={setVariableChartType}
              countingWhat={countingWhat}
              onCountingWhatChange={setCountingWhat}
              sizeVaries={sizeVaries}
              onSizeVariesChange={setSizeVaries}
              defaultSampleSize={defaultSampleSize}
              onDefaultSampleSizeChange={setDefaultSampleSize}
              derivedChartType={derivedChartType}
              needsSampleSize={needsSampleSize}
              getError={step1Validation.getError}
            />
          )}

          {currentStep === 2 && dataType === 'variable' && variableChartType === 'standard' && (
            <Step2Limits
              target={target}
              onTargetChange={setTarget}
              usl={usl}
              onUSLChange={setUSL}
              lsl={lsl}
              onLSLChange={setLSL}
              getError={limitsValidation.getError}
            />
          )}

          {currentStep === 2 && dataType === 'variable' && variableChartType === 'cusum' && (
            <Step2CUSUM
              cusumTarget={cusumTarget}
              onCusumTargetChange={setCusumTarget}
              cusumK={cusumK}
              onCusumKChange={setCusumK}
              cusumH={cusumH}
              onCusumHChange={setCusumH}
              getError={cusumValidation.getError}
            />
          )}

          {currentStep === 2 && dataType === 'variable' && variableChartType === 'ewma' && (
            <Step2EWMA
              ewmaTarget={cusumTarget}
              onEwmaTargetChange={setCusumTarget}
              ewmaLambda={ewmaLambda}
              onEwmaLambdaChange={setEwmaLambda}
              ewmaL={ewmaL}
              onEwmaLChange={setEwmaL}
              getError={ewmaValidation.getError}
            />
          )}
        </div>

        {/* Error — above footer so it's visible next to actions */}
        {submitError && (
          <div className="px-6 pb-2">
            <p className="text-destructive bg-destructive/10 border-destructive/20 rounded-lg border px-3 py-2 text-sm">
              {submitError}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="border-border flex shrink-0 items-center justify-end gap-3 border-t p-6 pt-4">
          <button
            onClick={handleClose}
            className="border-border hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          {currentStep > 1 && (
            <button
              onClick={handleBack}
              disabled={isSubmitting}
              className="border-border hover:bg-muted flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}
          {isLastStep ? (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-5 py-2 text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
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
              className={cn(
                'flex items-center gap-1 rounded-lg px-5 py-2 text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:cursor-not-allowed disabled:opacity-50',
              )}
            >
              Next
            </button>
          )}
        </div>
      </div>

      {/* Inline keyframes for step transition */}
      <style>{`
        @keyframes wizard-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
