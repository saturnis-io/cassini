import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Wifi, Server, Circle } from 'lucide-react'
import { brokerApi, opcuaApi } from '@/api/client'
import { useUIStore } from '@/stores/uiStore'
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
  const selectedPlantId = useUIStore((s) => s.selectedPlantId)

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
        className="w-full flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-sm hover:border-primary/50 transition-colors"
      >
        {value ? (
          <>
            <ProtocolIcon protocol={value.protocol} />
            <span className="flex-1 text-left truncate text-foreground">
              {value.name}
            </span>
            <StatusDot connected={value.isConnected} />
          </>
        ) : (
          <span className="flex-1 text-left text-muted-foreground">
            Select a server...
          </span>
        )}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          {servers.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
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
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                      isSelected
                        ? 'bg-indigo-500/10 text-indigo-300'
                        : server.isConnected
                          ? 'text-foreground hover:bg-muted'
                          : 'text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    <ProtocolIcon protocol={server.protocol} />
                    <span className="flex-1 text-left truncate">{server.name}</span>
                    <StatusDot connected={server.isConnected} />
                    {!server.isConnected && (
                      <span className="text-[10px] text-muted-foreground">offline</span>
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
      <span className="flex items-center justify-center w-5 h-5 rounded bg-teal-500/15 shrink-0">
        <Wifi className="h-3 w-3 text-teal-400" />
      </span>
    )
  }
  return (
    <span className="flex items-center justify-center w-5 h-5 rounded bg-purple-500/15 shrink-0">
      <Server className="h-3 w-3 text-purple-400" />
    </span>
  )
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <Circle
      className={`h-2 w-2 shrink-0 ${
        connected
          ? 'fill-emerald-400 text-emerald-400'
          : 'fill-muted-foreground text-muted-foreground'
      }`}
    />
  )
}
