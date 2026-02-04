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
        'focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2',
        disabled && 'opacity-50 cursor-not-allowed',
        checked ? 'bg-primary' : 'bg-muted'
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
          'shadow-sm',
          checked ? 'translate-x-6' : 'translate-x-1'
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
    CRITICAL: 'bg-red-500/20 text-red-600 border-red-500/30',
    WARNING: 'bg-orange-500/20 text-orange-600 border-orange-500/30',
    INFO: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        severityStyles[severity]
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
export const NelsonRulesConfigPanel = forwardRef<
  NelsonRulesConfigPanelRef,
  NelsonRulesConfigPanelProps
>(function NelsonRulesConfigPanel({ characteristicId, onDirty }, ref) {
  const { data: rulesData, isLoading } = useNelsonRules(characteristicId)
  const updateRules = useUpdateNelsonRules()

  // Local state for rule toggles
  const [enabledRules, setEnabledRules] = useState<Set<number>>(new Set())
  const [initialized, setInitialized] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Initialize local state from server data
  useEffect(() => {
    if (rulesData?.enabled_rules && !initialized) {
      setEnabledRules(new Set(rulesData.enabled_rules))
      setInitialized(true)
    }
  }, [rulesData, initialized])

  // Reset when characteristic changes
  useEffect(() => {
    setInitialized(false)
    setIsDirty(false)
  }, [characteristicId])

  // Handle toggle change
  const handleToggle = (ruleId: number, checked: boolean) => {
    setEnabledRules((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(ruleId)
      } else {
        next.delete(ruleId)
      }
      return next
    })
    setIsDirty(true)
    onDirty?.()
  }

  // Save function for parent to call
  const save = async () => {
    if (!isDirty) return

    await updateRules.mutateAsync({
      id: characteristicId,
      enabledRules: Array.from(enabledRules),
    })
    setIsDirty(false)
  }

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    save,
    isDirty,
  }), [isDirty, enabledRules, characteristicId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="text-muted-foreground">Loading rules...</div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {NELSON_RULES.map((rule) => (
        <div
          key={rule.id}
          className={cn(
            'flex items-center justify-between p-3 rounded-lg',
            'bg-muted/50 hover:bg-muted/70 transition-colors'
          )}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{rule.name}</span>
            <HelpTooltip helpKey={`nelson-rule-${rule.id}`} />
            <SeverityBadge severity={rule.severity} />
          </div>
          <ToggleSwitch
            checked={enabledRules.has(rule.id)}
            onChange={(checked) => handleToggle(rule.id, checked)}
            disabled={updateRules.isPending}
          />
        </div>
      ))}

      {/* Status indicator */}
      {updateRules.isPending && (
        <div className="text-sm text-muted-foreground text-center py-2">
          Saving rules...
        </div>
      )}
      {updateRules.isError && (
        <div className="text-sm text-red-600 text-center py-2">
          Failed to save rules. Please try again.
        </div>
      )}
    </div>
  )
})

export default NelsonRulesConfigPanel
