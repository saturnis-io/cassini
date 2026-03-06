import { useState, useEffect } from 'react'
import {
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  Check,
  Loader2,
  Smartphone,
  TestTube,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@/api/hooks'
import type { NotificationPreferenceItem } from '@/api/client'

const EVENT_TYPES = [
  {
    key: 'violation_created',
    label: 'Violation Detected',
    description: 'Nelson rule violation on a control chart',
  },
  {
    key: 'limits_updated',
    label: 'Limits Updated',
    description: 'Control limits recalculated',
  },
  {
    key: 'anomaly_detected',
    label: 'Anomaly Detected',
    description: 'AI/ML anomaly detection alert',
  },
  {
    key: 'signature_created',
    label: 'Signature Required',
    description: 'Electronic signature workflow initiated',
  },
  {
    key: 'workflow_completed',
    label: 'Workflow Completed',
    description: 'Approval workflow completed',
  },
]

const CHANNELS = [
  { value: 'email', label: 'Email' },
  { value: 'webhook', label: 'Webhook' },
]

export function NotificationsSettings() {
  return (
    <div className="space-y-6" data-ui="notifications-settings">
      <PushSection />
      <PreferencesSection />
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
      const { isPushSupported, isSubscribed, getPermissionState } =
        await import('@/lib/push-manager')
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
    const { subscribeToPush, unsubscribeFromPush } =
      await import('@/lib/push-manager')
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
    <div className="bg-muted rounded-xl p-6" data-ui="notifications-push-section">
      <div className="mb-4 flex items-center gap-2" data-ui="notifications-push-header">
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
              <div className="text-sm font-medium">
                Browser Push Notifications
              </div>
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
  const [violationSeverity, setViolationSeverity] = useState('all')

  // Sync severity state from fetched preferences
  useEffect(() => {
    if (!preferences) return
    const violationPref = preferences.find(
      (p) => p.event_type === 'violation_created',
    )
    if (violationPref?.severity_filter) {
      setViolationSeverity(violationPref.severity_filter)
    }
  }, [preferences])

  const isEnabled = (eventType: string, channel: string) => {
    if (!preferences) return false
    const pref = preferences.find(
      (p) => p.event_type === eventType && p.channel === channel,
    )
    return pref?.is_enabled ?? false
  }

  const buildPreferenceList = (
    overrides?: {
      eventType: string
      channel?: string
      is_enabled?: boolean
      severity_filter?: string
    },
  ): NotificationPreferenceItem[] => {
    const current = preferences || []
    const updated: NotificationPreferenceItem[] = []

    for (const evt of EVENT_TYPES) {
      for (const ch of CHANNELS) {
        const existing = current.find(
          (x) => x.event_type === evt.key && x.channel === ch.value,
        )

        const isTargetToggle =
          overrides &&
          evt.key === overrides.eventType &&
          ch.value === overrides.channel

        const item: NotificationPreferenceItem = {
          event_type: evt.key,
          channel: ch.value,
          is_enabled: isTargetToggle
            ? (overrides.is_enabled ?? !(existing?.is_enabled ?? false))
            : (existing?.is_enabled ?? false),
        }

        // Attach severity_filter for violation_created rows
        if (evt.key === 'violation_created') {
          if (overrides?.eventType === 'violation_created' && overrides.severity_filter) {
            item.severity_filter = overrides.severity_filter
          } else {
            item.severity_filter =
              existing?.severity_filter ?? violationSeverity
          }
        }

        updated.push(item)
      }
    }
    return updated
  }

  const togglePref = (eventType: string, channel: string) => {
    updatePrefs.mutate(
      buildPreferenceList({ eventType, channel }),
    )
  }

  const handleSeverityChange = (value: string) => {
    setViolationSeverity(value)
    updatePrefs.mutate(
      buildPreferenceList({
        eventType: 'violation_created',
        severity_filter: value,
      }),
    )
  }

  return (
    <div className="bg-muted rounded-xl p-6" data-ui="notifications-preferences-section">
      <div className="mb-4 flex items-center gap-2" data-ui="notifications-preferences-header">
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
            <div key={evt.key} className="space-y-2">
              <div className="grid grid-cols-[1fr_80px_80px] items-center gap-2">
                <div>
                  <div className="text-sm font-medium">{evt.label}</div>
                  <div className="text-muted-foreground text-xs">
                    {evt.description}
                  </div>
                </div>
                {CHANNELS.map((ch) => (
                  <div key={ch.value} className="flex justify-center">
                    <button
                      onClick={() => togglePref(evt.key, ch.value)}
                      className={cn(
                        'relative h-6 w-11 rounded-full transition-colors',
                        isEnabled(evt.key, ch.value)
                          ? 'bg-primary'
                          : 'bg-muted-foreground/20',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform',
                          isEnabled(evt.key, ch.value) && 'translate-x-5',
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>
              {evt.key === 'violation_created' && (
                <div className="pl-0">
                  <select
                    value={violationSeverity}
                    onChange={(e) => handleSeverityChange(e.target.value)}
                    className="bg-background border-border rounded-md border px-2 py-1 text-xs"
                  >
                    <option value="all">All violations</option>
                    <option value="critical_and_warning">
                      Critical + Warning
                    </option>
                    <option value="critical_only">Critical only</option>
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
