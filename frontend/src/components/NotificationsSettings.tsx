import { useState } from 'react'
import { Bell, Globe, Mail, Plus, TestTube, Trash2, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess } from '@/lib/roles'
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
  { value: 'violation_created', label: 'Violation Detected', description: 'When a Nelson rule violation occurs' },
  { value: 'limits_updated', label: 'Limits Updated', description: 'When control limits are recalculated' },
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
          updated.push({ event_type: evt.value, channel: ch.value, is_enabled: p?.is_enabled ?? false })
        }
      }
    }
    updatePrefs.mutate(updated)
  }

  return (
    <div className="bg-muted rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Notification Preferences</h3>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading preferences...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_80px_80px] gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            <span>Event</span>
            {CHANNELS.map((ch) => (
              <span key={ch.value} className="text-center">{ch.label}</span>
            ))}
          </div>
          {EVENT_TYPES.map((evt) => (
            <div key={evt.value} className="grid grid-cols-[1fr_80px_80px] gap-2 items-center">
              <div>
                <div className="text-sm font-medium">{evt.label}</div>
                <div className="text-xs text-muted-foreground">{evt.description}</div>
              </div>
              {CHANNELS.map((ch) => (
                <div key={ch.value} className="flex justify-center">
                  <button
                    onClick={() => togglePref(evt.value, ch.value)}
                    className={cn(
                      'relative w-11 h-6 rounded-full transition-colors',
                      isEnabled(evt.value, ch.value) ? 'bg-primary' : 'bg-muted-foreground/20'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
                        isEnabled(evt.value, ch.value) && 'translate-x-5'
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
    updateSmtp.mutate(form)
  }

  return (
    <div className="bg-muted rounded-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">SMTP Configuration</h3>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Port</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 587 })}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
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
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                value={form.password ?? ''}
                onChange={(e) => setForm({ ...form, password: e.target.value || null })}
                placeholder={smtp?.password_set ? '(unchanged)' : 'Optional'}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
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
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Use TLS</label>
              <p className="text-xs text-muted-foreground">Enable STARTTLS encryption</p>
            </div>
            <button
              onClick={() => setForm({ ...form, use_tls: !form.use_tls })}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                form.use_tls ? 'bg-primary' : 'bg-muted-foreground/20'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
                  form.use_tls && 'translate-x-5'
                )}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Active</label>
              <p className="text-xs text-muted-foreground">Enable email notifications</p>
            </div>
            <button
              onClick={() => setForm({ ...form, is_active: !form.is_active })}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                form.is_active ? 'bg-primary' : 'bg-muted-foreground/20'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
                  form.is_active && 'translate-x-5'
                )}
              />
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={updateSmtp.isPending || !form.server || !form.from_address}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {updateSmtp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save
            </button>
            <button
              onClick={() => testSmtp.mutate()}
              disabled={testSmtp.isPending || !smtp}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted disabled:opacity-50"
            >
              {testSmtp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
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
  const [showCreate, setShowCreate] = useState(false)
  const [newWebhook, setNewWebhook] = useState<WebhookConfigCreate>({
    name: '',
    url: '',
    secret: null,
    is_active: true,
    retry_count: 3,
    events_filter: null,
  })

  const handleCreate = () => {
    createWebhook.mutate(newWebhook, {
      onSuccess: () => {
        setShowCreate(false)
        setNewWebhook({ name: '', url: '', secret: null, is_active: true, retry_count: 3, events_filter: null })
      },
    })
  }

  return (
    <div className="bg-muted rounded-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Webhooks</h3>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : (
        <div className="space-y-3">
          {/* Create form */}
          {showCreate && (
            <div className="bg-background rounded-lg p-4 border space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={newWebhook.name}
                    onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
                    placeholder="My Webhook"
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">URL</label>
                  <input
                    type="url"
                    value={newWebhook.url}
                    onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
                    placeholder="https://example.com/webhook"
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Secret (optional)</label>
                <input
                  type="password"
                  value={newWebhook.secret ?? ''}
                  onChange={(e) => setNewWebhook({ ...newWebhook, secret: e.target.value || null })}
                  placeholder="HMAC-SHA256 signing secret"
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={createWebhook.isPending || !newWebhook.name || !newWebhook.url}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {createWebhook.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Create
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Webhook list */}
          {webhooks && webhooks.length > 0 ? (
            webhooks.map((wh) => (
              <div key={wh.id} className="bg-background rounded-lg p-4 border flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{wh.name}</span>
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      wh.is_active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground'
                    )}>
                      {wh.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {wh.has_secret && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        Signed
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{wh.url}</div>
                </div>
                <div className="flex items-center gap-1.5 ml-4 shrink-0">
                  <button
                    onClick={() => updateWebhook.mutate({ id: wh.id, data: { is_active: !wh.is_active } })}
                    className={cn(
                      'relative w-9 h-5 rounded-full transition-colors',
                      wh.is_active ? 'bg-primary' : 'bg-muted-foreground/20'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                        wh.is_active && 'translate-x-4'
                      )}
                    />
                  </button>
                  <button
                    onClick={() => testWebhook.mutate(wh.id)}
                    disabled={testWebhook.isPending}
                    className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
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
                    className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-muted"
                    title="Delete webhook"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          ) : !showCreate ? (
            <p className="text-sm text-muted-foreground">No webhooks configured. Click Add to create one.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
