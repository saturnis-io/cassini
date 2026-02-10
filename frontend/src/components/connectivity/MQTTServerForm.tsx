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
        }
      : defaultFormData
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
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-500/10">
            <span className="text-teal-400 text-sm font-bold">M</span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">
              {isEditing ? 'Edit MQTT Broker' : 'New MQTT Broker'}
            </h3>
            <p className="text-xs text-muted-foreground">
              Configure connection to an MQTT message broker
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-5 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              placeholder="Production MQTT"
              required
            />
          </div>

          {/* Host */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Host</label>
            <input
              type="text"
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              placeholder="mqtt.example.com"
              required
            />
          </div>

          {/* Port */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Port</label>
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
            <label className="block text-sm font-medium mb-1.5">Client ID</label>
            <input
              type="text"
              value={formData.client_id}
              onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              placeholder="openspc-client"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Username <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Password <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
              placeholder={isEditing ? '(unchanged)' : ''}
            />
          </div>

          {/* Keepalive */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Keepalive (seconds)</label>
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
              className="rounded border-input"
            />
            <label htmlFor="mqtt_use_tls" className="text-sm">
              Use TLS encryption
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <ConnectionTestButton
            onTest={handleTest}
            disabled={!formData.host}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Saving...' : isEditing ? 'Update Broker' : 'Create Broker'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
