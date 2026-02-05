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

      {/* Rule Details Accordion */}
      <Accordion defaultOpen={[]} className="mt-4">
        <AccordionSection id="rule-details" title="Rule Details">
          <div className="space-y-4 text-sm">
            {NELSON_RULES.map((rule) => {
              const Sparkline = NELSON_SPARKLINES[rule.id]
              return (
                <div key={rule.id} className="flex gap-4 p-3 bg-muted/30 rounded-lg">
                  <div className="w-20 flex-shrink-0 flex items-center justify-center">
                    {Sparkline && <Sparkline className="text-foreground" />}
                  </div>
                  <div>
                    <div className="font-medium">
                      Rule {rule.id}: {rule.name}
                    </div>
                    <p className="text-muted-foreground mt-1">{rule.shortDesc}</p>
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
