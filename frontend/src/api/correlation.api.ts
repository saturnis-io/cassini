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

export interface RegressionScatterPoint {
	x: number
	y: number
	residual: number
}

export interface RegressionScatterResponse {
	x_name: string
	y_name: string
	x_hierarchy_path: string | null
	y_hierarchy_path: string | null
	points: RegressionScatterPoint[]
	regression_line: [number, number][]
	confidence_band_upper: [number, number][]
	confidence_band_lower: [number, number][]
	prediction_band_upper: [number, number][]
	prediction_band_lower: [number, number][]
	slope: number
	intercept: number
	r_squared: number
	p_value: number
	std_err: number
	sample_count: number
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

	computeRegression: (data: {
		plant_id: number
		x_characteristic_id: number
		y_characteristic_id: number
		start_date?: string
		end_date?: string
	}): Promise<RegressionScatterResponse> =>
		fetchApi<RegressionScatterResponse>('/correlation/regression', {
			method: 'POST',
			body: JSON.stringify(data),
		}),

	getVariableImportance: (charId: number) =>
		fetchApi<VariableImportanceResponse>(
			`/correlation/variable-importance/${charId}`,
		),
}
