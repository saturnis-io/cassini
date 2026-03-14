import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Play, Loader2, X, BarChart3, Grid3X3, Trophy, GitFork } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlantContext } from '@/providers/PlantProvider'
import { characteristicApi } from '@/api/client'
import { HierarchyMultiSelector } from '@/components/HierarchyMultiSelector'
import { HelpTooltip } from '@/components/HelpTooltip'
import { ContextualHint } from '@/components/ContextualHint'
import { InterpretResult } from '@/components/InterpretResult'
import { hints, interpretCorrelation } from '@/lib/guidance'
import {
	useComputeCorrelationMatrix,
	useComputePCA,
	useComputePartialCorrelation,
	useVariableImportance,
} from '@/api/hooks'
import type {
	CorrelationMatrixResponse,
	PCAResponse,
	PartialCorrelationResponse,
} from '@/api/correlation.api'
import { CorrelationHeatmap } from './CorrelationHeatmap'
import { PCAScreePlot } from './PCAScreePlot'
import { PCABiplot } from './PCABiplot'

type SubTab = 'heatmap' | 'pca' | 'rankings' | 'partial'

const SUB_TABS: { id: SubTab; label: string; icon: typeof Grid3X3 }[] = [
	{ id: 'heatmap', label: 'Heatmap', icon: Grid3X3 },
	{ id: 'pca', label: 'PCA', icon: BarChart3 },
	{ id: 'rankings', label: 'Rankings', icon: Trophy },
	{ id: 'partial', label: 'Partial', icon: GitFork },
]

/**
 * CorrelationTab -- compute and visualize correlation matrices, PCA,
 * variable importance rankings, and partial correlations.
 *
 * Uses the dedicated /api/v1/correlation endpoints (Pro tier).
 */
