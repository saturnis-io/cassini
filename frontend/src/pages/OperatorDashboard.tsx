import { useEffect } from 'react'
import { useCharacteristics } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { TodoList } from '@/components/TodoList'
import { ControlChart } from '@/components/ControlChart'
import { DistributionHistogram } from '@/components/DistributionHistogram'
import { InputModal } from '@/components/InputModal'
import { useWebSocketContext } from '@/providers/WebSocketProvider'

export function OperatorDashboard() {
  const { data: characteristicsData, isLoading } = useCharacteristics()
  const selectedId = useDashboardStore((state) => state.selectedCharacteristicId)
  const inputModalOpen = useDashboardStore((state) => state.inputModalOpen)

  // Use app-level WebSocket context
  const { subscribe, unsubscribe } = useWebSocketContext()
  const characteristicIds = characteristicsData?.items.map((c) => c.id) ?? []

  // Manage subscriptions when characteristics change
  useEffect(() => {
    characteristicIds.forEach((id) => subscribe(id))

    return () => {
      // Only unsubscribe from these specific IDs when dashboard unmounts
      // The WebSocket connection itself stays open
      characteristicIds.forEach((id) => unsubscribe(id))
    }
  }, [characteristicIds.join(','), subscribe, unsubscribe])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading characteristics...</div>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-10rem)]">
      {/* Left panel - Todo list */}
      <div className="w-80 flex-shrink-0">
        <TodoList characteristics={characteristicsData?.items ?? []} />
      </div>

      {/* Right panel - Visualization */}
      <div className="flex-1 flex flex-col gap-4">
        {selectedId ? (
          <>
            <div className="flex-1 min-h-0">
              <ControlChart characteristicId={selectedId} />
            </div>
            <div className="h-64">
              <DistributionHistogram characteristicId={selectedId} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Select a characteristic from the list to view its control chart
          </div>
        )}
      </div>

      {/* Input Modal */}
      {inputModalOpen && <InputModal />}
    </div>
  )
}
