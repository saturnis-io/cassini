import { useState, useEffect } from 'react'
import { Loader2, Save, Zap, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlantContext } from '@/providers/PlantProvider'
import { useAIConfig, useUpdateAIConfig, useTestAIConnection } from '@/api/hooks'

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI' },
]

const MODEL_PLACEHOLDERS: Record<string, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
}

/**
 * AIConfigSettings -- settings page component for AI configuration.
 * Provider, API key, model selection, token limit, enable/disable, connection test.
 */
export function AIConfigSettings() {
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const { data: config, isLoading } = useAIConfig(plantId)
  const updateConfig = useUpdateAIConfig()
  const testConnection = useTestAIConnection()

  const [form, setForm] = useState({
    provider_type: 'anthropic',
    api_key: '',
    model_name: '',
    max_tokens: 1024,
    is_enabled: false,
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  useEffect(() => {
    if (config) {
      setForm({
        provider_type: config.provider_type,
        api_key: '', // Never populated from server
        model_name: config.model_name,
        max_tokens: config.max_tokens,
        is_enabled: config.is_enabled,
      })
      setDirty(false)
      setTestResult(null)
    }
  }, [config])

  const updateField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
    setTestResult(null)
  }

  const handleSave = () => {
    const data: Record<string, unknown> = {
      provider_type: form.provider_type,
      model_name: form.model_name,
      max_tokens: form.max_tokens,
      is_enabled: form.is_enabled,
    }
    // Only send API key if user typed a new one
    if (form.api_key.length > 0) {
      data.api_key = form.api_key
    }
    updateConfig.mutate(
      { plantId, data: data as Parameters<typeof updateConfig.mutate>[0]['data'] },
      { onSuccess: () => setDirty(false) },
    )
  }

  const handleTest = () => {
    testConnection.mutate(plantId, {
      onSuccess: (data) => {
        setTestResult({ success: data.success, message: data.message })
      },
      onError: (error) => {
        setTestResult({ success: false, message: error.message })
      },
    })
  }

  if (!selectedPlant) {
    return (
      <div className="text-muted-foreground py-8 text-center text-sm">
        Select a plant to configure AI settings.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 p-4">
        <div className="bg-muted h-4 w-48 rounded" />
        <div className="bg-muted h-10 w-full rounded" />
        <div className="bg-muted h-10 w-full rounded" />
        <div className="bg-muted h-10 w-full rounded" />
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h3 className="text-foreground text-base font-semibold">AI Analysis Configuration</h3>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Configure the AI provider for chart analysis and insights.
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <div>
          <h4 className="text-foreground text-sm font-medium">Enable AI Analysis</h4>
          <p className="text-muted-foreground text-xs">
            Allow AI-powered analysis of SPC chart data
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

      {/* Provider */}
      <div>
        <label className="text-foreground mb-1.5 block text-sm font-medium">Provider</label>
        <select
          value={form.provider_type}
          onChange={(e) => {
            updateField('provider_type', e.target.value)
            // Clear model name when switching providers
            setForm((prev) => ({ ...prev, provider_type: e.target.value, model_name: '' }))
            setDirty(true)
          }}
          className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* API Key */}
      <div>
        <label className="text-foreground mb-1.5 block text-sm font-medium">API Key</label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={form.api_key}
            onChange={(e) => updateField('api_key', e.target.value)}
            placeholder={config?.has_api_key ? '(key is set -- enter new value to change)' : 'Enter API key'}
            className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 pr-10 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {config?.has_api_key && !form.api_key && (
          <p className="text-muted-foreground mt-1 text-xs">API key is configured.</p>
        )}
      </div>

      {/* Model Name */}
      <div>
        <label className="text-foreground mb-1.5 block text-sm font-medium">Model Name</label>
        <input
          type="text"
          value={form.model_name}
          onChange={(e) => updateField('model_name', e.target.value)}
          placeholder={MODEL_PLACEHOLDERS[form.provider_type] ?? 'model-name'}
          className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Leave empty for default: {MODEL_PLACEHOLDERS[form.provider_type] ?? 'auto'}
        </p>
      </div>

      {/* Max Tokens */}
      <div>
        <label className="text-foreground mb-1.5 flex items-center justify-between text-sm font-medium">
          <span>Max Tokens</span>
          <span className="text-muted-foreground text-xs font-normal">{form.max_tokens}</span>
        </label>
        <input
          type="range"
          min={256}
          max={4096}
          step={256}
          value={form.max_tokens}
          onChange={(e) => updateField('max_tokens', parseInt(e.target.value, 10))}
          className="w-full accent-[hsl(var(--primary))]"
        />
        <div className="text-muted-foreground mt-0.5 flex justify-between text-[10px]">
          <span>256</span>
          <span>4096</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={!dirty || updateConfig.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
        >
          {updateConfig.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </button>

        <button
          onClick={handleTest}
          disabled={testConnection.isPending}
          className="border-input bg-background text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {testConnection.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Zap className="h-4 w-4" />
          )}
          Test Connection
        </button>
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border p-3',
            testResult.success
              ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30'
              : 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30',
          )}
        >
          {testResult.success ? (
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <p
            className={cn(
              'text-sm',
              testResult.success
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-red-700 dark:text-red-300',
            )}
          >
            {testResult.message}
          </p>
        </div>
      )}
    </div>
  )
}
