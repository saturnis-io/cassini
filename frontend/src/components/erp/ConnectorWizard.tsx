import { useState } from 'react'
import { X, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateERPConnector } from '@/api/hooks'

const CONNECTOR_TYPES = [
  { value: 'sap_odata', label: 'SAP OData', desc: 'SAP S/4HANA, ECC via OData v4' },
  { value: 'oracle_rest', label: 'Oracle REST', desc: 'Oracle Cloud Quality Management' },
  { value: 'generic_lims', label: 'Generic LIMS', desc: 'Any LIMS with REST API' },
  {
    value: 'generic_webhook',
    label: 'Webhook',
    desc: 'Inbound push via HMAC webhooks',
  },
]

const AUTH_TYPES = [
  { value: 'basic', label: 'Basic Auth' },
  { value: 'oauth2_client_credentials', label: 'OAuth2 Client Credentials' },
  { value: 'api_key', label: 'API Key' },
  { value: 'jwt_bearer', label: 'JWT Bearer' },
]

const STEP_LABELS = ['Type', 'Connection', 'Review']

interface Props {
  plantId: number
  onClose: () => void
}

/**
 * ConnectorWizard - Multi-step dialog for creating an ERP/LIMS connector.
 * Steps: 1) Select type, 2) Configure connection + auth, 3) Review and create.
 */
export function ConnectorWizard({ plantId, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({
    name: '',
    connector_type: '',
    base_url: '',
    auth_type: 'basic',
    auth_config: {} as Record<string, string>,
  })
  const createMutation = useCreateERPConnector()

  const handleCreate = () => {
    createMutation.mutate(
      {
        plant_id: plantId,
        name: form.name,
        connector_type: form.connector_type,
        base_url: form.base_url,
        auth_type: form.auth_type,
        auth_config: form.auth_config,
      },
      { onSuccess: () => onClose() },
    )
  }

  const canAdvanceStep1 = form.name.trim() !== '' && form.base_url.trim() !== ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-card border-border mx-4 w-full max-w-lg space-y-4 rounded-xl border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add ERP/LIMS Connector</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2">
          {STEP_LABELS.map((label, i) => (
            <div
              key={label}
              className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-muted')}
            />
          ))}
        </div>

        {/* Step 0: Select type */}
        {step === 0 && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">Select connector type:</p>
            {CONNECTOR_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setForm((f) => ({ ...f, connector_type: t.value }))
                  setStep(1)
                }}
                className={cn(
                  'hover:bg-accent w-full rounded-lg border p-3 text-left',
                  form.connector_type === t.value && 'border-primary',
                )}
              >
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-muted-foreground text-xs">{t.desc}</div>
              </button>
            ))}
          </div>
        )}

        {/* Step 1: Connection details */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="My SAP Connection"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Base URL</label>
              <input
                value={form.base_url}
                onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                className="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="https://erp.example.com/api"
              />
            </div>
            <div>
              <label className="text-xs font-medium">Authentication</label>
              <select
                value={form.auth_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, auth_type: e.target.value, auth_config: {} }))
                }
                className="border-input bg-background mt-1 w-full rounded-md border px-3 py-2 text-sm"
              >
                {AUTH_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Auth-specific fields */}
            {form.auth_type === 'basic' && (
              <>
                <input
                  placeholder="Username"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      auth_config: { ...f.auth_config, username: e.target.value },
                    }))
                  }
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  placeholder="Password"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      auth_config: { ...f.auth_config, password: e.target.value },
                    }))
                  }
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </>
            )}
            {form.auth_type === 'api_key' && (
              <>
                <input
                  placeholder="Header Name (e.g. X-API-Key)"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      auth_config: { ...f.auth_config, header_name: e.target.value },
                    }))
                  }
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  placeholder="API Key"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      auth_config: { ...f.auth_config, api_key: e.target.value },
                    }))
                  }
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </>
            )}
            {form.auth_type === 'oauth2_client_credentials' && (
              <>
                <input
                  placeholder="Token URL"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      auth_config: { ...f.auth_config, token_url: e.target.value },
                    }))
                  }
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
                <input
                  placeholder="Client ID"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      auth_config: { ...f.auth_config, client_id: e.target.value },
                    }))
                  }
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  placeholder="Client Secret"
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      auth_config: { ...f.auth_config, client_secret: e.target.value },
                    }))
                  }
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </>
            )}
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Type:</span>{' '}
              {CONNECTOR_TYPES.find((t) => t.value === form.connector_type)?.label}
            </div>
            <div>
              <span className="text-muted-foreground">Name:</span> {form.name}
            </div>
            <div>
              <span className="text-muted-foreground">URL:</span> {form.base_url}
            </div>
            <div>
              <span className="text-muted-foreground">Auth:</span>{' '}
              {AUTH_TYPES.find((a) => a.value === form.auth_type)?.label}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-2">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          ) : (
            <div />
          )}
          {step < 2 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 1 && !canAdvanceStep1}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}{' '}
              Create
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
