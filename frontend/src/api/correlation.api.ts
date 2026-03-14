import { fetchApi } from './client'

// ---- Types ----

export interface CorrelationMatrixRequest {
	plant_id: number
	characteristic_ids: number[]
	method?: 'pearson' | 'spearman'
}

export interface CorrelationMatrixResponse {
	characteristic_ids: number[]
	characteristic_names: string[]
	method: string
	matrix: number[][]
	p_values: number[][]
	sample_count: number
}

export interface PCARequest {
	plant_id: number
	characteristic_ids: number[]
}

export interface PCAResponse {
	characteristic_names: string[]
	eigenvalues: number[]
	explained_variance_ratios: number[]
	cumulative_variance: number[]
	loadings: number[][]
	scores: number[][]
}

export interface PartialCorrelationRequest {
	plant_id: number
	primary_id: number
	secondary_id: number
	control_ids: number[]
}

export interface PartialCorrelationResponse {
	primary_name: string
	secondary_name: string
	controlling_for: string[]
	r: number
	p_value: number
	df: number
}

export interface VariableImportanceItem {
	characteristic_id: number
	characteristic_name: string
	pearson_r: number
	abs_pearson_r: number
	p_value: number
}

export interface VariableImportanceResponse {
	target_characteristic_id: number
	target_characteristic_name: string
	sample_count: number
	rankings: VariableImportanceItem[]
}

// ---- API ----

export const correlationAnalysisApi = {
	computeMatrix: (data: CorrelationMatrixRequest) =>
		fetchApi<CorrelationMatrixResponse>('/correlation/matrix', {
			method: 'POST',
			body: JSON.stringify(data),
		}),

	computePCA: (data: PCARequest) =>
		fetchApi<PCAResponse>('/correlation/pca', {
			method: 'POST',
			body: JSON.stringify(data),
		}),

	computePartial: (data: PartialCorrelationRequest) =>
		fetchApi<PartialCorrelationResponse>('/correlation/partial', {
			method: 'POST',
			body: JSON.stringify(data),
		}),

	getVariableImportance: (charId: number) =>
		fetchApi<VariableImportanceResponse>(
			`/correlation/variable-importance/${charId}`,
		),
}
