import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  useAnomalyConfig,
  useUpdateAnomalyConfig,
  useResetAnomalyConfig,
} from '@/api/hooks'
import type { AnomalyDetectorConfig } from '@/types/anomaly'
import { RotateCcw, Save } from 'lucide-react'

interface AnomalyConfigPanelProps {
  characteristicId: number
  className?: string
}

type SensitivityPreset = 'low' | 'medium' | 'high'

function getSensitivityPreset(penalty: string): SensitivityPreset {
  if (penalty === 'auto') return 'medium'
  const val = parseFloat(penalty)
  if (isNaN(val)) return 'medium'
  // Low = higher penalty, High = lower penalty
  if (val > 5) return 'low'
  if (val < 2) return 'high'
  return 'medium'
}

export function AnomalyConfigPanel({ characteristicId, className }: AnomalyConfigPanelProps) {
  const { data: config, isLoading } = useAnomalyConfig(characteristicId)
  const updateConfig = useUpdateAnomalyConfig()
  const resetConfig = useResetAnomalyConfig()

  const [form, setForm] = useState<Partial<AnomalyDetectorConfig>>({})
  const [sensitivity, setSensitivity] = useState<SensitivityPreset>('medium')

  useEffect(() => {
    if (config) {
      setForm(config)
      setSensitivity(getSensitivityPreset(config.pelt_penalty))
    }
  }, [config])

  const updateField = <K extends keyof AnomalyDetectorConfig>(
    key: K,
    value: AnomalyDetectorConfig[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSensitivityChange = (preset: SensitivityPreset) => {
    setSensitivity(preset)
    const penaltyMap: Record<SensitivityPreset, string> = {
      low: '8.0',
      medium: 'auto',
      high: '1.5',
    }
    updateField('pelt_penalty', penaltyMap[preset])
  }

  const handleSave = () => {
    updateConfig.mutate({ charId: characteristicId, data: form })
  }

  const handleReset = () => {
    resetConfig.mutate(characteristicId)
  }

  if (isLoading) {
    return (
      <div className={cn('animate-pulse rounded-lg border border-border bg-card p-4', className)}>
        <div className="bg-muted h-4 w-48 rounded" />
        <div className="bg-muted mt-3 h-3 w-full rounded" />
        <div className="bg-muted mt-2 h-3 w-3/4 rounded" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-4 rounded-lg border border-border bg-card p-4', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Anomaly Detection {/* TODO: i18n */}
        </h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_enabled ?? false}
            onChange={(e) => updateField('is_enabled', e.target.checked)}
            className="accent-primary h-4 w-4 rounded"
          />
          <span className="text-xs text-muted-foreground">Enable</span>
        </label>
      </div>

      {form.is_enabled && (
        <>
          {/* PELT Configuration */}
          <fieldset className="space-y-2 rounded border border-border/50 p-3">
            <legend className="px-1 text-xs font-medium text-foreground">
              Change-Point Detection (PELT) {/* TODO: i18n */}
            </legend>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.pelt_enabled ?? true}
                onChange={(e) => updateField('pelt_enabled', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">Enabled</span>
            </label>

            {form.pelt_enabled && (
              <>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">Model:</label>
                  <select
                    value={form.pelt_model ?? 'l2'}
                    onChange={(e) =>
                      updateField('pelt_model', e.target.value as 'l2' | 'rbf' | 'normal')
                    }
                    className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                  >
                    <option value="l2">L2 (mean shift)</option>
                    <option value="rbf">RBF (mean+variance)</option>
                    <option value="normal">Normal (parametric)</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">Sensitivity:</label>
                  <div className="flex gap-1">
                    {(['low', 'medium', 'high'] as const).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => handleSensitivityChange(preset)}
                        className={cn(
                          'rounded px-2 py-0.5 text-xs capitalize transition-colors',
                          sensitivity === preset
                            ? 'bg-primary/15 text-primary border-primary/30 border'
                            : 'border border-border text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">Min segment:</label>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={form.pelt_min_segment ?? 5}
                    onChange={(e) => updateField('pelt_min_segment', parseInt(e.target.value) || 5)}
                    className="w-16 rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                  />
                </div>
              </>
            )}
          </fieldset>

          {/* Isolation Forest Configuration */}
          <fieldset className="space-y-2 rounded border border-border/50 p-3">
            <legend className="px-1 text-xs font-medium text-foreground">
              Multivariate Outlier Detection {/* TODO: i18n */}
            </legend>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.iforest_enabled ?? false}
                onChange={(e) => updateField('iforest_enabled', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">
                Enabled (requires 50+ samples)
              </span>
            </label>

            {form.iforest_enabled && (
              <>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">Contamination:</label>
                  <input
                    type="range"
                    min={0.01}
                    max={0.2}
                    step={0.01}
                    value={form.iforest_contamination ?? 0.05}
                    onChange={(e) =>
                      updateField('iforest_contamination', parseFloat(e.target.value))
                    }
                    className="h-1 w-24"
                  />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {((form.iforest_contamination ?? 0.05) * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">Score threshold:</label>
                  <input
                    type="number"
                    min={-1}
                    max={0}
                    step={0.05}
                    value={form.anomaly_score_threshold ?? -0.5}
                    onChange={(e) =>
                      updateField('anomaly_score_threshold', parseFloat(e.target.value) || -0.5)
                    }
                    className="w-20 rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                  />
                </div>
              </>
            )}
          </fieldset>

          {/* K-S Distribution Shift Configuration */}
          <fieldset className="space-y-2 rounded border border-border/50 p-3">
            <legend className="px-1 text-xs font-medium text-foreground">
              Distribution Shift Detection {/* TODO: i18n */}
            </legend>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.ks_enabled ?? true}
                onChange={(e) => updateField('ks_enabled', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">Enabled</span>
            </label>

            {form.ks_enabled && (
              <>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">Reference window:</label>
                  <input
                    type="number"
                    min={50}
                    max={1000}
                    value={form.ks_reference_window ?? 200}
                    onChange={(e) =>
                      updateField('ks_reference_window', parseInt(e.target.value) || 200)
                    }
                    className="w-20 rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">samples</span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">Test window:</label>
                  <input
                    type="number"
                    min={20}
                    max={200}
                    value={form.ks_test_window ?? 50}
                    onChange={(e) =>
                      updateField('ks_test_window', parseInt(e.target.value) || 50)
                    }
                    className="w-20 rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                  />
                  <span className="text-xs text-muted-foreground">samples</span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">Significance:</label>
                  <select
                    value={String(form.ks_alpha ?? 0.05)}
                    onChange={(e) => updateField('ks_alpha', parseFloat(e.target.value))}
                    className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                  >
                    <option value="0.01">0.01 (strict)</option>
                    <option value="0.05">0.05 (standard)</option>
                    <option value="0.10">0.10 (lenient)</option>
                  </select>
                </div>
              </>
            )}
          </fieldset>

          {/* Notification preferences */}
          <fieldset className="space-y-2 rounded border border-border/50 p-3">
            <legend className="px-1 text-xs font-medium text-foreground">
              Notifications {/* TODO: i18n */}
            </legend>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.notify_on_changepoint ?? true}
                onChange={(e) => updateField('notify_on_changepoint', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">Notify on changepoints</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.notify_on_anomaly_score ?? false}
                onChange={(e) => updateField('notify_on_anomaly_score', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">Notify on outlier scores</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.notify_on_distribution_shift ?? true}
                onChange={(e) => updateField('notify_on_distribution_shift', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">Notify on distribution shifts</span>
            </label>
          </fieldset>

          {/* Save / Reset buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={updateConfig.isPending}
              className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {updateConfig.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={handleReset}
              disabled={resetConfig.isPending}
              className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to defaults
            </button>
          </div>
        </>
      )}
    </div>
  )
}
