import { Accordion, AccordionSection } from './Accordion'
import { NumberInput } from '../NumberInput'
import { HelpTooltip } from '../HelpTooltip'
import { ScheduleConfigSection, type ScheduleConfig } from '../ScheduleConfigSection'
import { cn } from '@/lib/utils'
import type { SubgroupMode } from '@/types'

interface FormData {
  subgroup_mode: SubgroupMode
  min_measurements: string
  warn_below_count: string
}

interface Characteristic {
  subgroup_size: number
  is_manual: boolean
  stored_sigma: number | null
  stored_center_line: number | null
}

interface SamplingTabProps {
  formData: FormData
  characteristic: Characteristic
  scheduleConfig: ScheduleConfig
  onChange: (field: string, value: string) => void
  onScheduleChange: (config: ScheduleConfig) => void
  onModeChange: (mode: string) => void
  isModeChangePending?: boolean
}

const SUBGROUP_MODES = [
  {
    value: 'NOMINAL_TOLERANCE' as SubgroupMode,
    label: 'Nominal with Tolerance',
    badge: 'Recommended',
    description:
      'Uses nominal subgroup size for control limits with minimum threshold enforcement.',
    helpKey: 'subgroup-mode-nominal',
  },
  {
    value: 'VARIABLE_LIMITS' as SubgroupMode,
    label: 'Variable Control Limits',
    badge: null,
    description:
      'Recalculates control limits per point based on actual sample size (funnel effect).',
    helpKey: 'subgroup-mode-variable',
  },
  {
    value: 'STANDARDIZED' as SubgroupMode,
    label: 'Standardized (Z-Score)',
    badge: null,
    description:
      'Plots Z-scores with fixed ±3 control limits, normalizing for sample size variation.',
    helpKey: 'subgroup-mode-standardized',
  },
]

export function SamplingTab({
  formData,
  characteristic,
  scheduleConfig,
  onChange,
  onScheduleChange,
  onModeChange,
  isModeChangePending = false,
}: SamplingTabProps) {
  const isManual = characteristic.is_manual
  const showStoredParams =
    formData.subgroup_mode === 'STANDARDIZED' || formData.subgroup_mode === 'VARIABLE_LIMITS'

  const defaultOpen = ['subgroup']
  if (isManual) defaultOpen.push('schedule')
  if (showStoredParams) defaultOpen.push('stored-params')

  return (
    <Accordion defaultOpen={defaultOpen} className="space-y-3">
      {/* Subgroup Configuration - Default Open */}
      <AccordionSection id="subgroup" title="Subgroup Configuration">
        <div className="space-y-5">
          {/* Subgroup Size (read-only) */}
          <div>
            <label className="text-muted-foreground text-sm font-medium">Subgroup Size</label>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="bg-muted rounded-lg px-4 py-2 font-mono text-lg font-semibold">
                {characteristic.subgroup_size}
              </div>
              <span className="text-muted-foreground text-sm">
                measurements per sample (fixed at creation)
              </span>
            </div>
          </div>

          <hr className="border-border" />

          {/* Handling Mode */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <label className="text-sm font-medium">Handling Mode</label>
              <HelpTooltip
                helpKey={
                  SUBGROUP_MODES.find((m) => m.value === formData.subgroup_mode)?.helpKey ??
                  'subgroup-mode-nominal'
                }
              />
            </div>

            <div className="space-y-2">
              {SUBGROUP_MODES.map((mode) => (
                <label
                  key={mode.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    formData.subgroup_mode === mode.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                    isModeChangePending && 'pointer-events-none opacity-50',
                  )}
                >
                  <input
                    type="radio"
                    name="subgroup_mode"
                    value={mode.value}
                    checked={formData.subgroup_mode === mode.value}
                    onChange={(e) => onModeChange(e.target.value)}
                    disabled={isModeChangePending}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{mode.label}</span>
                      {mode.badge && (
                        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
                          {mode.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">{mode.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <hr className="border-border" />

          {/* Min Measurements & Warn Below */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Minimum Measurements</label>
              <NumberInput
                min={1}
                max={characteristic.subgroup_size}
                value={formData.min_measurements}
                onChange={(value) => onChange('min_measurements', value)}
                className="mt-1.5 w-full"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Samples below this will be rejected (1-{characteristic.subgroup_size})
              </p>
            </div>
            <div>
              <label className="text-sm font-medium">Warn Below Count</label>
              <NumberInput
                min={parseInt(formData.min_measurements) || 1}
                max={characteristic.subgroup_size}
                value={formData.warn_below_count}
                onChange={(value) => onChange('warn_below_count', value)}
                className="mt-1.5 w-full"
                placeholder="Optional"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Samples below this will be flagged as undersized
              </p>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Stored Parameters - Conditional */}
      {showStoredParams && (
        <AccordionSection
          id="stored-params"
          title={
            <div className="flex items-center gap-2">
              <span>Stored Parameters</span>
              {formData.subgroup_mode === 'STANDARDIZED' && (
                <HelpTooltip helpKey="z-score" triggerAs="span" />
              )}
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              These values are calculated during limit recalculation and used for{' '}
              {formData.subgroup_mode === 'STANDARDIZED'
                ? 'Z-score normalization'
                : 'variable limit calculation'}
              .
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-muted-foreground text-sm font-medium">Sigma (σ)</label>
                <div className="bg-muted mt-1.5 rounded-lg px-3 py-2 font-mono text-sm">
                  {characteristic.stored_sigma?.toFixed(4) ?? 'Not calculated'}
                </div>
              </div>
              <div>
                <label className="text-muted-foreground text-sm font-medium">Center Line (X̄)</label>
                <div className="bg-muted mt-1.5 rounded-lg px-3 py-2 font-mono text-sm">
                  {characteristic.stored_center_line?.toFixed(4) ?? 'Not calculated'}
                </div>
              </div>
            </div>

            {formData.subgroup_mode === 'STANDARDIZED' && characteristic.stored_sigma && (
              <div className="bg-muted/50 text-muted-foreground rounded-lg p-3 text-xs">
                <strong>Z-score formula:</strong> (Sample Mean - Center Line) / (Sigma / √n)
              </div>
            )}

            {!characteristic.stored_sigma && (
              <p className="text-warning text-sm">
                Note: Recalculate limits after adding samples for this mode to work correctly.
              </p>
            )}
          </div>
        </AccordionSection>
      )}

      {/* Schedule Configuration - MANUAL only */}
      {isManual && (
        <AccordionSection
          id="schedule"
          title={
            <div className="flex items-center gap-2">
              <span>Schedule</span>
              <HelpTooltip helpKey="schedule-configuration" triggerAs="span" />
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Configure when manual measurements are due. This determines the schedule for operator
              data entry tasks.
            </p>
            <ScheduleConfigSection value={scheduleConfig} onChange={onScheduleChange} />
          </div>
        </AccordionSection>
      )}
    </Accordion>
  )
}
