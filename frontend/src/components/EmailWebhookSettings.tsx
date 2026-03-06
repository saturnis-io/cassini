import { useState, useEffect } from 'react'
import {
  Check,
  Globe,
  Loader2,
  Mail,
  Plus,
  TestTube,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { inputErrorClass } from '@/lib/validation'
import { smtpConfigSchema, webhookCreateSchema } from '@/schemas/notifications'
import { useFormValidation } from '@/hooks/useFormValidation'
import { FieldError } from '@/components/FieldError'
import {
  useSmtpConfig,
  useUpdateSmtpConfig,
  useTestSmtp,
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
} from '@/api/hooks'
import type { SmtpConfigUpdate, WebhookConfigCreate } from '@/api/client'

// ---------------------------------------------------------------------------
// Email & Webhook Settings (admin-only)
// ---------------------------------------------------------------------------

export function EmailWebhookSettings() {
  return (
    <div className="space-y-6" data-ui="email-webhook-settings">
      <SmtpSection />
      <WebhookSection />
    </div>
  )
}

// ---------------------------------------------------------------------------
// SMTP configuration
// ---------------------------------------------------------------------------

function SmtpSection() {
  const { data: smtp, isLoading } = useSmtpConfig()
  const updateSmtp = useUpdateSmtpConfig()
  const testSmtp = useTestSmtp()
  const { validate, getError } = useFormValidation(smtpConfigSchema)

  const [form, setForm] = useState<SmtpConfigUpdate>({
    server: '',
    port: 587,
    username: null,
    password: null,
    use_tls: true,
    from_address: '',
    is_active: false,
  })
  const [initialized, setInitialized] = useState(false)

  // Populate form when data loads — username starts empty (backend returns boolean)
  if (smtp && !initialized) {
    setForm({
      server: smtp.server,
      port: smtp.port,
      username: null,
      password: null, // Never populate password
      use_tls: smtp.use_tls,
      from_address: smtp.from_address,
      is_active: smtp.is_active,
    })
    setInitialized(true)
  }

  const handleSave = () => {
    const validated = validate(form)
    if (!validated) return
    updateSmtp.mutate(form)
  }

  return (
    <div className="bg-muted rounded-xl p-6" data-ui="smtp-section">
      <div className="mb-4 flex items-center gap-2" data-ui="smtp-section-header">
        <Mail className="text-muted-foreground h-5 w-5" />
        <h3 className="font-semibold">SMTP Configuration</h3>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">SMTP Server</label>
              <input
                type="text"
                value={form.server}
                onChange={(e) => setForm({ ...form, server: e.target.value })}
                placeholder="smtp.example.com"
                className={cn(
                  'mt-1 w-full rounded-lg border px-3 py-2 text-sm',
                  inputErrorClass(getError('server')),
                )}
              />
              <FieldError error={getError('server')} />
            </div>
            <div>
              <label className="text-sm font-medium">Port</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) =>
                  setForm({ ...form, port: parseInt(e.target.value) || 587 })
                }
                className={cn(
                  'mt-1 w-full rounded-lg border px-3 py-2 text-sm',
                  inputErrorClass(getError('port')),
                )}
              />
              <FieldError error={getError('port')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Username</label>
              <input
                type="text"
                value={form.username ?? ''}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value || null })
                }
                placeholder={
                  smtp?.username_set ? 'Username configured' : 'Optional'
                }
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                value={form.password ?? ''}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value || null })
                }
                placeholder={smtp?.password_set ? '(unchanged)' : 'Optional'}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">From Address</label>
            <input
              type="email"
              value={form.from_address}
              onChange={(e) =>
                setForm({ ...form, from_address: e.target.value })
              }
              placeholder="noreply@example.com"
              className={cn(
                'mt-1 w-full rounded-lg border px-3 py-2 text-sm',
                inputErrorClass(getError('from_address')),
              )}
            />
            <FieldError error={getError('from_address')} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Use TLS</label>
              <p className="text-muted-foreground text-xs">
                Enable STARTTLS encryption
              </p>
            </div>
            <button
              onClick={() => setForm({ ...form, use_tls: !form.use_tls })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                form.use_tls ? 'bg-primary' : 'bg-muted-foreground/20',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform',
                  form.use_tls && 'translate-x-5',
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Active</label>
              <p className="text-muted-foreground text-xs">
                Enable email notifications
              </p>
            </div>
            <button
              onClick={() => setForm({ ...form, is_active: !form.is_active })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                form.is_active ? 'bg-primary' : 'bg-muted-foreground/20',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform',
                  form.is_active && 'translate-x-5',
                )}
              />
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={
                updateSmtp.isPending || !form.server || !form.from_address
              }
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {updateSmtp.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save
            </button>
            <button
              onClick={() => testSmtp.mutate()}
              disabled={testSmtp.isPending || !smtp}
              className="hover:bg-muted flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {testSmtp.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              Send Test
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Webhook management
// ---------------------------------------------------------------------------

function WebhookSection() {
  const { data: webhooks, isLoading } = useWebhooks()
  const createWebhook = useCreateWebhook()
  const updateWebhook = useUpdateWebhook()
  const deleteWebhook = useDeleteWebhook()
  const testWebhook = useTestWebhook()
  const { validate, getError, clearErrors } =
    useFormValidation(webhookCreateSchema)
  const [showCreate, setShowCreate] = useState(false)
  const [newWebhook, setNewWebhook] = useState<WebhookConfigCreate>({
    name: '',
    url: '',
    secret: null,
    is_active: true,
    retry_count: 3,
    events_filter: null,
  })

  // Clear validation errors when create form toggles
  useEffect(() => {
    clearErrors()
  }, [showCreate, clearErrors])

  const handleCreate = () => {
    const validated = validate(newWebhook)
    if (!validated) return
    createWebhook.mutate(newWebhook, {
      onSuccess: () => {
        setShowCreate(false)
        setNewWebhook({
          name: '',
          url: '',
          secret: null,
          is_active: true,
          retry_count: 3,
          events_filter: null,
        })
      },
    })
  }

  return (
    <div className="bg-muted rounded-xl p-6" data-ui="webhooks-section">
      <div className="mb-4 flex items-center justify-between" data-ui="webhooks-section-header">
        <div className="flex items-center gap-2">
          <Globe className="text-muted-foreground h-5 w-5" />
          <h3 className="font-semibold">Webhooks</h3>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="space-y-3">
          {/* Create form */}
          {showCreate && (
            <div className="bg-background space-y-3 rounded-lg border p-4" data-ui="webhooks-create-form">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={newWebhook.name}
                    onChange={(e) =>
                      setNewWebhook({ ...newWebhook, name: e.target.value })
                    }
                    placeholder="My Webhook"
                    className={cn(
                      'mt-1 w-full rounded-lg border px-3 py-2 text-sm',
                      inputErrorClass(getError('name')),
                    )}
                  />
                  <FieldError error={getError('name')} />
                </div>
                <div>
                  <label className="text-sm font-medium">URL</label>
                  <input
                    type="url"
                    value={newWebhook.url}
                    onChange={(e) =>
                      setNewWebhook({ ...newWebhook, url: e.target.value })
                    }
                    placeholder="https://example.com/webhook"
                    className={cn(
                      'mt-1 w-full rounded-lg border px-3 py-2 text-sm',
                      inputErrorClass(getError('url')),
                    )}
                  />
                  <FieldError error={getError('url')} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Secret (optional)</label>
                <input
                  type="password"
                  value={newWebhook.secret ?? ''}
                  onChange={(e) =>
                    setNewWebhook({
                      ...newWebhook,
                      secret: e.target.value || null,
                    })
                  }
                  placeholder="HMAC-SHA256 signing secret"
                  className={cn(
                    'mt-1 w-full rounded-lg border px-3 py-2 text-sm',
                    inputErrorClass(getError('secret')),
                  )}
                />
                <FieldError error={getError('secret')} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={
                    createWebhook.isPending ||
                    !newWebhook.name ||
                    !newWebhook.url
                  }
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {createWebhook.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Create
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="hover:bg-muted rounded-lg border px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Webhook list */}
          {webhooks && webhooks.length > 0 ? (
            webhooks.map((wh) => (
              <div
                key={wh.id}
                className="bg-background flex items-center justify-between rounded-lg border p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{wh.name}</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-xs',
                        wh.is_active
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {wh.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {wh.has_secret && (
                      <span className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-xs">
                        Signed
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 truncate text-xs">
                    {wh.url}
                  </div>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() =>
                      updateWebhook.mutate({
                        id: wh.id,
                        data: { is_active: !wh.is_active },
                      })
                    }
                    className={cn(
                      'relative h-5 w-9 rounded-full transition-colors',
                      wh.is_active ? 'bg-primary' : 'bg-muted-foreground/20',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform',
                        wh.is_active && 'translate-x-4',
                      )}
                    />
                  </button>
                  <button
                    onClick={() => testWebhook.mutate(wh.id)}
                    disabled={testWebhook.isPending}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5"
                    title="Send test payload"
                  >
                    <TestTube className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete webhook "${wh.name}"?`)) {
                        deleteWebhook.mutate(wh.id)
                      }
                    }}
                    disabled={deleteWebhook.isPending}
                    className="text-muted-foreground hover:text-destructive hover:bg-muted rounded-lg p-1.5"
                    title="Delete webhook"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          ) : !showCreate ? (
            <p className="text-muted-foreground text-sm">
              No webhooks configured. Click Add to create one.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
