import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { NumberInput } from '@/components/NumberInput'
import { ConnectionTestButton } from './ConnectionTestButton'
import { usePlant } from '@/providers/PlantProvider'
import { opcuaApi } from '@/api/client'
import type { OPCUAServer, OPCUAServerCreate } from '@/types'

interface OPCUAFormData {
  name: string
  endpoint_url: string
  auth_mode: 'anonymous' | 'username_password'
  username: string
  password: string
  security_policy: string
  security_mode: string
  session_timeout: number
  publishing_interval: number
  sampling_interval: number
}

const defaultFormData: OPCUAFormData = {
  name: '',
  endpoint_url: 'opc.tcp://',
  auth_mode: 'anonymous',
  username: '',
  password: '',
  security_policy: 'None',
  security_mode: 'None',
  session_timeout: 30000,
  publishing_interval: 1000,
  sampling_interval: 250,
}

interface OPCUAServerFormProps {
  server?: OPCUAServer
  onClose: () => void
  onSaved?: () => void
}

/**
 * OPC-UA server create/edit form.
 */
export function OPCUAServerForm({ server, onClose, onSaved }: OPCUAServerFormProps) {
  const queryClient = useQueryClient()
  const { selectedPlant } = usePlant()
  const isEditing = !!server

  const [formData, setFormData] = useState<OPCUAFormData>(
    server
      ? {
          name: server.name,
          endpoint_url: server.endpoint_url,
          auth_mode: server.auth_mode as OPCUAFormData['auth_mode'],
          username: server.username || '',
          password: '',
          security_policy: server.security_policy,
          security_mode: server.security_mode,
          session_timeout: server.session_timeout,
          publishing_interval: server.publishing_interval,
          sampling_interval: server.sampling_interval,
        }
      : defaultFormData
  )

  const createMutation = useMutation({
    mutationFn: opcuaApi.create,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['opcua-servers'] })
      queryClient.invalidateQueries({ queryKey: ['opcua-all-status'] })
      toast.success(`Created OPC-UA server "${data.name}"`)
      onSaved?.()
      onClose()
    },
    onError: (err: Error) => toast.error(`Failed to create server: ${err.message}`),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof opcuaApi.update>[1] }) =>
      opcuaApi.update(id, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['opcua-servers'] })
      queryClient.invalidateQueries({ queryKey: ['opcua-all-status'] })
      toast.success(`Updated OPC-UA server "${data.name}"`)
      onSaved?.()
      onClose()
    },
    onError: (err: Error) => toast.error(`Failed to update server: ${err.message}`),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data: Omit<OPCUAServerCreate, 'plant_id'> = {
      name: formData.name,
      endpoint_url: formData.endpoint_url,
      auth_mode: formData.auth_mode,
      security_policy: formData.security_policy,
      security_mode: formData.security_mode,
      session_timeout: formData.session_timeout,
      publishing_interval: formData.publishing_interval,
      sampling_interval: formData.sampling_interval,
      ...(formData.auth_mode === 'username_password' ? {
        username: formData.username || undefined,
        password: formData.password || undefined,
      } : {}),
    }

    if (isEditing && server) {
      updateMutation.mutate({ id: server.id, data })
    } else {
      createMutation.mutate({
        ...data,
        plant_id: selectedPlant?.id ?? undefined,
      })
    }
  }

  const handleTest = async () => {
    const testData: OPCUAServerCreate = {
      name: formData.name || 'test',
      endpoint_url: formData.endpoint_url,
      auth_mode: formData.auth_mode,
      ...(formData.auth_mode === 'username_password' ? {
        username: formData.username || undefined,
        password: formData.password || undefined,
      } : {}),
    }
    const result = await opcuaApi.test(testData)
    return { success: result.success, message: result.message }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const selectClasses = 'w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors appearance-none'

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10">
            <span className="text-purple-400 text-sm font-bold">U</span>
          </div>
          <div>
            <h3 className="font-semibold text-sm">
              {isEditing ? 'Edit OPC-UA Server' : 'New OPC-UA Server'}
            </h3>
            <p className="text-xs text-muted-foreground">
              Configure connection to an OPC-UA server
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
        {/* Connection */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Connection</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="PLC Controller 1"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5">Endpoint URL</label>
              <input
                type="text"
                value={formData.endpoint_url}
                onChange={(e) => setFormData({ ...formData, endpoint_url: e.target.value })}
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                placeholder="opc.tcp://192.168.1.100:4840"
                required
                pattern="^opc\.tcp://.*"
                title="Must start with opc.tcp://"
              />
            </div>
          </div>
        </div>

        {/* Authentication */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Authentication</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Auth Mode</label>
              <select
                value={formData.auth_mode}
                onChange={(e) => setFormData({ ...formData, auth_mode: e.target.value as OPCUAFormData['auth_mode'] })}
                className={selectClasses}
              >
                <option value="anonymous">Anonymous</option>
                <option value="username_password">Username / Password</option>
              </select>
            </div>
            <div /> {/* spacer */}

            {formData.auth_mode === 'username_password' && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
                    placeholder={isEditing ? '(unchanged)' : ''}
                    required={!isEditing}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Security */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Security</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Security Policy</label>
              <select
                value={formData.security_policy}
                onChange={(e) => setFormData({ ...formData, security_policy: e.target.value })}
                className={selectClasses}
              >
                <option value="None">None</option>
                <option value="Basic256Sha256">Basic256Sha256</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Security Mode</label>
              <select
                value={formData.security_mode}
                onChange={(e) => setFormData({ ...formData, security_mode: e.target.value })}
                className={selectClasses}
              >
                <option value="None">None</option>
                <option value="Sign">Sign</option>
                <option value="SignAndEncrypt">Sign and Encrypt</option>
              </select>
            </div>
          </div>
        </div>

        {/* Timing */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Timing</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Session Timeout</label>
              <div className="relative">
                <NumberInput
                  value={String(formData.session_timeout)}
                  onChange={(v) => setFormData({ ...formData, session_timeout: parseInt(v) || 30000 })}
                  min={1000}
                  max={300000}
                  step={1000}
                  showButtons={false}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">ms</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Publish Interval</label>
              <div className="relative">
                <NumberInput
                  value={String(formData.publishing_interval)}
                  onChange={(v) => setFormData({ ...formData, publishing_interval: parseInt(v) || 1000 })}
                  min={50}
                  max={60000}
                  step={100}
                  showButtons={false}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">ms</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Sampling Interval</label>
              <div className="relative">
                <NumberInput
                  value={String(formData.sampling_interval)}
                  onChange={(v) => setFormData({ ...formData, sampling_interval: parseInt(v) || 250 })}
                  min={10}
                  max={60000}
                  step={50}
                  showButtons={false}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <ConnectionTestButton
            onTest={handleTest}
            disabled={!formData.endpoint_url || !formData.endpoint_url.startsWith('opc.tcp://')}
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
              {isSaving ? 'Saving...' : isEditing ? 'Update Server' : 'Create Server'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
