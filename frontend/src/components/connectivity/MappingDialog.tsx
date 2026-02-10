import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, Loader2, Save, Wifi, Server } from 'lucide-react'
import { tagApi } from '@/api/client'
import { CharacteristicPicker } from './CharacteristicPicker'
import { ProtocolSourceFields } from './ProtocolSourceFields'
import type { ProtocolFieldValues } from './ProtocolSourceFields'

interface MappingDialogProps {
  isOpen: boolean
  onClose: () => void
  /** If provided, the dialog is in edit mode. */
  editData?: {
    dataSourceId: number
    characteristicId: number
    protocol: 'mqtt' | 'opcua'
    triggerStrategy: string
    // MQTT-specific
    topic?: string
    brokerId?: number
    metricName?: string
    triggerTag?: string
    // OPC-UA-specific
    nodeId?: string
    serverId?: number
  } | null
  /** Set of characteristic IDs that already have data sources */
  mappedCharacteristicIds?: Set<number>
}

/**
 * Modal dialog for creating or editing a DataSource mapping.
 * Steps: characteristic -> protocol -> server -> source fields -> trigger strategy.
 */
export function MappingDialog({
  isOpen,
  onClose,
  editData,
  mappedCharacteristicIds,
}: MappingDialogProps) {
  const queryClient = useQueryClient()
  const isEdit = !!editData

  // Form state
  const [characteristicId, setCharacteristicId] = useState<number | null>(
    editData?.characteristicId ?? null
  )
  const [protocol, setProtocol] = useState<'mqtt' | 'opcua'>(
    editData?.protocol ?? 'mqtt'
  )
  const [triggerStrategy, setTriggerStrategy] = useState(
    editData?.triggerStrategy ?? 'on_change'
  )
  const [protocolFields, setProtocolFields] = useState<ProtocolFieldValues>(() => {
    if (editData?.protocol === 'opcua') {
      return {
        protocol: 'opcua',
        node_id: editData.nodeId ?? '',
        server_id: editData.serverId ?? null,
        sampling_interval: '',
        publishing_interval: '',
      }
    }
    return {
      protocol: 'mqtt',
      topic: editData?.topic ?? '',
      broker_id: editData?.brokerId ?? null,
      metric_name: editData?.metricName ?? '',
      trigger_tag: editData?.triggerTag ?? '',
    }
  })

  // Create MQTT mapping
  const createMQTTMutation = useMutation({
    mutationFn: () => {
      const fields = protocolFields as { protocol: 'mqtt'; topic: string; broker_id: number | null; metric_name: string; trigger_tag: string }
      return tagApi.createMapping({
        characteristic_id: characteristicId!,
        mqtt_topic: fields.topic,
        trigger_strategy: triggerStrategy,
        trigger_tag: fields.trigger_tag || null,
        broker_id: fields.broker_id!,
        metric_name: fields.metric_name || null,
      })
    },
    onSuccess: () => {
      toast.success('MQTT mapping created')
      invalidateAndClose()
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  })

  // Create OPC-UA mapping — backend endpoint not yet available
  // TODO: Replace with dataSourceApi.create() when unified data-source API is implemented
  const createOPCUAMutation = useMutation({
    mutationFn: async () => {
      throw new Error('OPC-UA data source creation endpoint is not yet available. This will be enabled when the unified data-source API is implemented.')
    },
    onSuccess: () => {
      toast.success('OPC-UA mapping created')
      invalidateAndClose()
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const invalidateAndClose = () => {
    queryClient.invalidateQueries({ queryKey: ['tag-mappings'] })
    queryClient.invalidateQueries({ queryKey: ['data-sources'] })
    queryClient.invalidateQueries({ queryKey: ['opcua-subscriptions'] })
    onClose()
  }

  const handleSave = () => {
    if (protocol === 'mqtt') {
      createMQTTMutation.mutate()
    } else {
      createOPCUAMutation.mutate()
    }
  }

  const isPending = createMQTTMutation.isPending || createOPCUAMutation.isPending

  // Validation
  const isValid = (() => {
    if (!characteristicId) return false
    if (protocol === 'mqtt') {
      const f = protocolFields as { protocol: 'mqtt'; topic: string; broker_id: number | null }
      return !!f.topic && f.broker_id !== null
    }
    const f = protocolFields as { protocol: 'opcua'; node_id: string; server_id: number | null }
    return !!f.node_id && f.server_id !== null
  })()

  // Handle protocol switch — reset fields
  const handleProtocolChange = (p: 'mqtt' | 'opcua') => {
    setProtocol(p)
    setTriggerStrategy('on_change')
    if (p === 'mqtt') {
      setProtocolFields({ protocol: 'mqtt', topic: '', broker_id: null, metric_name: '', trigger_tag: '' })
    } else {
      setProtocolFields({ protocol: 'opcua', node_id: '', server_id: null, sampling_interval: '', publishing_interval: '' })
    }
  }

  // Trigger strategies filtered by protocol
  const strategies = protocol === 'mqtt'
    ? [
        { value: 'on_change', label: 'On Change' },
        { value: 'on_trigger', label: 'On Trigger' },
        { value: 'on_timer', label: 'On Timer' },
      ]
    : [
        { value: 'on_change', label: 'On Change' },
        { value: 'on_timer', label: 'On Timer' },
      ]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg bg-[#111827] border border-[#1e293b] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e293b]">
          <h2 className="text-base font-semibold text-[#e2e8f0]">
            {isEdit ? 'Edit Mapping' : 'New Mapping'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-[#64748b] hover:text-[#e2e8f0] transition-colors rounded-md hover:bg-[#1e293b]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* 1. Characteristic */}
          <div>
            <label className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider block mb-1.5">
              Characteristic
            </label>
            <CharacteristicPicker
              value={characteristicId}
              onChange={setCharacteristicId}
              mappedCharacteristicIds={mappedCharacteristicIds}
            />
          </div>

          {/* 2. Protocol selector */}
          {!isEdit && (
            <div>
              <label className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider block mb-1.5">
                Protocol
              </label>
              <div className="grid grid-cols-2 gap-2">
                <ProtocolCard
                  label="MQTT"
                  description="MQTT broker topic"
                  icon={<Wifi className="h-4 w-4" />}
                  color="teal"
                  selected={protocol === 'mqtt'}
                  onClick={() => handleProtocolChange('mqtt')}
                />
                <ProtocolCard
                  label="OPC-UA"
                  description="OPC-UA server node"
                  icon={<Server className="h-4 w-4" />}
                  color="purple"
                  selected={protocol === 'opcua'}
                  onClick={() => handleProtocolChange('opcua')}
                />
              </div>
            </div>
          )}

          {/* 3. Protocol-specific fields */}
          <div>
            <label className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider block mb-1.5">
              Source Configuration
            </label>
            <ProtocolSourceFields
              protocol={protocol}
              values={protocolFields}
              onChange={setProtocolFields}
              triggerStrategy={triggerStrategy}
            />
          </div>

          {/* 4. Trigger strategy */}
          <div>
            <label className="text-xs font-medium text-[#94a3b8] uppercase tracking-wider block mb-1.5">
              Trigger Strategy
            </label>
            <div className="flex gap-2">
              {strategies.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setTriggerStrategy(s.value)}
                  className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    triggerStrategy === s.value
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-[#1e293b] text-[#64748b] hover:border-[#334155] hover:text-[#94a3b8]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#1e293b]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || isPending}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEdit ? 'Save Changes' : 'Create Mapping'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Protocol Card (for selector)
 * ----------------------------------------------------------------------- */

function ProtocolCard({
  label,
  description,
  icon,
  color,
  selected,
  onClick,
}: {
  label: string
  description: string
  icon: React.ReactNode
  color: 'teal' | 'purple'
  selected: boolean
  onClick: () => void
}) {
  const colorClasses = color === 'teal'
    ? { border: 'border-teal-500', bg: 'bg-teal-500/10', text: 'text-teal-400', iconBg: 'bg-teal-500/15' }
    : { border: 'border-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', iconBg: 'bg-purple-500/15' }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
        selected
          ? `${colorClasses.border} ${colorClasses.bg}`
          : 'border-[#1e293b] hover:border-[#334155]'
      }`}
    >
      <span className={`flex items-center justify-center w-8 h-8 rounded-lg ${colorClasses.iconBg} ${colorClasses.text}`}>
        {icon}
      </span>
      <div className="text-left">
        <div className={`text-sm font-medium ${selected ? colorClasses.text : 'text-[#e2e8f0]'}`}>
          {label}
        </div>
        <div className="text-[11px] text-[#475569]">{description}</div>
      </div>
    </button>
  )
}
