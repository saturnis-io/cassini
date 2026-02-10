import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Wifi, Server, Pencil, Trash2, Power, PowerOff,
  Loader2, ShieldCheck, ShieldOff, Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { brokerApi, opcuaApi } from '@/api/client'
import type { MQTTBroker, OPCUAServer, BrokerConnectionStatus, OPCUAServerConnectionStatus } from '@/types'

type Protocol = 'mqtt' | 'opcua'

interface ServerListItemProps {
  protocol: Protocol
  server: MQTTBroker | OPCUAServer
  status?: BrokerConnectionStatus | OPCUAServerConnectionStatus | null
  onEdit: () => void
}

/**
 * Protocol-aware server row with status, connection string, and action buttons.
 */
export function ServerListItem({ protocol, server, status, onEdit }: ServerListItemProps) {
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isConnected = status
    ? status.is_connected
    : false

  const errorMessage = status
    ? status.error_message
    : null

  // MQTT connect/disconnect
  const mqttConnectMutation = useMutation({
    mutationFn: (id: number) => brokerApi.connect(id),
    onSuccess: () => {
      toast.success('Broker connected')
      queryClient.invalidateQueries({ queryKey: ['brokers-all-status'] })
      queryClient.invalidateQueries({ queryKey: ['brokers'] })
    },
    onError: (err: Error) => toast.error(`Connect failed: ${err.message}`),
  })

  const mqttDisconnectMutation = useMutation({
    mutationFn: () => brokerApi.disconnect(),
    onSuccess: () => {
      toast.success('Broker disconnected')
      queryClient.invalidateQueries({ queryKey: ['brokers-all-status'] })
    },
    onError: (err: Error) => toast.error(`Disconnect failed: ${err.message}`),
  })

  // OPC-UA connect/disconnect
  const opcuaConnectMutation = useMutation({
    mutationFn: (id: number) => opcuaApi.connect(id),
    onSuccess: () => {
      toast.success('OPC-UA server connected')
      queryClient.invalidateQueries({ queryKey: ['opcua-all-status'] })
      queryClient.invalidateQueries({ queryKey: ['opcua-servers'] })
    },
    onError: (err: Error) => toast.error(`Connect failed: ${err.message}`),
  })

  const opcuaDisconnectMutation = useMutation({
    mutationFn: (id: number) => opcuaApi.disconnect(id),
    onSuccess: () => {
      toast.success('OPC-UA server disconnected')
      queryClient.invalidateQueries({ queryKey: ['opcua-all-status'] })
      queryClient.invalidateQueries({ queryKey: ['opcua-servers'] })
    },
    onError: (err: Error) => toast.error(`Disconnect failed: ${err.message}`),
  })

  // Delete mutations
  const mqttDeleteMutation = useMutation({
    mutationFn: (id: number) => brokerApi.delete(id),
    onSuccess: () => {
      toast.success('Broker deleted')
      queryClient.invalidateQueries({ queryKey: ['brokers'] })
      queryClient.invalidateQueries({ queryKey: ['brokers-all-status'] })
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  })

  const opcuaDeleteMutation = useMutation({
    mutationFn: (id: number) => opcuaApi.delete(id),
    onSuccess: () => {
      toast.success('Server deleted')
      queryClient.invalidateQueries({ queryKey: ['opcua-servers'] })
      queryClient.invalidateQueries({ queryKey: ['opcua-all-status'] })
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  })

  const handleConnect = () => {
    if (protocol === 'mqtt') {
      mqttConnectMutation.mutate(server.id)
    } else {
      opcuaConnectMutation.mutate(server.id)
    }
  }

  const handleDisconnect = () => {
    if (protocol === 'mqtt') {
      mqttDisconnectMutation.mutate()
    } else {
      opcuaDisconnectMutation.mutate(server.id)
    }
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    if (protocol === 'mqtt') {
      mqttDeleteMutation.mutate(server.id)
    } else {
      opcuaDeleteMutation.mutate(server.id)
    }
  }

  const isConnecting = protocol === 'mqtt'
    ? mqttConnectMutation.isPending
    : opcuaConnectMutation.isPending

  const isDisconnecting = protocol === 'mqtt'
    ? mqttDisconnectMutation.isPending
    : opcuaDisconnectMutation.isPending

  const isDeleting = protocol === 'mqtt'
    ? mqttDeleteMutation.isPending
    : opcuaDeleteMutation.isPending

  // Protocol-specific display info
  const protocolConfig = protocol === 'mqtt'
    ? { icon: Wifi, color: 'text-teal-400', bgColor: 'bg-teal-500/10', label: 'MQTT' }
    : { icon: Server, color: 'text-purple-400', bgColor: 'bg-purple-500/10', label: 'OPC-UA' }

  const connectionString = protocol === 'mqtt'
    ? `${(server as MQTTBroker).host}:${(server as MQTTBroker).port}`
    : (server as OPCUAServer).endpoint_url

  const authSummary = getAuthSummary(protocol, server)

  const Icon = protocolConfig.icon

  return (
    <div className="group bg-card border border-border rounded-xl p-4 hover:border-muted-foreground/30 transition-all duration-200">
      <div className="flex items-center gap-4">
        {/* Protocol icon */}
        <div className={cn(
          'flex items-center justify-center w-10 h-10 rounded-lg shrink-0',
          protocolConfig.bgColor
        )}>
          <Icon className={cn('h-5 w-5', protocolConfig.color)} />
        </div>

        {/* Server info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm truncate">{server.name}</h3>
            <span className={cn(
              'px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded',
              protocolConfig.bgColor, protocolConfig.color
            )}>
              {protocolConfig.label}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs font-mono text-muted-foreground truncate">
              {connectionString}
            </span>
            {authSummary && (
              <>
                <span className="text-border">|</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {authSummary.icon}
                  {authSummary.label}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn(
            'w-2 h-2 rounded-full shrink-0',
            isConnected
              ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
              : errorMessage && errorMessage !== 'Not connected' && errorMessage !== 'Server is not connected' && errorMessage !== 'Disconnected'
                ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
                : 'bg-gray-500'
          )} />
          <span className={cn(
            'text-xs font-medium',
            isConnected
              ? 'text-emerald-400'
              : errorMessage && errorMessage !== 'Not connected' && errorMessage !== 'Server is not connected' && errorMessage !== 'Disconnected'
                ? 'text-red-400'
                : 'text-muted-foreground'
          )}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          {/* Edit */}
          <button
            onClick={onEdit}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>

          {/* Connect/Disconnect toggle */}
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="p-2 rounded-lg text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
              title="Disconnect"
            >
              {isDisconnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PowerOff className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="p-2 rounded-lg text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
              title="Connect"
            >
              {isConnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Power className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={isDeleting || isConnected}
            className={cn(
              'p-2 rounded-lg transition-colors disabled:opacity-50',
              confirmDelete
                ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                : 'text-muted-foreground hover:text-red-400 hover:bg-red-500/10'
            )}
            title={confirmDelete ? 'Click again to confirm' : isConnected ? 'Disconnect before deleting' : 'Delete'}
          >
            {isDeleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Error message */}
      {!isConnected && errorMessage && errorMessage !== 'Not connected' && errorMessage !== 'Server is not connected' && errorMessage !== 'Disconnected' && (
        <div className="mt-2 ml-14 text-xs text-red-400 truncate" title={errorMessage}>
          {errorMessage}
        </div>
      )}
    </div>
  )
}

function getAuthSummary(protocol: Protocol, server: MQTTBroker | OPCUAServer): { icon: React.ReactNode; label: string } | null {
  if (protocol === 'mqtt') {
    const broker = server as MQTTBroker
    if (broker.use_tls) {
      return { icon: <Lock className="h-3 w-3" />, label: 'TLS' }
    }
    if (broker.username) {
      return { icon: <ShieldCheck className="h-3 w-3" />, label: 'Auth' }
    }
    return { icon: <ShieldOff className="h-3 w-3" />, label: 'No Auth' }
  } else {
    const srv = server as OPCUAServer
    if (srv.auth_mode === 'username_password') {
      return { icon: <ShieldCheck className="h-3 w-3" />, label: 'Username/Password' }
    }
    return { icon: <ShieldOff className="h-3 w-3" />, label: 'Anonymous' }
  }
}
