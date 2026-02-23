import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useNelsonRules, useUpdateNelsonRules, useRulePresets, useApplyPreset } from '@/api/hooks'
import { Accordion, AccordionSection } from './Accordion'
import { NELSON_SPARKLINES } from './NelsonSparklines'
import { HelpTooltip } from '../HelpTooltip'
import { cn } from '@/lib/utils'
import { NELSON_RULES, NELSON_RULE_DETAILS } from '@/lib/nelson-rules'
import type { RulePreset } from '@/types'

interface RuleConfig {
  rule_id: number
  is_enabled: boolean
  require_acknowledgement: boolean
  parameters: Record<string, number> | null
}

interface RulesTabProps {
  characteristicId: number
  dataType?: 'variable' | 'attribute'
  onDirty?: () => void
}

export interface RulesTabRef {
  save: () => Promise<void>
  isDirty: boolean
}

/** Default parameters per rule ID */
const RULE_DEFAULTS: Record<number, Record<string, number>> = {
  1: { sigma_multiplier: 3.0 },
  2: { consecutive_count: 9 },
  3: { consecutive_count: 6 },
  4: { consecutive_count: 14 },
  5: { count: 2, window: 3 },
  6: { count: 4, window: 5 },
  7: { consecutive_count: 15 },
  8: { consecutive_count: 8 },
}

