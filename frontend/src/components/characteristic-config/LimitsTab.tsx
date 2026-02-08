import { useState } from 'react'
import { Accordion, AccordionSection } from './Accordion'
import { NumberInput } from '../NumberInput'
import { HelpTooltip } from '../HelpTooltip'
import { LocalTimeRangeSelector, type TimeRangeState } from '../LocalTimeRangeSelector'
import { RefreshCw, Calculator, Edit3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SubgroupMode } from '@/types'

type LimitSource = 'calculate' | 'manual'

interface FormData {
  target_value: string
  usl: string
  lsl: string
  subgroup_mode: SubgroupMode
}

interface Characteristic {
  ucl: number | null
  lcl: number | null
  stored_sigma: number | null
  stored_center_line: number | null
  sample_count?: number
}

interface LimitsTabProps {
  formData: FormData
  characteristic: Characteristic
  onChange: (field: string, value: string) => void
  onRecalculate: (options?: { excludeOoc?: boolean; startDate?: string; endDate?: string; lastN?: number }) => void
  onSetManualLimits?: (data: { ucl: number; lcl: number; center_line: number; sigma: number }) => void
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
      <div className="py-6 text-center text-sm text-muted-foreground">
        Set specification or control limits to see the visualization.
      </div>
    )
  }

  // Capability indices
  const cp = hasSpec && effectiveSigma && effectiveSigma > 0
    ? (usl! - lsl!) / (6 * effectiveSigma)
    : null

  const cpk = hasSpec && effectiveSigma && effectiveSigma > 0 && effectiveCenterLine !== null
    ? Math.min((usl! - effectiveCenterLine) / (3 * effectiveSigma), (effectiveCenterLine - lsl!) / (3 * effectiveSigma))
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
  const zones = effectiveSigma && effectiveSigma > 0 && effectiveCenterLine !== null
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
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
              cp >= 1.33 ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                : cp >= 1.0 ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                : 'bg-red-500/10 text-red-700 dark:text-red-400'
            )}>
              <span className="text-muted-foreground font-normal">Cp</span>
              <span className="font-mono">{cp.toFixed(2)}</span>
            </div>
          )}
          {cpk !== null && (
            <div className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium',
              cpk >= 1.33 ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                : cpk >= 1.0 ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                : 'bg-red-500/10 text-red-700 dark:text-red-400'
            )}>
              <span className="text-muted-foreground font-normal">Cpk</span>
              <span className="font-mono">{cpk.toFixed(2)}</span>
            </div>
          )}
          <span className="text-xs text-muted-foreground">
            {cpk !== null && cpk >= 1.33 ? 'Capable'
              : cpk !== null && cpk >= 1.0 ? 'Marginal'
              : cpk !== null ? 'Not capable'
              : ''}
          </span>
        </div>
      )}

      {/* Combined number line */}
      <div className="relative pt-2 pb-16">
        {/* Track background */}
        <div className="relative h-10 rounded bg-muted/40 border border-border overflow-hidden">

          {/* Spec limit band (green) */}
          {hasSpec && (
            <div
              className="absolute inset-y-0 bg-green-500/10 border-x border-green-500/30"
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
                className="absolute inset-y-0 bg-blue-500/5"
                style={{
                  left: `${Math.max(0, toPercent(zones.minus2))}%`,
                  width: `${Math.min(100, toPercent(zones.plus2)) - Math.max(0, toPercent(zones.minus2))}%`,
                }}
              />
              {/* ±1σ zone */}
              <div
                className="absolute inset-y-0 bg-blue-500/8"
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
              className="absolute inset-y-0 border-x-2 border-blue-500/50 border-dashed"
              style={{
                left: `${toPercent(lcl!)}%`,
                width: `${toPercent(ucl!) - toPercent(lcl!)}%`,
              }}
            />
          )}

          {/* LSL marker */}
          {lsl !== null && (
            <div
              className="absolute inset-y-0 w-0.5 bg-red-500"
              style={{ left: `${toPercent(lsl)}%` }}
            />
          )}

          {/* USL marker */}
          {usl !== null && (
            <div
              className="absolute inset-y-0 w-0.5 bg-red-500"
              style={{ left: `${toPercent(usl)}%` }}
            />
          )}

          {/* LCL marker */}
          {lcl !== null && (
            <div
              className="absolute inset-y-0 w-0.5 bg-blue-500"
              style={{ left: `${toPercent(lcl)}%` }}
            />
          )}

          {/* UCL marker */}
          {ucl !== null && (
            <div
              className="absolute inset-y-0 w-0.5 bg-blue-500"
              style={{ left: `${toPercent(ucl)}%` }}
            />
          )}

          {/* Target marker */}
          {target !== null && (
            <div
              className="absolute inset-y-0 w-0.5 bg-emerald-600 dark:bg-emerald-400"
              style={{ left: `${toPercent(target)}%` }}
            />
          )}

          {/* Center line marker */}
          {effectiveCenterLine !== null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 border-l border-dashed border-primary"
              style={{ left: `${toPercent(effectiveCenterLine)}%` }}
            />
          )}
        </div>

        {/* Row 1 labels: Spec limits (LSL, TGT, USL) — just below track */}
        {lsl !== null && (
          <div
            className="absolute text-[10px] font-mono text-red-600 dark:text-red-400 -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${toPercent(lsl)}%`, top: '3.25rem' }}
          >
            LSL<br />{lsl}
          </div>
        )}
        {target !== null && (
          <div
            className="absolute text-[10px] font-mono text-emerald-600 dark:text-emerald-400 -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${toPercent(target)}%`, top: '3.25rem' }}
          >
            TGT<br />{target}
          </div>
        )}
        {usl !== null && (
          <div
            className="absolute text-[10px] font-mono text-red-600 dark:text-red-400 -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${toPercent(usl)}%`, top: '3.25rem' }}
          >
            USL<br />{usl}
          </div>
        )}

        {/* Row 2 labels: Control limits (LCL, X̄, UCL) — offset below row 1 */}
        {lcl !== null && (
          <div
            className="absolute text-[10px] font-mono text-blue-600 dark:text-blue-400 -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${toPercent(lcl)}%`, top: '5.25rem' }}
          >
            LCL<br />{lcl.toFixed(2)}
          </div>
        )}
        {effectiveCenterLine !== null && (
          <div
            className="absolute text-[10px] font-mono text-primary -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${toPercent(effectiveCenterLine)}%`, top: '5.25rem' }}
          >
            X̄<br />{effectiveCenterLine.toFixed(2)}
          </div>
        )}
        {ucl !== null && (
          <div
            className="absolute text-[10px] font-mono text-blue-600 dark:text-blue-400 -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${toPercent(ucl)}%`, top: '5.25rem' }}
          >
            UCL<br />{ucl.toFixed(2)}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {hasSpec && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 bg-red-500 rounded-sm" />
            Spec Limits
          </span>
        )}
        {hasControl && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 bg-blue-500 rounded-sm" />
            Control Limits
          </span>
        )}
        {target !== null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 bg-emerald-600 dark:bg-emerald-400" />
            Target
          </span>
        )}
        {effectiveCenterLine !== null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-0.5 border-t border-dashed border-primary" />
            Center Line
          </span>
        )}
        {zones && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 bg-blue-500/15 rounded-sm" />
            Sigma Zones
          </span>
        )}
      </div>

      {/* Capability explanation */}
      {hasBoth && cp !== null && (
        <div className="text-xs text-muted-foreground border-t border-border pt-3 space-y-1">
          <p><strong>Cp</strong> measures potential capability (spread vs spec width). Cp {'>'}= 1.33 is generally acceptable.</p>
          <p><strong>Cpk</strong> measures actual capability (accounts for centering). Cpk {'<'} Cp indicates the process is off-center.</p>
        </div>
      )}
    </div>
  )
}

