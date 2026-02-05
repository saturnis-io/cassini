import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useNelsonRules, useUpdateNelsonRules } from '@/api/hooks'
import { Accordion, AccordionSection } from './Accordion'
import { NELSON_SPARKLINES } from './NelsonSparklines'
import { HelpTooltip } from '../HelpTooltip'
import { cn } from '@/lib/utils'

/**
 * Nelson rule metadata with display information.
 */
const NELSON_RULES = [
  { id: 1, name: 'Beyond 3σ', shortDesc: 'Single point outside limits', severity: 'CRITICAL' as const },
  { id: 2, name: 'Zone Bias', shortDesc: '9 consecutive on same side', severity: 'WARNING' as const },
  { id: 3, name: 'Trend', shortDesc: '6 consecutive increasing/decreasing', severity: 'WARNING' as const },
  { id: 4, name: 'Oscillation', shortDesc: '14 consecutive alternating', severity: 'WARNING' as const },
  { id: 5, name: 'Zone A Pattern', shortDesc: '2 of 3 beyond 2σ', severity: 'WARNING' as const },
  { id: 6, name: 'Zone B Pattern', shortDesc: '4 of 5 beyond 1σ', severity: 'WARNING' as const },
  { id: 7, name: 'Zone C Stability', shortDesc: '15 consecutive within 1σ', severity: 'INFO' as const },
  { id: 8, name: 'Mixed Zones', shortDesc: '8 consecutive outside C', severity: 'WARNING' as const },
] as const

/**
 * Detailed descriptions for each Nelson rule - educational content
 */
const NELSON_RULE_DETAILS: Record<number, { description: string; cause: string; action: string }> = {
  1: {
    description: 'A single point falls outside the 3-sigma control limits (beyond UCL or LCL). This is the most severe violation as it indicates an extreme deviation from the process mean.',
    cause: 'Equipment malfunction, measurement error, material defect, operator error, or a significant process upset.',
    action: 'Immediately investigate the assignable cause. Check recent changes to materials, equipment, or procedures. Verify measurement accuracy.',
  },
  2: {
    description: 'Nine or more consecutive points fall on the same side of the center line (all above or all below the mean). This indicates a shift in the process average.',
    cause: 'Process mean has shifted due to tool wear, different raw material batch, environmental change, or calibration drift.',
    action: 'Investigate what changed around the time the shift began. Check for material lot changes, equipment adjustments, or environmental factors.',
  },
  3: {
    description: 'Six or more consecutive points are continuously increasing or decreasing. This indicates a trend in the process.',
    cause: 'Tool wear, gradual equipment degradation, temperature drift, operator fatigue, or depleting consumables.',
    action: 'Identify and address the source of drift. Consider implementing preventive maintenance or recalibration schedules.',
  },
  4: {
    description: 'Fourteen or more consecutive points alternate up and down in a sawtooth pattern. This indicates over-adjustment or two alternating causes.',
    cause: 'Over-correction by operators, alternating materials from two sources, fixture switching, or inspection by alternating gauges.',
    action: 'Review operator adjustment procedures. Check if multiple material sources or equipment are being alternated. Verify measurement consistency.',
  },
  5: {
    description: 'Two out of three consecutive points fall in Zone A (beyond 2σ from center) on the same side. Zone A is the outer third between 2σ and 3σ.',
    cause: 'Process variance has increased, or the mean is shifting. Early warning of a potential Rule 1 violation.',
    action: 'Monitor closely for further deterioration. Investigate recent changes that may have increased variability.',
  },
  6: {
    description: 'Four out of five consecutive points fall in Zone B or beyond (beyond 1σ from center) on the same side. Zone B is between 1σ and 2σ.',
    cause: 'Small shift in process mean or gradually increasing variance.',
    action: 'Investigate potential causes of shift. This is often an early indicator before a more serious violation occurs.',
  },
  7: {
    description: 'Fifteen consecutive points fall within Zone C (within 1σ of center). While this looks "good," it indicates stratification or mixture of data from different sources.',
    cause: 'Data from multiple streams being mixed, incorrect subgrouping, measurement resolution too coarse, or calculated/fabricated data.',
    action: 'Review data collection methods. Verify subgroups contain data from the same source. Check that measurement resolution is adequate.',
  },
  8: {
    description: 'Eight consecutive points fall outside Zone C (beyond 1σ on either side) with points on both sides of center. This bimodal pattern suggests mixture.',
    cause: 'Two distinct processes or conditions being mixed, alternating operators with different techniques, or two measurement systems.',
    action: 'Separate and analyze data by source. Identify the two populations and address the cause of inconsistency.',
  },
}

