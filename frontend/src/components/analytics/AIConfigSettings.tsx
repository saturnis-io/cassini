import { useState, useEffect } from 'react'
import {
  Loader2,
  Save,
  Zap,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  ChevronDown,
  HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlantContext } from '@/providers/PlantProvider'
import { useAIConfig, useUpdateAIConfig, useTestAIConnection } from '@/api/hooks'

const PROVIDERS = [
  { value: 'claude', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'azure_openai', label: 'Azure OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai_compatible', label: 'OpenAI-Compatible (vLLM, Ollama, etc.)' },
]

const MODEL_PLACEHOLDERS: Record<string, string> = {
  claude: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  azure_openai: '(set via Deployment ID)',
  gemini: 'gemini-2.0-flash',
  openai_compatible: 'default',
}

const PROVIDERS_WITH_ADVANCED_URL = new Set(['claude', 'openai', 'gemini'])
const PROVIDERS_WITH_OPTIONAL_KEY = new Set(['openai_compatible'])

interface FormState {
  provider_type: string
  api_key: string
  model_name: string
  max_tokens: number
  is_enabled: boolean
  base_url: string
  azure_resource_name: string
  azure_deployment_id: string
  azure_api_version: string
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

  const [form, setForm] = useState<FormState>({
    provider_type: 'claude',
    api_key: '',
    model_name: '',
    max_tokens: 1024,
    is_enabled: false,
    base_url: '',
    azure_resource_name: '',
    azure_deployment_id: '',
    azure_api_version: '2024-10-21',
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
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
        base_url: config.base_url ?? '',
        azure_resource_name: config.azure_resource_name ?? '',
        azure_deployment_id: config.azure_deployment_id ?? '',
        azure_api_version: config.azure_api_version ?? '2024-10-21',
      })
      setDirty(false)
      setTestResult(null)
      setShowAdvanced(!!config.base_url)
    }
  }, [config])

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
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
      base_url: form.base_url || null,
      azure_resource_name: form.azure_resource_name || null,
      azure_deployment_id: form.azure_deployment_id || null,
      azure_api_version: form.azure_api_version || null,
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

  const isAzure = form.provider_type === 'azure_openai'
  const isCompatible = form.provider_type === 'openai_compatible'
  const hasAdvancedUrl = PROVIDERS_WITH_ADVANCED_URL.has(form.provider_type)
  const keyOptional = PROVIDERS_WITH_OPTIONAL_KEY.has(form.provider_type)
  const showModelField = !isAzure // Azure uses deployment ID instead

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
            const newProvider = e.target.value
            setForm((prev) => ({
              ...prev,
              provider_type: newProvider,
              model_name: '',
              base_url: '',
              azure_resource_name: '',
              azure_deployment_id: '',
              azure_api_version: '2024-10-21',
            }))
            setDirty(true)
            setTestResult(null)
            setShowAdvanced(false)
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
        <label className="text-foreground mb-1.5 block text-sm font-medium">
          API Key{keyOptional && (
            <span className="text-muted-foreground ml-1 text-xs font-normal">(optional)</span>
          )}
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={form.api_key}
            onChange={(e) => updateField('api_key', e.target.value)}
            placeholder={
              config?.has_api_key
                ? '(key is set -- enter new value to change)'
                : keyOptional
                  ? 'Enter API key (optional for local servers)'
                  : 'Enter API key'
            }
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

      {/* Azure OpenAI fields */}
      {isAzure && (
        <>
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">
              Resource Name
            </label>
            <input
              type="text"
              value={form.azure_resource_name}
              onChange={(e) => updateField('azure_resource_name', e.target.value)}
              placeholder="my-openai-resource"
              className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Azure resource name from your Azure OpenAI deployment
            </p>
          </div>
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">
              Deployment ID
            </label>
            <input
              type="text"
              value={form.azure_deployment_id}
              onChange={(e) => updateField('azure_deployment_id', e.target.value)}
              placeholder="gpt-4o-deployment"
              className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Deployment name configured in Azure OpenAI Studio
            </p>
          </div>
          <div>
            <label className="text-foreground mb-1.5 block text-sm font-medium">
              API Version
            </label>
            <input
              type="text"
              value={form.azure_api_version}
              onChange={(e) => updateField('azure_api_version', e.target.value)}
              placeholder="2024-10-21"
              className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
            />
            <p className="text-muted-foreground mt-1 text-xs">
              Azure OpenAI API version (default: 2024-10-21)
            </p>
          </div>
        </>
      )}

      {/* OpenAI-compatible: required Base URL */}
      {isCompatible && (
        <div>
          <label className="text-foreground mb-1.5 block text-sm font-medium">
            Base URL <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={form.base_url}
            onChange={(e) => updateField('base_url', e.target.value)}
            placeholder="http://localhost:11434"
            className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">
            Server URL for your OpenAI-compatible endpoint (vLLM, Ollama, LM Studio, etc.)
          </p>
        </div>
      )}

      {/* Model Name (hidden for Azure which uses deployment ID) */}
      {showModelField && (
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
      )}

      {/* Max Tokens */}
      <div>
        <label className="text-foreground mb-1.5 flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-1.5">
            Max Tokens
            <span className="group relative">
              <HelpCircle className="text-muted-foreground h-3.5 w-3.5" />
              <span className="bg-popover text-popover-foreground border-border pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border p-2 text-xs font-normal leading-relaxed opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                Maximum number of tokens the AI can generate in its response. Higher values allow
                longer, more detailed analysis but cost more. 1024 is recommended for most use cases.
              </span>
            </span>
          </span>
          <span className="text-muted-foreground text-xs font-normal">{form.max_tokens}</span>
        </label>
        <input
          type="range"
          min={256}
          max={8192}
          step={256}
          value={form.max_tokens}
          onChange={(e) => updateField('max_tokens', parseInt(e.target.value, 10))}
          className="w-full accent-[hsl(var(--primary))]"
        />
        <div className="text-muted-foreground mt-0.5 flex justify-between text-[10px]">
          <span>256</span>
          <span>8192</span>
        </div>
      </div>

      {/* Advanced: optional base URL override for Claude/OpenAI/Gemini */}
      {hasAdvancedUrl && (
        <div className="rounded-lg border border-border">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground font-medium">Advanced</span>
            <ChevronDown
              className={cn(
                'text-muted-foreground h-4 w-4 transition-transform',
                showAdvanced && 'rotate-180',
              )}
            />
          </button>
          {showAdvanced && (
            <div className="border-t border-border px-3 pb-3 pt-2">
              <label className="text-foreground mb-1.5 block text-sm font-medium">
                Base URL Override
              </label>
              <input
                type="text"
                value={form.base_url}
                onChange={(e) => updateField('base_url', e.target.value)}
                placeholder="Leave empty for default endpoint"
                className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                Override the default API endpoint (e.g., for corporate proxies)
              </p>
            </div>
          )}
        </div>
      )}

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
