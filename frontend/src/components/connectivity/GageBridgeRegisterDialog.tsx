import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Loader2, Copy, Check, AlertTriangle } from 'lucide-react'
import { brokerApi } from '@/api/client'
import { useRegisterGageBridge } from '@/api/hooks'
import { gageBridgeRegisterSchema } from '@/schemas/connectivity'
import { useFormValidation } from '@/hooks/useFormValidation'
import { FieldError } from '@/components/FieldError'
import { inputErrorClass } from '@/lib/validation'
import { cn } from '@/lib/utils'

interface GageBridgeRegisterDialogProps {
  open: boolean
  onClose: () => void
  plantId: number
}

/**
 * Modal dialog for registering a new gage bridge.
 * After successful registration the one-time API key is displayed
 * with a copy button and warning that it will not be shown again.
 */
export function GageBridgeRegisterDialog({
  open,
  onClose,
  plantId,
}: GageBridgeRegisterDialogProps) {
  const [name, setName] = useState('')
  const [brokerId, setBrokerId] = useState<number | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const registerMutation = useRegisterGageBridge()
  const { validate, getError, clearErrors } = useFormValidation(gageBridgeRegisterSchema)

  // Fetch MQTT brokers for the dropdown
  const { data: brokersResponse } = useQuery({
    queryKey: ['brokers', plantId],
    queryFn: () => brokerApi.list({ plantId }),
    enabled: open,
  })
  const brokers = brokersResponse?.items ?? []

  const handleSubmit = () => {
    const validated = validate({ name })
    if (!validated) return

    registerMutation.mutate(
      {
        plant_id: plantId,
        name: validated.name,
        mqtt_broker_id: brokerId,
      },
      {
        onSuccess: (data) => {
          setApiKey(data.api_key)
        },
      },
    )
  }

  const handleCopy = async () => {
    if (!apiKey) return
    await navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = () => {
    setName('')
    setBrokerId(null)
    setApiKey(null)
    setCopied(false)
    registerMutation.reset()
    clearErrors()
    onClose()
  }

  if (!open) return null

  const isRegistered = !!apiKey

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={isRegistered ? undefined : handleClose} />

      {/* Dialog */}
      <div className="bg-card border-border relative w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl">
        {/* Header */}
        <div className="border-border flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-foreground text-base font-semibold">
            {isRegistered ? 'Bridge Registered' : 'Register Gage Bridge'}
          </h2>
          {!isRegistered && (
            <button
              onClick={handleClose}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md p-1 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {isRegistered ? (
            <>
              {/* API Key display */}
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-medium tracking-wider uppercase">
                  API Key
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={apiKey}
                    className="bg-muted border-border text-foreground w-full rounded-lg border px-3 py-2 font-mono text-sm select-all"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={handleCopy}
                    className="border-border hover:bg-muted shrink-0 rounded-lg border p-2 transition-colors"
                    title="Copy to clipboard"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="text-muted-foreground h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-sm text-amber-400">
                  Save this API key — it will not be shown again. The bridge uses this
                  key to authenticate its MQTT heartbeats and data publications.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Name field */}
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-medium tracking-wider uppercase">
                  Bridge Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lab-Floor Gage PC"
                  autoFocus
                  className={cn("bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2", inputErrorClass(getError('name')))}
                />
                <FieldError error={getError('name')} />
              </div>

              {/* MQTT Broker field */}
              <div>
                <label className="text-muted-foreground mb-1.5 block text-xs font-medium tracking-wider uppercase">
                  MQTT Broker
                </label>
                <select
                  value={brokerId ?? ''}
                  onChange={(e) => setBrokerId(e.target.value ? Number(e.target.value) : null)}
                  className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 text-sm transition-colors focus:ring-2"
                >
                  <option value="">None (standalone)</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.host}:{b.port})
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground mt-1 text-xs">
                  Optional — associate with a broker for heartbeat monitoring.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-3">
          {isRegistered ? (
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground px-4 py-2 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!name.trim() || registerMutation.isPending}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {registerMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Register
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