interface RuleConfig {
  rule_id: number
  is_enabled: boolean
  require_acknowledgement: boolean
}

interface RulesTabProps {
  characteristicId: number
  onDirty?: () => void
}

export interface RulesTabRef {
  save: () => Promise<void>
  isDirty: boolean
}

function SeverityBadge({ severity }: { severity: 'CRITICAL' | 'WARNING' | 'INFO' }) {
  const styles = {
    CRITICAL: 'bg-red-500/15 text-red-600 border-red-500/30',
    WARNING: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
    INFO: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
        styles[severity]
      )}
    >
      {severity}
    </span>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
  size = 'md',
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}) {
  const sizeStyles = {
    sm: { track: 'h-5 w-9', thumb: 'h-3 w-3', translate: 'translate-x-4' },
    md: { track: 'h-6 w-11', thumb: 'h-4 w-4', translate: 'translate-x-5' },
  }

  const s = sizeStyles[size]

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex items-center rounded-full transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
        disabled && 'opacity-50 cursor-not-allowed',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        s.track
      )}
    >
      <span
        className={cn(
          'inline-block transform rounded-full bg-white shadow-sm transition-transform',
          checked ? s.translate : 'translate-x-1',
          s.thumb
        )}
      />
    </button>
  )
}

export const RulesTab = forwardRef<RulesTabRef, RulesTabProps>(function RulesTab(
  { characteristicId, onDirty },
  ref
) {
  const { data: rulesData, isLoading } = useNelsonRules(characteristicId)
  const updateRules = useUpdateNelsonRules()

  const [ruleConfigs, setRuleConfigs] = useState<Map<number, RuleConfig>>(new Map())
  const [initialized, setInitialized] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Initialize from server
  useEffect(() => {
    if (rulesData?.rule_configs && !initialized) {
      const configMap = new Map<number, RuleConfig>()
      for (const config of rulesData.rule_configs) {
        configMap.set(config.rule_id, {
          rule_id: config.rule_id,
          is_enabled: config.is_enabled,
          require_acknowledgement: config.require_acknowledgement,
        })
      }
      // Fill defaults
      for (let i = 1; i <= 8; i++) {
        if (!configMap.has(i)) {
          configMap.set(i, { rule_id: i, is_enabled: true, require_acknowledgement: true })
        }
      }
      setRuleConfigs(configMap)
      setInitialized(true)
    }
  }, [rulesData, initialized])

  // Reset on characteristic change
  useEffect(() => {
    setInitialized(false)
    setIsDirty(false)
  }, [characteristicId])

  const handleEnabledToggle = (ruleId: number, checked: boolean) => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      const existing = next.get(ruleId) || { rule_id: ruleId, is_enabled: true, require_acknowledgement: true }
      next.set(ruleId, { ...existing, is_enabled: checked })
      return next
    })
    setIsDirty(true)
    onDirty?.()
  }

  const handleRequireAckChange = (ruleId: number, checked: boolean) => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      const existing = next.get(ruleId) || { rule_id: ruleId, is_enabled: true, require_acknowledgement: true }
      next.set(ruleId, { ...existing, require_acknowledgement: checked })
      return next
    })
    setIsDirty(true)
    onDirty?.()
  }

  const handleEnableAll = () => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      for (const [id, config] of next) {
        next.set(id, { ...config, is_enabled: true })
      }
      return next
    })
    setIsDirty(true)
    onDirty?.()
  }

  const handleDisableAll = () => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      for (const [id, config] of next) {
        next.set(id, { ...config, is_enabled: false })
      }
      return next
    })
    setIsDirty(true)
    onDirty?.()
  }

  const handleResetDefaults = () => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      for (let i = 1; i <= 8; i++) {
        next.set(i, { rule_id: i, is_enabled: true, require_acknowledgement: true })
      }
      return next
    })
    setIsDirty(true)
    onDirty?.()
  }

  const save = async () => {
    if (!isDirty) return
    const configs = Array.from(ruleConfigs.values())
    await updateRules.mutateAsync({ id: characteristicId, ruleConfigs: configs })
    setIsDirty(false)
  }

  useImperativeHandle(ref, () => ({ save, isDirty }), [isDirty, ruleConfigs, characteristicId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-muted-foreground">Loading rules...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            Nelson Rules
            <HelpTooltip helpKey="nelson-rules-overview" />
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Detect patterns that indicate a process is out of statistical control.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg border border-border">
        <span className="text-sm text-muted-foreground mr-2">Quick Actions:</span>
        <button
          onClick={handleEnableAll}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
        >
          Enable All
        </button>
        <button
          onClick={handleDisableAll}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
        >
          Disable All
        </button>
        <button
          onClick={handleResetDefaults}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted transition-colors"
        >
          Reset to Defaults
        </button>
      </div>

      {/* Rules Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2 w-16">Pattern</th>
              <th className="px-3 py-2">Rule</th>
              <th className="px-3 py-2 w-20">Severity</th>
              <th className="px-3 py-2 w-24 text-center">Req. Ack</th>
              <th className="px-3 py-2 w-20 text-center">Enabled</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {NELSON_RULES.map((rule) => {
              const config = ruleConfigs.get(rule.id)
              const isEnabled = config?.is_enabled ?? true
              const requireAck = config?.require_acknowledgement ?? true
              const Sparkline = NELSON_SPARKLINES[rule.id]

              return (
                <tr
                  key={rule.id}
                  className={cn(
                    'transition-colors',
                    isEnabled ? 'bg-background' : 'bg-muted/20 opacity-60'
                  )}
                >
                  {/* Sparkline */}
                  <td className="px-3 py-2">
                    <div className="w-16 h-6 flex items-center justify-center">
                      {Sparkline && <Sparkline className="text-foreground" />}
                    </div>
                  </td>

                  {/* Rule Name & Description */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-4">
                        {rule.id}
                      </span>
                      <div>
                        <div className="font-medium text-sm">{rule.name}</div>
                        <div className="text-xs text-muted-foreground">{rule.shortDesc}</div>
                      </div>
                    </div>
                  </td>

                  {/* Severity */}
                  <td className="px-3 py-2">
                    <SeverityBadge severity={rule.severity} />
                  </td>

                  {/* Require Acknowledgement */}
                  <td className="px-3 py-2 text-center">
                    {isEnabled && (
                      <input
                        type="checkbox"
                        checked={requireAck}
                        onChange={(e) => handleRequireAckChange(rule.id, e.target.checked)}
                        disabled={updateRules.isPending}
                        className="h-4 w-4 rounded border-border cursor-pointer"
                      />
                    )}
                  </td>

                  {/* Enable Toggle */}
                  <td className="px-3 py-2 text-center">
                    <ToggleSwitch
                      size="sm"
                      checked={isEnabled}
                      onChange={(checked) => handleEnabledToggle(rule.id, checked)}
                      disabled={updateRules.isPending}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> Critical
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Warning
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Info
        </span>
      </div>

      {/* Rule Details Accordion - Now with educational content */}
      <Accordion defaultOpen={[]} className="mt-4">
        <AccordionSection id="rule-details" title="Rule Details & Troubleshooting Guide">
          <div className="space-y-6">
            {NELSON_RULES.map((rule) => {
              const Sparkline = NELSON_SPARKLINES[rule.id]
              const details = NELSON_RULE_DETAILS[rule.id]

              return (
                <div key={rule.id} className="border border-border rounded-lg overflow-hidden">
                  {/* Rule Header */}
                  <div className="flex items-center gap-4 p-4 bg-muted/30">
                    <div className="w-20 flex-shrink-0 flex items-center justify-center">
                      {Sparkline && <Sparkline className="text-foreground" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">Rule {rule.id}: {rule.name}</span>
                        <SeverityBadge severity={rule.severity} />
                      </div>
                      <p className="text-sm text-muted-foreground">{rule.shortDesc}</p>
                    </div>
                  </div>

                  {/* Rule Details */}
                  <div className="p-4 space-y-4 text-sm">
                    {/* What it detects */}
                    <div>
                      <h5 className="font-medium text-xs uppercase text-muted-foreground mb-1">
                        What This Detects
                      </h5>
                      <p className="text-foreground">{details.description}</p>
                    </div>

                    {/* Common causes */}
                    <div>
                      <h5 className="font-medium text-xs uppercase text-muted-foreground mb-1">
                        Common Causes
                      </h5>
                      <p className="text-foreground">{details.cause}</p>
                    </div>

                    {/* Recommended action */}
                    <div>
                      <h5 className="font-medium text-xs uppercase text-muted-foreground mb-1">
                        Recommended Action
                      </h5>
                      <p className="text-foreground">{details.action}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </AccordionSection>
      </Accordion>

      {/* Status */}
      {updateRules.isPending && (
        <div className="text-sm text-muted-foreground text-center py-2">Saving rules...</div>
      )}
      {updateRules.isError && (
        <div className="text-sm text-red-600 text-center py-2">
          Failed to save rules. Please try again.
        </div>
      )}
    </div>
  )
})

export default RulesTab
