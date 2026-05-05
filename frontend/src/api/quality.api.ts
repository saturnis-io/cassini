import type {
  CapabilityHistoryItem,
  CapabilityResult,
  CapabilitySnapshotResponse,
  DistributionFitResponse,
  NonNormalCapabilityResult,
  PaginatedResponse,
  RuleConfig,
  RulePreset,
  Violation,
  ViolationStats,
} from '@/types'
import type {
  AnomalyDashboardStats,
  AnomalyDetectorConfig,
  AnomalyEvent,
  AnomalySummary,
  DetectorStatus,
} from '@/types/anomaly'
import { fetchApi } from './client'

// Violation API
export const violationApi = {
  list: (params?: {
    acknowledged?: boolean
    requires_acknowledgement?: boolean
    severity?: string
    rule_id?: number
    characteristic_id?: number
    sample_id?: number
    plant_id?: number
    start_date?: string
    end_date?: string
    page?: number
    per_page?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.acknowledged !== undefined)
      searchParams.set('acknowledged', String(params.acknowledged))
    if (params?.requires_acknowledgement !== undefined)
      searchParams.set('requires_acknowledgement', String(params.requires_acknowledgement))
    if (params?.severity) searchParams.set('severity', params.severity)
    if (params?.rule_id) searchParams.set('rule_id', String(params.rule_id))
    if (params?.characteristic_id)
      searchParams.set('characteristic_id', String(params.characteristic_id))
    if (params?.sample_id) searchParams.set('sample_id', String(params.sample_id))
    if (params?.plant_id) searchParams.set('plant_id', String(params.plant_id))
    if (params?.start_date) searchParams.set('start_date', params.start_date)
    if (params?.end_date) searchParams.set('end_date', params.end_date)
    // Convert page/per_page to offset/limit for the backend
    const perPage = params?.per_page ?? 50
    const page = params?.page ?? 1
    searchParams.set('offset', String((page - 1) * perPage))
    searchParams.set('limit', String(perPage))

    const query = searchParams.toString()
    return fetchApi<PaginatedResponse<Violation>>(`/violations/${query ? `?${query}` : ''}`)
  },

  get: (id: number) => fetchApi<Violation>(`/violations/${id}`),

  getStats: (params?: { plant_id?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.plant_id) searchParams.set('plant_id', String(params.plant_id))
    const query = searchParams.toString()
    return fetchApi<ViolationStats>(`/violations/stats${query ? `?${query}` : ''}`)
  },

  // 21 CFR Part 11 §11.50: server derives the acknowledging user from the
  // authenticated principal. Do NOT pass `user` here — backend rejects extras.
  acknowledge: (id: number, data: { reason: string; exclude_sample?: boolean }) =>
    fetchApi<Violation>(`/violations/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  batchAcknowledge: (data: {
    violation_ids: number[]
    reason: string
    exclude_sample?: boolean
  }) =>
    fetchApi<{
      total: number
      successful: number
      failed: number
      acknowledged: number[]
      errors: Record<number, string>
    }>('/violations/batch-acknowledge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getReasonCodes: () => fetchApi<string[]>('/violations/reason-codes'),
}

// Anomaly Detection API
export const anomalyApi = {
  // Dashboard
  getDashboard: (params?: {
    plant_id?: number
    severity?: string
    limit?: number
    offset?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.plant_id) searchParams.set('plant_id', String(params.plant_id))
    if (params?.severity) searchParams.set('severity', params.severity)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.offset) searchParams.set('offset', String(params.offset))
    const query = searchParams.toString()
    return fetchApi<{ events: AnomalyEvent[]; total: number }>(
      `/anomaly/dashboard${query ? `?${query}` : ''}`,
    )
  },

  getDashboardStats: (plantId?: number) => {
    const params = plantId ? `?plant_id=${plantId}` : ''
    return fetchApi<AnomalyDashboardStats>(`/anomaly/dashboard/stats${params}`)
  },

  // Config
  getConfig: (charId: number) =>
    fetchApi<AnomalyDetectorConfig>(`/anomaly/${charId}/config`),

  updateConfig: (charId: number, data: Partial<AnomalyDetectorConfig>) =>
    fetchApi<AnomalyDetectorConfig>(`/anomaly/${charId}/config`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  resetConfig: (charId: number) =>
    fetchApi<void>(`/anomaly/${charId}/config`, { method: 'DELETE' }),

  // Events
  getEvents: (
    charId: number,
    params?: {
      severity?: string
      detector_type?: string
      limit?: number
      offset?: number
    },
  ) => {
    const searchParams = new URLSearchParams()
    if (params?.severity) searchParams.set('severity', params.severity)
    if (params?.detector_type) searchParams.set('detector_type', params.detector_type)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.offset) searchParams.set('offset', String(params.offset))
    const query = searchParams.toString()
    return fetchApi<{ events: AnomalyEvent[]; total: number }>(
      `/anomaly/${charId}/events${query ? `?${query}` : ''}`,
    )
  },

  getEvent: (charId: number, eventId: number) =>
    fetchApi<AnomalyEvent>(`/anomaly/${charId}/events/${eventId}`),

  acknowledgeEvent: (charId: number, eventId: number) =>
    fetchApi<AnomalyEvent>(`/anomaly/${charId}/events/${eventId}/acknowledge`, {
      method: 'POST',
    }),

  dismissEvent: (charId: number, eventId: number, reason: string) =>
    fetchApi<AnomalyEvent>(`/anomaly/${charId}/events/${eventId}/dismiss`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Summary & Analysis
  getSummary: (charId: number) =>
    fetchApi<AnomalySummary>(`/anomaly/${charId}/summary`),

  triggerAnalysis: (charId: number) =>
    fetchApi<{ message: string }>(`/anomaly/${charId}/analyze`, { method: 'POST' }),

  getStatus: (charId: number) =>
    fetchApi<DetectorStatus[]>(`/anomaly/${charId}/status`),
}

// Distribution Analysis API (Sprint 5 - A1)
export const distributionApi = {
  calculateNonNormal: (charId: number, method = 'auto') =>
    fetchApi<NonNormalCapabilityResult>(
      `/characteristics/${charId}/capability/nonnormal`,
      { method: 'POST', body: JSON.stringify({ method }) },
    ),

  fitDistribution: (charId: number) =>
    fetchApi<DistributionFitResponse>(
      `/characteristics/${charId}/capability/fit-distribution`,
      { method: 'POST' },
    ),

  updateConfig: (
    charId: number,
    config: {
      distribution_method?: string
      box_cox_lambda?: number
      distribution_params?: Record<string, unknown>
    },
  ) =>
    fetchApi<void>(`/characteristics/${charId}/distribution-config`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
}

// ---- Capability API ----

export const capabilityApi = {
  getCapability: (charId: number, opts?: { windowSize?: number; includeCi?: boolean }) => {
    const params = new URLSearchParams()
    if (opts?.windowSize) params.set('window_size', String(opts.windowSize))
    if (opts?.includeCi) params.set('include_ci', 'true')
    const query = params.toString()
    return fetchApi<CapabilityResult>(
      `/characteristics/${charId}/capability${query ? `?${query}` : ''}`,
    )
  },

  getHistory: (charId: number, limit?: number) => {
    const params = new URLSearchParams()
    if (limit) params.set('limit', String(limit))
    const query = params.toString()
    return fetchApi<CapabilityHistoryItem[]>(
      `/characteristics/${charId}/capability/history${query ? `?${query}` : ''}`,
    )
  },

  saveSnapshot: (charId: number, windowSize?: number) => {
    const params = new URLSearchParams()
    if (windowSize) params.set('window_size', String(windowSize))
    const query = params.toString()
    return fetchApi<CapabilitySnapshotResponse>(
      `/characteristics/${charId}/capability/snapshot${query ? `?${query}` : ''}`,
      { method: 'POST' },
    )
  },
}

// Rule Preset API (Sprint 5 - A2)
export const rulePresetApi = {
  list: (plantId?: number) => {
    const params = plantId ? `?plant_id=${plantId}` : ''
    return fetchApi<RulePreset[]>(`/rule-presets${params}`)
  },
  get: (id: number) => fetchApi<RulePreset>(`/rule-presets/${id}`),
  create: (data: { name: string; description?: string; rules_config: RuleConfig[]; plant_id?: number }) =>
    fetchApi<RulePreset>('/rule-presets', { method: 'POST', body: JSON.stringify(data) }),
  applyToCharacteristic: (charId: number, presetId: number) =>
    fetchApi<void>(`/characteristics/${charId}/rules/preset`, {
      method: 'PUT',
      body: JSON.stringify({ preset_id: presetId }),
    }),
}
