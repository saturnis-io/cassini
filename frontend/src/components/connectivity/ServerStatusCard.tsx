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

  const serverName =
    protocol === 'mqtt'
      ? (status as BrokerConnectionStatus).broker_name
      : (status as OPCUAServerConnectionStatus).server_name

  const errorMessage = status.error_message
  const hasError =
    !isConnected &&
    errorMessage &&
    errorMessage !== 'Not connected' &&
    errorMessage !== 'Server is not connected' &&
    errorMessage !== 'Disconnected'

  // Only MQTT status has last_connected and subscribed_topics
  const lastConnected =
    protocol === 'mqtt' && (status as BrokerConnectionStatus).last_connected
      ? new Date((status as BrokerConnectionStatus).last_connected!)
      : null

  // Data details
  const dataDetail =
    protocol === 'mqtt'
      ? {
          label: 'Topics',
          count: (status as BrokerConnectionStatus).subscribed_topics?.length ?? 0,
        }
      : {
          label: 'Status',
          count: isConnected ? 'Active' : 'Idle',
        }

  const protocolConfig =
    protocol === 'mqtt'
      ? {
          icon: Wifi,
          label: 'MQTT',
          color: 'text-teal-400',
          bgColor: 'bg-teal-500/10',
          borderAccent: isConnected
            ? 'border-t-teal-500'
            : hasError
              ? 'border-t-destructive'
              : 'border-t-border',
        }
      : {
          icon: Server,
          label: 'OPC-UA',
          color: 'text-purple-400',
          bgColor: 'bg-purple-500/10',
          borderAccent: isConnected
            ? 'border-t-purple-500'
            : hasError
              ? 'border-t-destructive'
              : 'border-t-border',
        }

  const Icon = protocolConfig.icon

  return (
    <div
      className={cn(
        'bg-card border-border overflow-hidden rounded-xl border transition-all duration-200',
        'border-t-2',
        protocolConfig.borderAccent,
        isConnected && 'hover:shadow-sm',
      )}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg',
                protocolConfig.bgColor,
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', protocolConfig.color)} />
            </div>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase',
                protocolConfig.bgColor,
                protocolConfig.color,
              )}
            >
              {protocolConfig.label}
            </span>
          </div>
          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                isConnected
                  ? 'bg-success shadow-[0_0_6px_rgba(16,185,129,0.5)]'
                  : hasError
                    ? 'bg-destructive shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                    : 'bg-muted-foreground',
              )}
            />
            <span
              className={cn(
                'text-xs font-medium',
                isConnected
                  ? 'text-success'
                  : hasError
                    ? 'text-destructive'
                    : 'text-muted-foreground',
              )}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        <h3 className="truncate text-sm font-semibold">{serverName}</h3>
      </div>

      {/* Stats */}
      <div className="border-border/50 border-t px-4 pb-3">
        <div className="grid grid-cols-2 gap-3 pt-3">
          <div>
            <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
              {dataDetail.label}
            </p>
            <p className="mt-0.5 font-mono text-sm font-medium">{dataDetail.count}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-[10px] tracking-wider uppercase">
              Last Activity
            </p>
            <p className="mt-0.5 flex items-center gap-1 font-mono text-sm font-medium">
              {lastConnected ? (
                <>
                  <Clock className="text-muted-foreground h-3 w-3" />
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
        <div className="border-destructive/20 bg-destructive/5 border-t px-4 py-2">
          <p className="text-destructive truncate text-xs" title={errorMessage ?? ''}>
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
