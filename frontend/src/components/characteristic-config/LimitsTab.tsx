import { useState } from 'react'
import { Accordion, AccordionSection } from './Accordion'
import { NumberInput } from '../NumberInput'
import { HelpTooltip } from '../HelpTooltip'
import { StatNote } from '@/components/StatNote'
import { ChangeReasonDialog } from '@/components/ChangeReasonDialog'
import { LocalTimeRangeSelector, type TimeRangeState } from '../LocalTimeRangeSelector'
import { RefreshCw, Calculator, Edit3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLicense } from '@/hooks/useLicense'
import type { SubgroupMode } from '@/types'

type LimitSource = 'calculate' | 'manual'

interface FormData {
  target_value: string
  usl: string
  lsl: string
  subgroup_mode: SubgroupMode
  chart_type: '' | 'cusum' | 'ewma'
  cusum_target: string
  cusum_k: string
  cusum_h: string
  ewma_lambda: string
  ewma_l: string
  use_laney_correction?: boolean
  short_run_mode?: '' | 'deviation' | 'standardized'
  sigma_method?: '' | 'r_bar_d2' | 's_bar_c4' | 'moving_range' | 'pooled'
}

interface Characteristic {
  ucl: number | null
  lcl: number | null
  stored_sigma: number | null
  stored_center_line: number | null
  sample_count?: number
  attribute_chart_type?: 'p' | 'np' | 'c' | 'u' | null
  subgroup_size?: number
}

interface LimitsTabProps {
  formData: FormData
  characteristic: Characteristic
  dataType?: 'variable' | 'attribute'
  onChange: (field: string, value: string | boolean) => void
  onRecalculate: (options?: {
    excludeOoc?: boolean
    startDate?: string
    endDate?: string
    lastN?: number
  }) => void
  onSetManualLimits?: (data: {
    ucl: number
    lcl: number
    center_line: number
    sigma: number
    change_reason?: string
  }) => void
  isRecalculating?: boolean
  isSettingManual?: boolean
}

/**
 * Visual comparison of specification and control limits on a single number line,
 * with process capability indices (Cp, Cpk) when both are defined.
 */
