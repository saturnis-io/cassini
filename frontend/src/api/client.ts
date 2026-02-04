import type {
  Characteristic,
  CharacteristicSummary,
  ChartData,
  HierarchyNode,
  PaginatedResponse,
  Sample,
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
    fetchApi<CharacteristicSummary[]>(`/hierarchy/${id}/characteristics`),
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
    return fetchApi<PaginatedResponse<CharacteristicSummary>>(`/characteristics/${query ? `?${query}` : ''}`)
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

  getChartData: (id: number, limit?: number) => {
    const params = limit ? `?limit=${limit}` : ''
    return fetchApi<ChartData>(`/characteristics/${id}/chart-data${params}`)
  },

  recalculateLimits: (id: number, excludeOoc?: boolean) =>
    fetchApi<{ before: object; after: object }>(`/characteristics/${id}/recalculate-limits`, {
      method: 'POST',
      body: JSON.stringify({ exclude_ooc: excludeOoc ?? true }),
    }),

  getRules: (id: number) =>
    fetchApi<{ enabled_rules: number[] }>(`/characteristics/${id}/rules`),

  updateRules: (id: number, enabledRules: number[]) =>
    fetchApi<{ enabled_rules: number[] }>(`/characteristics/${id}/rules`, {
      method: 'PUT',
      body: JSON.stringify({ enabled_rules: enabledRules }),
    }),

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
    fetchApi<{ sample: Sample; violations: Violation[] }>('/samples', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  exclude: (id: number, excluded: boolean) =>
    fetchApi<Sample>(`/samples/${id}/exclude`, {
      method: 'PATCH',
      body: JSON.stringify({ excluded }),
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
