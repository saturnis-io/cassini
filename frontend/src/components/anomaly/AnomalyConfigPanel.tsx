import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('anomaly')
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
          {t('title')}
        </h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_enabled ?? false}
            onChange={(e) => updateField('is_enabled', e.target.checked)}
            className="accent-primary h-4 w-4 rounded"
          />
          <span className="text-xs text-muted-foreground">{t('config.enable')}</span>
        </label>
      </div>

      {form.is_enabled && (
        <>
          {/* PELT Configuration */}
          <fieldset className="space-y-2 rounded border border-border/50 p-3">
            <legend className="px-1 text-xs font-medium text-foreground">
              {t('config.processShiftDetection')}
            </legend>
            <p className="text-[10px] text-muted-foreground">
              {t('config.processShiftDescription')}
            </p>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.pelt_enabled ?? true}
                onChange={(e) => updateField('pelt_enabled', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">{t('config.enabled')}</span>
            </label>

            {form.pelt_enabled && (
              <>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">{t('config.model')}:</label>
                  <select
                    value={form.pelt_model ?? 'l2'}
                    onChange={(e) =>
                      updateField('pelt_model', e.target.value as 'l2' | 'rbf' | 'normal')
                    }
                    className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                  >
                    <option value="l2">{t('models.l2')}</option>
                    <option value="rbf">{t('models.rbf')}</option>
                    <option value="normal">{t('models.normal')}</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">{t('config.sensitivity')}:</label>
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
                        {t(`sensitivity.${preset}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground" title="Min segment">
                    {t('config.minimumRunLength')}:
                  </label>
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
              {t('config.unusualPatternDetection')}
            </legend>
            <p className="text-[10px] text-muted-foreground">
              {t('config.unusualPatternDescription')}
            </p>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.iforest_enabled ?? false}
                onChange={(e) => updateField('iforest_enabled', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">
                {t('config.enabledRequiresSamples')}
              </span>
            </label>

            {form.iforest_enabled && (
              <>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground" title="Contamination">
                    {t('config.expectedAnomalyRate')}:
                  </label>
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
                  <label className="text-xs text-muted-foreground" title="Score threshold">
                    {t('config.detectionThreshold')}:
                  </label>
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
              {t('config.distributionDriftDetection')}
            </legend>
            <p className="text-[10px] text-muted-foreground">
              {t('config.distributionDriftDescription')}
            </p>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.ks_enabled ?? true}
                onChange={(e) => updateField('ks_enabled', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">{t('config.enabled')}</span>
            </label>

            {form.ks_enabled && (
              <>
                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">{t('config.referenceWindow')}:</label>
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
                  <span className="text-xs text-muted-foreground">{t('config.samples')}</span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">{t('config.testWindow')}:</label>
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
                  <span className="text-xs text-muted-foreground">{t('config.samples')}</span>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-muted-foreground">{t('config.significance')}:</label>
                  <select
                    value={String(form.ks_alpha ?? 0.05)}
                    onChange={(e) => updateField('ks_alpha', parseFloat(e.target.value))}
                    className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
                  >
                    <option value="0.01">{t('significanceLevels.strict')}</option>
                    <option value="0.05">{t('significanceLevels.standard')}</option>
                    <option value="0.10">{t('significanceLevels.lenient')}</option>
                  </select>
                </div>
              </>
            )}
          </fieldset>

          {/* Notification preferences */}
          <fieldset className="space-y-2 rounded border border-border/50 p-3">
            <legend className="px-1 text-xs font-medium text-foreground">
              {t('notifications.title')}
            </legend>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.notify_on_changepoint ?? true}
                onChange={(e) => updateField('notify_on_changepoint', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">{t('notifications.notifyOnProcessShifts')}</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.notify_on_anomaly_score ?? false}
                onChange={(e) => updateField('notify_on_anomaly_score', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">{t('notifications.notifyOnUnusualPatterns')}</span>
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.notify_on_distribution_shift ?? true}
                onChange={(e) => updateField('notify_on_distribution_shift', e.target.checked)}
                className="accent-primary h-3.5 w-3.5 rounded"
              />
              <span className="text-xs text-muted-foreground">{t('notifications.notifyOnDistributionDrift')}</span>
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
              {updateConfig.isPending ? t('config.saving') : t('config.save')}
            </button>
            <button
              onClick={handleReset}
              disabled={resetConfig.isPending}
              className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t('config.resetToDefaults')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
