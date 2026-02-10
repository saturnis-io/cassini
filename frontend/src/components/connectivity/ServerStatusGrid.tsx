import { ServerStatusCard } from './ServerStatusCard'
import type { BrokerConnectionStatus, OPCUAServerConnectionStatus } from '@/types'

interface ServerStatusGridProps {
  mqttStates: BrokerConnectionStatus[]
  opcuaStates: OPCUAServerConnectionStatus[]
}

/**
 * Responsive grid of ServerStatusCard components.
 * 3-col on large screens, 2-col medium, 1-col small.
 */
export function ServerStatusGrid({ mqttStates, opcuaStates }: ServerStatusGridProps) {
  const hasAny = mqttStates.length > 0 || opcuaStates.length > 0

  if (!hasAny) {
    return null
  }

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">Server Status</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {mqttStates.map((s) => (
          <ServerStatusCard
            key={`mqtt-${s.broker_id}`}
            protocol="mqtt"
            status={s}
          />
        ))}
        {opcuaStates.map((s) => (
          <ServerStatusCard
            key={`opcua-${s.server_id}`}
            protocol="opcua"
            status={s}
          />
        ))}
      </div>
    </div>
  )
}
