import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Wifi, Server, Circle } from 'lucide-react'
import { brokerApi, opcuaApi } from '@/api/client'
import { usePlantContext } from '@/providers/PlantProvider'
import type { BrokerConnectionStatus, OPCUAServerStatus } from '@/types'

export interface SelectedServer {
  id: number
  name: string
  protocol: 'mqtt' | 'opcua'
  isConnected: boolean
}

interface ServerSelectorProps {
  value: SelectedServer | null
  onChange: (server: SelectedServer | null) => void
}

/**
 * Dropdown selector for all configured servers (MQTT brokers + OPC-UA servers).
 * Shows protocol badge, server name, and connection status dot.
 * Disconnected servers are shown but grayed out.
 */
export function ServerSelector({ value, onChange }: ServerSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const selectedPlantId = usePlantContext().selectedPlant?.id ?? null

  // Fetch MQTT broker statuses
  const { data: brokerData } = useQuery({
    queryKey: ['brokers-all-status', selectedPlantId],
    queryFn: () => brokerApi.getAllStatus(selectedPlantId ?? undefined),
    refetchInterval: 10000,
  })

  // Fetch OPC-UA server statuses
  const { data: opcuaStatuses } = useQuery({
    queryKey: ['opcua-all-status', selectedPlantId],
    queryFn: () => opcuaApi.getAllStatus(selectedPlantId ?? undefined),
    refetchInterval: 10000,
  })

  const brokerStates = brokerData?.states ?? []
  const opcuaStates = opcuaStatuses?.states ?? []

  // Build unified server list
  const servers: SelectedServer[] = [
    ...brokerStates.map((b: BrokerConnectionStatus) => ({
      id: b.broker_id,
      name: b.broker_name,
      protocol: 'mqtt' as const,
      isConnected: b.is_connected,
    })),
    ...opcuaStates.map((s: OPCUAServerStatus) => ({
      id: s.server_id,
      name: s.server_name,
      protocol: 'opcua' as const,
      isConnected: s.is_connected,
    })),
  ]

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (server: SelectedServer) => {
    onChange(server)
    setIsOpen(false)
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-card border-border hover:border-primary/50 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
      >
        {value ? (
          <>
            <ProtocolIcon protocol={value.protocol} />
            <span className="text-foreground flex-1 truncate text-left">{value.name}</span>
            <StatusDot connected={value.isConnected} />
          </>
        ) : (
          <span className="text-muted-foreground flex-1 text-left">Select a server...</span>
        )}
        <ChevronDown
          className={`text-muted-foreground h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="bg-card border-border absolute z-50 mt-1 w-full overflow-hidden rounded-lg border shadow-xl">
          {servers.length === 0 ? (
            <div className="text-muted-foreground px-3 py-4 text-center text-sm">
              No servers configured. Add servers in the Servers tab.
            </div>
          ) : (
            <div className="max-h-[240px] overflow-y-auto">
              {servers.map((server) => {
                const isSelected = value?.id === server.id && value?.protocol === server.protocol
                return (
                  <button
                    key={`${server.protocol}-${server.id}`}
                    onClick={() => handleSelect(server)}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : server.isConnected
                          ? 'text-foreground hover:bg-muted'
                          : 'text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    <ProtocolIcon protocol={server.protocol} />
                    <span className="flex-1 truncate text-left">{server.name}</span>
                    <StatusDot connected={server.isConnected} />
                    {!server.isConnected && (
                      <span className="text-muted-foreground text-[10px]">offline</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProtocolIcon({ protocol }: { protocol: 'mqtt' | 'opcua' }) {
  if (protocol === 'mqtt') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-teal-500/15">
        <Wifi className="h-3 w-3 text-teal-400" />
      </span>
    )
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-purple-500/15">
      <Server className="h-3 w-3 text-purple-400" />
    </span>
  )
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <Circle
      className={`h-2 w-2 shrink-0 ${
        connected ? 'fill-success text-success' : 'fill-muted-foreground text-muted-foreground'
      }`}
    />
  )
}
