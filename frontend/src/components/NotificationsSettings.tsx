import { useState, useEffect } from 'react'
import { Bell, Globe, TestTube, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface NotificationSettings {
  webhookUrl: string
  webhookEnabled: boolean
  notifyOnViolation: boolean
  notifyOnCriticalOnly: boolean
  notifyOnAcknowledgement: boolean
}

const STORAGE_KEY = 'openspc-notification-settings'

const defaultSettings: NotificationSettings = {
  webhookUrl: '',
  webhookEnabled: false,
  notifyOnViolation: true,
  notifyOnCriticalOnly: false,
  notifyOnAcknowledgement: false,
}

function getStoredSettings(): NotificationSettings {
  if (typeof window === 'undefined') return defaultSettings
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      return { ...defaultSettings, ...JSON.parse(stored) }
    } catch {
      return defaultSettings
    }
  }
  return defaultSettings
}

export function NotificationsSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(getStoredSettings)
  const [isTesting, setIsTesting] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  const updateSetting = <K extends keyof NotificationSettings>(
    key: K,
    value: NotificationSettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    setHasChanges(false)
    toast.success('Notification settings saved')
  }

  const handleTestWebhook = async () => {
    if (!settings.webhookUrl) {
      toast.error('Please enter a webhook URL first')
      return
    }

    setIsTesting(true)
    try {
      const response = await fetch(settings.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'test',
          message: 'OpenSPC webhook test',
          timestamp: new Date().toISOString(),
        }),
      })

      if (response.ok) {
        toast.success('Webhook test successful!')
      } else {
        toast.error(`Webhook test failed: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      toast.error(`Webhook test failed: ${error instanceof Error ? error.message : 'Network error'}`)
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Webhook Configuration */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Webhook Configuration</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Webhook URL</label>
            <div className="flex gap-2 mt-1">
              <input
                type="url"
                value={settings.webhookUrl}
                onChange={(e) => updateSetting('webhookUrl', e.target.value)}
                placeholder="https://your-server.com/webhook"
                className="flex-1 px-3 py-2 border rounded-lg"
              />
              <button
                onClick={handleTestWebhook}
                disabled={!settings.webhookUrl || isTesting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted disabled:opacity-50"
              >
                <TestTube className="h-4 w-4" />
                {isTesting ? 'Testing...' : 'Test'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              POST requests will be sent to this URL when events occur
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Enable Webhook</label>
              <p className="text-xs text-muted-foreground">Send notifications to the webhook URL</p>
            </div>
            <button
              onClick={() => updateSetting('webhookEnabled', !settings.webhookEnabled)}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                settings.webhookEnabled ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
                  settings.webhookEnabled && 'translate-x-5'
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Notification Events</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Violation Detected</label>
              <p className="text-xs text-muted-foreground">Notify when a Nelson rule violation occurs</p>
            </div>
            <button
              onClick={() => updateSetting('notifyOnViolation', !settings.notifyOnViolation)}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                settings.notifyOnViolation ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
                  settings.notifyOnViolation && 'translate-x-5'
                )}
              />
            </button>
          </div>

          {settings.notifyOnViolation && (
            <div className="flex items-center justify-between pl-4 border-l-2 border-muted">
              <div>
                <label className="text-sm font-medium">Critical Only</label>
                <p className="text-xs text-muted-foreground">Only notify for Rule 1 (beyond 3 sigma) violations</p>
              </div>
              <button
                onClick={() => updateSetting('notifyOnCriticalOnly', !settings.notifyOnCriticalOnly)}
                className={cn(
                  'relative w-11 h-6 rounded-full transition-colors',
                  settings.notifyOnCriticalOnly ? 'bg-primary' : 'bg-muted'
                )}
              >
                <span
                  className={cn(
                    'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
                    settings.notifyOnCriticalOnly && 'translate-x-5'
                  )}
                />
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Violation Acknowledged</label>
              <p className="text-xs text-muted-foreground">Notify when a violation is acknowledged</p>
            </div>
            <button
              onClick={() => updateSetting('notifyOnAcknowledgement', !settings.notifyOnAcknowledgement)}
              className={cn(
                'relative w-11 h-6 rounded-full transition-colors',
                settings.notifyOnAcknowledgement ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform',
                  settings.notifyOnAcknowledgement && 'translate-x-5'
                )}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Webhook Payload Example */}
      <div className="bg-muted/50 border border-border rounded-xl p-4">
        <h4 className="font-medium mb-2">Webhook Payload Format</h4>
        <pre className="bg-background rounded-lg p-3 text-xs overflow-x-auto">
{`{
  "type": "violation",
  "severity": "CRITICAL",
  "rule_id": 1,
  "rule_name": "Beyond 3 Sigma",
  "characteristic": {
    "id": 1,
    "name": "Temperature"
  },
  "sample": {
    "id": 123,
    "mean": 25.8,
    "timestamp": "2024-02-04T10:30:00Z"
  },
  "message": "Temperature: Rule 1 violation detected"
}`}
        </pre>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Check className="h-4 w-4" />
            Save Changes
          </button>
        </div>
      )}
    </div>
  )
}