export function LimitsTab({
  formData,
  characteristic,
  onChange,
  onRecalculate,
  onSetManualLimits,
  isRecalculating = false,
  isSettingManual = false,
}: LimitsTabProps) {
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

  const target = parseFloat(formData.target_value) || null
  const usl = parseFloat(formData.usl) || null
  const lsl = parseFloat(formData.lsl) || null

  // Calculate positions for visual indicator
  const hasSpecLimits = usl !== null && lsl !== null
  const range = hasSpecLimits ? usl - lsl : 0
  const targetPercent = hasSpecLimits && target !== null
    ? ((target - lsl) / range) * 100
    : 50

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
    const ucl = parseFloat(manualUcl)
    const lcl = parseFloat(manualLcl)
    const centerLine = parseFloat(manualCenterLine)
    const sigma = parseFloat(manualSigma)

    if (isNaN(ucl) || isNaN(lcl) || isNaN(centerLine) || isNaN(sigma)) {
      return
    }
    if (ucl <= lcl) return
    if (sigma <= 0) return
    if (centerLine < lcl || centerLine > ucl) return

    onSetManualLimits?.({ ucl, lcl, center_line: centerLine, sigma })
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
    <Accordion defaultOpen={['spec-limits', 'control-limits']} className="space-y-3">
      {/* Specification Limits - Default Open */}
      <AccordionSection id="spec-limits" title="Specification Limits">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Engineering specification limits define the acceptable range for your process.
          </p>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">LSL</label>
              <NumberInput
                step="any"
                value={formData.lsl}
                onChange={(value) => onChange('lsl', value)}
                className="w-full mt-1.5"
                placeholder="Lower limit"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Target</label>
              <NumberInput
                step="any"
                value={formData.target_value}
                onChange={(value) => onChange('target_value', value)}
                className="w-full mt-1.5"
                placeholder="Target value"
              />
            </div>
            <div>
              <label className="text-sm font-medium">USL</label>
              <NumberInput
                step="any"
                value={formData.usl}
                onChange={(value) => onChange('usl', value)}
                className="w-full mt-1.5"
                placeholder="Upper limit"
              />
            </div>
          </div>

          {/* Visual Number Line */}
          {hasSpecLimits && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="relative h-8">
                {/* Background bar */}
                <div className="absolute inset-x-0 top-3 h-2 bg-gradient-to-r from-red-200 via-green-200 to-red-200 rounded-full" />

                {/* LSL marker */}
                <div className="absolute left-0 top-0 flex flex-col items-center">
                  <div className="w-0.5 h-4 bg-red-500" />
                  <span className="text-xs text-muted-foreground mt-1">{lsl}</span>
                </div>

                {/* Target marker */}
                {target !== null && (
                  <div
                    className="absolute top-0 flex flex-col items-center -translate-x-1/2"
                    style={{ left: `${targetPercent}%` }}
                  >
                    <div className="w-0.5 h-4 bg-primary" />
                    <span className="text-xs font-medium text-primary mt-1">{target}</span>
                  </div>
                )}

                {/* USL marker */}
                <div className="absolute right-0 top-0 flex flex-col items-center">
                  <div className="w-0.5 h-4 bg-red-500" />
                  <span className="text-xs text-muted-foreground mt-1">{usl}</span>
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
            />
          </div>
        }
      >
        <div className="space-y-4">
          {/* Current limits display */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">LCL</label>
              <div className="mt-1.5 px-3 py-2 bg-muted rounded-lg font-mono text-sm">
                {characteristic.lcl?.toFixed(4) ?? '—'}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">UCL</label>
              <div className="mt-1.5 px-3 py-2 bg-muted rounded-lg font-mono text-sm">
                {characteristic.ucl?.toFixed(4) ?? '—'}
              </div>
            </div>
          </div>

          {/* Calculation info */}
          {characteristic.stored_sigma && (
            <div className="text-sm text-muted-foreground">
              Based on: {characteristic.sample_count ?? '?'} samples, σ = {characteristic.stored_sigma.toFixed(4)}
            </div>
          )}

          {/* Source toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setLimitSource('calculate')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                limitSource === 'calculate'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              <Calculator className="h-4 w-4" />
              Calculate from Data
            </button>
            <button
              type="button"
              onClick={() => setLimitSource('manual')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors',
                limitSource === 'manual'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              <Edit3 className="h-4 w-4" />
              Set Manually
            </button>
          </div>

          {/* Calculate from Data mode */}
          {limitSource === 'calculate' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Control limits are calculated from your sample data and represent the natural process variation.
              </p>

              {/* Baseline period selector */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Baseline Period</label>
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
                  {(dateRange.type === 'custom' || (dateRange.type === 'duration' && dateRange.hoursBack)) && (
                    <button
                      type="button"
                      onClick={() => setDateRange({ type: 'duration', pointsLimit: null, hoursBack: 0, startDate: null, endDate: null })}
                      className="text-xs text-primary hover:underline whitespace-nowrap"
                    >
                      Use all data
                    </button>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-border"
                  checked={excludeOoc}
                  onChange={(e) => setExcludeOoc(e.target.checked)}
                />
                <span className="text-muted-foreground">Exclude out-of-control points from calculation</span>
              </label>

              {/* Recalculate button */}
              <button
                type="button"
                onClick={handleRecalculate}
                disabled={isRecalculating}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2.5',
                  'text-sm font-medium rounded-lg border border-border',
                  'hover:bg-muted transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
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
              <p className="text-sm text-muted-foreground">
                Enter values from an external capability study or validation protocol.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">LCL</label>
                  <NumberInput
                    step="any"
                    value={manualLcl}
                    onChange={setManualLcl}
                    className="w-full mt-1.5"
                    placeholder="Lower control limit"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">UCL</label>
                  <NumberInput
                    step="any"
                    value={manualUcl}
                    onChange={setManualUcl}
                    className="w-full mt-1.5"
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
                    className="w-full mt-1.5"
                    placeholder="Process mean"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Sigma (σ)</label>
                  <NumberInput
                    step="any"
                    value={manualSigma}
                    onChange={setManualSigma}
                    className="w-full mt-1.5"
                    placeholder="Process std dev"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSetManual}
                disabled={isSettingManual || !isManualValid}
                className={cn(
                  'w-full flex items-center justify-center gap-2 px-4 py-2.5',
                  'text-sm font-medium rounded-lg',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isSettingManual ? 'Applying...' : 'Apply Manual Limits'}
              </button>
            </div>
          )}
        </div>
      </AccordionSection>

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
