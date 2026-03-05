import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, Loader2, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { usePlantContext } from '@/providers/PlantProvider'
import { characteristicApi } from '@/api/client'
import { HierarchyMultiSelector } from '@/components/HierarchyMultiSelector'
import { HelpTooltip } from '@/components/HelpTooltip'
import { ContextualHint } from '@/components/ContextualHint'
import { InterpretResult } from '@/components/InterpretResult'
import { hints, interpretCorrelation } from '@/lib/guidance'
import { useComputeCorrelation, useCorrelationResults } from '@/api/hooks'
import { CorrelationHeatmap } from './CorrelationHeatmap'
import { PCABiplot } from './PCABiplot'

/**
 * CorrelationTab — compute and visualize correlation matrices and PCA.
 *
 * Multi-select characteristics, choose method, run analysis, see results.
 */
export function CorrelationTab() {
  const { formatDateTime } = useDateFormat()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  // Form state
  const [selectedCharIds, setSelectedCharIds] = useState<number[]>([])
  const [method, setMethod] = useState<'pearson' | 'spearman'>('pearson')
  const [includePCA, setIncludePCA] = useState(false)

  // Active result to display
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeResult, setActiveResult] = useState<any>(null)

  // Fetch characteristics for multi-select
  const { data: charData } = useQuery({
    queryKey: ['characteristics-for-correlation', plantId],
    queryFn: () => characteristicApi.list({ per_page: 500, plant_id: plantId }),
    enabled: plantId > 0,
  })
  const characteristics = charData?.items ?? []

  // Recent results
  const { data: recentResults, isLoading: isLoadingRecent } = useCorrelationResults(plantId, 10)

  // Compute mutation
  const computeMutation = useComputeCorrelation()

  // Lookup map for char names
  const charNameMap = useMemo(() => {
    const map = new Map<number, string>()
    for (const c of characteristics) {
      map.set(c.id, c.name)
    }
    return map
  }, [characteristics])

  const handleCompute = () => {
    if (selectedCharIds.length < 2) return
    computeMutation.mutate(
      {
        characteristic_ids: selectedCharIds,
        method,
        include_pca: includePCA,
        plant_id: plantId,
      },
      {
        onSuccess: (data) => {
          setActiveResult(data)
        },
      },
    )
  }

  const selectedCharNames = selectedCharIds
    .map((id) => charNameMap.get(id))
    .filter(Boolean)

  return (
    <div className="space-y-6">
      {/* Configuration panel */}
      <div className="bg-card border-border rounded-lg border p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          Correlation Analysis
          <HelpTooltip helpKey="correlation-analysis" />
        </h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Select characteristics to compute correlation matrix and optional PCA
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Characteristic multi-select */}
          <div className="lg:col-span-2">
            <label className="text-foreground mb-1.5 block text-sm font-medium">
              Characteristics
              {selectedCharIds.length > 0 && (
                <span className="text-muted-foreground ml-2 font-normal">
                  ({selectedCharIds.length} selected)
                </span>
              )}
            </label>

            <HierarchyMultiSelector
              selectedIds={selectedCharIds}
              onSelectionChange={setSelectedCharIds}
              plantId={plantId}
              className="border-border max-h-64 rounded-lg border"
            />

            {/* Selection tags */}
            {selectedCharIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedCharIds.map((id) => (
                  <span
                    key={id}
                    className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  >
                    {charNameMap.get(id)}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedCharIds((prev) => prev.filter((x) => x !== id))
                      }
                      className="hover:text-primary/70"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Method + PCA + Compute */}
          <div className="space-y-3">
            <div>
              <label className="text-foreground mb-1.5 flex items-center gap-2 text-sm font-medium">
                Method
                <HelpTooltip
                  helpKey={method === 'spearman' ? 'correlation-method-spearman' : 'correlation-method-pearson'}
                />
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as 'pearson' | 'spearman')}
                className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm"
              >
                <option value="pearson">Pearson</option>
                <option value="spearman">Spearman</option>
              </select>
              <ContextualHint hintId={hints.correlationMethod.id} className="mt-2">
                <strong>Tip:</strong> {hints.correlationMethod.text}
              </ContextualHint>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includePCA}
                onChange={(e) => setIncludePCA(e.target.checked)}
                className="accent-primary h-4 w-4 rounded"
              />
              <span className="text-foreground">Include PCA</span>
              <HelpTooltip helpKey="pca-analysis" />
            </label>
            {includePCA && (
              <ContextualHint hintId={hints.correlationPCA.id} className="mt-1">
                <strong>Tip:</strong> {hints.correlationPCA.text}
              </ContextualHint>
            )}

            <button
              onClick={handleCompute}
              disabled={selectedCharIds.length < 2 || computeMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
            >
              {computeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Computing...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Compute
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Active result */}
      {activeResult && (
        <div className="space-y-4">
          {/* Heatmap */}
          {activeResult.matrix && (
            <div className="bg-card border-border rounded-lg border p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                Correlation Matrix
                <HelpTooltip helpKey="correlation-matrix" />
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {method === 'pearson' ? 'Pearson' : 'Spearman'} correlation coefficients
              </p>
              <CorrelationHeatmap
                matrix={activeResult.matrix}
                labels={activeResult.characteristic_names ?? selectedCharNames}
                pValues={activeResult.p_values}
                sampleCount={activeResult.sample_count}
              />
              {(() => {
                const names = activeResult.characteristic_names ?? selectedCharNames
                const matrix = activeResult.matrix as number[][]
                let maxR = 0
                let maxI = 0
                let maxJ = 1
                for (let i = 0; i < matrix.length; i++) {
                  for (let j = i + 1; j < matrix[i].length; j++) {
                    if (Math.abs(matrix[i][j]) > Math.abs(maxR)) {
                      maxR = matrix[i][j]
                      maxI = i
                      maxJ = j
                    }
                  }
                }
                const pVal = activeResult.p_values
                  ? (activeResult.p_values as number[][])[maxI]?.[maxJ]
                  : undefined
                return (
                  <InterpretResult
                    interpretation={interpretCorrelation({
                      r: maxR,
                      pValue: pVal,
                      method,
                      label1: String(names[maxI] ?? 'Variable A'),
                      label2: String(names[maxJ] ?? 'Variable B'),
                    })}
                    className="mt-3"
                  />
                )
              })()}
            </div>
          )}

          {/* PCA Biplot */}
          {activeResult.pca && (
            <div className="bg-card border-border rounded-lg border p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                PCA Biplot
                <HelpTooltip helpKey="pca-biplot" />
              </h3>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Principal component scores and loading vectors
              </p>
              <PCABiplot pca={activeResult.pca} />
            </div>
          )}
        </div>
      )}

      {/* Recent results */}
      <div className="bg-card border-border rounded-lg border p-5">
        <h3 className="text-foreground text-sm font-semibold">Recent Results</h3>
        {isLoadingRecent ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recent results...
          </div>
        ) : !recentResults || (Array.isArray(recentResults) && recentResults.length === 0) ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No correlation results yet. Run an analysis above.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {(Array.isArray(recentResults) ? recentResults : []).map(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (result: any) => (
                <button
                  key={result.id}
                  type="button"
                  onClick={() => setActiveResult(result)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                    activeResult?.id === result.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  <Clock className="text-muted-foreground h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground truncate text-sm font-medium">
                      {result.characteristic_names?.join(', ') ?? `${result.characteristic_ids?.length ?? 0} characteristics`}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {result.method ?? 'pearson'} &middot;{' '}
                      {result.computed_at
                        ? formatDateTime(result.computed_at)
                        : 'Unknown date'}
                    </p>
                  </div>
                  {result.pca && (
                    <span className="bg-primary/10 text-primary shrink-0 rounded px-2 py-0.5 text-xs font-medium">
                      PCA
                    </span>
                  )}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
