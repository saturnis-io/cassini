import { Server, PlugZap, GitBranch, Activity, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BrokerConnectionStatus, OPCUAServerConnectionStatus } from '@/types'

interface ConnectivityMetricsProps {
  mqttStates: BrokerConnectionStatus[]
  opcuaStates: OPCUAServerConnectionStatus[]
}

interface MetricCard {
  label: string
  value: number | string
  icon: typeof Server
  color: string
  bgColor: string
  iconColor: string
}

/**
 * Protocol-agnostic summary metrics bar.
 * Displays key indicators across all connectivity sources.
 */
export function ConnectivityMetrics({ mqttStates, opcuaStates }: ConnectivityMetricsProps) {
  const totalServers = mqttStates.length + opcuaStates.length
  const connectedServers =
    mqttStates.filter((s) => s.is_connected).length +
    opcuaStates.filter((s) => s.is_connected).length

  const totalTopics = mqttStates.reduce((acc, s) => acc + (s.subscribed_topics?.length ?? 0), 0)
  // OPCUAServerConnectionStatus doesn't expose node count — use connected servers as proxy
  const totalNodes = opcuaStates.filter((s) => s.is_connected).length
  const mappedSources = totalTopics + totalNodes

  const errorCount =
    mqttStates.filter(
      (s) =>
        !s.is_connected &&
        s.error_message &&
        s.error_message !== 'Not connected' &&
        s.error_message !== 'Disconnected',
    ).length +
    opcuaStates.filter(
      (s) =>
        !s.is_connected &&
        s.error_message &&
        s.error_message !== 'Not connected' &&
        s.error_message !== 'Server is not connected' &&
        s.error_message !== 'Disconnected',
    ).length

  const metrics: MetricCard[] = [
    {
      label: 'Total Servers',
      value: totalServers,
      icon: Server,
      color: 'text-foreground',
      bgColor: 'bg-muted',
      iconColor: 'text-muted-foreground',
    },
    {
      label: 'Connected',
      value: connectedServers,
      icon: PlugZap,
      color: connectedServers > 0 ? 'text-success' : 'text-muted-foreground',
      bgColor: connectedServers > 0 ? 'bg-success/10' : 'bg-muted',
      iconColor: connectedServers > 0 ? 'text-success' : 'text-muted-foreground',
    },
    {
      label: 'Mapped Sources',
      value: mappedSources,
      icon: GitBranch,
      color: mappedSources > 0 ? 'text-primary' : 'text-muted-foreground',
      bgColor: mappedSources > 0 ? 'bg-primary/10' : 'bg-muted',
      iconColor: mappedSources > 0 ? 'text-primary' : 'text-muted-foreground',
    },
    {
      label: 'Activity',
      value: connectedServers > 0 ? 'Active' : 'Idle',
      icon: Activity,
      color: connectedServers > 0 ? 'text-primary' : 'text-muted-foreground',
      bgColor: connectedServers > 0 ? 'bg-primary/10' : 'bg-muted',
      iconColor: connectedServers > 0 ? 'text-primary' : 'text-muted-foreground',
    },
    {
      label: 'Errors',
      value: errorCount,
      icon: AlertTriangle,
      color: errorCount > 0 ? 'text-destructive' : 'text-muted-foreground',
      bgColor: errorCount > 0 ? 'bg-destructive/10' : 'bg-muted',
      iconColor: errorCount > 0 ? 'text-destructive' : 'text-muted-foreground',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {metrics.map((m) => {
        const Icon = m.icon
        return (
          <div
            key={m.label}
            className="bg-card border-border rounded-xl border px-4 py-3 transition-colors"
          >
            <div className="mb-2 flex items-center gap-2">
              <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', m.bgColor)}>
                <Icon className={cn('h-3.5 w-3.5', m.iconColor)} />
              </div>
              <span className="text-muted-foreground text-xs">{m.label}</span>
            </div>
            <p className={cn('text-xl font-bold', m.color)}>{m.value}</p>
          </div>
        )
      })}
    </div>
  )
}
