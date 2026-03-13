import { fetchApi } from './client'

// ---- DOE API ----

export interface DOEFactor {
  name: string
  low_level: number
  high_level: number
  unit?: string
}

export interface DOEStudyCreate {
  name: string
  plant_id: number
  design_type: string
  resolution?: number
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
}

export interface DOEInteraction {
  factor_indices: number[]
  factor_names: string[]
  effect: number
}

export interface DOEAnalysis {
  anova_table: DOEANOVARow[]
  effects: DOEEffect[]
  interactions: DOEInteraction[]
  r_squared: number
  adj_r_squared: number
  grand_mean: number
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
}
