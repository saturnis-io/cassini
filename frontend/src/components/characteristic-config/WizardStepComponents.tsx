import { useId } from 'react'
import {
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
import { NumberInput } from '@/components/NumberInput'
import { FieldError } from '@/components/FieldError'

export type DataType = 'variable' | 'attribute'
export type VariableChartType = 'standard' | 'cusum' | 'ewma'
export type AttributeChartType = 'p' | 'np' | 'c' | 'u'
export type CountingWhat = 'defectives' | 'defects'

/** Derive attribute chart type from two process-level questions. */
export function deriveChartType(counting: CountingWhat, sizeVaries: boolean): AttributeChartType {
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

/* -----------------------------------------------------------------------
 * OptionCard — reusable radio-style card
 * ----------------------------------------------------------------------- */

export function OptionCard({
  selected,
  onClick,
  icon: Icon,
  title,
  description,
  groupLabel,
}: {
  selected: boolean
  onClick: () => void
  icon: typeof BarChart3
  title: string
  description: string
  groupLabel: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`${groupLabel}: ${title}`}
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 rounded-lg border-2 p-3 text-left transition-all',
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-muted-foreground/30',
      )}
    >
      <div className={cn('mt-0.5 rounded-md p-1.5', selected ? 'bg-primary/10' : 'bg-muted')}>
        <Icon
          className={cn(
            'h-4 w-4',
            selected ? 'text-primary' : 'text-muted-foreground',
          )}
        />
      </div>
      <div>
        <p
          className={cn(
            'text-sm font-medium',
            selected ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {title}
        </p>
        <p className="text-muted-foreground mt-0.5 text-xs">{description}</p>
      </div>
    </button>
  )
}

/* -----------------------------------------------------------------------
 * AttributeGuide
 * ----------------------------------------------------------------------- */

export function AttributeGuide({
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
 * VariableChartTypeSelector
 * ----------------------------------------------------------------------- */

export function VariableChartTypeSelector({
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
          <p className={cn('text-xs font-medium', value === 'standard' ? 'text-foreground' : 'text-muted-foreground')}>
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
          <p className={cn('text-xs font-medium', value === 'cusum' ? 'text-foreground' : 'text-muted-foreground')}>
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
          <p className={cn('text-xs font-medium', value === 'ewma' ? 'text-foreground' : 'text-muted-foreground')}>
            EWMA
          </p>
          <p className="text-muted-foreground text-[10px]">Weighted avg</p>
        </div>
      </button>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 2: Limits
 * ----------------------------------------------------------------------- */

export function Step2Limits({
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
          <label htmlFor={targetId} className="text-sm font-medium">Target</label>
          <NumberInput id={targetId} step="any" value={target} onChange={onTargetChange} placeholder="Optional" className="mt-1 w-full" />
        </div>
        <div>
          <label htmlFor={uslId} className="text-sm font-medium">USL</label>
          <NumberInput id={uslId} step="any" value={usl} onChange={onUSLChange} placeholder="Optional" className={cn('mt-1 w-full', inputErrorClass(getError('usl')))} />
          <FieldError error={getError('usl')} />
        </div>
        <div>
          <label htmlFor={lslId} className="text-sm font-medium">LSL</label>
          <NumberInput id={lslId} step="any" value={lsl} onChange={onLSLChange} placeholder="Optional" className="mt-1 w-full" />
        </div>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 2: CUSUM
 * ----------------------------------------------------------------------- */

export function Step2CUSUM({
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
        <NumberInput id={targetId} step="any" value={cusumTarget} onChange={onCusumTargetChange} placeholder="Process mean / target value" className={cn('mt-1 w-full', inputErrorClass(getError('cusumTarget')))} />
        <FieldError error={getError('cusumTarget')} />
        <p className="text-muted-foreground mt-1 text-xs">
          The in-control process mean. CUSUM accumulates deviations from this value.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={kId} className="text-sm font-medium">Slack Value (k)</label>
          <NumberInput id={kId} step="any" min={0} value={cusumK} onChange={onCusumKChange} placeholder="0.5" className="mt-1 w-full" />
          <p className="text-muted-foreground mt-1 text-xs">Allowance parameter. Typically 0.5 (half the shift to detect).</p>
        </div>
        <div>
          <label htmlFor={hId} className="text-sm font-medium">Decision Interval (H)</label>
          <NumberInput id={hId} step="any" min={0} value={cusumH} onChange={onCusumHChange} placeholder="5" className="mt-1 w-full" />
          <p className="text-muted-foreground mt-1 text-xs">Threshold for signaling. Typically 4 or 5. Larger = fewer false alarms.</p>
        </div>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step 2: EWMA
 * ----------------------------------------------------------------------- */

export function Step2EWMA({
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
        <NumberInput id={targetId} step="any" value={ewmaTarget} onChange={onEwmaTargetChange} placeholder="Process mean / target value" className={cn('mt-1 w-full', inputErrorClass(getError('ewmaTarget')))} />
        <FieldError error={getError('ewmaTarget')} />
        <p className="text-muted-foreground mt-1 text-xs">
          The in-control process mean. EWMA starts at this value.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={lambdaId} className="text-sm font-medium">Smoothing Constant (lambda)</label>
          <NumberInput id={lambdaId} step="any" min={0.01} max={1} value={ewmaLambda} onChange={onEwmaLambdaChange} placeholder="0.2" className="mt-1 w-full" />
          <p className="text-muted-foreground mt-1 text-xs">Weight for the latest observation (0-1). Smaller = more smoothing. Typical: 0.05-0.25.</p>
        </div>
        <div>
          <label htmlFor={lId} className="text-sm font-medium">Limit Multiplier (L)</label>
          <NumberInput id={lId} step="any" min={0.1} value={ewmaL} onChange={onEwmaLChange} placeholder="2.7" className="mt-1 w-full" />
          <p className="text-muted-foreground mt-1 text-xs">Control limit width in sigma units. Typical: 2.7 (for lambda=0.2).</p>
        </div>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * StepIndicator
 * ----------------------------------------------------------------------- */

export function StepIndicator({
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
              <div className={cn('h-px w-12 transition-colors', isCompleted ? 'bg-primary' : 'bg-border')} />
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
              <span className={cn('text-xs font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}>
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
 * DataTypeSelector
 * ----------------------------------------------------------------------- */

export function DataTypeSelector({
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
          <BarChart3 className={cn('h-4 w-4', value === 'variable' ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <div>
          <p className={cn('text-sm font-medium', value === 'variable' ? 'text-foreground' : 'text-muted-foreground')}>Variable</p>
          <p className="text-muted-foreground text-[11px]">Measured values (length, weight, temp)</p>
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
          <PieChart className={cn('h-4 w-4', value === 'attribute' ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <div>
          <p className={cn('text-sm font-medium', value === 'attribute' ? 'text-foreground' : 'text-muted-foreground')}>Attribute</p>
          <p className="text-muted-foreground text-[11px]">Count data (defects, pass/fail)</p>
        </div>
      </button>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Step1Basics
 * ----------------------------------------------------------------------- */

export function Step1Basics({
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

      {dataType === 'variable' && (
        <div>
          <label htmlFor={subgroupId} className="text-sm font-medium">Subgroup Size</label>
          <NumberInput
            id={subgroupId}
            min={1}
            max={25}
            value={subgroupSize}
            onChange={onSubgroupSizeChange}
            className={cn('mt-1 w-full', inputErrorClass(getError('subgroupSize')))}
          />
          <FieldError error={getError('subgroupSize')} />
          <p className="text-muted-foreground mt-1 text-xs">Number of measurements per sample (1-25)</p>
        </div>
      )}

      {dataType === 'variable' && (
        <div>
          <label className="mb-2 block text-sm font-medium">Chart Type</label>
          <VariableChartTypeSelector value={variableChartType} onChange={onVariableChartTypeChange} />
        </div>
      )}

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
