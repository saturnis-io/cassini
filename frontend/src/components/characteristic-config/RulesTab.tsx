import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useNelsonRules, useUpdateNelsonRules } from '@/api/hooks'
import { Accordion, AccordionSection } from './Accordion'
import { NELSON_SPARKLINES } from './NelsonSparklines'
import { HelpTooltip } from '../HelpTooltip'
import { cn } from '@/lib/utils'
import { NELSON_RULES, NELSON_RULE_DETAILS } from '@/lib/nelson-rules'

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
    CRITICAL: 'bg-destructive/15 text-destructive border-destructive/30',
    WARNING: 'bg-warning/15 text-warning border-warning/30',
    INFO: 'bg-primary/15 text-primary border-primary/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium',
        styles[severity],
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
        'focus-visible:ring-primary/50 focus:outline-none focus-visible:ring-2',
        disabled && 'cursor-not-allowed opacity-50',
        checked ? 'bg-primary' : 'bg-muted-foreground/30',
        s.track,
      )}
    >
      <span
        className={cn(
          'inline-block transform rounded-full bg-white shadow-sm transition-transform',
          checked ? s.translate : 'translate-x-1',
          s.thumb,
        )}
      />
    </button>
  )
}

export const RulesTab = forwardRef<RulesTabRef, RulesTabProps>(function RulesTab(
  { characteristicId, onDirty },
  ref,
) {
  const { data: rulesData, isLoading } = useNelsonRules(characteristicId)
  const updateRules = useUpdateNelsonRules()

  const [ruleConfigs, setRuleConfigs] = useState<Map<number, RuleConfig>>(new Map())
  const [initialized, setInitialized] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Initialize from server - intentional sync from fetched data

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

  // Reset on characteristic change - intentional reset

  useEffect(() => {
    setInitialized(false)
    setIsDirty(false)
  }, [characteristicId])

  const handleEnabledToggle = (ruleId: number, checked: boolean) => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      const existing = next.get(ruleId) || {
        rule_id: ruleId,
        is_enabled: true,
        require_acknowledgement: true,
      }
      next.set(ruleId, { ...existing, is_enabled: checked })
      return next
    })
    setIsDirty(true)
    onDirty?.()
  }

  const handleRequireAckChange = (ruleId: number, checked: boolean) => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      const existing = next.get(ruleId) || {
        rule_id: ruleId,
        is_enabled: true,
        require_acknowledgement: true,
      }
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
          <h3 className="flex items-center gap-2 font-medium">
            Nelson Rules
            <HelpTooltip helpKey="nelson-rules-overview" />
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Detect patterns that indicate a process is out of statistical control.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-muted/30 border-border flex items-center gap-2 rounded-lg border p-3">
        <span className="text-muted-foreground mr-2 text-sm">Quick Actions:</span>
        <button
          onClick={handleEnableAll}
          className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Enable All
        </button>
        <button
          onClick={handleDisableAll}
          className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Disable All
        </button>
        <button
          onClick={handleResetDefaults}
          className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
        >
          Reset to Defaults
        </button>
      </div>

      {/* Rules Table */}
      <div className="border-border overflow-hidden rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground text-left text-xs font-medium">
              <th className="w-16 px-3 py-2">Pattern</th>
              <th className="px-3 py-2">Rule</th>
              <th className="w-20 px-3 py-2">Severity</th>
              <th className="w-24 px-3 py-2 text-center">Req. Ack</th>
              <th className="w-20 px-3 py-2 text-center">Enabled</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
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
                    isEnabled ? 'bg-background' : 'bg-muted/20 opacity-60',
                  )}
                >
                  {/* Sparkline */}
                  <td className="px-3 py-2">
                    <div className="flex h-6 w-16 items-center justify-center">
                      {Sparkline && <Sparkline className="text-foreground" />}
                    </div>
                  </td>

                  {/* Rule Name & Description */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4 font-mono text-xs">{rule.id}</span>
                      <div>
                        <div className="text-sm font-medium">{rule.name}</div>
                        <div className="text-muted-foreground text-xs">{rule.shortDesc}</div>
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
                        className="border-border h-4 w-4 cursor-pointer rounded"
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
      <div className="text-muted-foreground flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="bg-destructive h-2 w-2 rounded-full" /> Critical
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-warning h-2 w-2 rounded-full" /> Warning
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-primary h-2 w-2 rounded-full" /> Info
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
                <div key={rule.id} className="border-border overflow-hidden rounded-lg border">
                  {/* Rule Header */}
                  <div className="bg-muted/30 flex items-center gap-4 p-4">
                    <div className="flex w-20 flex-shrink-0 items-center justify-center">
                      {Sparkline && <Sparkline className="text-foreground" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">
                          Rule {rule.id}: {rule.name}
                        </span>
                        <SeverityBadge severity={rule.severity} />
                      </div>
                      <p className="text-muted-foreground text-sm">{rule.shortDesc}</p>
                    </div>
                  </div>

                  {/* Rule Details */}
                  <div className="space-y-4 p-4 text-sm">
                    {/* What it detects */}
                    <div>
                      <h5 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                        What This Detects
                      </h5>
                      <p className="text-foreground">{details.description}</p>
                    </div>

                    {/* Common causes */}
                    <div>
                      <h5 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
                        Common Causes
                      </h5>
                      <p className="text-foreground">{details.cause}</p>
                    </div>

                    {/* Recommended action */}
                    <div>
                      <h5 className="text-muted-foreground mb-1 text-xs font-medium uppercase">
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
        <div className="text-muted-foreground py-2 text-center text-sm">Saving rules...</div>
      )}
      {updateRules.isError && (
        <div className="text-destructive py-2 text-center text-sm">
          Failed to save rules. Please try again.
        </div>
      )}
    </div>
  )
})

export default RulesTab
