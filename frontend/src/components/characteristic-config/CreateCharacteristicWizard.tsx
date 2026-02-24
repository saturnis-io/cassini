import { useState, useEffect, useCallback, useId } from 'react'
import {
  X,
  ChevronLeft,
  Loader2,
  Check,
  BarChart3,
  PieChart,
  Ban,
  Search,
  Lock,
  Shuffle,
  TrendingUp,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { inputErrorClass } from '@/lib/validation'
import { useCreateCharacteristic } from '@/api/hooks'
import { useFormValidation } from '@/hooks/useFormValidation'
import {
  wizardStep1Schema,
  wizardStep2LimitsSchema,
  wizardStep2CUSUMSchema,
  wizardStep2EWMASchema,
} from '@/schemas/characteristics'
import { NumberInput } from '@/components/NumberInput'
import { FieldError } from '@/components/FieldError'

type DataType = 'variable' | 'attribute'
type VariableChartType = 'standard' | 'cusum' | 'ewma'
type AttributeChartType = 'p' | 'np' | 'c' | 'u'
type CountingWhat = 'defectives' | 'defects'

/** Derive attribute chart type from two process-level questions. */
function deriveChartType(counting: CountingWhat, sizeVaries: boolean): AttributeChartType {
  if (counting === 'defectives') return sizeVaries ? 'p' : 'np'
  return sizeVaries ? 'u' : 'c'
}

const CHART_DESCRIPTIONS: Record<
  AttributeChartType,
  { label: string; summary: string; fields: string; distribution: string }
> = {
  p: {
    label: 'p-chart',
    summary: 'Tracks proportion of defective items across variable-sized samples',
    fields: 'Defect count + sample size per point',
    distribution: 'binomial',
  },
  np: {
    label: 'np-chart',
    summary: 'Tracks number of defective items in fixed-size samples',
    fields: 'Defect count + fixed sample size',
    distribution: 'binomial',
  },
  c: {
    label: 'c-chart',
    summary: 'Tracks total defects found in a fixed inspection area',
    fields: 'Defect count only',
    distribution: 'Poisson',
  },
  u: {
    label: 'u-chart',
    summary: 'Tracks defects per unit across variable-sized inspections',
    fields: 'Defect count + units inspected per point',
    distribution: 'Poisson',
  },
}

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
    <div className="flex items-center justify-center gap-3 px-6 pb-2">
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1
        const isActive = step === currentStep
        const isCompleted = step < currentStep

        return (
          <div key={step} className="flex items-center gap-3">
            {i > 0 && (
              <div
                className={cn(
                  'h-px w-12 transition-colors',
                  isCompleted ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  isActive && 'bg-primary text-primary-foreground',
                  isCompleted && 'bg-primary/20 text-primary',
                  !isActive && !isCompleted && 'bg-muted text-muted-foreground',
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : step}
              </div>
              <span
                className={cn(
                  'text-xs font-medium',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
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
 * Data Type Selector
 * ----------------------------------------------------------------------- */

function DataTypeSelector({
  value,
  onChange,
}: {
  value: DataType
  onChange: (v: DataType) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Data type">
      <button
        type="button"
        role="radio"
        aria-checked={value === 'variable'}
        onClick={() => onChange('variable')}
        className={cn(
          'flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all',
          value === 'variable'
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/30',
        )}
      >
        <div className={cn('rounded-md p-2', value === 'variable' ? 'bg-primary/10' : 'bg-muted')}>
          <BarChart3
            className={cn(
              'h-4 w-4',
              value === 'variable' ? 'text-primary' : 'text-muted-foreground',
            )}
          />
        </div>
        <div>
          <p
            className={cn(
              'text-sm font-medium',
              value === 'variable' ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            Variable
          </p>
          <p className="text-muted-foreground text-[11px]">
            Measured values (length, weight, temp)
          </p>
        </div>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={value === 'attribute'}
        onClick={() => onChange('attribute')}
        className={cn(
          'flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all',
          value === 'attribute'
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/30',
        )}
      >
        <div className={cn('rounded-md p-2', value === 'attribute' ? 'bg-primary/10' : 'bg-muted')}>
          <PieChart
            className={cn(
              'h-4 w-4',
              value === 'attribute' ? 'text-primary' : 'text-muted-foreground',
            )}
          />
        </div>
        <div>
          <p
            className={cn(
              'text-sm font-medium',
              value === 'attribute' ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            Attribute
          </p>
          <p className="text-muted-foreground text-[11px]">Count data (defects, pass/fail)</p>
        </div>
      </button>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Guided Attribute Configuration
 * ----------------------------------------------------------------------- */

function OptionCard({
  selected,
  onClick,
  icon: Icon,
  title,
  description,
  groupLabel,
}: {
  selected: boolean
  onClick: () => void
  icon: React.ElementType
  title: string
  description: string
  groupLabel?: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={groupLabel ? `${groupLabel}: ${title}` : title}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-all',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30',
      )}
    >
      <div className={cn('mt-0.5 rounded-md p-1.5', selected ? 'bg-primary/10' : 'bg-muted')}>
        <Icon className={cn('h-3.5 w-3.5', selected ? 'text-primary' : 'text-muted-foreground')} />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm font-medium',
            selected ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {title}
        </p>
        <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">{description}</p>
      </div>
    </button>
  )
}

function AttributeGuide({
  countingWhat,
  onCountingWhatChange,
  sizeVaries,
  onSizeVariesChange,
  defaultSampleSize,
  onDefaultSampleSizeChange,
  derivedChartType,
  needsSampleSize,
  getError,
}: {
  countingWhat: CountingWhat
  onCountingWhatChange: (v: CountingWhat) => void
  sizeVaries: boolean
  onSizeVariesChange: (v: boolean) => void
  defaultSampleSize: string
  onDefaultSampleSizeChange: (v: string) => void
  derivedChartType: AttributeChartType
  needsSampleSize: boolean
  getError: (field: string) => string | undefined
}) {
  const sampleSizeId = useId()
  const info = CHART_DESCRIPTIONS[derivedChartType]

  return (
    <div className="space-y-4">
      {/* Q1: What are you counting? */}
      <div>
        <label className="mb-2 block text-sm font-medium" id="counting-label">
          What are you counting?
        </label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="counting-label">
          <OptionCard
            selected={countingWhat === 'defectives'}
            onClick={() => onCountingWhatChange('defectives')}
            icon={Ban}
            title="Defective items"
            description="Items that pass or fail (e.g., cracked parts, wrong color)"
            groupLabel="Counting"
          />
          <OptionCard
            selected={countingWhat === 'defects'}
            onClick={() => onCountingWhatChange('defects')}
            icon={Search}
            title="Defects / flaws"
            description="Individual flaws found per item (e.g., scratches, bubbles)"
            groupLabel="Counting"
          />
        </div>
      </div>

      {/* Q2: Does sample size vary? */}
      <div>
        <label className="mb-2 block text-sm font-medium" id="size-label">
          Does the inspection size vary?
        </label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="size-label">
          <OptionCard
            selected={!sizeVaries}
            onClick={() => onSizeVariesChange(false)}
            icon={Lock}
            title="Fixed"
            description="Same number inspected every time"
            groupLabel="Inspection size"
          />
          <OptionCard
            selected={sizeVaries}
            onClick={() => onSizeVariesChange(true)}
            icon={Shuffle}
            title="Varies"
            description="Different amount each inspection"
            groupLabel="Inspection size"
          />
        </div>
      </div>

      {/* Derived chart type badge */}
      <div className="border-primary/20 bg-primary/5 flex items-center gap-3 rounded-lg border px-4 py-2.5">
        <span className="text-primary bg-primary/10 rounded px-2 py-0.5 font-mono text-xs font-bold">
          {info.label}
        </span>
        <span className="text-muted-foreground text-xs">{info.summary}</span>
      </div>

      {/* Sample size (if needed) */}
      {needsSampleSize && (
        <div>
          <label htmlFor={sampleSizeId} className="text-sm font-medium">
            Default {derivedChartType === 'u' ? 'inspection units' : 'sample size'}{' '}
            <span className="text-destructive">*</span>
          </label>
          <NumberInput
            id={sampleSizeId}
            min={1}
            value={defaultSampleSize}
            onChange={onDefaultSampleSizeChange}
            className={cn('mt-1 w-full', inputErrorClass(getError('defaultSampleSize')))}
          />
          <FieldError error={getError('defaultSampleSize')} />
          <p className="text-muted-foreground mt-1 text-xs">
            {derivedChartType === 'u'
              ? 'Default inspection units per sample — can be overridden per data point'
              : sizeVaries
                ? 'Default items inspected per sample — can be overridden per data point'
                : 'Fixed number of items inspected per sample'}
          </p>
        </div>
      )}

      {/* Info callout — attribute-specific context */}
      <div className="border-primary/15 bg-primary/5 rounded-lg border p-3">
        <p className="text-muted-foreground text-xs">
          Control limits are calculated automatically from your data using {info.distribution}{' '}
          distribution formulas. Nelson Rules 1–4 are applied for out-of-control detection.
        </p>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 1: Basics
 * ----------------------------------------------------------------------- */

function Step1Basics({
  name,
  onNameChange,
  dataType,
  onDataTypeChange,
  subgroupSize,
  onSubgroupSizeChange,
  variableChartType,
  onVariableChartTypeChange,
  countingWhat,
  onCountingWhatChange,
  sizeVaries,
  onSizeVariesChange,
  defaultSampleSize,
  onDefaultSampleSizeChange,
  derivedChartType,
  needsSampleSize,
  getError,
}: {
  name: string
  onNameChange: (v: string) => void
  dataType: DataType
  onDataTypeChange: (v: DataType) => void
  subgroupSize: string
  onSubgroupSizeChange: (v: string) => void
  variableChartType: VariableChartType
  onVariableChartTypeChange: (v: VariableChartType) => void
  countingWhat: CountingWhat
  onCountingWhatChange: (v: CountingWhat) => void
  sizeVaries: boolean
  onSizeVariesChange: (v: boolean) => void
  defaultSampleSize: string
  onDefaultSampleSizeChange: (v: string) => void
  derivedChartType: AttributeChartType
  needsSampleSize: boolean
  getError: (field: string) => string | undefined
}) {
  const nameId = useId()
  const subgroupId = useId()

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={nameId} className="text-sm font-medium">
          Name <span className="text-destructive">*</span>
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={dataType === 'variable' ? 'e.g., Shaft Diameter' : 'e.g., Paint Defects'}
          className={cn(
            'border-border bg-background focus:ring-primary/30 focus:border-primary mt-1 w-full rounded-lg border px-3 py-2 transition-colors focus:ring-2 focus:outline-none',
            inputErrorClass(getError('name')),
          )}
          autoFocus
        />
        <FieldError error={getError('name')} />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">Data Type</label>
        <DataTypeSelector value={dataType} onChange={onDataTypeChange} />
      </div>

      {/* Variable: subgroup size */}
      {dataType === 'variable' && (
        <div>
          <label htmlFor={subgroupId} className="text-sm font-medium">
            Subgroup Size
          </label>
          <NumberInput
            id={subgroupId}
            min={1}
            max={25}
            value={subgroupSize}
            onChange={onSubgroupSizeChange}
            className={cn('mt-1 w-full', inputErrorClass(getError('subgroupSize')))}
          />
          <FieldError error={getError('subgroupSize')} />
          <p className="text-muted-foreground mt-1 text-xs">
            Number of measurements per sample (1-25)
          </p>
        </div>
      )}

      {/* Variable: chart type selector */}
      {dataType === 'variable' && (
        <div>
          <label className="mb-2 block text-sm font-medium">Chart Type</label>
          <VariableChartTypeSelector value={variableChartType} onChange={onVariableChartTypeChange} />
        </div>
      )}

      {/* Attribute: guided questions */}
      {dataType === 'attribute' && (
        <AttributeGuide
          countingWhat={countingWhat}
          onCountingWhatChange={onCountingWhatChange}
          sizeVaries={sizeVaries}
          onSizeVariesChange={onSizeVariesChange}
          defaultSampleSize={defaultSampleSize}
          onDefaultSampleSizeChange={onDefaultSampleSizeChange}
          derivedChartType={derivedChartType}
          needsSampleSize={needsSampleSize}
          getError={getError}
        />
      )}

      <p className="text-muted-foreground text-xs">
        Data sources (MQTT, OPC-UA) can be configured after creation via the Connectivity Hub.
      </p>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Variable Chart Type Selector
 * ----------------------------------------------------------------------- */

function VariableChartTypeSelector({
  value,
  onChange,
}: {
  value: VariableChartType
  onChange: (v: VariableChartType) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Variable chart type">
      <button
        type="button"
        role="radio"
        aria-checked={value === 'standard'}
        onClick={() => onChange('standard')}
        className={cn(
          'flex items-center gap-2 rounded-lg border-2 p-2.5 text-left transition-all',
          value === 'standard'
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/30',
        )}
      >
        <div className={cn('rounded-md p-1.5', value === 'standard' ? 'bg-primary/10' : 'bg-muted')}>
          <BarChart3
            className={cn(
              'h-3.5 w-3.5',
              value === 'standard' ? 'text-primary' : 'text-muted-foreground',
            )}
          />
        </div>
        <div>
          <p
            className={cn(
              'text-xs font-medium',
              value === 'standard' ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            Standard
          </p>
          <p className="text-muted-foreground text-[10px]">X-bar / I-MR</p>
        </div>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={value === 'cusum'}
        onClick={() => onChange('cusum')}
        className={cn(
          'flex items-center gap-2 rounded-lg border-2 p-2.5 text-left transition-all',
          value === 'cusum'
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/30',
        )}
      >
        <div className={cn('rounded-md p-1.5', value === 'cusum' ? 'bg-primary/10' : 'bg-muted')}>
          <TrendingUp
            className={cn(
              'h-3.5 w-3.5',
              value === 'cusum' ? 'text-primary' : 'text-muted-foreground',
            )}
          />
        </div>
        <div>
          <p
            className={cn(
              'text-xs font-medium',
              value === 'cusum' ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            CUSUM
          </p>
          <p className="text-muted-foreground text-[10px]">Small shifts</p>
        </div>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={value === 'ewma'}
        onClick={() => onChange('ewma')}
        className={cn(
          'flex items-center gap-2 rounded-lg border-2 p-2.5 text-left transition-all',
          value === 'ewma'
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-muted-foreground/30',
        )}
      >
        <div className={cn('rounded-md p-1.5', value === 'ewma' ? 'bg-primary/10' : 'bg-muted')}>
          <Activity
            className={cn(
              'h-3.5 w-3.5',
              value === 'ewma' ? 'text-primary' : 'text-muted-foreground',
            )}
          />
        </div>
        <div>
          <p
            className={cn(
              'text-xs font-medium',
              value === 'ewma' ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            EWMA
          </p>
          <p className="text-muted-foreground text-[10px]">Weighted avg</p>
        </div>
      </button>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 2: Limits (standard variable data only)
 * ----------------------------------------------------------------------- */

function Step2Limits({
  target,
  onTargetChange,
  usl,
  onUSLChange,
  lsl,
  onLSLChange,
  getError,
}: {
  target: string
  onTargetChange: (v: string) => void
  usl: string
  onUSLChange: (v: string) => void
  lsl: string
  onLSLChange: (v: string) => void
  getError: (field: string) => string | undefined
}) {
  const targetId = useId()
  const uslId = useId()
  const lslId = useId()

  return (
    <div className="space-y-4">
      <div className="border-border bg-muted/30 rounded-lg border px-3 py-2.5">
        <p className="text-muted-foreground text-sm">
          Specification limits are optional — they can be set or changed later. Control limits
          (UCL/LCL) are calculated automatically from your data.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label htmlFor={targetId} className="text-sm font-medium">
            Target
          </label>
          <NumberInput
            id={targetId}
            step="any"
            value={target}
            onChange={onTargetChange}
            placeholder="Optional"
            className="mt-1 w-full"
          />
        </div>
        <div>
          <label htmlFor={uslId} className="text-sm font-medium">
            USL
          </label>
          <NumberInput
            id={uslId}
            step="any"
            value={usl}
            onChange={onUSLChange}
            placeholder="Optional"
            className={cn('mt-1 w-full', inputErrorClass(getError('usl')))}
          />
          <FieldError error={getError('usl')} />
        </div>
        <div>
          <label htmlFor={lslId} className="text-sm font-medium">
            LSL
          </label>
          <NumberInput
            id={lslId}
            step="any"
            value={lsl}
            onChange={onLSLChange}
            placeholder="Optional"
            className="mt-1 w-full"
          />
        </div>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 2: CUSUM Parameters
 * ----------------------------------------------------------------------- */

function Step2CUSUM({
  cusumTarget,
  onCusumTargetChange,
  cusumK,
  onCusumKChange,
  cusumH,
  onCusumHChange,
  getError,
}: {
  cusumTarget: string
  onCusumTargetChange: (v: string) => void
  cusumK: string
  onCusumKChange: (v: string) => void
  cusumH: string
  onCusumHChange: (v: string) => void
  getError: (field: string) => string | undefined
}) {
  const targetId = useId()
  const kId = useId()
  const hId = useId()

  return (
    <div className="space-y-4">
      <div className="border-primary/15 bg-primary/5 rounded-lg border p-3">
        <p className="text-muted-foreground text-sm">
          CUSUM (Cumulative Sum) charts detect small, persistent shifts in process mean.
          The chart accumulates deviations from the target value.
        </p>
      </div>

      <div>
        <label htmlFor={targetId} className="text-sm font-medium">
          Process Target <span className="text-destructive">*</span>
        </label>
        <NumberInput
          id={targetId}
          step="any"
          value={cusumTarget}
          onChange={onCusumTargetChange}
          placeholder="Process mean / target value"
          className={cn('mt-1 w-full', inputErrorClass(getError('cusumTarget')))}
        />
        <FieldError error={getError('cusumTarget')} />
        <p className="text-muted-foreground mt-1 text-xs">
          The in-control process mean. CUSUM accumulates deviations from this value.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={kId} className="text-sm font-medium">
            Slack Value (k)
          </label>
          <NumberInput
            id={kId}
            step="any"
            min={0}
            value={cusumK}
            onChange={onCusumKChange}
            placeholder="0.5"
            className="mt-1 w-full"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Allowance parameter. Typically 0.5 (half the shift to detect).
          </p>
        </div>
        <div>
          <label htmlFor={hId} className="text-sm font-medium">
            Decision Interval (H)
          </label>
          <NumberInput
            id={hId}
            step="any"
            min={0}
            value={cusumH}
            onChange={onCusumHChange}
            placeholder="5"
            className="mt-1 w-full"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Threshold for signaling. Typically 4 or 5. Larger = fewer false alarms.
          </p>
        </div>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 2: EWMA Parameters
 * ----------------------------------------------------------------------- */

function Step2EWMA({
  ewmaTarget,
  onEwmaTargetChange,
  ewmaLambda,
  onEwmaLambdaChange,
  ewmaL,
  onEwmaLChange,
  getError,
}: {
  ewmaTarget: string
  onEwmaTargetChange: (v: string) => void
  ewmaLambda: string
  onEwmaLambdaChange: (v: string) => void
  ewmaL: string
  onEwmaLChange: (v: string) => void
  getError: (field: string) => string | undefined
}) {
  const targetId = useId()
  const lambdaId = useId()
  const lId = useId()

  return (
    <div className="space-y-4">
      <div className="border-primary/15 bg-primary/5 rounded-lg border p-3">
        <p className="text-muted-foreground text-sm">
          EWMA (Exponentially Weighted Moving Average) charts give more weight to recent
          observations, making them sensitive to small and moderate shifts.
        </p>
      </div>

      <div>
        <label htmlFor={targetId} className="text-sm font-medium">
          Process Target <span className="text-destructive">*</span>
        </label>
        <NumberInput
          id={targetId}
          step="any"
          value={ewmaTarget}
          onChange={onEwmaTargetChange}
          placeholder="Process mean / target value"
          className={cn('mt-1 w-full', inputErrorClass(getError('ewmaTarget')))}
        />
        <FieldError error={getError('ewmaTarget')} />
        <p className="text-muted-foreground mt-1 text-xs">
          The in-control process mean. EWMA starts at this value.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={lambdaId} className="text-sm font-medium">
            Smoothing Constant (lambda)
          </label>
          <NumberInput
            id={lambdaId}
            step="any"
            min={0.01}
            max={1}
            value={ewmaLambda}
            onChange={onEwmaLambdaChange}
            placeholder="0.2"
            className="mt-1 w-full"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Weight for the latest observation (0-1). Smaller = more smoothing. Typical: 0.05-0.25.
          </p>
        </div>
        <div>
          <label htmlFor={lId} className="text-sm font-medium">
            Limit Multiplier (L)
          </label>
          <NumberInput
            id={lId}
            step="any"
            min={0.1}
            value={ewmaL}
            onChange={onEwmaLChange}
            placeholder="2.7"
            className="mt-1 w-full"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Control limit width in sigma units. Typical: 2.7 (for lambda=0.2).
          </p>
        </div>
      </div>
    </div>
  )
}