function LimitVisualization({
  lsl,
  usl,
  target,
  lcl,
  ucl,
  centerLine,
  sigma,
}: {
  lsl: number | null
  usl: number | null
  target: number | null
  lcl: number | null
  ucl: number | null
  centerLine: number | null
  sigma: number | null
}) {
  const hasSpec = lsl !== null && usl !== null
  const hasControl = lcl !== null && ucl !== null
  const hasBoth = hasSpec && hasControl

  // Derive sigma and center line from control limits when stored values aren't available
  // Standard 3-sigma control charts: UCL = X̄ + 3σ, LCL = X̄ - 3σ
  const effectiveCenterLine = centerLine ?? (hasControl ? (ucl! + lcl!) / 2 : null)
  const effectiveSigma = sigma ?? (hasControl ? (ucl! - lcl!) / 6 : null)

  // Nothing to visualize
  if (!hasSpec && !hasControl) {
    return (
      <div className="text-muted-foreground py-6 text-center text-sm">
        Set specification or control limits to see the visualization.
      </div>
    )
  }

  // Capability indices
  const cp =
    hasSpec && effectiveSigma && effectiveSigma > 0 ? (usl! - lsl!) / (6 * effectiveSigma) : null

  const cpk =
    hasSpec && effectiveSigma && effectiveSigma > 0 && effectiveCenterLine !== null
      ? Math.min(
          (usl! - effectiveCenterLine) / (3 * effectiveSigma),
          (effectiveCenterLine - lsl!) / (3 * effectiveSigma),
        )
      : null

  // Compute the overall range for the number line - pad 10% on each side
  const allValues: number[] = []
  if (lsl !== null) allValues.push(lsl)
  if (usl !== null) allValues.push(usl)
  if (lcl !== null) allValues.push(lcl)
  if (ucl !== null) allValues.push(ucl)
  if (target !== null) allValues.push(target)
  if (effectiveCenterLine !== null) allValues.push(effectiveCenterLine)

  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const span = maxVal - minVal || 1
  const pad = span * 0.12
  const rangeMin = minVal - pad
  const rangeMax = maxVal + pad
  const totalRange = rangeMax - rangeMin

  const toPercent = (v: number) => ((v - rangeMin) / totalRange) * 100

  // Zone boundaries (±1σ, ±2σ from center line)
  const zones =
    effectiveSigma && effectiveSigma > 0 && effectiveCenterLine !== null
      ? {
          minus2: effectiveCenterLine - 2 * effectiveSigma,
          minus1: effectiveCenterLine - effectiveSigma,
          plus1: effectiveCenterLine + effectiveSigma,
          plus2: effectiveCenterLine + 2 * effectiveSigma,
        }
      : null

  return (
    <div className="space-y-4">
      {/* Capability indices */}
      {(cp !== null || cpk !== null) && (
        <div className="flex items-center gap-3">
          {cp !== null && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium',
                cp >= 1.33
                  ? 'bg-success/10 text-success'
                  : cp >= 1.0
                    ? 'bg-warning/10 text-warning'
                    : 'bg-destructive/10 text-destructive',
              )}
            >
              <span className="text-muted-foreground font-normal">Cp</span>
              <span className="font-mono">{cp.toFixed(2)}</span>
            </div>
          )}
          {cpk !== null && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium',
                cpk >= 1.33
                  ? 'bg-success/10 text-success'
                  : cpk >= 1.0
                    ? 'bg-warning/10 text-warning'
                    : 'bg-destructive/10 text-destructive',
              )}
            >
              <span className="text-muted-foreground font-normal">Cpk</span>
              <span className="font-mono">{cpk.toFixed(2)}</span>
            </div>
          )}
          <span className="text-muted-foreground text-xs">
            {cpk !== null && cpk >= 1.33
              ? 'Capable'
              : cpk !== null && cpk >= 1.0
                ? 'Marginal'
                : cpk !== null
                  ? 'Not capable'
                  : ''}
          </span>
        </div>
      )}

      {/* Combined number line */}
      <div className="relative pt-2 pb-16">
        {/* Track background */}
        <div className="bg-muted/40 border-border relative h-10 overflow-hidden rounded border">
          {/* Spec limit band (green) */}
          {hasSpec && (
            <div
              className="border-success/30 bg-success/10 absolute inset-y-0 border-x"
              style={{
                left: `${toPercent(lsl!)}%`,
                width: `${toPercent(usl!) - toPercent(lsl!)}%`,
              }}
            />
          )}

          {/* Zone shading (±1σ, ±2σ) */}
          {zones && (
            <>
              {/* ±2σ zone */}
              <div
                className="bg-primary/5 absolute inset-y-0"
                style={{
                  left: `${Math.max(0, toPercent(zones.minus2))}%`,
                  width: `${Math.min(100, toPercent(zones.plus2)) - Math.max(0, toPercent(zones.minus2))}%`,
                }}
              />
              {/* ±1σ zone */}
              <div
                className="bg-primary/8 absolute inset-y-0"
                style={{
                  left: `${Math.max(0, toPercent(zones.minus1))}%`,
                  width: `${Math.min(100, toPercent(zones.plus1)) - Math.max(0, toPercent(zones.minus1))}%`,
                }}
              />
            </>
          )}

          {/* Control limit band outline (blue dashed) */}
          {hasControl && (
            <div
              className="border-primary/50 absolute inset-y-0 border-x-2 border-dashed"
              style={{
                left: `${toPercent(lcl!)}%`,
                width: `${toPercent(ucl!) - toPercent(lcl!)}%`,
              }}
            />
          )}

          {/* LSL marker */}
          {lsl !== null && (
            <div
              className="bg-destructive absolute inset-y-0 w-0.5"
              style={{ left: `${toPercent(lsl)}%` }}
            />
          )}

          {/* USL marker */}
          {usl !== null && (
            <div
              className="bg-destructive absolute inset-y-0 w-0.5"
              style={{ left: `${toPercent(usl)}%` }}
            />
          )}

          {/* LCL marker */}
          {lcl !== null && (
            <div
              className="bg-primary absolute inset-y-0 w-0.5"
              style={{ left: `${toPercent(lcl)}%` }}
            />
          )}

          {/* UCL marker */}
          {ucl !== null && (
            <div
              className="bg-primary absolute inset-y-0 w-0.5"
              style={{ left: `${toPercent(ucl)}%` }}
            />
          )}

          {/* Target marker */}
          {target !== null && (
            <div
              className="bg-success absolute inset-y-0 w-0.5"
              style={{ left: `${toPercent(target)}%` }}
            />
          )}

          {/* Center line marker */}
          {effectiveCenterLine !== null && (
            <div
              className="border-primary absolute top-0 bottom-0 w-0.5 border-l border-dashed"
              style={{ left: `${toPercent(effectiveCenterLine)}%` }}
            />
          )}
        </div>

        {/* Row 1 labels: Spec limits (LSL, TGT, USL) — just below track */}
        {lsl !== null && (
          <div
            className="text-destructive absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(lsl)}%`, top: '3.25rem' }}
          >
            LSL
            <br />
            {lsl}
          </div>
        )}
        {target !== null && (
          <div
            className="text-success absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(target)}%`, top: '3.25rem' }}
          >
            TGT
            <br />
            {target}
          </div>
        )}
        {usl !== null && (
          <div
            className="text-destructive absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(usl)}%`, top: '3.25rem' }}
          >
            USL
            <br />
            {usl}
          </div>
        )}

        {/* Row 2 labels: Control limits (LCL, X̄, UCL) — offset below row 1 */}
        {lcl !== null && (
          <div
            className="text-primary absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(lcl)}%`, top: '5.25rem' }}
          >
            LCL
            <br />
            {lcl.toFixed(2)}
          </div>
        )}
        {effectiveCenterLine !== null && (
          <div
            className="text-primary absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(effectiveCenterLine)}%`, top: '5.25rem' }}
          >
            X̄
            <br />
            {effectiveCenterLine.toFixed(2)}
          </div>
        )}
        {ucl !== null && (
          <div
            className="text-primary absolute -translate-x-1/2 font-mono text-[10px] whitespace-nowrap"
            style={{ left: `${toPercent(ucl)}%`, top: '5.25rem' }}
          >
            UCL
            <br />
            {ucl.toFixed(2)}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {hasSpec && (
          <span className="flex items-center gap-1.5">
            <span className="bg-destructive inline-block h-2 w-3 rounded-sm" />
            Spec Limits
          </span>
        )}
        {hasControl && (
          <span className="flex items-center gap-1.5">
            <span className="bg-primary inline-block h-2 w-3 rounded-sm" />
            Control Limits
          </span>
        )}
        {target !== null && (
          <span className="flex items-center gap-1.5">
            <span className="bg-success inline-block h-0.5 w-3" />
            Target
          </span>
        )}
        {effectiveCenterLine !== null && (
          <span className="flex items-center gap-1.5">
            <span className="border-primary inline-block h-0.5 w-3 border-t border-dashed" />
            Center Line
          </span>
        )}
        {zones && (
          <span className="flex items-center gap-1.5">
            <span className="bg-primary/15 inline-block h-2 w-3 rounded-sm" />
            Sigma Zones
          </span>
        )}
      </div>

      {/* Capability explanation */}
      {hasBoth && cp !== null && (
        <div className="text-muted-foreground border-border space-y-1 border-t pt-3 text-xs">
          <p>
            <strong>Cp</strong> measures potential capability (spread vs spec width). Cp {'>'}= 1.33
            is generally acceptable.
          </p>
          <p>
            <strong>Cpk</strong> measures actual capability (accounts for centering). Cpk {'<'} Cp
            indicates the process is off-center.
          </p>
        </div>
      )}
    </div>
  )
}

