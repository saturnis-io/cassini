import { useState } from 'react'
import { Loader2, Play, Lock } from 'lucide-react'
import { usePlantContext } from '@/providers/PlantProvider'
import {
  useMultivariateGroups,
  useComputeMultivariateChart,
  useMultivariateChartData,
  useFreezePhaseI,
} from '@/api/hooks'
import { GroupManager } from './GroupManager'
import { T2Chart } from './T2Chart'
import { DecompositionTable } from './DecompositionTable'

/**
 * MultivariateTab — CRUD for multivariate groups, T-squared charting,
 * and OOC decomposition analysis.
 */
export function MultivariateTab() {
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedOOCPoint, setSelectedOOCPoint] = useState<any>(null)

  // Chart data for selected group
  const { data: chartData, isLoading: isLoadingChart } = useMultivariateChartData(
    selectedGroupId ?? 0,
  )

  // Group list to determine phase
  const { data: groups } = useMultivariateGroups(plantId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const selectedGroup = (groups as any[])?.find((g: any) => g.id === selectedGroupId)

  // Mutations
  const computeMutation = useComputeMultivariateChart()
  const freezeMutation = useFreezePhaseI()

  const handleCompute = () => {
    if (!selectedGroupId) return
    computeMutation.mutate(selectedGroupId)
  }

  const handleFreeze = () => {
    if (!selectedGroupId) return
    freezeMutation.mutate(selectedGroupId)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleOOCClick = (point: any) => {
    setSelectedOOCPoint(point)
  }

  return (
    <div className="space-y-6">
      {/* Group management */}
      <GroupManager
        plantId={plantId}
        selectedGroupId={selectedGroupId}
        onSelectGroup={(id) => {
          setSelectedGroupId(id)
          setSelectedOOCPoint(null)
        }}
      />

      {/* Chart controls + T2 chart */}
      {selectedGroupId && (
        <div className="bg-card border-border rounded-lg border p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-foreground text-sm font-semibold">
                Hotelling T{'\u00B2'} Chart
                {selectedGroup?.phase && (
                  <span className="bg-muted text-muted-foreground ml-2 rounded px-2 py-0.5 text-xs font-normal">
                    {selectedGroup.phase === 'phase_i' ? 'Phase I' : 'Phase II'}
                  </span>
                )}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {selectedGroup?.chart_type === 'mewma'
                  ? 'MEWMA monitoring chart'
                  : 'Hotelling T-squared monitoring chart'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedGroup?.phase === 'phase_i' && (
                <button
                  onClick={handleFreeze}
                  disabled={freezeMutation.isPending}
                  className="border-border text-foreground hover:bg-muted flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
                >
                  {freezeMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Lock className="h-3.5 w-3.5" />
                  )}
                  Freeze Phase I
                </button>
              )}
              <button
                onClick={handleCompute}
                disabled={computeMutation.isPending}
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
              >
                {computeMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Compute
              </button>
            </div>
          </div>

          {/* Chart area */}
          <div className="mt-4">
            {isLoadingChart ? (
              <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
              </div>
            ) : chartData ? (
              <T2Chart data={chartData} onOOCClick={handleOOCClick} />
            ) : (
              <div className="flex h-[400px] items-center justify-center text-sm text-muted-foreground">
                Click "Compute" to generate the T{'\u00B2'} chart
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decomposition table for selected OOC point */}
      {selectedOOCPoint && selectedOOCPoint.decomposition && (
        <div className="bg-card border-border rounded-lg border p-5">
          <h3 className="text-foreground text-sm font-semibold">
            OOC Decomposition
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Variable contributions for the selected out-of-control point (T{'\u00B2'} ={' '}
            {selectedOOCPoint.t2_value?.toFixed(2)})
          </p>
          <div className="mt-3">
            <DecompositionTable decomposition={selectedOOCPoint.decomposition} />
          </div>
        </div>
      )}
    </div>
  )
}
