import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { NumberInput } from '@/components/NumberInput'
import { ConnectionTestButton } from './ConnectionTestButton'
import { TlsCertificateSection, type CertAction } from './TlsCertificateSection'
import { usePlant } from '@/providers/PlantProvider'
import { opcuaApi } from '@/api/client'
import { opcuaServerSchema } from '@/schemas/connectivity'
import { useFormValidation } from '@/hooks/useFormValidation'
import { FieldError } from '@/components/FieldError'
import { inputErrorClass } from '@/lib/validation'
import { cn } from '@/lib/utils'
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
  tls_insecure: boolean
  ca_cert_pem: string
  client_cert_pem: string
  client_key_pem: string
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
  tls_insecure: false,
  ca_cert_pem: '',
  client_cert_pem: '',
  client_key_pem: '',
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
          tls_insecure: server.tls_insecure,
          ca_cert_pem: '',
          client_cert_pem: '',
          client_key_pem: '',
        }
      : defaultFormData,
  )

  const [showTlsCerts, setShowTlsCerts] = useState(
    server
      ? server.security_policy !== 'None' || server.has_ca_cert || server.has_client_cert
      : false,
  )
  const [caCertAction, setCaCertAction] = useState<CertAction>(
    server?.has_ca_cert ? 'keep' : 'replace',
  )
  const [clientCertAction, setClientCertAction] = useState<CertAction>(
    server?.has_client_cert ? 'keep' : 'replace',
  )

  const { validate, getError } = useFormValidation(opcuaServerSchema)

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
    const validated = validate(formData)
    if (!validated) return

    const data: Record<string, unknown> = {
      name: validated.name,
      endpoint_url: validated.endpoint_url,
      auth_mode: validated.auth_mode,
      security_policy: validated.security_policy,
      security_mode: validated.security_mode,
      session_timeout: validated.session_timeout,
      publishing_interval: validated.publishing_interval,
      sampling_interval: validated.sampling_interval,
      ...(validated.auth_mode === 'username_password'
        ? {
            username: validated.username || undefined,
            password: validated.password || undefined,
          }
        : {}),
    }

    if (showTlsCerts) {
      data.tls_insecure = validated.tls_insecure

      if (caCertAction === 'replace' && validated.ca_cert_pem) {
        data.ca_cert_pem = validated.ca_cert_pem
      } else if (caCertAction === 'remove') {
        data.ca_cert_pem = null
      }

      if (clientCertAction === 'replace' && validated.client_cert_pem) {
        data.client_cert_pem = validated.client_cert_pem
        data.client_key_pem = validated.client_key_pem
      } else if (clientCertAction === 'remove') {
        data.client_cert_pem = null
        data.client_key_pem = null
      }
    }

    if (isEditing && server) {
      updateMutation.mutate({ id: server.id, data: data as Parameters<typeof opcuaApi.update>[1] })
    } else {
      createMutation.mutate({
        ...data,
        plant_id: selectedPlant?.id ?? undefined,
      } as OPCUAServerCreate)
    }
  }

  const handleTest = async () => {
    const testData: OPCUAServerCreate = {
      name: formData.name || 'test',
      endpoint_url: formData.endpoint_url,
      auth_mode: formData.auth_mode,
      ...(formData.auth_mode === 'username_password'
        ? {
            username: formData.username || undefined,
            password: formData.password || undefined,
          }
        : {}),
      ...(showTlsCerts
        ? {
            tls_insecure: formData.tls_insecure,
            ca_cert_pem: formData.ca_cert_pem || undefined,
            client_cert_pem: formData.client_cert_pem || undefined,
            client_key_pem: formData.client_key_pem || undefined,
          }
        : {}),
    }
    const result = await opcuaApi.test(testData)
    return { success: result.success, message: result.message }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  const selectClasses =
    'w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors appearance-none'

  return (
    <div className="bg-card border-border overflow-hidden rounded-xl border">
      {/* Header */}
      <div className="border-border bg-muted/30 flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
            <span className="text-sm font-bold text-purple-400">U</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              {isEditing ? 'Edit OPC-UA Server' : 'New OPC-UA Server'}
            </h3>
            <p className="text-muted-foreground text-xs">
              Configure connection to an OPC-UA server
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
        {/* Connection */}
        <div>
          <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
            Connection
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={cn("bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2", inputErrorClass(getError('name')))}
                placeholder="PLC Controller 1"
                required
              />
              <FieldError error={getError('name')} />
            </div>
            <div className="col-span-2">
              <label className="mb-1.5 block text-sm font-medium">Endpoint URL</label>
              <input
                type="text"
                value={formData.endpoint_url}
                onChange={(e) => setFormData({ ...formData, endpoint_url: e.target.value })}
                className={cn("bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 font-mono text-sm transition-colors focus:ring-2", inputErrorClass(getError('endpoint_url')))}
                placeholder="opc.tcp://192.168.1.100:4840"
                required
                pattern="^opc\.tcp://.*"
                title="Must start with opc.tcp://"
              />
              <FieldError error={getError('endpoint_url')} />
            </div>
          </div>
        </div>

        {/* Authentication */}
        <div>
          <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
            Authentication
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Auth Mode</label>
              <select
                value={formData.auth_mode}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    auth_mode: e.target.value as OPCUAFormData['auth_mode'],
                  })
                }
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
                  <label className="mb-1.5 block text-sm font-medium">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
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
          <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
            Security
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Security Policy</label>
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
              <label className="mb-1.5 block text-sm font-medium">Security Mode</label>
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

            {/* TLS Certificates toggle */}
            <div className="col-span-2 flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="opcua_tls_certs"
                checked={showTlsCerts}
                onChange={(e) => setShowTlsCerts(e.target.checked)}
                className="border-input rounded"
              />
              <label htmlFor="opcua_tls_certs" className="text-sm">
                Configure TLS certificates
              </label>
            </div>
          </div>

          {showTlsCerts && (
            <TlsCertificateSection
              hasCaCert={server?.has_ca_cert ?? false}
              hasClientCert={server?.has_client_cert ?? false}
              caCertPem={formData.ca_cert_pem}
              clientCertPem={formData.client_cert_pem}
              clientKeyPem={formData.client_key_pem}
              tlsInsecure={formData.tls_insecure}
              caCertAction={caCertAction}
              clientCertAction={clientCertAction}
              onChange={(field, value) =>
                setFormData({ ...formData, [field]: value })
              }
              onCaCertAction={setCaCertAction}
              onClientCertAction={setClientCertAction}
              getError={getError}
              isEditing={isEditing}
            />
          )}
        </div>

        {/* Timing */}
        <div>
          <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase">
            Timing
          </h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Session Timeout</label>
              <div className="relative">
                <NumberInput
                  value={String(formData.session_timeout)}
                  onChange={(v) =>
                    setFormData({ ...formData, session_timeout: parseInt(v) || 30000 })
                  }
                  min={1000}
                  max={300000}
                  step={1000}
                  showButtons={false}
                  className={inputErrorClass(getError('session_timeout'))}
                />
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
                  ms
                </span>
              </div>
              <FieldError error={getError('session_timeout')} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Publish Interval</label>
              <div className="relative">
                <NumberInput
                  value={String(formData.publishing_interval)}
                  onChange={(v) =>
                    setFormData({ ...formData, publishing_interval: parseInt(v) || 1000 })
                  }
                  min={50}
                  max={60000}
                  step={100}
                  showButtons={false}
                  className={inputErrorClass(getError('publishing_interval'))}
                />
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
                  ms
                </span>
              </div>
              <FieldError error={getError('publishing_interval')} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Sampling Interval</label>
              <div className="relative">
                <NumberInput
                  value={String(formData.sampling_interval)}
                  onChange={(v) =>
                    setFormData({ ...formData, sampling_interval: parseInt(v) || 250 })
                  }
                  min={10}
                  max={60000}
                  step={50}
                  showButtons={false}
                  className={inputErrorClass(getError('sampling_interval'))}
                />
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs">
                  ms
                </span>
              </div>
              <FieldError error={getError('sampling_interval')} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="border-border flex items-center justify-between border-t pt-2">
          <ConnectionTestButton
            onTest={handleTest}
            disabled={!formData.endpoint_url || !formData.endpoint_url.startsWith('opc.tcp://')}
          />

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
              {isSaving ? 'Saving...' : isEditing ? 'Update Server' : 'Create Server'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
