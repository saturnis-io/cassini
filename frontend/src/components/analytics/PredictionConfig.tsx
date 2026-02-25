import { useState, useEffect } from 'react'
import { Loader2, Save, Play, Clock, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  usePredictionConfig,
  useUpdatePredictionConfig,
  useTrainModel,
  usePredictionModel,
  useGenerateForecast,
} from '@/api/hooks'

interface PredictionConfigProps {
  characteristicId: number
  className?: string
}

const MODEL_TYPES = [
  { value: 'auto', label: 'Auto (best fit)' },
  { value: 'arima', label: 'ARIMA' },
  { value: 'exponential_smoothing', label: 'Exponential Smoothing' },
]

/**
 * Configuration panel for a single characteristic's prediction model.
 * Shows enable/disable, model type, horizon, refit interval, and model info.
 */
export function PredictionConfig({ characteristicId, className }: PredictionConfigProps) {
  const { data: config, isLoading: configLoading } = usePredictionConfig(characteristicId)
  const { data: model, isLoading: modelLoading } = usePredictionModel(characteristicId)
  const updateConfig = useUpdatePredictionConfig()
  const trainModel = useTrainModel()
  const generateForecast = useGenerateForecast()

  const [form, setForm] = useState({
    is_enabled: false,
    model_type: 'auto',
    forecast_horizon: 20,
    refit_interval: 50,
  })
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (config) {
      setForm({
        is_enabled: config.is_enabled,
        model_type: config.model_type,
        forecast_horizon: config.forecast_horizon,
        refit_interval: config.refit_interval,
      })
      setDirty(false)
    }
  }, [config])

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const handleSave = () => {
    updateConfig.mutate(
      { charId: characteristicId, data: form },
      { onSuccess: () => setDirty(false) },
    )
  }

  const handleTrain = () => {
    trainModel.mutate(characteristicId)
  }

  const handleGenerateForecast = () => {
    generateForecast.mutate(characteristicId)
  }

  if (configLoading) {
    return (
      <div className={cn('animate-pulse rounded-lg border border-border bg-card p-4', className)}>
        <div className="bg-muted h-4 w-48 rounded" />
        <div className="bg-muted mt-3 h-3 w-full rounded" />
        <div className="bg-muted mt-2 h-3 w-3/4 rounded" />
      </div>
    )
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Enable toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-foreground text-sm font-medium">Predictions</h4>
          <p className="text-muted-foreground text-xs">
            Enable time-series forecasting for this characteristic
          </p>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={form.is_enabled}
            onChange={(e) => updateField('is_enabled', e.target.checked)}
          />
          <div className="bg-muted peer-checked:bg-primary h-5 w-9 rounded-full transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-4" />
        </label>
      </div>

      {/* Model type */}
      <div>
        <label className="text-foreground mb-1 block text-xs font-medium">Model Type</label>
        <select
          value={form.model_type}
          onChange={(e) => updateField('model_type', e.target.value)}
          className="border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm"
        >
          {MODEL_TYPES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Forecast horizon */}
      <div>
        <label className="text-foreground mb-1 flex items-center justify-between text-xs font-medium">
          <span>Forecast Horizon</span>
          <span className="text-muted-foreground font-normal">{form.forecast_horizon} steps</span>
        </label>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={form.forecast_horizon}
          onChange={(e) => updateField('forecast_horizon', parseInt(e.target.value, 10))}
          className="w-full accent-[hsl(var(--primary))]"
        />
        <div className="text-muted-foreground mt-0.5 flex justify-between text-[10px]">
          <span>5</span>
          <span>100</span>
        </div>
      </div>

      {/* Refit interval */}
      <div>
        <label className="text-foreground mb-1 flex items-center justify-between text-xs font-medium">
          <span>Refit Interval</span>
          <span className="text-muted-foreground font-normal">
            every {form.refit_interval} samples
          </span>
        </label>
        <input
          type="range"
          min={20}
          max={200}
          step={10}
          value={form.refit_interval}
          onChange={(e) => updateField('refit_interval', parseInt(e.target.value, 10))}
          className="w-full accent-[hsl(var(--primary))]"
        />
        <div className="text-muted-foreground mt-0.5 flex justify-between text-[10px]">
          <span>20</span>
          <span>200</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!dirty || updateConfig.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed"
        >
          {updateConfig.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Save className="h-3 w-3" />
          )}
          Save Config
        </button>

        <button
          onClick={handleTrain}
          disabled={trainModel.isPending}
          className="border-input bg-background text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {trainModel.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          Train Now
        </button>

        <button
          onClick={handleGenerateForecast}
          disabled={generateForecast.isPending}
          className="border-input bg-background text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generateForecast.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <BarChart3 className="h-3 w-3" />
          )}
          Generate Forecast
        </button>
      </div>

      {/* Current model info */}
      {modelLoading ? (
        <div className="animate-pulse rounded-md bg-muted/50 p-3">
          <div className="bg-muted h-3 w-32 rounded" />
        </div>
      ) : model ? (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <h5 className="text-foreground mb-1.5 text-xs font-medium">Current Model</h5>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="text-muted-foreground">Type</div>
            <div className="text-foreground font-medium">{model.model_type}</div>

            {model.aic != null && (
              <>
                <div className="text-muted-foreground">AIC</div>
                <div className="text-foreground font-medium">{model.aic.toFixed(2)}</div>
              </>
            )}

            <div className="text-muted-foreground">Status</div>
            <div className="text-foreground font-medium capitalize">{model.status}</div>

            <div className="text-muted-foreground">Training Samples</div>
            <div className="text-foreground font-medium">{model.training_samples}</div>

            {model.trained_at && (
              <>
                <div className="text-muted-foreground">Last Trained</div>
                <div className="text-foreground flex items-center gap-1 font-medium">
                  <Clock className="h-3 w-3" />
                  {new Date(model.trained_at).toLocaleString()}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs italic">
          No model trained yet. Click "Train Now" to build a prediction model.
        </p>
      )}
    </div>
  )
}
