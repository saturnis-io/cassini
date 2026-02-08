import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { brokerApi } from '@/api/client'
import { useUIStore } from '@/stores/uiStore'
import { ConnectionMetrics } from '@/components/connectivity/ConnectionMetrics'
import { BrokerStatusCards } from '@/components/connectivity/BrokerStatusCards'
import { TopicTreeBrowser } from '@/components/connectivity/TopicTreeBrowser'
import { TagMappingPanel } from '@/components/connectivity/TagMappingPanel'

/**
 * Connectivity page for managing MQTT broker connections and topic discovery.
 *
 * Features:
 * - Multi-broker status overview (scoped to selected plant)
 * - Connect/disconnect brokers
 * - Start/stop topic discovery
 * - Browse discovered topics in tree/flat view
 * - Tag mapping workflow with live preview
 */
export function ConnectivityPage() {
  const selectedPlantId = useUIStore((s) => s.selectedPlantId)
  const [selectedBrokerId, setSelectedBrokerId] = useState<number | null>(null)
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)

  const { data: allStatus } = useQuery({
    queryKey: ['brokers-all-status', selectedPlantId],
    queryFn: () => brokerApi.getAllStatus(selectedPlantId ?? undefined),
    refetchInterval: 5000,
  })

  const states = allStatus?.states ?? []

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Industrial Connectivity</h1>
        <p className="text-sm text-muted-foreground mt-1">
          MQTT broker connections and topic discovery
        </p>
      </div>

      {/* Metrics summary */}
      <ConnectionMetrics states={states} />

      {/* Broker status cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Broker Connections</h2>
        <BrokerStatusCards
          states={states}
          selectedBrokerId={selectedBrokerId}
          onSelectBroker={setSelectedBrokerId}
        />
      </div>

      {/* Topic browser */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Topic Browser</h2>
        <TopicTreeBrowser
          brokerId={selectedBrokerId}
          onSelectTopic={setSelectedTopic}
        />
      </div>

      {/* Tag mapping panel */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Tag Mapping</h2>
        <TagMappingPanel
          brokerId={selectedBrokerId}
          selectedTopic={selectedTopic}
          plantId={selectedPlantId}
        />
      </div>
    </div>
  )
}
