import type {
  BrokerConnectionStatus,
  BrokerTestResult,
  Characteristic,
  ChartData,
  HierarchyNode,
  MQTTBroker,
  PaginatedResponse,
  ProviderStatus,
  Sample,
  SampleProcessingResult,
  TagProviderStatus,
  Violation,
  ViolationStats,
} from '@/types'

const API_BASE = '/api/v1'

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    // Handle Pydantic validation errors (array of errors) and standard errors
    let message = 'Unknown error'
    if (typeof error.detail === 'string') {
      message = error.detail
    } else if (Array.isArray(error.detail)) {
      // Pydantic validation error format: [{loc: [...], msg: "...", type: "..."}]
      message = error.detail.map((e: { msg: string; loc?: string[] }) =>
        e.loc ? `${e.loc.join('.')}: ${e.msg}` : e.msg
      ).join('; ')
    } else if (error.detail) {
      message = JSON.stringify(error.detail)
    }
    throw new Error(message || `HTTP ${response.status}`)
  }

  // Handle 204 No Content responses (e.g., DELETE operations)
  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

// Hierarchy API
export const hierarchyApi = {
  getTree: () => fetchApi<HierarchyNode[]>('/hierarchy/'),

  getNode: (id: number) => fetchApi<HierarchyNode>(`/hierarchy/${id}`),

  createNode: (data: { name: string; type: string; parent_id: number | null }) =>
    fetchApi<HierarchyNode>('/hierarchy/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateNode: (id: number, data: { name?: string }) =>
    fetchApi<HierarchyNode>(`/hierarchy/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteNode: (id: number) =>
    fetchApi<void>(`/hierarchy/${id}`, { method: 'DELETE' }),

  getCharacteristics: (id: number) =>
    fetchApi<Characteristic[]>(`/hierarchy/${id}/characteristics`),
}

// Characteristic API
export const characteristicApi = {
  list: (params?: {
    hierarchy_id?: number
    provider_type?: string
    in_control?: boolean
    page?: number
    per_page?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.hierarchy_id) searchParams.set('hierarchy_id', String(params.hierarchy_id))
    if (params?.provider_type) searchParams.set('provider_type', params.provider_type)
    if (params?.in_control !== undefined) searchParams.set('in_control', String(params.in_control))
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.per_page) searchParams.set('per_page', String(params.per_page))

    const query = searchParams.toString()
    return fetchApi<PaginatedResponse<Characteristic>>(`/characteristics/${query ? `?${query}` : ''}`)
  },

  get: (id: number) => fetchApi<Characteristic>(`/characteristics/${id}`),

  create: (data: Partial<Characteristic>) =>
    fetchApi<Characteristic>('/characteristics/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<Characteristic>) =>
    fetchApi<Characteristic>(`/characteristics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/characteristics/${id}`, { method: 'DELETE' }),

  getChartData: (id: number, options?: {
    limit?: number
    startDate?: string
    endDate?: string
  }) => {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.startDate) params.set('start_date', options.startDate)
    if (options?.endDate) params.set('end_date', options.endDate)
    const query = params.toString()
    return fetchApi<ChartData>(`/characteristics/${id}/chart-data${query ? `?${query}` : ''}`)
  },

  recalculateLimits: (id: number, excludeOoc?: boolean) =>
    fetchApi<{ before: object; after: object }>(`/characteristics/${id}/recalculate-limits`, {
      method: 'POST',
      body: JSON.stringify({ exclude_ooc: excludeOoc ?? true }),
    }),

  getRules: async (id: number) => {
    // Backend returns [{rule_id, is_enabled}, ...], transform to {enabled_rules: number[]}
    const rules = await fetchApi<{ rule_id: number; is_enabled: boolean }[]>(`/characteristics/${id}/rules`)
    return {
      enabled_rules: rules.filter(r => r.is_enabled).map(r => r.rule_id)
    }
  },

  updateRules: (id: number, enabledRules: number[]) => {
    // Backend expects array of {rule_id, is_enabled} for all 8 rules
    const rulesPayload = Array.from({ length: 8 }, (_, i) => ({
      rule_id: i + 1,
      is_enabled: enabledRules.includes(i + 1),
    }))
    return fetchApi<{ rule_id: number; is_enabled: boolean }[]>(`/characteristics/${id}/rules`, {
      method: 'PUT',
      body: JSON.stringify(rulesPayload),
    })
  },

  changeMode: (id: number, newMode: string) =>
    fetchApi<{
      previous_mode: string
      new_mode: string
      samples_migrated: number
      characteristic: Characteristic
    }>(`/characteristics/${id}/change-mode`, {
      method: 'POST',
      body: JSON.stringify({ new_mode: newMode }),
    }),
}

// Sample API
export const sampleApi = {
  list: (params?: {
    characteristic_id?: number
    start_date?: string
    end_date?: string
    page?: number
    per_page?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.characteristic_id) searchParams.set('characteristic_id', String(params.characteristic_id))
    if (params?.start_date) searchParams.set('start_date', params.start_date)
    if (params?.end_date) searchParams.set('end_date', params.end_date)
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.per_page) searchParams.set('per_page', String(params.per_page))

    const query = searchParams.toString()
    return fetchApi<PaginatedResponse<Sample>>(`/samples${query ? `?${query}` : ''}`)
  },

  get: (id: number) => fetchApi<Sample>(`/samples/${id}`),

  submit: (data: { characteristic_id: number; measurements: number[] }) =>
    fetchApi<SampleProcessingResult>('/samples', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  exclude: (id: number, excluded: boolean) =>
    fetchApi<Sample>(`/samples/${id}/exclude`, {
      method: 'PATCH',
      body: JSON.stringify({ is_excluded: excluded }),
    }),

  batchImport: (data: {
    characteristic_id: number
    samples: { measurements: number[]; timestamp?: string }[]
    skip_rule_evaluation?: boolean
  }) =>
    fetchApi<{ imported: number; errors: string[] }>('/samples/batch', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/samples/${id}`, { method: 'DELETE' }),

  update: (id: number, data: { measurements: number[] }) =>
    fetchApi<SampleProcessingResult>(`/samples/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}

// Violation API
export const violationApi = {
  list: (params?: {
    acknowledged?: boolean
    severity?: string
    rule_id?: number
    characteristic_id?: number
    start_date?: string
    end_date?: string
    page?: number
    per_page?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.acknowledged !== undefined) searchParams.set('acknowledged', String(params.acknowledged))
    if (params?.severity) searchParams.set('severity', params.severity)
    if (params?.rule_id) searchParams.set('rule_id', String(params.rule_id))
    if (params?.characteristic_id) searchParams.set('characteristic_id', String(params.characteristic_id))
    if (params?.start_date) searchParams.set('start_date', params.start_date)
    if (params?.end_date) searchParams.set('end_date', params.end_date)
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.per_page) searchParams.set('per_page', String(params.per_page))

    const query = searchParams.toString()
    return fetchApi<PaginatedResponse<Violation>>(`/violations${query ? `?${query}` : ''}`)
  },

  get: (id: number) => fetchApi<Violation>(`/violations/${id}`),

  getStats: () => fetchApi<ViolationStats>('/violations/stats'),

  acknowledge: (id: number, data: { reason: string; user: string }) =>
    fetchApi<Violation>(`/violations/${id}/acknowledge`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  batchAcknowledge: (data: { violation_ids: number[]; reason: string; user: string }) =>
    fetchApi<{ acknowledged: number[]; errors: Record<number, string> }>('/violations/batch-acknowledge', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// MQTT Broker API
export const brokerApi = {
  list: (activeOnly?: boolean) => {
    const params = activeOnly ? '?active_only=true' : ''
    return fetchApi<PaginatedResponse<MQTTBroker>>(`/brokers/${params}`)
  },

  get: (id: number) => fetchApi<MQTTBroker>(`/brokers/${id}`),

  create: (data: {
    name: string
    host: string
    port?: number
    username?: string
    password?: string
    client_id?: string
    keepalive?: number
    use_tls?: boolean
    is_active?: boolean
  }) =>
    fetchApi<MQTTBroker>('/brokers/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<MQTTBroker & { password?: string }>) =>
    fetchApi<MQTTBroker>(`/brokers/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/brokers/${id}`, { method: 'DELETE' }),

  activate: (id: number) =>
    fetchApi<MQTTBroker>(`/brokers/${id}/activate`, { method: 'POST' }),

  getStatus: (id: number) =>
    fetchApi<BrokerConnectionStatus>(`/brokers/${id}/status`),

  getCurrentStatus: () =>
    fetchApi<BrokerConnectionStatus>('/brokers/current/status'),

  connect: (id: number) =>
    fetchApi<BrokerConnectionStatus>(`/brokers/${id}/connect`, { method: 'POST' }),

  disconnect: () =>
    fetchApi<{ message: string }>('/brokers/disconnect', { method: 'POST' }),

  test: (data: {
    host: string
    port?: number
    username?: string
    password?: string
    use_tls?: boolean
  }) =>
    fetchApi<BrokerTestResult>('/brokers/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// Provider Status API
export const providerApi = {
  getStatus: () => fetchApi<ProviderStatus>('/providers/status'),

  restartTagProvider: () =>
    fetchApi<TagProviderStatus>('/providers/tag/restart', { method: 'POST' }),

  refreshTagSubscriptions: () =>
    fetchApi<{ message: string; characteristics_count: number }>('/providers/tag/refresh', { method: 'POST' }),
}

// API Key types
export interface APIKeyResponse {
  id: string
  name: string
  created_at: string
  expires_at: string | null
  rate_limit_per_minute: number
  is_active: boolean
  last_used_at: string | null
}

export interface APIKeyCreateResponse extends APIKeyResponse {
  key: string // Only returned on creation
}

// API Keys API
export const apiKeysApi = {
  list: () => fetchApi<APIKeyResponse[]>('/api-keys/'),

  get: (id: string) => fetchApi<APIKeyResponse>(`/api-keys/${id}`),

  create: (data: { name: string; expires_at?: string | null; rate_limit_per_minute?: number }) =>
    fetchApi<APIKeyCreateResponse>('/api-keys/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; is_active?: boolean; rate_limit_per_minute?: number }) =>
    fetchApi<APIKeyResponse>(`/api-keys/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<void>(`/api-keys/${id}`, { method: 'DELETE' }),

  revoke: (id: string) =>
    fetchApi<APIKeyResponse>(`/api-keys/${id}/revoke`, { method: 'POST' }),
}