export function LimitsTab({
  formData,
  characteristic,
  dataType,
  onChange,
  onRecalculate,
  onSetManualLimits,
  isRecalculating = false,
  isSettingManual = false,
}: LimitsTabProps) {
  const { isProOrAbove } = useLicense()
  const [limitSource, setLimitSource] = useState<LimitSource>('calculate')
  const [excludeOoc, setExcludeOoc] = useState(true)
  const [dateRange, setDateRange] = useState<TimeRangeState>({
    type: 'duration',
    pointsLimit: null,
    hoursBack: 0,
    startDate: null,
    endDate: null,
  })
  const [manualUcl, setManualUcl] = useState('')
  const [manualLcl, setManualLcl] = useState('')
  const [manualCenterLine, setManualCenterLine] = useState('')
  const [manualSigma, setManualSigma] = useState('')
  const [changeReasonOpen, setChangeReasonOpen] = useState(false)

  const target = isNaN(parseFloat(formData.target_value)) ? null : parseFloat(formData.target_value)
  const usl = isNaN(parseFloat(formData.usl)) ? null : parseFloat(formData.usl)
  const lsl = isNaN(parseFloat(formData.lsl)) ? null : parseFloat(formData.lsl)

  // Calculate positions for visual indicator
  const hasSpecLimits = usl !== null && lsl !== null
  const range = hasSpecLimits ? usl - lsl : 0
  const targetPercent = hasSpecLimits && target !== null ? ((target - lsl) / range) * 100 : 50

  const handleRecalculate = () => {
    let startDate: string | undefined
    let endDate: string | undefined
    let lastN: number | undefined

    if (dateRange.type === 'points' && dateRange.pointsLimit) {
      lastN = dateRange.pointsLimit
    } else if (dateRange.type === 'custom' && dateRange.startDate && dateRange.endDate) {
      startDate = dateRange.startDate
      endDate = dateRange.endDate
    } else if (dateRange.type === 'duration' && dateRange.hoursBack) {
      startDate = new Date(Date.now() - dateRange.hoursBack * 60 * 60 * 1000).toISOString()
      endDate = new Date().toISOString()
    }
    // hoursBack === 0 means "all data" (no date filter, no lastN)

    onRecalculate({
      excludeOoc,
      startDate,
      endDate,
      lastN,
    })
  }

  const handleSetManual = () => {
    if (!isManualValid) return
    setChangeReasonOpen(true)
  }

  const handleSetManualWithReason = (reason: string) => {
    const ucl = parseFloat(manualUcl)
    const lcl = parseFloat(manualLcl)
    const centerLine = parseFloat(manualCenterLine)
    const sigma = parseFloat(manualSigma)

    onSetManualLimits?.({
      ucl,
      lcl,
      center_line: centerLine,
      sigma,
      change_reason: reason || undefined,
    })
    setChangeReasonOpen(false)
  }

  const isManualValid = (() => {
    const ucl = parseFloat(manualUcl)
    const lcl = parseFloat(manualLcl)
    const centerLine = parseFloat(manualCenterLine)
    const sigma = parseFloat(manualSigma)
    if (isNaN(ucl) || isNaN(lcl) || isNaN(centerLine) || isNaN(sigma)) return false
    if (ucl <= lcl) return false
    if (sigma <= 0) return false
    if (centerLine < lcl || centerLine > ucl) return false
    return true
  })()

  return (
    <Accordion defaultOpen={['chart-type', 'spec-limits', 'control-limits']} className="space-y-3">
      {/* Default Analysis Selection */}
      <AccordionSection id="chart-type" title="Default Analysis">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Choose the default analysis view for this characteristic. Standard (Shewhart) is the
            default. CUSUM and EWMA are supplementary analyses for detecting small, sustained
            shifts. This can be overridden per session on the dashboard.
          </p>

          {/* Chart type selector */}
          <div className="border-border flex overflow-hidden rounded-lg border">
            {(['', 'cusum', 'ewma'] as const).map((type) => (
              <button
                key={type || 'standard'}
                type="button"
                onClick={() => onChange('chart_type', type)}
                className={cn(
                  'flex flex-1 items-center justify-center px-3 py-2 text-sm font-medium transition-colors',
                  formData.chart_type === type
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted',
                )}
              >
                {type === '' ? 'Standard' : type === 'cusum' ? 'CUSUM' : 'EWMA'}
              </button>
            ))}
          </div>

          {/* CUSUM parameters */}
          {formData.chart_type === 'cusum' && (
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs">
                CUSUM (Cumulative Sum) detects small sustained shifts. k is the slack value
                (typically 0.5σ), H is the decision interval (typically 4-5σ).
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">Target (μ₀)</label>
                  <NumberInput
                    step="any"
                    value={formData.cusum_target}
                    onChange={(value) => onChange('cusum_target', value)}
                    className="mt-1.5 w-full"
                    placeholder="Process target"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">k (slack)</label>
                  <NumberInput
                    step="any"
                    value={formData.cusum_k}
                    onChange={(value) => onChange('cusum_k', value)}
                    className="mt-1.5 w-full"
                    placeholder="0.5"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">H (decision)</label>
                  <NumberInput
                    step="any"
                    value={formData.cusum_h}
                    onChange={(value) => onChange('cusum_h', value)}
                    className="mt-1.5 w-full"
                    placeholder="5"
                  />
                </div>
              </div>
            </div>
          )}

          {/* EWMA parameters */}
          {formData.chart_type === 'ewma' && (
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs">
                EWMA (Exponentially Weighted Moving Average) smooths data to detect small shifts.
                λ is the smoothing factor (0.05-0.25), L is the control limit width (typically 2.5-3).
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">λ (lambda)</label>
                  <NumberInput
                    step="any"
                    value={formData.ewma_lambda}
                    onChange={(value) => onChange('ewma_lambda', value)}
                    className="mt-1.5 w-full"
                    placeholder="0.2"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">L (width)</label>
                  <NumberInput
                    step="any"
                    value={formData.ewma_l}
                    onChange={(value) => onChange('ewma_l', value)}
                    className="mt-1.5 w-full"
                    placeholder="3"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Laney p'/u' correction (commercial only) */}
          {isProOrAbove &&
            (characteristic?.attribute_chart_type === 'p' ||
              characteristic?.attribute_chart_type === 'u') && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="laney-correction"
                  checked={formData.use_laney_correction ?? false}
                  onChange={(e) => onChange('use_laney_correction', e.target.checked)}
                  className="border-border rounded"
                />
                <label htmlFor="laney-correction" className="text-sm">
                  Use Laney p&apos;/u&apos; correction
                  <span className="text-muted-foreground ml-1">
                    (adjusts limits for over/under-dispersion)
                  </span>
                </label>
              </div>
            )}

          {/* Short-Run Mode (variable data only, commercial only) */}
          {isProOrAbove && dataType === 'variable' && (
            <div className="mt-3 space-y-2">
              <label className="text-sm font-medium">Short-Run Mode</label>
              <p className="text-muted-foreground text-xs">
                Short-run charts normalize data across multiple part numbers or short production
                runs, enabling meaningful SPC with limited data per part.
              </p>
              <select
                value={formData.short_run_mode ?? ''}
                onChange={(e) => onChange('short_run_mode', e.target.value)}
                className={cn(
                  'border-border bg-background w-full rounded-lg border px-3 py-2 text-sm',
                  'focus:border-primary focus:ring-primary/20 focus:ring-2 focus:outline-none',
                )}
              >
                <option value="">Off (standard chart)</option>
                <option value="deviation">Deviation from Target</option>
                <option value="standardized">Standardized (Z)</option>
              </select>
              {formData.short_run_mode === 'deviation' && (
                <p className="text-muted-foreground text-xs">
                  Each point is plotted as (value - target). Requires a target value to be set.
                </p>
              )}
              {formData.short_run_mode === 'standardized' && (
                <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  Each point is plotted as (value - target) / sigma. Control limits become fixed at
                  &plusmn;3.
                  <StatNote>
                    Standardized mode requires a stored &sigma; value to be
                    configured. Submissions will be rejected without it.
                  </StatNote>
                </p>
              )}
            </div>
          )}
        </div>
      </AccordionSection>

      {/* Specification Limits - Default Open */}
      <AccordionSection id="spec-limits" title="Specification Limits">
        <div className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Engineering specification limits define the acceptable range for your process.
          </p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">LSL</label>
              <NumberInput
                step="any"
                value={formData.lsl}
                onChange={(value) => onChange('lsl', value)}
                className="mt-1.5 w-full"
                placeholder="Lower limit"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Target</label>
              <NumberInput
                step="any"
                value={formData.target_value}
                onChange={(value) => onChange('target_value', value)}
                className="mt-1.5 w-full"
                placeholder="Target value"
              />
            </div>
            <div>
              <label className="text-sm font-medium">USL</label>
              <NumberInput
                step="any"
                value={formData.usl}
                onChange={(value) => onChange('usl', value)}
                className="mt-1.5 w-full"
                placeholder="Upper limit"
              />
            </div>
          </div>

          {/* Visual Number Line */}
          {hasSpecLimits && (
            <div className="border-border mt-4 border-t pt-4">
              <div className="relative h-8">
                {/* Background bar */}
                <div className="from-destructive/20 via-success/20 to-destructive/20 absolute inset-x-0 top-3 h-2 rounded-full bg-gradient-to-r" />

                {/* LSL marker */}
                <div className="absolute top-0 left-0 flex flex-col items-center">
                  <div className="bg-destructive h-4 w-0.5" />
                  <span className="text-muted-foreground mt-1 text-xs">{lsl}</span>
                </div>

                {/* Target marker */}
                {target !== null && (
                  <div
                    className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                    style={{ left: `${targetPercent}%` }}
                  >
                    <div className="bg-primary h-4 w-0.5" />
                    <span className="text-primary mt-1 text-xs font-medium">{target}</span>
                  </div>
                )}

                {/* USL marker */}
                <div className="absolute top-0 right-0 flex flex-col items-center">
                  <div className="bg-destructive h-4 w-0.5" />
                  <span className="text-muted-foreground mt-1 text-xs">{usl}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </AccordionSection>

      {/* Control Limits - Default Open */}
      <AccordionSection
        id="control-limits"
        title={
          <div className="flex items-center gap-2">
            <span>Control Limits</span>
            <HelpTooltip
              helpKey={
                formData.subgroup_mode === 'STANDARDIZED'
                  ? 'ucl-lcl-standardized'
                  : formData.subgroup_mode === 'VARIABLE_LIMITS'
                    ? 'ucl-lcl-variable'
                    : 'ucl-lcl-nominal'
              }
              triggerAs="span"
            />
          </div>
        }
      >
        <div className="space-y-4">
          {/* Current limits display */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-muted-foreground text-sm font-medium">LCL</label>
              <div className="bg-muted mt-1.5 rounded-lg px-3 py-2 font-mono text-sm">
                {characteristic.lcl?.toFixed(4) ?? '—'}
              </div>
            </div>
            <div>
              <label className="text-muted-foreground text-sm font-medium">UCL</label>
              <div className="bg-muted mt-1.5 rounded-lg px-3 py-2 font-mono text-sm">
                {characteristic.ucl?.toFixed(4) ?? '—'}
              </div>
            </div>
          </div>

          {/* Source toggle */}
          <div className="border-border flex overflow-hidden rounded-lg border">
            <button
              type="button"
              onClick={() => setLimitSource('calculate')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                limitSource === 'calculate'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              <Calculator className="h-4 w-4" />
              Calculate from Data
            </button>
            <button
              type="button"
              onClick={() => setLimitSource('manual')}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                limitSource === 'manual'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted',
              )}
            >
              <Edit3 className="h-4 w-4" />
              Set Manually
            </button>
          </div>

          {/* Calculate from Data mode */}
          {limitSource === 'calculate' && (
            <div className="space-y-4">
              {characteristic.stored_sigma && (
                <div className="text-muted-foreground text-sm">
                  Based on: {characteristic.sample_count ?? '?'} samples, σ ={' '}
                  {characteristic.stored_sigma.toFixed(4)}
                </div>
              )}

              <p className="text-muted-foreground text-sm">
                Control limits are calculated from your sample data and represent the natural
                process variation.
              </p>

              {/* Baseline period selector */}
              <div>
                <label className="text-muted-foreground mb-1.5 block text-sm font-medium">
                  Baseline Period
                </label>
                <div className="flex items-center gap-2">
                  <LocalTimeRangeSelector
                    value={dateRange}
                    onChange={setDateRange}
                    presets={[
                      { label: 'All data', type: 'duration', value: 0 },
                      { label: 'Last 50', type: 'points', value: 50 },
                      { label: 'Last 100', type: 'points', value: 100 },
                      { label: 'Last 200', type: 'points', value: 200 },
                      { label: 'Last 24h', type: 'duration', value: 24 },
                      { label: 'Last 7 days', type: 'duration', value: 168 },
                      { label: 'Last 30 days', type: 'duration', value: 720 },
                    ]}
                  />
                  {(dateRange.type === 'custom' ||
                    (dateRange.type === 'duration' && dateRange.hoursBack)) && (
                    <button
                      type="button"
                      onClick={() =>
                        setDateRange({
                          type: 'duration',
                          pointsLimit: null,
                          hoursBack: 0,
                          startDate: null,
                          endDate: null,
                        })
                      }
                      className="text-primary text-xs whitespace-nowrap hover:underline"
                    >
                      Use all data
                    </button>
                  )}
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="border-border rounded"
                  checked={excludeOoc}
                  onChange={(e) => setExcludeOoc(e.target.checked)}
                />
                <span className="text-muted-foreground">
                  Exclude out-of-control points from calculation
                </span>
              </label>

              {/* Recalculate button */}
              <button
                type="button"
                onClick={handleRecalculate}
                disabled={isRecalculating}
                className={cn(
                  'flex w-full items-center justify-center gap-2 px-4 py-2.5',
                  'border-border rounded-lg border text-sm font-medium',
                  'hover:bg-muted transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <RefreshCw className={cn('h-4 w-4', isRecalculating && 'animate-spin')} />
                {isRecalculating ? 'Recalculating...' : 'Recalculate from Data'}
              </button>
            </div>
          )}

          {/* Set Manually mode */}
          {limitSource === 'manual' && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Enter values from an external capability study or validation protocol.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">LCL</label>
                  <NumberInput
                    step="any"
                    value={manualLcl}
                    onChange={setManualLcl}
                    className="mt-1.5 w-full"
                    placeholder="Lower control limit"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">UCL</label>
                  <NumberInput
                    step="any"
                    value={manualUcl}
                    onChange={setManualUcl}
                    className="mt-1.5 w-full"
                    placeholder="Upper control limit"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Center Line (X̄)</label>
                  <NumberInput
                    step="any"
                    value={manualCenterLine}
                    onChange={setManualCenterLine}
                    className="mt-1.5 w-full"
                    placeholder="Process mean"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Sigma (σ)</label>
                  <NumberInput
                    step="any"
                    value={manualSigma}
                    onChange={setManualSigma}
                    className="mt-1.5 w-full"
                    placeholder="Process std dev"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSetManual}
                disabled={isSettingManual || !isManualValid}
                className={cn(
                  'flex w-full items-center justify-center gap-2 px-4 py-2.5',
                  'rounded-lg text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {isSettingManual ? 'Applying...' : 'Apply Manual Limits'}
              </button>

              <ChangeReasonDialog
                open={changeReasonOpen}
                onConfirm={handleSetManualWithReason}
                onCancel={() => setChangeReasonOpen(false)}
                title="Reason for Manual Limits"
                description="Describe why control limits are being manually set (e.g., external capability study reference)."
                isLoading={isSettingManual}
              />
            </div>
          )}
        </div>
      </AccordionSection>

      {/* Sigma Estimation - Variable data only, default closed */}
      {dataType === 'variable' && (
        <AccordionSection id="sigma-estimation" title="Sigma Estimation">
          <div className="space-y-2">
            <label className="text-sm font-medium">Sigma Estimation Method</label>
            <div className="space-y-1">
              {(
                [
                  { value: '', label: 'Auto', desc: 'Based on subgroup size', always: true },
                  {
                    value: 'moving_range',
                    label: 'MR̄/d₂',
                    desc: 'Moving range — individuals only',
                    always: false,
                    enabled: (characteristic.subgroup_size ?? 1) === 1,
                    reason: 'Requires subgroup size = 1',
                  },
                  {
                    value: 'r_bar_d2',
                    label: 'R̄/d₂',
                    desc: 'Range-based (subgroups 2–10)',
                    always: false,
                    enabled: (characteristic.subgroup_size ?? 1) > 1,
                    reason: 'Requires subgroup size > 1',
                  },
                  {
                    value: 's_bar_c4',
                    label: 'S̄/c₄',
                    desc: 'Std dev-based (any subgroup > 1)',
                    always: false,
                    enabled: (characteristic.subgroup_size ?? 1) > 1,
                    reason: 'Requires subgroup size > 1',
                  },
                  {
                    value: 'pooled',
                    label: 'Sp (pooled)',
                    desc: 'Pooled std dev (ISO 22514-2)',
                    always: false,
                    enabled: (characteristic.subgroup_size ?? 1) > 1,
                    reason: 'Requires subgroup size > 1',
                  },
                ] as const
              ).map((opt) => {
                const isEnabled = opt.always || opt.enabled
                const isSelected = (formData.sigma_method ?? '') === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={!isEnabled}
                    onClick={() => isEnabled && onChange('sigma_method', opt.value)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-primary/20 ring-1'
                        : isEnabled
                          ? 'border-border hover:bg-muted/50'
                          : 'border-border/50 opacity-40 cursor-not-allowed',
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                        isSelected
                          ? 'border-primary'
                          : isEnabled
                            ? 'border-muted-foreground/40'
                            : 'border-muted-foreground/20',
                      )}
                    >
                      {isSelected && <div className="bg-primary h-2 w-2 rounded-full" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('font-medium', !isEnabled && 'line-through')}>
                          {opt.label}
                        </span>
                        {!isEnabled && (
                          <span className="text-muted-foreground text-[10px] italic">
                            {opt.reason}
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground text-xs">{opt.desc}</span>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="text-muted-foreground text-xs">
              {!formData.sigma_method
                ? 'Auto-selects: MR̄/d₂ for n=1, R̄/d₂ for n≤10, S̄/c₄ for n>10'
                : formData.sigma_method === 'moving_range'
                  ? 'Uses consecutive moving ranges divided by d₂ (1.128) for individuals data'
                  : formData.sigma_method === 'r_bar_d2'
                    ? 'Uses mean of subgroup ranges divided by d₂. Standard for subgroup sizes 2–10'
                    : formData.sigma_method === 'pooled'
                      ? 'Pooled standard deviation Sp = √(Σ(nᵢ-1)sᵢ² / Σ(nᵢ-1)). ISO 22514-2'
                      : 'Uses mean of subgroup standard deviations divided by c₄. More efficient for larger subgroups'}
            </p>
          </div>
        </AccordionSection>
      )}

      {/* Limit Visualization - Default Closed */}
      <AccordionSection id="visualization" title="Limit Visualization">
        <LimitVisualization
          lsl={lsl}
          usl={usl}
          target={target}
          lcl={characteristic.lcl}
          ucl={characteristic.ucl}
          centerLine={characteristic.stored_center_line}
          sigma={characteristic.stored_sigma}
        />
      </AccordionSection>
    </Accordion>
  )
}
