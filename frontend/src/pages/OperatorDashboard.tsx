import { useEffect, useMemo, useState } from 'react'
import { useCharacteristics, useCharacteristic } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { HierarchyTodoList } from '@/components/HierarchyTodoList'
import { ChartPanel } from '@/components/ChartPanel'
import { DualChartPanel } from '@/components/charts/DualChartPanel'
import { InputModal } from '@/components/InputModal'
import { ChartToolbar } from '@/components/ChartToolbar'
import { ComparisonSelector } from '@/components/ComparisonSelector'
import { useWebSocketContext } from '@/providers/WebSocketProvider'
import { DUAL_CHART_TYPES } from '@/lib/chart-registry'
import type { ChartTypeId } from '@/types/charts'

export function OperatorDashboard() {
  const { data: characteristicsData, isLoading } = useCharacteristics()
  const selectedId = useDashboardStore((state) => state.selectedCharacteristicId)
  const inputModalOpen = useDashboardStore((state) => state.inputModalOpen)
  const histogramPosition = useDashboardStore((state) => state.histogramPosition)
  const showSpecLimits = useDashboardStore((state) => state.showSpecLimits)
  const comparisonMode = useDashboardStore((state) => state.comparisonMode)
  const secondaryCharacteristicId = useDashboardStore((state) => state.secondaryCharacteristicId)
  const setSecondaryCharacteristicId = useDashboardStore((state) => state.setSecondaryCharacteristicId)
  const timeRange = useDashboardStore((state) => state.timeRange)
  const chartTypes = useDashboardStore((state) => state.chartTypes)
  const [showComparisonSelector, setShowComparisonSelector] = useState(false)

  // Get selected characteristic details for subgroup size
  const { data: selectedCharacteristic } = useCharacteristic(selectedId ?? 0)

  // Get current chart type
  const currentChartType: ChartTypeId = (selectedId && chartTypes.get(selectedId)) || 'xbar'
  const isDualChart = DUAL_CHART_TYPES.includes(currentChartType)

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
      {/* Left panel - Hierarchy-based characteristic selection */}
      <div className="w-80 flex-shrink-0">
        <HierarchyTodoList />
      </div>

      {/* Right panel - Visualization */}
      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {selectedId ? (
          <>
            <ChartToolbar
              characteristicId={selectedId}
              subgroupSize={selectedCharacteristic?.subgroup_size ?? 5}
              onChangeSecondary={() => setShowComparisonSelector(true)}
            />

            {/* Primary Chart with optional histogram */}
            <div className="flex-1 min-h-0">
              {isDualChart ? (
                <DualChartPanel
                  characteristicId={selectedId}
                  chartType={currentChartType}
                  chartOptions={chartOptions}
                  label={comparisonMode ? 'Primary' : undefined}
                  histogramPosition={histogramPosition}
                  showSpecLimits={showSpecLimits}
                />
              ) : (
                <ChartPanel
                  characteristicId={selectedId}
                  chartOptions={chartOptions}
                  label={comparisonMode ? 'Primary' : undefined}
                  histogramPosition={histogramPosition}
                  showSpecLimits={showSpecLimits}
                />
              )}
            </div>

            {/* Secondary Chart (Comparison Mode) */}
            {comparisonMode && (
              <div className="flex-1 min-h-0 relative">
                {secondaryCharacteristicId ? (
                  <ChartPanel
                    characteristicId={secondaryCharacteristicId}
                    chartOptions={chartOptions}
                    label="Secondary"
                    histogramPosition={histogramPosition}
                    showSpecLimits={showSpecLimits}
                  />
                ) : (
                  <div className="h-full bg-card border border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground">
                    <p className="mb-3">Select a characteristic to compare</p>
                    <button
                      onClick={() => setShowComparisonSelector(true)}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      Browse Hierarchy
                    </button>
                  </div>
                )}

                {/* Comparison Selector Modal */}
                {showComparisonSelector && (
                  <ComparisonSelector
                    excludeId={selectedId}
                    onSelect={(id) => {
                      setSecondaryCharacteristicId(id)
                      setShowComparisonSelector(false)
                    }}
                    onCancel={() => setShowComparisonSelector(false)}
                  />
                )}
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
