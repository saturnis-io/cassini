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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateCharacteristic } from '@/api/hooks'
import { NumberInput } from '@/components/NumberInput'

type DataType = 'variable' | 'attribute'
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

  const derivedChartType = deriveChartType(countingWhat, sizeVaries)
  const needsSampleSize = derivedChartType !== 'c'

  // Attribute completes in 1 step (all decisions on step 1, derived badge is the review).
  // Variable uses 2 steps (basics → spec limits).
  const totalSteps = dataType === 'variable' ? 2 : 1
  const stepLabels = dataType === 'variable' ? ['Basics', 'Limits'] : ['Basics']

  // Clamp step when switching data types while on step 2
  useEffect(() => {
    if (currentStep > totalSteps) setCurrentStep(totalSteps)
  }, [totalSteps, currentStep])

  // Validation
  const isStep1Valid = () => {
    if (!name.trim()) return false
    if (dataType === 'variable') {
      const sg = parseInt(subgroupSize)
      return sg >= 1 && sg <= 25
    }
    if (needsSampleSize) {
      const ss = parseInt(defaultSampleSize)
      return ss >= 1
    }
    return true
  }

  const isCurrentStepValid = () => {
    if (currentStep === 1) return isStep1Valid()
    return true
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
    setCountingWhat('defectives')
    setSizeVaries(false)
    setDefaultSampleSize('100')
    setTarget('')
    setUSL('')
    setLSL('')
    setIsSubmitting(false)
    setSubmitError(null)
    onClose()
  }, [onClose])

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
              countingWhat={countingWhat}
              onCountingWhatChange={setCountingWhat}
              sizeVaries={sizeVaries}
              onSizeVariesChange={setSizeVaries}
              defaultSampleSize={defaultSampleSize}
              onDefaultSampleSizeChange={setDefaultSampleSize}
              derivedChartType={derivedChartType}
              needsSampleSize={needsSampleSize}
            />
          )}

          {currentStep === 2 && dataType === 'variable' && (
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
              disabled={!isCurrentStepValid() || isSubmitting}
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
              disabled={!isCurrentStepValid()}
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
}: {
  countingWhat: CountingWhat
  onCountingWhatChange: (v: CountingWhat) => void
  sizeVaries: boolean
  onSizeVariesChange: (v: boolean) => void
  defaultSampleSize: string
  onDefaultSampleSizeChange: (v: string) => void
  derivedChartType: AttributeChartType
  needsSampleSize: boolean
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
            className="mt-1 w-full"
          />
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
  countingWhat,
  onCountingWhatChange,
  sizeVaries,
  onSizeVariesChange,
  defaultSampleSize,
  onDefaultSampleSizeChange,
  derivedChartType,
  needsSampleSize,
}: {
  name: string
  onNameChange: (v: string) => void
  dataType: DataType
  onDataTypeChange: (v: DataType) => void
  subgroupSize: string
  onSubgroupSizeChange: (v: string) => void
  countingWhat: CountingWhat
  onCountingWhatChange: (v: CountingWhat) => void
  sizeVaries: boolean
  onSizeVariesChange: (v: boolean) => void
  defaultSampleSize: string
  onDefaultSampleSizeChange: (v: string) => void
  derivedChartType: AttributeChartType
  needsSampleSize: boolean
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
          className="border-border bg-background focus:ring-primary/30 focus:border-primary mt-1 w-full rounded-lg border px-3 py-2 transition-colors focus:ring-2 focus:outline-none"
          autoFocus
        />
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
            className="mt-1 w-full"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Number of measurements per sample (1–25)
          </p>
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
        />
      )}

      <p className="text-muted-foreground text-xs">
        Data sources (MQTT, OPC-UA) can be configured after creation via the Connectivity Hub.
      </p>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 2: Limits (variable data only)
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
            className="mt-1 w-full"
          />
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
