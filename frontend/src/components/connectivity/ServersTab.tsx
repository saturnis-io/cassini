import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Wifi, Server, LayoutList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { brokerApi, opcuaApi } from '@/api/client'
import { useUIStore } from '@/stores/uiStore'
import { ServerListItem } from './ServerListItem'
import { ProtocolSelector, type ProtocolId } from './ProtocolSelector'
import { MQTTServerForm } from './MQTTServerForm'
import { OPCUAServerForm } from './OPCUAServerForm'
import type {
  MQTTBroker,
  OPCUAServer,
  BrokerConnectionStatus,
  OPCUAServerConnectionStatus,
} from '@/types'

type FilterProtocol = 'all' | 'mqtt' | 'opcua'
type ViewMode = 'list' | 'add-select' | 'add-mqtt' | 'add-opcua' | 'edit-mqtt' | 'edit-opcua'

/**
 * Servers tab — unified server management for MQTT brokers and OPC-UA servers.
 * Supports filtering, searching, add/edit flows with protocol-specific forms.
 */
export function ServersTab() {
  const selectedPlantId = useUIStore((s) => s.selectedPlantId)
  const [filter, setFilter] = useState<FilterProtocol>('all')
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [editingBroker, setEditingBroker] = useState<MQTTBroker | null>(null)
  const [editingOpcua, setEditingOpcua] = useState<OPCUAServer | null>(null)

  // Fetch MQTT brokers
  const { data: brokersResponse, isLoading: loadingBrokers } = useQuery({
    queryKey: ['brokers', selectedPlantId],
    queryFn: () => brokerApi.list({ plantId: selectedPlantId ?? undefined }),
  })

  // Fetch MQTT broker statuses
  const { data: mqttStatus } = useQuery({
    queryKey: ['brokers-all-status', selectedPlantId],
    queryFn: () => brokerApi.getAllStatus(selectedPlantId ?? undefined),
    refetchInterval: 5000,
  })

  // Fetch OPC-UA servers
  const { data: opcuaServersData, isLoading: loadingOpcua } = useQuery({
    queryKey: ['opcua-servers', selectedPlantId],
    queryFn: () => opcuaApi.list(selectedPlantId ?? undefined),
  })

  // Fetch OPC-UA server statuses
  const { data: opcuaStatusData } = useQuery({
    queryKey: ['opcua-all-status', selectedPlantId],
    queryFn: () => opcuaApi.getAllStatus(selectedPlantId ?? undefined),
    refetchInterval: 5000,
  })

  const brokers = brokersResponse?.items ?? []
  const opcuaServers = opcuaServersData?.items ?? []
  const mqttStates = mqttStatus?.states ?? []
  const opcuaStates = opcuaStatusData?.states ?? []

  // Build unified server list
  type UnifiedServer = {
    protocol: 'mqtt' | 'opcua'
    server: MQTTBroker | OPCUAServer
    status: BrokerConnectionStatus | OPCUAServerConnectionStatus | null
  }

  const allServers = useMemo<UnifiedServer[]>(() => {
    const list: UnifiedServer[] = []

    for (const broker of brokers) {
      const st = mqttStates.find((s) => s.broker_id === broker.id) ?? null
      list.push({ protocol: 'mqtt', server: broker, status: st })
    }

    for (const srv of opcuaServers) {
      const st = opcuaStates.find((s) => s.server_id === srv.id) ?? null
      list.push({ protocol: 'opcua', server: srv, status: st })
    }

    return list
  }, [brokers, opcuaServers, mqttStates, opcuaStates])

  // Apply filters
  const filteredServers = useMemo(() => {
    let result = allServers

    if (filter !== 'all') {
      result = result.filter((s) => s.protocol === filter)
    }

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((s) => {
        const name = s.server.name.toLowerCase()
        const connStr =
          s.protocol === 'mqtt'
            ? `${(s.server as MQTTBroker).host}:${(s.server as MQTTBroker).port}`
            : (s.server as OPCUAServer).endpoint_url
        return name.includes(q) || connStr.toLowerCase().includes(q)
      })
    }

    return result
  }, [allServers, filter, search])

  const isLoading = loadingBrokers || loadingOpcua

  const handleAddServer = () => {
    setViewMode('add-select')
  }

  const handleProtocolSelect = (protocol: ProtocolId) => {
    if (protocol === 'mqtt') setViewMode('add-mqtt')
    else setViewMode('add-opcua')
  }

  const handleEditMQTT = (broker: MQTTBroker) => {
    setEditingBroker(broker)
    setViewMode('edit-mqtt')
  }

  const handleEditOPCUA = (server: OPCUAServer) => {
    setEditingOpcua(server)
    setViewMode('edit-opcua')
  }

  const handleCloseForm = () => {
    setViewMode('list')
    setEditingBroker(null)
    setEditingOpcua(null)
  }

  // Count badges
  const mqttCount = brokers.length
  const opcuaCount = opcuaServers.length

  // Show form views
  if (viewMode === 'add-select') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Add Server</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">Select a protocol to configure</p>
          </div>
          <button
            onClick={handleCloseForm}
            className="border-border text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg border px-3 py-1.5 text-sm transition-colors"
          >
            Back to list
          </button>
        </div>
        <ProtocolSelector selected={null} onSelect={handleProtocolSelect} />
      </div>
    )
  }

  if (viewMode === 'add-mqtt' || viewMode === 'edit-mqtt') {
    return <MQTTServerForm broker={editingBroker ?? undefined} onClose={handleCloseForm} />
  }

  if (viewMode === 'add-opcua' || viewMode === 'edit-opcua') {
    return <OPCUAServerForm server={editingOpcua ?? undefined} onClose={handleCloseForm} />
  }

  // List view
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayoutList className="text-muted-foreground h-5 w-5" />
          <div>
            <h2 className="text-lg font-semibold">Servers</h2>
            <p className="text-muted-foreground text-sm">
              {allServers.length} server{allServers.length !== 1 ? 's' : ''} configured
            </p>
          </div>
        </div>
        <button
          onClick={handleAddServer}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Server
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        {/* Protocol chips */}
        <div className="flex items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'All', count: allServers.length, icon: null },
              { id: 'mqtt', label: 'MQTT', count: mqttCount, icon: Wifi },
              { id: 'opcua', label: 'OPC-UA', count: opcuaCount, icon: Server },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              onClick={() => setFilter(chip.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                filter === chip.id
                  ? 'bg-primary/10 text-primary border-primary/20 border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent',
              )}
            >
              {chip.icon && <chip.icon className="h-3 w-3" />}
              {chip.label}
              <span
                className={cn(
                  'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px]',
                  filter === chip.id
                    ? 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {chip.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto max-w-xs flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search servers..."
            className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border py-1.5 pr-3 pl-9 text-sm transition-colors focus:ring-2"
          />
        </div>
      </div>

      {/* Server list */}
      {isLoading ? (
        <div className="text-muted-foreground py-12 text-center">Loading servers...</div>
      ) : filteredServers.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed py-16 text-center">
          {allServers.length === 0 ? (
            <>
              <Server className="text-muted-foreground/50 mx-auto mb-3 h-10 w-10" />
              <p className="text-muted-foreground text-sm">No servers configured yet</p>
              <p className="text-muted-foreground mt-1 mb-4 text-xs">
                Connect to MQTT brokers and OPC-UA servers to start collecting data
              </p>
              <button
                onClick={handleAddServer}
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Server
              </button>
            </>
          ) : (
            <>
              <Search className="text-muted-foreground/50 mx-auto mb-2 h-8 w-8" />
              <p className="text-muted-foreground text-sm">No servers match your filters</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredServers.map((item) => (
            <ServerListItem
              key={`${item.protocol}-${item.server.id}`}
              protocol={item.protocol}
              server={item.server}
              status={item.status}
              onEdit={() => {
                if (item.protocol === 'mqtt') {
                  handleEditMQTT(item.server as MQTTBroker)
                } else {
                  handleEditOPCUA(item.server as OPCUAServer)
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
