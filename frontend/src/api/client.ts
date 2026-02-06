import type {
  AuthUser,
  BrokerConnectionStatus,
  BrokerTestResult,
  Characteristic,
  ChartData,
  HierarchyNode,
  LoginResponse,
  MQTTBroker,
  PaginatedResponse,
  Plant,
  PlantCreate,
  PlantUpdate,
  ProviderStatus,
  RefreshResponse,
  Sample,
  SampleEditHistory,
  SampleProcessingResult,
  TagProviderStatus,
  Violation,
  ViolationStats,
} from '@/types'
import type { ScheduleConfig } from '@/components/ScheduleConfigSection'

// Characteristic configuration response type
export interface CharacteristicConfigResponse {
  characteristic_id: number
  config: {
    config_type: 'MANUAL' | 'TAG'
    // ManualConfig fields
    instructions?: string
    schedule?: ScheduleConfig
    grace_period_minutes?: number
    // TagConfig fields
    source_tag_path?: string
    trigger?: {
      trigger_type: 'ON_UPDATE' | 'ON_EVENT' | 'ON_VALUE_CHANGE'
      [key: string]: unknown
    }
    batch_tag_path?: string
    min_valid_value?: number
    max_valid_value?: number
  }
  is_active: boolean
}

const API_BASE = '/api/v1'

// Access token stored in memory only (not localStorage)
let accessToken: string | null = null
let isRefreshing = false

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> || {}),
  }

  // Attach Bearer token if available
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Send cookies for refresh token
  })

  // Handle 401 with automatic token refresh (avoid retry on auth endpoints)
  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    if (!isRefreshing) {
      isRefreshing = true
      try {
        const refreshResult = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (refreshResult.ok) {
          const data: RefreshResponse = await refreshResult.json()
          accessToken = data.access_token
          isRefreshing = false

          // Retry original request with new token
          headers['Authorization'] = `Bearer ${accessToken}`
          const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
            credentials: 'include',
          })
          if (!retryResponse.ok) {
            const error = await retryResponse.json().catch(() => ({ detail: 'Unknown error' }))
            throw new Error(typeof error.detail === 'string' ? error.detail : `HTTP ${retryResponse.status}`)
          }
          if (retryResponse.status === 204) return undefined as T
          return retryResponse.json()
        } else {
          // Refresh failed - force logout
          accessToken = null
          isRefreshing = false
          window.dispatchEvent(new CustomEvent('auth:logout'))
          throw new Error('Session expired')
        }
      } catch (e) {
        isRefreshing = false
        if ((e as Error).message === 'Session expired') throw e
        accessToken = null
        window.dispatchEvent(new CustomEvent('auth:logout'))
        throw new Error('Session expired')
      }
    }
  }

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

// Auth API
export const authApi = {
  login: (username: string, password: string, rememberMe?: boolean) =>
    fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, remember_me: rememberMe ?? false }),
      credentials: 'include',
    }).then(async (res) => {
      if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: 'Login failed' }))
        throw new Error(typeof error.detail === 'string' ? error.detail : 'Login failed')
      }
      return res.json() as Promise<LoginResponse>
    }),

  refresh: () =>
    fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).then(async (res) => {
      if (!res.ok) throw new Error('Refresh failed')
      return res.json() as Promise<RefreshResponse>
    }),

  logout: () =>
    fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).then(async (res) => {
      if (!res.ok) throw new Error('Logout failed')
      return res.json()
    }),

  me: () => fetchApi<AuthUser>('/auth/me'),
}

