import { fetchApi } from './client'

// ---- DOE API ----

export interface DOEFactor {
  name: string
  low_level: number
  high_level: number
  unit?: string
}

export type SNType =
  | 'smaller_is_better'
  | 'larger_is_better'
  | 'nominal_is_best_1'
  | 'nominal_is_best_2'

export interface DOEStudyCreate {
  name: string
  plant_id: number
  design_type: string
  resolution?: number
  n_runs?: number
  model_order?: 'linear' | 'interaction' | 'quadratic'
  sn_type?: SNType
  response_name?: string
  response_unit?: string
  notes?: string
  factors: DOEFactor[]
}

export interface DOEStudy {
  id: number
  name: string
  plant_id: number
  design_type: string
  resolution: number | null
  sn_type: SNType | null
  is_confirmation: boolean
  parent_study_id: number | null
  response_name: string | null
  response_unit: string | null
  notes: string | null
  status: 'design' | 'collecting' | 'analyzed'
  run_count: number
  factors: DOEFactor[]
  created_at: string
  created_by: number | null
}

export interface DOEStudyDetail extends DOEStudy {
  factors: {
    id: number
    name: string
    low_level: number
    high_level: number
    unit: string | null
  }[]
}

export interface DOERun {
  id: number
  run_order: number
  standard_order: number
  factor_values: Record<string, number>
  factor_actuals: Record<string, number>
  is_center_point: boolean
  response_value: number | null
  notes: string | null
  completed_at: string | null
}

export interface DOERunUpdate {
  run_id: number
  response_value: number
  notes?: string
}

export interface DOEANOVARow {
  source: string
  sum_of_squares: number
  df: number
  mean_square: number
  f_value: number | null
  p_value: number | null
}

export interface DOEEffect {
  factor_name: string
  effect: number
  coefficient: number
  sum_of_squares: number | null
  t_statistic: number | null
  p_value: number | null
  significant: boolean | null
}

export interface DOEInteraction {
  factor_indices: number[]
  factor_names: string[]
  effect: number
  coefficient: number | null
  sum_of_squares: number | null
  t_statistic: number | null
  p_value: number | null
  significant: boolean | null
}

export interface DOENormalityTest {
  statistic: number
  p_value: number
  method: string
}

export interface DOEResidualStats {
  mean: number
  std: number
  min: number
  max: number
}

export interface TaguchiANOMFactor {
  factor_name: string
  level_means: Record<string, number>
  best_level: string
  best_level_value: number
  range: number
  rank: number
}

export interface TaguchiANOM {
  sn_type: SNType
  response_table: TaguchiANOMFactor[]
  optimal_settings: Record<string, string>
  sn_ratios: (number | null)[]
}

export interface DOEAnalysis {
  anova_table: DOEANOVARow[]
  effects: DOEEffect[]
  interactions: DOEInteraction[]
  r_squared: number
  adj_r_squared: number
  pred_r_squared: number | null
  lack_of_fit_f: number | null
  lack_of_fit_p: number | null
  ss_type_warning: string | null
  grand_mean: number
  taguchi_anom: TaguchiANOM | null
  residuals: number[] | null
  fitted_values: number[] | null
  normality_test: DOENormalityTest | null
  outlier_indices: number[] | null
  residual_stats: DOEResidualStats | null
}

export interface ConfirmationRunResult {
  run_order: number
  actual_value: number
  within_pi: boolean
}

export interface IntervalBounds {
  lower: number
  upper: number
}

export interface ConfirmationAnalysis {
  parent_study_id: number
  predicted_value: number
  mse: number
  df_residual: number
  t_critical: number
  alpha: number
  prediction_interval: IntervalBounds
  confidence_interval: IntervalBounds
  mean_actual: number
  mean_within_ci: boolean
  all_within_pi: boolean
  runs: ConfirmationRunResult[]
  warnings: string[]
  verdict: string
}

export const doeApi = {
  listStudies: (plantId: number, status?: string) => {
    const sp = new URLSearchParams({ plant_id: String(plantId) })
    if (status) sp.set('status', status)
    return fetchApi<DOEStudy[]>(`/doe/studies?${sp}`)
  },

  createStudy: (data: DOEStudyCreate) =>
    fetchApi<DOEStudy>('/doe/studies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getStudy: (id: number) =>
    fetchApi<DOEStudyDetail>(`/doe/studies/${id}`),

  updateStudy: (id: number, data: Record<string, unknown>) =>
    fetchApi<DOEStudyDetail>(`/doe/studies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteStudy: (id: number) =>
    fetchApi<void>(`/doe/studies/${id}`, { method: 'DELETE' }),

  generateDesign: (id: number) =>
    fetchApi<DOERun[]>(`/doe/studies/${id}/generate`, { method: 'POST' }),

  getRuns: (id: number) =>
    fetchApi<DOERun[]>(`/doe/studies/${id}/runs`),

  updateRuns: (id: number, runs: DOERunUpdate[]) =>
    fetchApi<DOERun[]>(`/doe/studies/${id}/runs`, {
      method: 'PUT',
      body: JSON.stringify({ runs }),
    }),

  analyze: (id: number) =>
    fetchApi<DOEAnalysis>(`/doe/studies/${id}/analyze`, { method: 'POST' }),

  getAnalysis: (id: number) =>
    fetchApi<DOEAnalysis>(`/doe/studies/${id}/analysis`),

  createConfirmation: (id: number, nRuns: number = 3) =>
    fetchApi<DOEStudy>(`/doe/studies/${id}/confirmation?n_runs=${nRuns}`, {
      method: 'POST',
    }),

  analyzeConfirmation: (id: number) =>
    fetchApi<ConfirmationAnalysis>(`/doe/studies/${id}/analyze-confirmation`, {
      method: 'POST',
    }),
}
