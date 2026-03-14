import { fetchApi } from './client'

// ---- Prediction Types ----

export interface PredictionConfig {
  characteristic_id: number
  is_enabled: boolean
  model_type: string
  forecast_horizon: number
  refit_interval: number
  confidence_levels: number[]
}

export interface PredictionModel {
  id: number
  characteristic_id: number
  model_type: string
  model_params: Record<string, unknown> | null
  aic: number | null
  training_samples: number | null
  fitted_at: string
  is_current: boolean
}

export interface ForecastPoint {
  step: number
  predicted_value: number
  lower_80?: number
  upper_80?: number
  lower_95?: number
  upper_95?: number
  predicted_ooc?: boolean
}

export interface ForecastResult {
  characteristic_id: number
  points: ForecastPoint[]
  generated_at: string
  model_type: string
  predicted_ooc_step: number | null
  aic?: number | null
}

export interface PredictionDashboardItem {
  characteristic_id: number
  characteristic_name: string
  is_enabled: boolean
  model_type: string | null
  aic: number | null
  last_trained: string | null
  training_samples: number
  has_forecast: boolean
  predicted_ooc: boolean
}

export interface IntervalStats {
  median_width_80: number
  median_width_95: number
  width_trend: 'widening' | 'stable' | 'narrowing'
  sigma_ratio: number
  horizon_recommendation: number | null
  interpretation: string
}

export interface PredictionHistoryEntry {
  characteristic_id: number
  model_type: string
  generated_at: string
  points: ForecastPoint[]
  predicted_ooc_step: number | null
}

// ---- AI Types ----

export interface AIConfig {
  plant_id: number
  provider_type: string
  has_api_key: boolean
  model_name: string
  max_tokens: number
  is_enabled: boolean
  base_url?: string | null
  azure_resource_name?: string | null
  azure_deployment_id?: string | null
  azure_api_version?: string | null
}

export interface AIInsight {
  id: number
  characteristic_id: number
  summary: string
  patterns: string[]
  risks: string[]
  recommendations: string[]
  provider: string
  model: string
  tokens_used: number
  latency_ms: number
  created_at: string
}

export interface AITestResult {
  success: boolean
  message: string
  latency_ms: number | null
}

// ---- Prediction API ----

export const predictionApi = {
  dashboard: (plantId: number) =>
    fetchApi<PredictionDashboardItem[]>(`/predictions/dashboard?plant_id=${plantId}`),

  getConfig: (charId: number) =>
    fetchApi<PredictionConfig>(`/predictions/${charId}/config`),

  updateConfig: (charId: number, data: {
    is_enabled?: boolean
    model_type?: string
    forecast_horizon?: number
    refit_interval?: number
    confidence_levels?: number[]
  }) => fetchApi<PredictionConfig>(`/predictions/${charId}/config`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  train: (charId: number) =>
    fetchApi<PredictionModel>(`/predictions/${charId}/train`, { method: 'POST' }),

  getModel: (charId: number) =>
    fetchApi<PredictionModel>(`/predictions/${charId}/model`),

  getForecast: (charId: number) =>
    fetchApi<ForecastResult>(`/predictions/${charId}/forecast`),

  generateForecast: (charId: number) =>
    fetchApi<ForecastResult>(`/predictions/${charId}/forecast`, { method: 'POST' }),

  getHistory: (charId: number, limit?: number) =>
    fetchApi<PredictionHistoryEntry[]>(`/predictions/${charId}/history?limit=${limit ?? 5}`),

  getIntervalStats: (charId: number) =>
    fetchApi<IntervalStats>(`/predictions/${charId}/interval-stats`),
}

// ---- AI API ----

export const aiApi = {
  getConfig: (plantId: number) =>
    fetchApi<AIConfig>(`/ai/config?plant_id=${plantId}`),

  updateConfig: (plantId: number, data: {
    provider_type?: string
    api_key?: string
    model_name?: string
    max_tokens?: number
    is_enabled?: boolean
    base_url?: string | null
    azure_resource_name?: string | null
    azure_deployment_id?: string | null
    azure_api_version?: string | null
  }) => fetchApi<AIConfig>(`/ai/config?plant_id=${plantId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  test: (plantId: number) =>
    fetchApi<AITestResult>(`/ai/test?plant_id=${plantId}`, {
      method: 'POST',
    }),

  analyze: (charId: number) =>
    fetchApi<AIInsight>(`/ai/analyze/${charId}`, { method: 'POST' }),

  getLatestInsight: (charId: number) =>
    fetchApi<AIInsight>(`/ai/insights/${charId}`),

  getInsightHistory: (charId: number, limit?: number) =>
    fetchApi<AIInsight[]>(`/ai/insights/${charId}/history?limit=${limit ?? 10}`),
}