export function CorrelationTab() {
	const { selectedPlant } = usePlantContext()
	const plantId = selectedPlant?.id ?? 0

	// Form state
	const [selectedCharIds, setSelectedCharIds] = useState<number[]>([])
	const [method, setMethod] = useState<'pearson' | 'spearman'>('pearson')
	const [activeSubTab, setActiveSubTab] = useState<SubTab>('heatmap')

	// Results state
	const [matrixResult, setMatrixResult] = useState<CorrelationMatrixResponse | null>(null)
	const [pcaResult, setPcaResult] = useState<PCAResponse | null>(null)
	const [partialResult, setPartialResult] = useState<PartialCorrelationResponse | null>(null)

	// Partial correlation form state
	const [primaryId, setPrimaryId] = useState<number>(0)
	const [secondaryId, setSecondaryId] = useState<number>(0)
	const [controlIds, setControlIds] = useState<number[]>([])

	// When primary or secondary changes, remove the newly-selected ID from controlIds
	const handlePrimaryChange = useCallback(
		(id: number) => {
			setPrimaryId(id)
			setControlIds((prev) => prev.filter((x) => x !== id))
		},
		[],
	)

	const handleSecondaryChange = useCallback(
		(id: number) => {
			setSecondaryId(id)
			setControlIds((prev) => prev.filter((x) => x !== id))
		},
		[],
	)

	// Variable importance target
	const [importanceTargetId, setImportanceTargetId] = useState<number>(0)

	// Fetch characteristics for multi-select
	const { data: charData } = useQuery({
		queryKey: ['characteristics-for-correlation', plantId],
		queryFn: () => characteristicApi.list({ per_page: 500, plant_id: plantId }),
		enabled: plantId > 0,
	})
	const characteristics = charData?.items ?? []

	// Mutations
	const matrixMutation = useComputeCorrelationMatrix()
	const pcaMutation = useComputePCA()
	const partialMutation = useComputePartialCorrelation()

	// Variable importance query
	const { data: importanceResult, isLoading: isLoadingImportance } =
		useVariableImportance(importanceTargetId)

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

		// Compute matrix
		matrixMutation.mutate(
			{
				characteristic_ids: selectedCharIds,
				method,
				plant_id: plantId,
			},
			{
				onSuccess: (data) => {
					setMatrixResult(data)
					setActiveSubTab('heatmap')
				},
			},
		)

		// Also compute PCA
		pcaMutation.mutate(
			{
				characteristic_ids: selectedCharIds,
				plant_id: plantId,
			},
			{
				onSuccess: (data) => {
					setPcaResult(data)
				},
			},
		)

		// Set the first char as default importance target
		if (selectedCharIds.length > 0 && importanceTargetId === 0) {
			setImportanceTargetId(selectedCharIds[0])
		}
	}

	const handleComputePartial = () => {
		if (!primaryId || !secondaryId) return
		partialMutation.mutate(
			{
				plant_id: plantId,
				primary_id: primaryId,
				secondary_id: secondaryId,
				control_ids: controlIds,
			},
			{
				onSuccess: (data) => {
					setPartialResult(data)
				},
			},
		)
	}

	const isComputing = matrixMutation.isPending || pcaMutation.isPending

	return (
		<div className="space-y-6">
			{/* Configuration panel */}
			<div className="bg-card border-border rounded-lg border p-5">
				<h2 className="text-foreground flex items-center gap-2 text-base font-semibold">
					Correlation Analysis
					<HelpTooltip helpKey="correlation-analysis" />
				</h2>
				<p className="text-muted-foreground mt-0.5 text-sm">
					Select characteristics to compute correlation matrix, PCA, and rankings
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

					{/* Method + Compute */}
					<div className="space-y-3">
						<div>
							<label className="text-foreground mb-1.5 flex items-center gap-2 text-sm font-medium">
								Method
								<HelpTooltip
									helpKey={
										method === 'spearman'
											? 'correlation-method-spearman'
											: 'correlation-method-pearson'
									}
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

						<button
							onClick={handleCompute}
							disabled={selectedCharIds.length < 2 || isComputing}
							className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
						>
							{isComputing ? (
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

			{/* Results area with sub-tabs */}
			{(matrixResult || pcaResult) && (
				<div className="bg-card border-border rounded-lg border">
					{/* Sub-tab bar */}
					<div className="border-border flex gap-1 border-b px-4 pt-3">
						{SUB_TABS.map((tab) => {
							const isActive = activeSubTab === tab.id
							return (
								<button
									key={tab.id}
									onClick={() => setActiveSubTab(tab.id)}
									className={cn(
										'relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
										isActive
											? 'text-primary'
											: 'text-muted-foreground hover:text-foreground',
									)}
								>
									<tab.icon className="h-3.5 w-3.5" />
									{tab.label}
									{isActive && (
										<span className="bg-primary absolute inset-x-0 bottom-0 h-0.5 rounded-full" />
									)}
								</button>
							)
						})}
					</div>

					<div className="p-5">
						{/* Heatmap sub-tab */}
						{activeSubTab === 'heatmap' && matrixResult && (
							<div>
								<h3 className="text-foreground flex items-center gap-2 text-sm font-semibold">
									Correlation Matrix
									<HelpTooltip helpKey="correlation-matrix" />
								</h3>
								<p className="text-muted-foreground mt-0.5 text-xs">
									{matrixResult.method === 'pearson' ? 'Pearson' : 'Spearman'} correlation
									coefficients ({matrixResult.sample_count} aligned samples)
								</p>
								<CorrelationHeatmap
									matrix={matrixResult.matrix}
									labels={matrixResult.characteristic_names}
									pValues={matrixResult.p_values}
									sampleCount={matrixResult.sample_count}
								/>
								{/* Interpretation */}
								{(() => {
									const names = matrixResult.characteristic_names
									const matrix = matrixResult.matrix
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
									const pVal = matrixResult.p_values[maxI]?.[maxJ]
									return (
										<InterpretResult
											interpretation={interpretCorrelation({
												r: maxR,
												pValue: pVal,
												method: matrixResult.method as 'pearson' | 'spearman',
												label1: String(names[maxI] ?? 'Variable A'),
												label2: String(names[maxJ] ?? 'Variable B'),
											})}
											className="mt-3"
										/>
									)
								})()}
							</div>
						)}

						{/* PCA sub-tab */}
						{activeSubTab === 'pca' && pcaResult && (
							<div className="space-y-6">
								<div>
									<h3 className="text-foreground text-sm font-semibold">Scree Plot</h3>
									<p className="text-muted-foreground mt-0.5 text-xs">
										Explained variance per principal component
									</p>
									<PCAScreePlot
										explainedVarianceRatios={pcaResult.explained_variance_ratios}
										cumulativeVariance={pcaResult.cumulative_variance}
										eigenvalues={pcaResult.eigenvalues}
									/>
								</div>
								<div>
									<h3 className="text-foreground flex items-center gap-2 text-sm font-semibold">
										PCA Biplot
										<HelpTooltip helpKey="pca-biplot" />
									</h3>
									<p className="text-muted-foreground mt-0.5 text-xs">
										PC1 vs PC2 scores with loading vectors
									</p>
									<PCABiplot
										pca={{
											explained_variance_ratio: pcaResult.explained_variance_ratios,
											scores: pcaResult.scores,
											loadings: pcaResult.loadings,
											feature_names: pcaResult.characteristic_names,
										}}
									/>
								</div>
								{/* Variance summary */}
								<div className="bg-muted/30 rounded-lg p-4">
									<h4 className="text-foreground text-xs font-semibold">Variance Summary</h4>
									<div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
										{pcaResult.explained_variance_ratios.slice(0, 4).map((ratio, i) => (
											<div
												key={i}
												className="bg-background border-border rounded-lg border p-3 text-center"
											>
												<div className="text-foreground text-lg font-bold">
													{(ratio * 100).toFixed(1)}%
												</div>
												<div className="text-muted-foreground text-xs">PC{i + 1}</div>
											</div>
										))}
									</div>
								</div>
							</div>
						)}

						{/* Rankings sub-tab */}
						{activeSubTab === 'rankings' && (
							<div>
								<h3 className="text-foreground text-sm font-semibold">
									Variable Importance Rankings
								</h3>
								<p className="text-muted-foreground mt-0.5 text-xs">
									Rank characteristics by correlation strength to a target
								</p>

								<div className="mt-3">
									<label className="text-foreground mb-1.5 block text-sm font-medium">
										Target Characteristic
									</label>
									<select
										value={importanceTargetId}
										onChange={(e) => setImportanceTargetId(Number(e.target.value))}
										className="bg-background border-border text-foreground w-full max-w-md rounded-lg border px-3 py-2 text-sm"
									>
										<option value={0}>Select a target...</option>
										{selectedCharIds.map((id) => (
											<option key={id} value={id}>
												{charNameMap.get(id) ?? `Characteristic ${id}`}
											</option>
										))}
									</select>
								</div>

								{isLoadingImportance && (
									<div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
										<Loader2 className="h-4 w-4 animate-spin" />
										Computing rankings...
									</div>
								)}

								{importanceResult && importanceResult.rankings.length > 0 && (
									<div className="mt-4 space-y-2">
										<p className="text-muted-foreground text-xs">
											Ranked by |r| against{' '}
											<strong>{importanceResult.target_characteristic_name}</strong> (
											{importanceResult.sample_count} samples)
										</p>
										<div className="divide-border divide-y">
											{importanceResult.rankings.map((item, idx) => {
												const barWidth = Math.round(item.abs_pearson_r * 100)
												const isSignificant = item.p_value < 0.05
												return (
													<div key={item.characteristic_id} className="flex items-center gap-3 py-2">
														<span className="text-muted-foreground w-6 text-right text-xs font-mono">
															{idx + 1}.
														</span>
														<div className="min-w-0 flex-1">
															<div className="flex items-center gap-2">
																<span className="text-foreground truncate text-sm font-medium">
																	{item.characteristic_name}
																</span>
																{isSignificant && (
																	<span className="text-emerald-600 text-[10px] font-semibold">
																		*
																	</span>
																)}
															</div>
															<div className="bg-muted mt-1 h-1.5 w-full overflow-hidden rounded-full">
																<div
																	className={cn(
																		'h-full rounded-full transition-all',
																		item.pearson_r >= 0 ? 'bg-blue-500' : 'bg-red-500',
																	)}
																	style={{ width: `${barWidth}%` }}
																/>
															</div>
														</div>
														<div className="shrink-0 text-right">
															<span
																className={cn(
																	'text-sm font-mono font-semibold',
																	item.pearson_r >= 0 ? 'text-blue-600' : 'text-red-600',
																)}
															>
																{item.pearson_r >= 0 ? '+' : ''}
																{item.pearson_r.toFixed(3)}
															</span>
															<div className="text-muted-foreground text-[10px]">
																p={item.p_value < 0.001 ? item.p_value.toExponential(1) : item.p_value.toFixed(3)}
															</div>
														</div>
													</div>
												)
											})}
										</div>
									</div>
								)}

								{importanceResult && importanceResult.rankings.length === 0 && (
									<p className="text-muted-foreground py-6 text-center text-sm">
										No sibling characteristics with aligned data found.
									</p>
								)}

								{!importanceResult && !isLoadingImportance && importanceTargetId === 0 && (
									<p className="text-muted-foreground py-6 text-center text-sm">
										Select a target characteristic to see rankings.
									</p>
								)}
							</div>
						)}

						{/* Partial correlation sub-tab */}
						{activeSubTab === 'partial' && (
							<div>
								<h3 className="text-foreground text-sm font-semibold">
									Partial Correlation
								</h3>
								<p className="text-muted-foreground mt-0.5 text-xs">
									Compute correlation between two variables while controlling for confounders
								</p>

								<div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
									<div>
										<label className="text-foreground mb-1.5 block text-xs font-medium">
											Primary Variable
										</label>
										<select
											value={primaryId}
											onChange={(e) => handlePrimaryChange(Number(e.target.value))}
											className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm"
										>
											<option value={0}>Select...</option>
											{selectedCharIds.map((id) => (
												<option key={id} value={id}>
													{charNameMap.get(id)}
												</option>
											))}
										</select>
									</div>
									<div>
										<label className="text-foreground mb-1.5 block text-xs font-medium">
											Secondary Variable
										</label>
										<select
											value={secondaryId}
											onChange={(e) => handleSecondaryChange(Number(e.target.value))}
											className="bg-background border-border text-foreground w-full rounded-lg border px-3 py-2 text-sm"
										>
											<option value={0}>Select...</option>
											{selectedCharIds
												.filter((id) => id !== primaryId)
												.map((id) => (
													<option key={id} value={id}>
														{charNameMap.get(id)}
													</option>
												))}
										</select>
									</div>
									<div>
										<label className="text-foreground mb-1.5 block text-xs font-medium">
											Control Variables
										</label>
										<div className="border-border max-h-32 space-y-1 overflow-y-auto rounded-lg border p-2">
											{selectedCharIds
												.filter((id) => id !== primaryId && id !== secondaryId)
												.map((id) => (
													<label key={id} className="flex items-center gap-2 text-xs">
														<input
															type="checkbox"
															checked={controlIds.includes(id)}
															onChange={(e) => {
																if (e.target.checked) {
																	setControlIds((prev) => [...prev, id])
																} else {
																	setControlIds((prev) => prev.filter((x) => x !== id))
																}
															}}
															className="accent-primary h-3.5 w-3.5 rounded"
														/>
														<span className="text-foreground truncate">
															{charNameMap.get(id)}
														</span>
													</label>
												))}
											{selectedCharIds.filter(
												(id) => id !== primaryId && id !== secondaryId,
											).length === 0 && (
												<p className="text-muted-foreground text-xs">
													Select more characteristics above
												</p>
											)}
										</div>
									</div>
								</div>

								<button
									onClick={handleComputePartial}
									disabled={!primaryId || !secondaryId || partialMutation.isPending}
									className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground mt-4 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed"
								>
									{partialMutation.isPending ? (
										<>
											<Loader2 className="h-4 w-4 animate-spin" />
											Computing...
										</>
									) : (
										<>
											<Play className="h-4 w-4" />
											Compute Partial Correlation
										</>
									)}
								</button>

								{/* Result display */}
								{partialResult && (
									<div className="bg-muted/30 mt-4 rounded-lg p-4">
										<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
											<div className="bg-background border-border rounded-lg border p-4 text-center">
												<div className="text-muted-foreground text-xs">
													Partial r
												</div>
												<div
													className={cn(
														'mt-1 text-2xl font-bold font-mono',
														partialResult.r >= 0 ? 'text-blue-600' : 'text-red-600',
													)}
												>
													{partialResult.r >= 0 ? '+' : ''}
													{partialResult.r.toFixed(4)}
												</div>
											</div>
											<div className="bg-background border-border rounded-lg border p-4 text-center">
												<div className="text-muted-foreground text-xs">
													p-value
												</div>
												<div
													className={cn(
														'mt-1 text-2xl font-bold font-mono',
														partialResult.p_value < 0.05
															? 'text-emerald-600'
															: 'text-muted-foreground',
													)}
												>
													{partialResult.p_value < 0.001
														? partialResult.p_value.toExponential(2)
														: partialResult.p_value.toFixed(4)}
												</div>
											</div>
											<div className="bg-background border-border rounded-lg border p-4 text-center">
												<div className="text-muted-foreground text-xs">
													Degrees of Freedom
												</div>
												<div className="text-foreground mt-1 text-2xl font-bold font-mono">
													{partialResult.df}
												</div>
											</div>
										</div>
										<p className="text-muted-foreground mt-3 text-xs">
											Correlation between <strong>{partialResult.primary_name}</strong> and{' '}
											<strong>{partialResult.secondary_name}</strong>
											{partialResult.controlling_for.length > 0 && (
												<>
													{' '}
													controlling for{' '}
													<strong>{partialResult.controlling_for.join(', ')}</strong>
												</>
											)}
										</p>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}
