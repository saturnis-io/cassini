import { useEffect, useMemo } from 'react'
import { useCharacteristics } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { TodoList } from '@/components/TodoList'
import { ControlChart } from '@/components/ControlChart'
import { DistributionHistogram } from '@/components/DistributionHistogram'
import { InputModal } from '@/components/InputModal'
import { ChartToolbar } from '@/components/ChartToolbar'
import { useWebSocketContext } from '@/providers/WebSocketProvider'

export function OperatorDashboard() {
  const { data: characteristicsData, isLoading } = useCharacteristics()
  const selectedId = useDashboardStore((state) => state.selectedCharacteristicId)
  const inputModalOpen = useDashboardStore((state) => state.inputModalOpen)
  const showHistogram = useDashboardStore((state) => state.showHistogram)
  const comparisonMode = useDashboardStore((state) => state.comparisonMode)
  const secondaryCharacteristicId = useDashboardStore((state) => state.secondaryCharacteristicId)
  const setSecondaryCharacteristicId = useDashboardStore((state) => state.setSecondaryCharacteristicId)
  const timeRange = useDashboardStore((state) => state.timeRange)

  // Compute chart data options from time range
  const chartOptions = useMemo(() => {
    if (timeRange.type === 'points' && timeRange.pointsLimit) {
      return { limit: timeRange.pointsLimit }
    }
    if (timeRange.type === 'duration' && timeRange.hoursBack) {
      const endDate = new Date().toISOString()
      const startDate = new Date(Date.now() - timeRange.hoursBack * 60 * 60 * 1000).toISOString()
      return { startDate, endDate, limit: 500 } // Cap at 500 for performance
    }
    if (timeRange.type === 'custom' && timeRange.startDate && timeRange.endDate) {
      return { startDate: timeRange.startDate, endDate: timeRange.endDate, limit: 500 }
    }
    return { limit: 50 }
  }, [timeRange])

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
            <ChartToolbar />

            {/* Primary Chart */}
            <div className={comparisonMode ? 'flex-1 min-h-0' : 'flex-1 min-h-0'}>
              <ControlChart
                characteristicId={selectedId}
                chartOptions={chartOptions}
                label={comparisonMode ? 'Primary' : undefined}
              />
            </div>

            {/* Secondary Chart (Comparison Mode) */}
            {comparisonMode && (
              <div className="flex-1 min-h-0">
                {secondaryCharacteristicId ? (
                  <ControlChart
                    characteristicId={secondaryCharacteristicId}
                    chartOptions={chartOptions}
                    label="Secondary"
                  />
                ) : (
                  <div className="h-full bg-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground">
                    <p className="mb-2">Select a characteristic to compare</p>
                    <select
                      className="px-3 py-1.5 bg-background border border-border rounded text-sm"
                      value=""
                      onChange={(e) => setSecondaryCharacteristicId(Number(e.target.value))}
                    >
                      <option value="">Choose characteristic...</option>
                      {characteristicsData?.items
                        .filter((c) => c.id !== selectedId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Histogram (toggleable) */}
            {showHistogram && (
              <div className="h-64 flex-shrink-0">
                <DistributionHistogram characteristicId={selectedId} />
              </div>
            )}
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
