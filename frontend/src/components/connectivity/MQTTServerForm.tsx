import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { brokerApi } from '@/api/client'
import { NumberInput } from '@/components/NumberInput'
import { ConnectionTestButton } from './ConnectionTestButton'
import { usePlant } from '@/providers/PlantProvider'
import type { MQTTBroker } from '@/types'

interface BrokerFormData {
  name: string
  host: string
  port: number
  username: string
  password: string
  client_id: string
  keepalive: number
  use_tls: boolean
  outbound_enabled: boolean
  outbound_topic_prefix: string
  outbound_format: 'json' | 'sparkplug'
  outbound_rate_limit: number
}

const defaultFormData: BrokerFormData = {
  name: '',
  host: 'localhost',
  port: 1883,
  username: '',
  password: '',
  client_id: 'openspc-client',
  keepalive: 60,
  use_tls: false,
  outbound_enabled: false,
  outbound_topic_prefix: 'openspc',
  outbound_format: 'json',
  outbound_rate_limit: 1.0,
}

interface MQTTServerFormProps {
  broker?: MQTTBroker
  onClose: () => void
  onSaved?: () => void
}

/**
 * MQTT broker create/edit form.
 * Extracted from MQTTConfigPanel with improved layout.
 */
export function MQTTServerForm({ broker, onClose, onSaved }: MQTTServerFormProps) {
  const queryClient = useQueryClient()
  const { selectedPlant } = usePlant()
  const isEditing = !!broker

  const [formData, setFormData] = useState<BrokerFormData>(
    broker
      ? {
          name: broker.name,
          host: broker.host,
          port: broker.port,
          username: broker.username || '',
          password: '',
          client_id: broker.client_id,
          keepalive: broker.keepalive,
          use_tls: broker.use_tls,
          outbound_enabled: broker.outbound_enabled,
          outbound_topic_prefix: broker.outbound_topic_prefix,
          outbound_format: broker.outbound_format,
          outbound_rate_limit: broker.outbound_rate_limit,
        }
      : defaultFormData,
  )

  const createMutation = useMutation({
    mutationFn: brokerApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['brokers'] })
      queryClient.invalidateQueries({ queryKey: ['brokers-all-status'] })
      toast.success(`Created broker "${data.name}"`)
      onSaved?.()
      onClose()
    },
    onError: (err: Error) => toast.error(`Failed to create broker: ${err.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MQTTBroker & { password?: string }> }) =>
      brokerApi.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['brokers'] })
      queryClient.invalidateQueries({ queryKey: ['brokers-all-status'] })
      toast.success(`Updated broker "${data.name}"`)
      onSaved?.()
      onClose()
    },
    onError: (err: Error) => toast.error(`Failed to update broker: ${err.message}`),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = {
      ...formData,
      username: formData.username || undefined,
      password: formData.password || undefined,
    }

    if (isEditing && broker) {
      updateMutation.mutate({ id: broker.id, data })
    } else {
      createMutation.mutate({ ...data, plant_id: selectedPlant?.id ?? undefined })
    }
  }

  const handleTest = async () => {
    const result = await brokerApi.test({
      host: formData.host,
      port: formData.port,
      username: formData.username || undefined,
      password: formData.password || undefined,
      use_tls: formData.use_tls,
    })
    return { success: result.success, message: result.message }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      {/* Header */}
      <div className="border-border bg-muted/30 flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10">
            <span className="text-sm font-bold text-teal-400">M</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {isEditing ? 'Edit MQTT Broker' : 'New MQTT Broker'}
            </h3>
            <p className="text-muted-foreground text-xs">
              Configure connection to an MQTT message broker
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
              placeholder="Production MQTT"
              required
            />
          </div>

          {/* Host */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Host</label>
            <input
              type="text"
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 font-mono text-sm transition-colors focus:ring-2"
              placeholder="mqtt.example.com"
              required
            />
          </div>

          {/* Port */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Port</label>
            <NumberInput
              value={String(formData.port)}
              onChange={(v) => setFormData({ ...formData, port: parseInt(v) || 1883 })}
              min={1}
              max={65535}
              step={1}
              showButtons={false}
            />
          </div>

          {/* Client ID */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Client ID</label>
            <input
              type="text"
              value={formData.client_id}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 font-mono text-sm transition-colors focus:ring-2"
              placeholder="openspc-client"
            />
          </div>

          {/* Username */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Username <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
            />
          </div>

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Password <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
              placeholder={isEditing ? '(unchanged)' : ''}
            />
          </div>

          {/* Keepalive */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">Keepalive (seconds)</label>
            <NumberInput
              value={String(formData.keepalive)}
              onChange={(v) => setFormData({ ...formData, keepalive: parseInt(v) || 60 })}
              min={5}
              max={3600}
              step={1}
              showButtons={false}
            />
          </div>

          {/* TLS */}
          <div className="flex items-center gap-3 pt-6">
            <input
              type="checkbox"
              id="mqtt_use_tls"
              checked={formData.use_tls}
              onChange={(e) => setFormData({ ...formData, use_tls: e.target.checked })}
              className="border-input rounded"
            />
            <label htmlFor="mqtt_use_tls" className="text-sm">
              Use TLS encryption
            </label>
          </div>
        </div>

        {/* Outbound Publishing Section */}
        <div className="border-border border-t pt-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold">Outbound Publishing</h4>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Publish SPC events (samples, violations, limits) to this broker
              </p>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={formData.outbound_enabled}
                onChange={(e) => setFormData({ ...formData, outbound_enabled: e.target.checked })}
                className="peer sr-only"
              />
              <div className="bg-muted peer peer-checked:bg-primary after:bg-background h-5 w-9 rounded-full transition-colors after:absolute after:start-[2px] after:top-0.5 after:h-4 after:w-4 after:rounded-full after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
            </label>
          </div>

          {formData.outbound_enabled && (
            <div className="mt-3 grid grid-cols-2 gap-4">
              {/* Topic Prefix */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">Topic Prefix</label>
                <input
                  type="text"
                  value={formData.outbound_topic_prefix}
                  onChange={(e) =>
                    setFormData({ ...formData, outbound_topic_prefix: e.target.value })
                  }
                  className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 font-mono text-sm transition-colors focus:ring-2"
                  placeholder="openspc"
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Topic format: {formData.outbound_topic_prefix || 'openspc'}/
                  {'<plant>/<path>/<char>/<event>'}
                </p>
              </div>

              {/* Payload Format */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">Payload Format</label>
                <select
                  value={formData.outbound_format}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      outbound_format: e.target.value as 'json' | 'sparkplug',
                    })
                  }
                  className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
                >
                  <option value="json">JSON</option>
                  <option value="sparkplug">SparkplugB</option>
                </select>
              </div>

              {/* Rate Limit */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">Rate Limit (seconds)</label>
                <NumberInput
                  value={String(formData.outbound_rate_limit)}
                  onChange={(v) =>
                    setFormData({ ...formData, outbound_rate_limit: parseFloat(v) || 1.0 })
                  }
                  min={0.1}
                  max={60}
                  step={0.1}
                  showButtons={false}
                />
                <p className="text-muted-foreground mt-1 text-xs">
                  Min interval between publishes per characteristic
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="border-border flex items-center justify-between border-t pt-2">
          <ConnectionTestButton onTest={handleTest} disabled={!formData.host} />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border-border text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : isEditing ? 'Update Broker' : 'Create Broker'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
