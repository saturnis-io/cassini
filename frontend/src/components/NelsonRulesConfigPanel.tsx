import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useNelsonRules, useUpdateNelsonRules } from '@/api/hooks'
import { HelpTooltip } from './HelpTooltip'
import { cn } from '@/lib/utils'

/**
 * Nelson rule metadata with display information.
 */
const NELSON_RULES = [
  { id: 1, name: 'Rule 1: Beyond 3 Sigma', shortName: 'Outlier', severity: 'CRITICAL' as const },
  { id: 2, name: 'Rule 2: Zone Bias', shortName: '9 same side', severity: 'WARNING' as const },
  { id: 3, name: 'Rule 3: Trend', shortName: '6 trending', severity: 'WARNING' as const },
  { id: 4, name: 'Rule 4: Oscillation', shortName: '14 alternating', severity: 'WARNING' as const },
  { id: 5, name: 'Rule 5: Zone A Pattern', shortName: '2 of 3 in A', severity: 'WARNING' as const },
  { id: 6, name: 'Rule 6: Zone B Pattern', shortName: '4 of 5 in B', severity: 'WARNING' as const },
  { id: 7, name: 'Rule 7: Zone C Stability', shortName: '15 in C', severity: 'INFO' as const },
  { id: 8, name: 'Rule 8: Mixed Zones', shortName: '8 outside C', severity: 'WARNING' as const },
] as const

interface NelsonRulesConfigPanelProps {
  /** ID of the characteristic to configure rules for */
  characteristicId: number
  /** Callback when user makes changes (for dirty tracking) */
  onDirty?: () => void
}

/**
 * Ref interface for parent components to access panel state and actions.
 */
export interface NelsonRulesConfigPanelRef {
  /** Save pending changes to the server */
  save: () => Promise<void>
  /** Whether there are unsaved changes */
  isDirty: boolean
}

/**
 * Toggle switch component for enabling/disabling rules.
 */
function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        'focus:ring-primary/20 focus:ring-2 focus:ring-offset-2 focus:outline-none',
        disabled && 'cursor-not-allowed opacity-50',
        checked ? 'bg-primary' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          'shadow-sm',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}

/**
 * Severity badge component for displaying rule severity levels.
 */
function SeverityBadge({ severity }: { severity: 'CRITICAL' | 'WARNING' | 'INFO' }) {
  const severityStyles = {
    CRITICAL: 'bg-destructive/20 text-destructive border-destructive/30',
    WARNING: 'bg-warning/20 text-warning border-warning/30',
    INFO: 'bg-primary/20 text-primary border-primary/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        severityStyles[severity],
      )}
    >
      {severity}
    </span>
  )
}

/**
 * NelsonRulesConfigPanel - Configure which Nelson rules are enabled for a characteristic.
 *
 * Displays all 8 Nelson rules with toggle switches, severity badges, and help tooltips.
 * Changes are tracked locally and can be saved via the ref's save() method.
 *
 * @example
 * const panelRef = useRef<NelsonRulesConfigPanelRef>(null)
 *
 * // In form submit:
 * if (panelRef.current?.isDirty) {
 *   await panelRef.current.save()
 * }
 *
 * <NelsonRulesConfigPanel
 *   ref={panelRef}
 *   characteristicId={1}
 *   onDirty={() => setFormDirty(true)}
 * />
 */
interface RuleConfig {
  rule_id: number
  is_enabled: boolean
  require_acknowledgement: boolean
}

export const NelsonRulesConfigPanel = forwardRef<
  NelsonRulesConfigPanelRef,
  NelsonRulesConfigPanelProps
>(function NelsonRulesConfigPanel({ characteristicId, onDirty }, ref) {
  const { data: rulesData, isLoading } = useNelsonRules(characteristicId)
  const updateRules = useUpdateNelsonRules()

  // Local state for rule configs (enabled + require_ack per rule)
  const [ruleConfigs, setRuleConfigs] = useState<Map<number, RuleConfig>>(new Map())
  const [initialized, setInitialized] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Initialize local state from server data - intentional sync from fetched data

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
      // Fill in defaults for any missing rules
      for (let i = 1; i <= 8; i++) {
        if (!configMap.has(i)) {
          configMap.set(i, { rule_id: i, is_enabled: true, require_acknowledgement: true })
        }
      }
      setRuleConfigs(configMap)
      setInitialized(true)
    }
  }, [rulesData, initialized])

  // Reset when characteristic changes - intentional reset

  useEffect(() => {
    setInitialized(false)
    setIsDirty(false)
  }, [characteristicId])

  // Handle enabled toggle change
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

  // Handle require_acknowledgement change
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

  // Save function for parent to call
  const save = async () => {
    if (!isDirty) return

    const configs = Array.from(ruleConfigs.values())
    await updateRules.mutateAsync({
      id: characteristicId,
      ruleConfigs: configs,
    })
    setIsDirty(false)
  }

  // Expose methods to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      save,
      isDirty,
    }),
    [isDirty, ruleConfigs, characteristicId],
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="text-muted-foreground">Loading rules...</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {NELSON_RULES.map((rule) => {
        const config = ruleConfigs.get(rule.id)
        const isEnabled = config?.is_enabled ?? true
        const requireAck = config?.require_acknowledgement ?? true

        return (
          <div
            key={rule.id}
            className={cn(
              'flex items-center justify-between rounded-lg p-3',
              'bg-muted/50 hover:bg-muted/70 transition-colors',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{rule.name}</span>
              <HelpTooltip helpKey={`nelson-rule-${rule.id}`} />
              <SeverityBadge severity={rule.severity} />
            </div>
            <div className="flex items-center gap-4">
              {/* Require Acknowledgement checkbox - only visible when rule is enabled */}
              {isEnabled && (
                <label className="text-muted-foreground flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={requireAck}
                    onChange={(e) => handleRequireAckChange(rule.id, e.target.checked)}
                    disabled={updateRules.isPending}
                    className="border-border h-4 w-4 cursor-pointer rounded"
                  />
                  <span className="whitespace-nowrap">Require Ack</span>
                </label>
              )}
              <ToggleSwitch
                checked={isEnabled}
                onChange={(checked) => handleEnabledToggle(rule.id, checked)}
                disabled={updateRules.isPending}
              />
            </div>
          </div>
        )
      })}

      {/* Status indicator */}
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

export default NelsonRulesConfigPanel