// Plant API
export const plantApi = {
  list: (activeOnly?: boolean) => {
    const params = activeOnly ? '?active_only=true' : ''
    return fetchApi<Plant[]>(`/plants/${params}`)
  },

  get: (id: number) => fetchApi<Plant>(`/plants/${id}`),

  create: (data: PlantCreate) =>
    fetchApi<Plant>('/plants/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: PlantUpdate) =>
    fetchApi<Plant>(`/plants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/plants/${id}`, { method: 'DELETE' }),
}

// Hierarchy API
export const hierarchyApi = {
  // Global endpoints (backward compatibility)
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

  // Plant-scoped endpoints
  getTreeByPlant: (plantId: number) =>
    fetchApi<HierarchyNode[]>(`/plants/${plantId}/hierarchies/`),

  createNodeInPlant: (plantId: number, data: { name: string; type: string; parent_id: number | null }) =>
    fetchApi<HierarchyNode>(`/plants/${plantId}/hierarchies/`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
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
    // Backend returns [{rule_id, is_enabled, require_acknowledgement}, ...]
    const rules = await fetchApi<{ rule_id: number; is_enabled: boolean; require_acknowledgement: boolean }[]>(`/characteristics/${id}/rules`)
    return {
      enabled_rules: rules.filter(r => r.is_enabled).map(r => r.rule_id),
      rule_configs: rules,
    }
  },

  updateRules: (id: number, ruleConfigs: { rule_id: number; is_enabled: boolean; require_acknowledgement: boolean }[]) => {
    // Backend expects array of {rule_id, is_enabled, require_acknowledgement} for all 8 rules
    // Fill in any missing rules with defaults
    const allRules = Array.from({ length: 8 }, (_, i) => {
      const config = ruleConfigs.find(r => r.rule_id === i + 1)
      return config || { rule_id: i + 1, is_enabled: true, require_acknowledgement: true }
    })
    return fetchApi<{ rule_id: number; is_enabled: boolean; require_acknowledgement: boolean }[]>(`/characteristics/${id}/rules`, {
      method: 'PUT',
      body: JSON.stringify(allRules),
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

  getConfig: (id: number) =>
    fetchApi<CharacteristicConfigResponse | null>(`/characteristics/${id}/config`),

  updateConfig: (id: number, config: object) =>
    fetchApi<CharacteristicConfigResponse>(`/characteristics/${id}/config`, {
      method: 'PUT',
      body: JSON.stringify({ config }),
    }),
}

// Sample API
export const sampleApi = {
  list: (params?: {
    characteristic_id?: number
    start_date?: string
    end_date?: string
    /** Include excluded samples in results */
    include_excluded?: boolean
    /** Page number (1-indexed, converted to offset internally) */
    page?: number
    /** Items per page (maps to limit) */
    per_page?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.characteristic_id) searchParams.set('characteristic_id', String(params.characteristic_id))
    if (params?.start_date) searchParams.set('start_date', params.start_date)
    if (params?.end_date) searchParams.set('end_date', params.end_date)
    if (params?.include_excluded) searchParams.set('include_excluded', 'true')
    // Backend uses offset/limit, convert from page/per_page
    const limit = params?.per_page ?? 100
    const offset = params?.page ? (params.page - 1) * limit : 0
    searchParams.set('offset', String(offset))
    searchParams.set('limit', String(limit))

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

  update: (id: number, data: { measurements: number[]; reason: string; edited_by?: string }) =>
    fetchApi<SampleProcessingResult>(`/samples/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getEditHistory: (id: number) =>
    fetchApi<SampleEditHistory[]>(`/samples/${id}/history`),
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

// User Management types
export interface UserResponse {
  id: number
  username: string
  email: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  plant_roles: {
    plant_id: number
    plant_name: string
    plant_code: string
    role: string
  }[]
}

// User Management API
export const userApi = {
  list: (params?: { search?: string; active_only?: boolean }) => {
    const searchParams = new URLSearchParams()
    if (params?.search) searchParams.set('search', params.search)
    if (params?.active_only) searchParams.set('active_only', 'true')
    const query = searchParams.toString()
    return fetchApi<UserResponse[]>(`/users/${query ? `?${query}` : ''}`)
  },

  get: (id: number) => fetchApi<UserResponse>(`/users/${id}`),

  create: (data: { username: string; password: string; email?: string }) =>
    fetchApi<UserResponse>('/users/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: { username?: string; email?: string; password?: string; is_active?: boolean }) =>
    fetchApi<UserResponse>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deactivate: (id: number) =>
    fetchApi<void>(`/users/${id}`, { method: 'DELETE' }),

  assignRole: (userId: number, data: { plant_id: number; role: string }) =>
    fetchApi<UserResponse>(`/users/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  removeRole: (userId: number, plantId: number) =>
    fetchApi<void>(`/users/${userId}/roles/${plantId}`, { method: 'DELETE' }),
}
