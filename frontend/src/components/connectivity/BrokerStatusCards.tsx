import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Wifi, WifiOff, Search, SquareX, Power, PowerOff } from 'lucide-react'
import { brokerApi } from '@/api/client'
import type { BrokerConnectionStatus } from '@/types'

interface BrokerStatusCardsProps {
  states: BrokerConnectionStatus[]
  selectedBrokerId: number | null
  onSelectBroker: (id: number) => void
}

/**
 * Grid of cards showing status for each broker with connect/disconnect
 * and discovery controls.
 */
export function BrokerStatusCards({
  states,
  selectedBrokerId,
  onSelectBroker,
}: BrokerStatusCardsProps) {
  const queryClient = useQueryClient()

  const connectMutation = useMutation({
    mutationFn: (id: number) => brokerApi.connect(id),
    onSuccess: (_, id) => {
      toast.success('Broker connected')
      queryClient.invalidateQueries({ queryKey: ['brokers-all-status'] })
    },
    onError: (err: Error) => toast.error(`Connect failed: ${err.message}`),
  })

  const disconnectMutation = useMutation({
    mutationFn: () => brokerApi.disconnect(),
    onSuccess: () => {
      toast.success('Broker disconnected')
      queryClient.invalidateQueries({ queryKey: ['brokers-all-status'] })
    },
    onError: (err: Error) => toast.error(`Disconnect failed: ${err.message}`),
  })

  const startDiscoveryMutation = useMutation({
    mutationFn: (id: number) => brokerApi.startDiscovery(id),
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['brokers-all-status'] })
    },
    onError: (err: Error) => toast.error(`Discovery failed: ${err.message}`),
  })

  const stopDiscoveryMutation = useMutation({
    mutationFn: (id: number) => brokerApi.stopDiscovery(id),
    onSuccess: (data) => {
      toast.success(data.message)
      queryClient.invalidateQueries({ queryKey: ['brokers-all-status'] })
    },
    onError: (err: Error) => toast.error(`Stop discovery failed: ${err.message}`),
  })

  if (states.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No MQTT brokers configured.</p>
        <p className="text-sm mt-1">Add brokers in Configuration &gt; MQTT Settings.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {states.map((s) => {
        const isSelected = selectedBrokerId === s.broker_id
        return (
          <div
            key={s.broker_id}
            onClick={() => onSelectBroker(s.broker_id)}
            className={`bg-card border rounded-xl p-4 cursor-pointer transition-all ${
              isSelected
                ? 'border-primary ring-2 ring-primary/20'
                : 'border-border hover:border-primary/50'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm truncate">{s.broker_name}</h3>
              <div className="flex items-center gap-1.5">
                {s.is_connected ? (
                  <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    Disconnected
                  </span>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="space-y-1 text-xs text-muted-foreground mb-3">
              <p>Topics: {s.subscribed_topics?.length ?? 0}</p>
              {s.last_connected && (
                <p>
                  Last connected:{' '}
                  {new Date(s.last_connected).toLocaleTimeString()}
                </p>
              )}
              {s.error_message && !s.is_connected && (
                <p className="text-destructive truncate" title={s.error_message}>
                  {s.error_message}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {s.is_connected ? (
                <>
                  <button
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md border border-border hover:bg-accent transition-colors"
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                    Disconnect
                  </button>
                  <button
                    onClick={() => startDiscoveryMutation.mutate(s.broker_id)}
                    disabled={startDiscoveryMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Discover
                  </button>
                </>
              ) : (
                <button
                  onClick={() => connectMutation.mutate(s.broker_id)}
                  disabled={connectMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Power className="h-3.5 w-3.5" />
                  Connect
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
