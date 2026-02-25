import { useState, useEffect } from 'react'
import { Bell, Globe, Mail, Plus, Smartphone, TestTube, Trash2, Check, Loader2, BellRing, BellOff, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inputErrorClass } from '@/lib/validation'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess } from '@/lib/roles'
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
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/api/hooks'
import type { SmtpConfigUpdate, WebhookConfigCreate } from '@/api/client'
import type { NotificationPreferenceItem } from '@/api/client'

const EVENT_TYPES = [
  {
    value: 'violation_created',
    label: 'Violation Detected',
    description: 'When a Nelson rule violation occurs',
  },
  {
    value: 'limits_updated',
    label: 'Limits Updated',
    description: 'When control limits are recalculated',
  },
]

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'webhook', label: 'Webhook' },
]

export function NotificationsSettings() {
  const { role } = useAuth()
  const isAdmin = hasAccess(role, 'admin')

  return (
    <div className="space-y-6">
      {/* Push notifications — always visible */}
      <PushSection />

      {/* User Preferences — always visible */}
      <PreferencesSection />

      {/* Admin-only sections */}
      {isAdmin && (
        <>
          <SmtpSection />
          <WebhookSection />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Push notifications (browser)
// ---------------------------------------------------------------------------

function PushSection() {
  const [isEnabled, setIsEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [supported, setSupported] = useState(true)
  const [permState, setPermState] = useState<NotificationPermission>('default')
  const [testSent, setTestSent] = useState(false)

  useEffect(() => {
    async function checkStatus() {
      const { isPushSupported, isSubscribed, getPermissionState } = await import('@/lib/push-manager')
      if (!isPushSupported()) {
        setSupported(false)
        setIsLoading(false)
        return
      }
      setPermState(getPermissionState())
      const subscribed = await isSubscribed()
      setIsEnabled(subscribed)
      setIsLoading(false)
    }
    checkStatus()
  }, [])

  const handleToggle = async () => {
    const { subscribeToPush, unsubscribeFromPush } = await import('@/lib/push-manager')
    setIsLoading(true)
    if (isEnabled) {
      const ok = await unsubscribeFromPush()
      if (ok) setIsEnabled(false)
    } else {
      const ok = await subscribeToPush()
      if (ok) {
        setIsEnabled(true)
        setPermState('granted')
      }
    }
    setIsLoading(false)
  }

  const handleTestNotification = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Cassini Test', {
        body: 'Push notifications are working correctly.',
        icon: '/icons/icon-192.png',
      })
      setTestSent(true)
      setTimeout(() => setTestSent(false), 3000)
    }
  }

  return (
    <div className="bg-muted rounded-xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <Smartphone className="text-muted-foreground h-5 w-5" />
        <h3 className="font-semibold">Push Notifications</h3>
      </div>

      {!supported ? (
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          Push notifications are not supported in this browser.
        </div>
      ) : isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking push status...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Browser Push Notifications</div>
              <div className="text-muted-foreground text-xs">
                {permState === 'denied'
                  ? 'Notifications blocked by browser. Update your browser settings to allow notifications for this site.'
                  : isEnabled
                    ? 'You will receive push alerts for SPC violations and limit updates.'
                    : 'Enable to receive real-time alerts even when Cassini is not open.'}
              </div>
            </div>
            <button
              onClick={handleToggle}
              disabled={permState === 'denied'}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors disabled:opacity-50',
                isEnabled ? 'bg-primary' : 'bg-muted-foreground/20',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform',
                  isEnabled && 'translate-x-5',
                )}
              />
            </button>
          </div>

          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium',
                isEnabled
                  ? 'bg-success/10 text-success'
                  : 'bg-muted-foreground/10 text-muted-foreground',
              )}
            >
              {isEnabled ? (
                <BellRing className="h-3 w-3" />
              ) : (
                <BellOff className="h-3 w-3" />
              )}
              {isEnabled ? 'Subscribed' : 'Not subscribed'}
            </span>
            <span
              className={cn(
                'rounded px-2 py-0.5 text-xs font-medium',
                permState === 'granted'
                  ? 'bg-success/10 text-success'
                  : permState === 'denied'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted-foreground/10 text-muted-foreground',
              )}
            >
              Permission: {permState}
            </span>
          </div>

          {/* Test button */}
          {isEnabled && (
            <button
              onClick={handleTestNotification}
              disabled={testSent}
              className="hover:bg-muted flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {testSent ? (
                <Check className="h-4 w-4" />
              ) : (
                <TestTube className="h-4 w-4" />
              )}
              {testSent ? 'Sent' : 'Send Test Notification'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// User notification preferences
// ---------------------------------------------------------------------------

function PreferencesSection() {
  const { data: preferences, isLoading } = useNotificationPreferences()
  const updatePrefs = useUpdateNotificationPreferences()

  const isEnabled = (eventType: string, channel: string) => {
    if (!preferences) return false
    const pref = preferences.find((p) => p.event_type === eventType && p.channel === channel)
    return pref?.is_enabled ?? false
  }

  const togglePref = (eventType: string, channel: string) => {
    const current = preferences || []
    const existing = current.find((p) => p.event_type === eventType && p.channel === channel)
    const newEnabled = !(existing?.is_enabled ?? false)

    // Build full preference list
    const updated: NotificationPreferenceItem[] = []
    for (const evt of EVENT_TYPES) {
      for (const ch of CHANNELS) {
        if (evt.value === eventType && ch.value === channel) {
          updated.push({ event_type: evt.value, channel: ch.value, is_enabled: newEnabled })
        } else {
          const p = current.find((x) => x.event_type === evt.value && x.channel === ch.value)
          updated.push({
            event_type: evt.value,
            channel: ch.value,
            is_enabled: p?.is_enabled ?? false,
          })
        }
      }
    }
    updatePrefs.mutate(updated)
  }

  return (
    <div className="bg-muted rounded-xl p-6">
      <div className="mb-4 flex items-center gap-2">
        <Bell className="text-muted-foreground h-5 w-5" />
        <h3 className="font-semibold">Notification Preferences</h3>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading preferences...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-muted-foreground grid grid-cols-[1fr_80px_80px] gap-2 text-xs font-medium tracking-wider uppercase">
            <span>Event</span>
            {CHANNELS.map((ch) => (
              <span key={ch.value} className="text-center">
                {ch.label}
              </span>
            ))}
          </div>
          {EVENT_TYPES.map((evt) => (
            <div key={evt.value} className="grid grid-cols-[1fr_80px_80px] items-center gap-2">
              <div>
                <div className="text-sm font-medium">{evt.label}</div>
                <div className="text-muted-foreground text-xs">{evt.description}</div>
              </div>
              {CHANNELS.map((ch) => (
                <div key={ch.value} className="flex justify-center">
                  <button
                    onClick={() => togglePref(evt.value, ch.value)}
                    className={cn(
                      'relative h-6 w-11 rounded-full transition-colors',
                      isEnabled(evt.value, ch.value) ? 'bg-primary' : 'bg-muted-foreground/20',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform',
                        isEnabled(evt.value, ch.value) && 'translate-x-5',
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SMTP configuration (admin-only)
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

  // Populate form when data loads
  if (smtp && !initialized) {
    setForm({
      server: smtp.server,
      port: smtp.port,
      username: smtp.username,
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
    <div className="bg-muted rounded-xl p-6">
      <div className="mb-4 flex items-center gap-2">
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
                className={cn('mt-1 w-full rounded-lg border px-3 py-2 text-sm', inputErrorClass(getError('server')))}
              />
              <FieldError error={getError('server')} />
            </div>
            <div>
              <label className="text-sm font-medium">Port</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 587 })}
                className={cn('mt-1 w-full rounded-lg border px-3 py-2 text-sm', inputErrorClass(getError('port')))}
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
                onChange={(e) => setForm({ ...form, username: e.target.value || null })}
                placeholder="Optional"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                value={form.password ?? ''}
                onChange={(e) => setForm({ ...form, password: e.target.value || null })}
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
              onChange={(e) => setForm({ ...form, from_address: e.target.value })}
              placeholder="noreply@example.com"
              className={cn('mt-1 w-full rounded-lg border px-3 py-2 text-sm', inputErrorClass(getError('from_address')))}
            />
            <FieldError error={getError('from_address')} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Use TLS</label>
              <p className="text-muted-foreground text-xs">Enable STARTTLS encryption</p>
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
              <p className="text-muted-foreground text-xs">Enable email notifications</p>
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
              disabled={updateSmtp.isPending || !form.server || !form.from_address}
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
// Webhook management (admin-only)
// ---------------------------------------------------------------------------

function WebhookSection() {
  const { data: webhooks, isLoading } = useWebhooks()
  const createWebhook = useCreateWebhook()
  const updateWebhook = useUpdateWebhook()
  const deleteWebhook = useDeleteWebhook()
  const testWebhook = useTestWebhook()
  const { validate, getError, clearErrors } = useFormValidation(webhookCreateSchema)
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
    <div className="bg-muted rounded-xl p-6">
      <div className="mb-4 flex items-center justify-between">
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
            <div className="bg-background space-y-3 rounded-lg border p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={newWebhook.name}
                    onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                    placeholder="My Webhook"
                    className={cn('mt-1 w-full rounded-lg border px-3 py-2 text-sm', inputErrorClass(getError('name')))}
                  />
                  <FieldError error={getError('name')} />
                </div>
                <div>
                  <label className="text-sm font-medium">URL</label>
                  <input
                    type="url"
                    value={newWebhook.url}
                    onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                    placeholder="https://example.com/webhook"
                    className={cn('mt-1 w-full rounded-lg border px-3 py-2 text-sm', inputErrorClass(getError('url')))}
                  />
                  <FieldError error={getError('url')} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Secret (optional)</label>
                <input
                  type="password"
                  value={newWebhook.secret ?? ''}
                  onChange={(e) => setNewWebhook({ ...newWebhook, secret: e.target.value || null })}
                  placeholder="HMAC-SHA256 signing secret"
                  className={cn('mt-1 w-full rounded-lg border px-3 py-2 text-sm', inputErrorClass(getError('secret')))}
                />
                <FieldError error={getError('secret')} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={createWebhook.isPending || !newWebhook.name || !newWebhook.url}
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
                  <div className="text-muted-foreground mt-0.5 truncate text-xs">{wh.url}</div>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() =>
                      updateWebhook.mutate({ id: wh.id, data: { is_active: !wh.is_active } })
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