/** Human-readable labels for parameters */
const PARAM_LABELS: Record<string, string> = {
  sigma_multiplier: 'Sigma multiplier',
  consecutive_count: 'Consecutive count',
  count: 'Count',
  window: 'Window',
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

function ParameterEditor({
  ruleId,
  parameters,
  onChange,
  disabled,
}: {
  ruleId: number
  parameters: Record<string, number> | null
  onChange: (params: Record<string, number>) => void
  disabled?: boolean
}) {
  const defaults = RULE_DEFAULTS[ruleId]
  if (!defaults) return null

  const current = { ...defaults, ...parameters }

  const handleParamChange = (key: string, raw: string) => {
    const val = parseFloat(raw)
    if (!isNaN(val)) {
      onChange({ ...current, [key]: val })
    }
  }

  const paramKeys = Object.keys(defaults)

  return (
    <div className="bg-muted/30 border-border mt-1 flex flex-wrap items-center gap-3 rounded border px-3 py-2">
      {paramKeys.map((key) => {
        const isFloat = key === 'sigma_multiplier'
        return (
          <label key={key} className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{PARAM_LABELS[key] || key}:</span>
            <input
              type="number"
              step={isFloat ? 0.1 : 1}
              min={isFloat ? 0.1 : 1}
              value={current[key]}
              onChange={(e) => handleParamChange(key, e.target.value)}
              disabled={disabled}
              className="border-border bg-background w-16 rounded border px-1.5 py-0.5 text-xs"
            />
          </label>
        )
      })}
    </div>
  )
}

function PresetSelector({
  presets,
  selectedPresetId,
  onSelect,
  disabled,
}: {
  presets: RulePreset[]
  selectedPresetId: number | null
  onSelect: (presetId: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-muted-foreground text-sm">Preset:</label>
      <select
        value={selectedPresetId ?? ''}
        onChange={(e) => {
          const val = e.target.value
          if (val) onSelect(parseInt(val))
        }}
        disabled={disabled}
        className="border-border bg-background rounded-md border px-3 py-1.5 text-sm"
      >
        <option value="">Custom</option>
        {presets.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  )
}

export const RulesTab = forwardRef<RulesTabRef, RulesTabProps>(function RulesTab(
  { characteristicId, dataType, onDirty },
  ref,
) {
  const { data: rulesData, isLoading } = useNelsonRules(characteristicId)
  const updateRules = useUpdateNelsonRules()
  const { data: presets } = useRulePresets()
  const applyPreset = useApplyPreset()

  const [ruleConfigs, setRuleConfigs] = useState<Map<number, RuleConfig>>(new Map())
  const [initialized, setInitialized] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null)
  const [expandedRules, setExpandedRules] = useState<Set<number>>(new Set())

  // Initialize from server - intentional sync from fetched data

  useEffect(() => {
    if (rulesData?.rule_configs && !initialized) {
      const configMap = new Map<number, RuleConfig>()
      for (const config of rulesData.rule_configs) {
        configMap.set(config.rule_id, {
          rule_id: config.rule_id,
          is_enabled: config.is_enabled,
          require_acknowledgement: config.require_acknowledgement,
          parameters: config.parameters ?? null,
        })
      }
      // Fill defaults
      for (let i = 1; i <= 8; i++) {
        if (!configMap.has(i)) {
          configMap.set(i, { rule_id: i, is_enabled: true, require_acknowledgement: true, parameters: null })
        }
      }
      setRuleConfigs(configMap)
      setInitialized(true)

      // Detect matching preset
      if (presets) {
        const matched = detectMatchingPreset(configMap, presets)
        setSelectedPresetId(matched)
      }
    }
  }, [rulesData, initialized, presets])

  // Reset on characteristic change - intentional reset

  useEffect(() => {
    setInitialized(false)
    setIsDirty(false)
    setSelectedPresetId(null)
  }, [characteristicId])

  const handleEnabledToggle = (ruleId: number, checked: boolean) => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      const existing = next.get(ruleId) || {
        rule_id: ruleId,
        is_enabled: true,
        require_acknowledgement: true,
        parameters: null,
      }
      next.set(ruleId, { ...existing, is_enabled: checked })
      return next
    })
    setSelectedPresetId(null)
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
        parameters: null,
      }
      next.set(ruleId, { ...existing, require_acknowledgement: checked })
      return next
    })
    setIsDirty(true)
    onDirty?.()
  }

  const handleParameterChange = (ruleId: number, params: Record<string, number>) => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      const existing = next.get(ruleId) || {
        rule_id: ruleId,
        is_enabled: true,
        require_acknowledgement: true,
        parameters: null,
      }
      next.set(ruleId, { ...existing, parameters: params })
      return next
    })
    setSelectedPresetId(null)
    setIsDirty(true)
    onDirty?.()
  }

  const toggleParamExpand = (ruleId: number) => {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId)) {
        next.delete(ruleId)
      } else {
        next.add(ruleId)
      }
      return next
    })
  }

  const handlePresetSelect = async (presetId: number) => {
    await applyPreset.mutateAsync({ charId: characteristicId, presetId })
    setSelectedPresetId(presetId)
    setInitialized(false) // Force re-init from server
    setIsDirty(false)
  }

  const handleEnableAll = () => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      for (const [id, config] of next) {
        next.set(id, { ...config, is_enabled: true })
      }
      return next
    })
    setSelectedPresetId(null)
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
    setSelectedPresetId(null)
    setIsDirty(true)
    onDirty?.()
  }

  const handleResetDefaults = () => {
    setRuleConfigs((prev) => {
      const next = new Map(prev)
      for (let i = 1; i <= 8; i++) {
        next.set(i, { rule_id: i, is_enabled: true, require_acknowledgement: true, parameters: null })
      }
      return next
    })
    setSelectedPresetId(null)
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

      {/* Preset Selector + Quick Actions */}
      <div className="bg-muted/30 border-border flex flex-wrap items-center gap-4 rounded-lg border p-3">
        {presets && (
          <PresetSelector
            presets={presets}
            selectedPresetId={selectedPresetId}
            onSelect={handlePresetSelect}
            disabled={applyPreset.isPending}
          />
        )}
        <div className="border-border h-6 border-l" />
        <span className="text-muted-foreground text-sm">Quick Actions:</span>
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
      {dataType === 'attribute' && (
        <p className="text-muted-foreground text-xs">
          Attribute charts support Nelson Rules 1-4 only. Rules 5-8 require zone-based analysis that is not applicable to attribute data.
        </p>
      )}
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
            {NELSON_RULES.filter((rule) => dataType !== 'attribute' || rule.id <= 4).map((rule) => {
              const config = ruleConfigs.get(rule.id)
              const isEnabled = config?.is_enabled ?? true
              const requireAck = config?.require_acknowledgement ?? true
              const Sparkline = NELSON_SPARKLINES[rule.id]
              const isExpanded = expandedRules.has(rule.id)
              const hasCustomParams = config?.parameters && Object.keys(config.parameters).length > 0

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

                  {/* Rule Name & Description + Parameters */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-4 font-mono text-xs">{rule.id}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{rule.name}</span>
                          {isEnabled && (
                            <button
                              onClick={() => toggleParamExpand(rule.id)}
                              className={cn(
                                'text-muted-foreground hover:text-foreground text-[10px] transition-colors',
                                hasCustomParams && 'text-primary',
                              )}
                              title="Configure parameters"
                            >
                              {isExpanded ? '[-]' : '[+]'}
                            </button>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs">{rule.shortDesc}</div>
                        {isEnabled && isExpanded && (
                          <ParameterEditor
                            ruleId={rule.id}
                            parameters={config?.parameters ?? null}
                            onChange={(params) => handleParameterChange(rule.id, params)}
                            disabled={updateRules.isPending}
                          />
                        )}
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
      {(updateRules.isPending || applyPreset.isPending) && (
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

/** Check if current config matches any preset */
function detectMatchingPreset(
  configs: Map<number, RuleConfig>,
  presets: RulePreset[],
): number | null {
  for (const preset of presets) {
    let matches = true
    for (const rc of preset.rules_config) {
      const current = configs.get(rc.rule_id)
      if (!current) {
        matches = false
        break
      }
      if (current.is_enabled !== rc.is_enabled) {
        matches = false
        break
      }
      // Compare parameters
      const presetParams = rc.parameters ?? RULE_DEFAULTS[rc.rule_id]
      const currentParams = current.parameters ?? RULE_DEFAULTS[rc.rule_id]
      if (presetParams && currentParams) {
        for (const key of Object.keys(presetParams)) {
          if (presetParams[key] !== currentParams[key]) {
            matches = false
            break
          }
        }
      }
      if (!matches) break
    }
    if (matches) return preset.id
  }
  return null
}

export default RulesTab
