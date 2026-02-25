import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus, Server } from 'lucide-react'
import { brokerApi, opcuaApi } from '@/api/client'
import { useUIStore } from '@/stores/uiStore'
import { ConnectivityMetrics } from './ConnectivityMetrics'
import { DataFlowPipeline } from './DataFlowPipeline'
import { ServerStatusGrid } from './ServerStatusGrid'

/**
 * Monitor tab — operational dashboard showing connectivity health at a glance.
 * Read-only view: metrics, data flow pipeline, and server status cards.
 */
export function MonitorTab() {
  const navigate = useNavigate()
  const selectedPlantId = useUIStore((s) => s.selectedPlantId)

  // Fetch MQTT broker statuses
  const { data: mqttStatus, isLoading: loadingMqtt } = useQuery({
    queryKey: ['brokers-all-status', selectedPlantId],
    queryFn: () => brokerApi.getAllStatus(selectedPlantId ?? undefined),
    refetchInterval: 5000,
  })

  // Fetch OPC-UA server statuses
  const { data: opcuaStatusData, isLoading: loadingOpcua } = useQuery({
    queryKey: ['opcua-all-status', selectedPlantId],
    queryFn: () => opcuaApi.getAllStatus(selectedPlantId ?? undefined),
    refetchInterval: 5000,
  })

  const mqttStates = mqttStatus?.states ?? []
  const opcuaStates = opcuaStatusData?.states ?? []
  const isInitialLoading = (loadingMqtt && !mqttStatus) || (loadingOpcua && !opcuaStatusData)
  const hasServers = mqttStates.length > 0 || opcuaStates.length > 0

  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="border-primary mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          <p className="text-muted-foreground text-sm">Loading connectivity status...</p>
        </div>
      </div>
    )
  }

  if (!hasServers) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="max-w-md text-center">
          <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
            <Server className="text-muted-foreground/50 h-8 w-8" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">No data sources configured</h3>
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
            Add your first server to start collecting industrial data. Cassini supports MQTT brokers
            and OPC-UA servers.
          </p>
          <button
            onClick={() => navigate('/connectivity/servers')}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Server
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Summary Metrics */}
      <ConnectivityMetrics mqttStates={mqttStates} opcuaStates={opcuaStates} />

      {/* Data Flow Pipeline */}
      <DataFlowPipeline mqttStates={mqttStates} opcuaStates={opcuaStates} />

      {/* Server Status Grid */}
      <ServerStatusGrid mqttStates={mqttStates} opcuaStates={opcuaStates} />
    </div>
  )
}
