import { useQuery } from '@tanstack/react-query'
import { brokerApi, opcuaApi } from '@/api/client'
import { useUIStore } from '@/stores/uiStore'
import type { BrokerConnectionStatus, OPCUAServerStatus } from '@/types'

interface MQTTFieldValues {
  protocol: 'mqtt'
  topic: string
  broker_id: number | null
  metric_name: string
  trigger_tag: string
}

interface OPCUAFieldValues {
  protocol: 'opcua'
  node_id: string
  server_id: number | null
  sampling_interval: string
  publishing_interval: string
}

export type ProtocolFieldValues = MQTTFieldValues | OPCUAFieldValues

interface ProtocolSourceFieldsProps {
  protocol: 'mqtt' | 'opcua'
  values: ProtocolFieldValues
  onChange: (values: ProtocolFieldValues) => void
  triggerStrategy: string
}

/**
 * Protocol-specific form fields for DataSource creation/editing.
 * - MQTT: topic, broker selector, metric_name (optional), trigger_tag (conditional)
 * - OPC-UA: node_id, server selector, sampling/publishing interval
 */
export function ProtocolSourceFields({
  protocol,
  values,
  onChange,
  triggerStrategy,
}: ProtocolSourceFieldsProps) {
  if (protocol === 'mqtt' && values.protocol === 'mqtt') {
    return (
      <MQTTFields
        values={values}
        onChange={onChange}
        triggerStrategy={triggerStrategy}
      />
    )
  }
  if (protocol === 'opcua' && values.protocol === 'opcua') {
    return (
      <OPCUAFields
        values={values}
        onChange={onChange}
      />
    )
  }
  return null
}

/* -----------------------------------------------------------------------
 * MQTT Fields
 * ----------------------------------------------------------------------- */

function MQTTFields({
  values,
  onChange,
  triggerStrategy,
}: {
  values: MQTTFieldValues
  onChange: (v: ProtocolFieldValues) => void
  triggerStrategy: string
}) {
  const selectedPlantId = useUIStore((s) => s.selectedPlantId)

  // Fetch broker statuses to populate dropdown
  const { data: brokerData } = useQuery({
    queryKey: ['brokers-all-status', selectedPlantId],
    queryFn: () => brokerApi.getAllStatus(selectedPlantId ?? undefined),
  })
  const brokerStates = brokerData?.states ?? []

  const update = (patch: Partial<MQTTFieldValues>) => {
    onChange({ ...values, ...patch } as ProtocolFieldValues)
  }

  return (
    <div className="space-y-3">
      {/* Broker selector */}
      <div>
        <label className="text-[11px] text-muted-foreground">Broker</label>
        <select
          value={values.broker_id ?? ''}
          onChange={(e) => update({ broker_id: e.target.value ? Number(e.target.value) : null })}
          className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="">Select broker...</option>
          {brokerStates.map((b: BrokerConnectionStatus) => (
            <option key={b.broker_id} value={b.broker_id}>
              {b.broker_name} {b.is_connected ? '' : '(disconnected)'}
            </option>
          ))}
        </select>
      </div>

      {/* Topic */}
      <div>
        <label className="text-[11px] text-muted-foreground">Topic</label>
        <input
          type="text"
          value={values.topic}
          onChange={(e) => update({ topic: e.target.value })}
          placeholder="e.g. spBv1.0/group/DDATA/node"
          className="w-full mt-0.5 px-2 py-1.5 text-sm font-mono bg-background border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Metric name (optional for SparkplugB) */}
      <div>
        <label className="text-[11px] text-muted-foreground">
          Metric Name <span className="opacity-60">(optional, SparkplugB)</span>
        </label>
        <input
          type="text"
          value={values.metric_name}
          onChange={(e) => update({ metric_name: e.target.value })}
          placeholder="e.g. Temperature"
          className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Trigger tag (only for on_trigger strategy) */}
      {triggerStrategy === 'on_trigger' && (
        <div>
          <label className="text-[11px] text-muted-foreground">Trigger Tag</label>
          <input
            type="text"
            value={values.trigger_tag}
            onChange={(e) => update({ trigger_tag: e.target.value })}
            placeholder="e.g. spBv1.0/plant/NCMD/trigger"
            className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
      )}
    </div>
  )
}

/* -----------------------------------------------------------------------
 * OPC-UA Fields
 * ----------------------------------------------------------------------- */

function OPCUAFields({
  values,
  onChange,
}: {
  values: OPCUAFieldValues
  onChange: (v: ProtocolFieldValues) => void
}) {
  const selectedPlantId = useUIStore((s) => s.selectedPlantId)

  // Fetch OPC-UA server statuses
  const { data: opcuaStatuses } = useQuery({
    queryKey: ['opcua-all-status', selectedPlantId],
    queryFn: () => opcuaApi.getAllStatus(selectedPlantId ?? undefined),
  })
  const serverStates = opcuaStatuses?.states ?? []

  const update = (patch: Partial<OPCUAFieldValues>) => {
    onChange({ ...values, ...patch } as ProtocolFieldValues)
  }

  return (
    <div className="space-y-3">
      {/* Server selector */}
      <div>
        <label className="text-[11px] text-muted-foreground">OPC-UA Server</label>
        <select
          value={values.server_id ?? ''}
          onChange={(e) => update({ server_id: e.target.value ? Number(e.target.value) : null })}
          className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="">Select server...</option>
          {serverStates.map((s: OPCUAServerStatus) => (
            <option key={s.server_id} value={s.server_id}>
              {s.server_name} {s.is_connected ? '' : '(disconnected)'}
            </option>
          ))}
        </select>
      </div>

      {/* Node ID */}
      <div>
        <label className="text-[11px] text-muted-foreground">Node ID</label>
        <input
          type="text"
          value={values.node_id}
          onChange={(e) => update({ node_id: e.target.value })}
          placeholder="e.g. ns=2;i=1234"
          className="w-full mt-0.5 px-2 py-1.5 text-sm font-mono bg-background border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Sampling interval */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] text-muted-foreground">
            Sampling Interval <span className="opacity-60">(ms)</span>
          </label>
          <input
            type="number"
            value={values.sampling_interval}
            onChange={(e) => update({ sampling_interval: e.target.value })}
            placeholder="1000"
            className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">
            Publishing Interval <span className="opacity-60">(ms)</span>
          </label>
          <input
            type="number"
            value={values.publishing_interval}
            onChange={(e) => update({ publishing_interval: e.target.value })}
            placeholder="1000"
            className="w-full mt-0.5 px-2 py-1.5 text-sm bg-background border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>
    </div>
  )
}
