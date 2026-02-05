import { Accordion, AccordionSection } from './Accordion'
import { NumberInput } from '../NumberInput'
import { HelpTooltip } from '../HelpTooltip'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SubgroupMode } from '@/types'

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
  onRecalculate: () => void
  isRecalculating?: boolean
}

export function LimitsTab({
  formData,
  characteristic,
  onChange,
  onRecalculate,
  isRecalculating = false,
}: LimitsTabProps) {
  const target = parseFloat(formData.target_value) || null
  const usl = parseFloat(formData.usl) || null
  const lsl = parseFloat(formData.lsl) || null

  // Calculate positions for visual indicator
  const hasSpecLimits = usl !== null && lsl !== null
  const range = hasSpecLimits ? usl - lsl : 0
  const targetPercent = hasSpecLimits && target !== null
    ? ((target - lsl) / range) * 100
    : 50

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
          <p className="text-sm text-muted-foreground">
            Control limits are calculated from your sample data and represent the natural process variation.
          </p>

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

          {/* Recalculate button */}
          <button
            onClick={onRecalculate}
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

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="rounded border-border" defaultChecked />
            <span className="text-muted-foreground">Exclude out-of-control points from calculation</span>
          </label>
        </div>
      </AccordionSection>

      {/* Limit Visualization - Default Closed */}
      <AccordionSection id="visualization" title="Limit Visualization">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Visual comparison of specification and control limits.
          </p>

          {/* Mini chart placeholder */}
          <div className="h-32 bg-muted/50 rounded-lg flex items-center justify-center border border-dashed border-border">
            <span className="text-sm text-muted-foreground">
              Limit comparison chart coming soon
            </span>
          </div>
        </div>
      </AccordionSection>
    </Accordion>
  )
}
