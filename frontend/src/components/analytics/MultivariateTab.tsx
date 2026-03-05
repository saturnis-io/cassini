import { useState } from 'react'
import { Loader2, Play, Lock } from 'lucide-react'
import { HelpTooltip } from '@/components/HelpTooltip'
import { ContextualHint } from '@/components/ContextualHint'
import { InterpretResult } from '@/components/InterpretResult'
import { hints, interpretMultivariate } from '@/lib/guidance'
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
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                Hotelling T{'\u00B2'} Chart
                <HelpTooltip
                  helpKey={selectedGroup?.chart_type === 'mewma' ? 'chart-type-mewma' : 'hotelling-t2'}
                />
                {selectedGroup?.phase && (
                  <HelpTooltip
                    helpKey={selectedGroup.phase === 'phase_i' ? 'multivariate-phase-i' : 'multivariate-phase-ii'}
                  >
                    <span className="bg-muted text-muted-foreground cursor-help rounded px-2 py-0.5 text-xs font-normal">
                      {selectedGroup.phase === 'phase_i' ? 'Phase I' : 'Phase II'}
                    </span>
                  </HelpTooltip>
                )}
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {selectedGroup?.chart_type === 'mewma'
                  ? 'MEWMA monitoring chart'
                  : 'Hotelling T-squared monitoring chart'}
              </p>
              {selectedGroup?.phase === 'phase_i' && (
                <ContextualHint hintId={hints.multivariatePhaseI.id} className="mt-3">
                  <strong>Phase I:</strong> {hints.multivariatePhaseI.text}
                </ContextualHint>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selectedGroup?.phase === 'phase_i' && (
                <div className="flex flex-col items-end gap-2">
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
                  <ContextualHint hintId={hints.multivariateFreeze.id} className="max-w-xs text-xs">
                    {hints.multivariateFreeze.text}
                  </ContextualHint>
                </div>
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
            {chartData &&
              (() => {
                const points = Array.isArray(chartData) ? chartData : []
                const oocCount = points.filter(
                  (p: { in_control?: boolean }) => p.in_control === false,
                ).length
                return (
                  <InterpretResult
                    interpretation={interpretMultivariate({
                      oocCount,
                      totalPoints: points.length,
                      phase: selectedGroup?.phase ?? 'phase_i',
                      chartType: selectedGroup?.chart_type ?? 't2',
                    })}
                    className="mt-3"
                  />
                )
              })()}
          </div>
        </div>
      )}

      {/* Decomposition table for selected OOC point */}
      {selectedOOCPoint && selectedOOCPoint.decomposition && (
        <div className="bg-card border-border rounded-lg border p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            OOC Decomposition
            <HelpTooltip helpKey="ooc-decomposition" />
          </h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Variable contributions for the selected out-of-control point (T{'\u00B2'} ={' '}
            {selectedOOCPoint.t_squared?.toFixed(2)})
          </p>
          <div className="mt-3">
            <DecompositionTable decomposition={selectedOOCPoint.decomposition} />
          </div>
        </div>
      )}
    </div>
  )
}
