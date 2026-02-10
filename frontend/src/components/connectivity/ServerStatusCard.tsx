import { Wifi, Server, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BrokerConnectionStatus, OPCUAServerConnectionStatus } from '@/types'

type Protocol = 'mqtt' | 'opcua'

interface ServerStatusCardProps {
  protocol: Protocol
  status: BrokerConnectionStatus | OPCUAServerConnectionStatus
}

/**
 * Read-only server status card for the Monitor tab.
 * Protocol-aware, showing connection health and data metrics.
 * Styled to resemble an industrial HMI status panel.
 */
export function ServerStatusCard({ protocol, status }: ServerStatusCardProps) {
  const isConnected = status.is_connected

  const serverName = protocol === 'mqtt'
    ? (status as BrokerConnectionStatus).broker_name
    : (status as OPCUAServerConnectionStatus).server_name

  const errorMessage = status.error_message
  const hasError = !isConnected && errorMessage
    && errorMessage !== 'Not connected'
    && errorMessage !== 'Server is not connected'
    && errorMessage !== 'Disconnected'

  // Only MQTT status has last_connected and subscribed_topics
  const lastConnected = protocol === 'mqtt' && (status as BrokerConnectionStatus).last_connected
    ? new Date((status as BrokerConnectionStatus).last_connected!)
    : null

  // Data details
  const dataDetail = protocol === 'mqtt'
    ? {
        label: 'Topics',
        count: (status as BrokerConnectionStatus).subscribed_topics?.length ?? 0,
      }
    : {
        label: 'Status',
        count: isConnected ? 'Active' : 'Idle',
      }

  const protocolConfig = protocol === 'mqtt'
    ? {
        icon: Wifi,
        label: 'MQTT',
        color: 'text-teal-400',
        bgColor: 'bg-teal-500/10',
        borderAccent: isConnected ? 'border-t-teal-500' : hasError ? 'border-t-red-500' : 'border-t-border',
      }
    : {
        icon: Server,
        label: 'OPC-UA',
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/10',
        borderAccent: isConnected ? 'border-t-purple-500' : hasError ? 'border-t-red-500' : 'border-t-border',
      }

  const Icon = protocolConfig.icon

  return (
    <div className={cn(
      'bg-card border border-border rounded-xl overflow-hidden transition-all duration-200',
      'border-t-2',
      protocolConfig.borderAccent,
      isConnected && 'hover:shadow-sm'
    )}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={cn('flex items-center justify-center w-7 h-7 rounded-lg', protocolConfig.bgColor)}>
              <Icon className={cn('h-3.5 w-3.5', protocolConfig.color)} />
            </div>
            <span className={cn(
              'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded',
              protocolConfig.bgColor, protocolConfig.color
            )}>
              {protocolConfig.label}
            </span>
          </div>
          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'w-2 h-2 rounded-full',
              isConnected
                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                : hasError
                  ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                  : 'bg-gray-500'
            )} />
            <span className={cn(
              'text-xs font-medium',
              isConnected ? 'text-emerald-400' : hasError ? 'text-red-400' : 'text-muted-foreground'
            )}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <h3 className="font-semibold text-sm truncate">{serverName}</h3>
      </div>

      {/* Stats */}
      <div className="px-4 pb-3 border-t border-border/50">
        <div className="grid grid-cols-2 gap-3 pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{dataDetail.label}</p>
            <p className="text-sm font-mono font-medium mt-0.5">{dataDetail.count}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last Activity</p>
            <p className="text-sm font-mono font-medium mt-0.5 flex items-center gap-1">
              {lastConnected ? (
                <>
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {formatRelativeTime(lastConnected)}
                </>
              ) : (
                <span className="text-muted-foreground">--</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Error display */}
      {hasError && (
        <div className="px-4 py-2 bg-red-500/5 border-t border-red-500/20">
          <p className="text-xs text-red-400 truncate" title={errorMessage ?? ''}>
            {errorMessage}
          </p>
        </div>
      )}
    </div>
  )
}

function formatRelativeTime(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const seconds = Math.floor(diff / 1000)

  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return date.toLocaleDateString()
}
