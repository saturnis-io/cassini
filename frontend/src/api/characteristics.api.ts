import type {
  Annotation,
  AnnotationCreate,
  AnnotationType,
  AnnotationUpdate,
  Characteristic,
  ChartData,
  PaginatedResponse,
  Sample,
  SampleEditHistory,
  SampleProcessingResult,
} from '@/types'
import type { CharacteristicConfigResponse } from './client'
import { fetchApi } from './client'

// Characteristic API
export const characteristicApi = {
  list: (params?: {
    hierarchy_id?: number
    in_control?: boolean
    plant_id?: number
    page?: number
    per_page?: number
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.hierarchy_id) searchParams.set('hierarchy_id', String(params.hierarchy_id))
    if (params?.in_control !== undefined) searchParams.set('in_control', String(params.in_control))
    if (params?.plant_id) searchParams.set('plant_id', String(params.plant_id))
    if (params?.page) searchParams.set('page', String(params.page))
    if (params?.per_page) searchParams.set('per_page', String(params.per_page))

    const query = searchParams.toString()
    return fetchApi<PaginatedResponse<Characteristic>>(
      `/characteristics/${query ? `?${query}` : ''}`,
    )
  },

  get: (id: number) => fetchApi<Characteristic>(`/characteristics/${id}`),

  create: (data: Partial<Characteristic>) =>
    fetchApi<Characteristic>('/characteristics/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<Characteristic> & { change_reason?: string }) =>
    fetchApi<Characteristic>(`/characteristics/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: number) => fetchApi<void>(`/characteristics/${id}`, { method: 'DELETE' }),

  getChartData: (
    id: number,
    options?: {
      limit?: number
      startDate?: string
      endDate?: string
      materialId?: number
      chartType?: string
    },
  ) => {
    const params = new URLSearchParams()
    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.startDate) params.set('start_date', options.startDate)
    if (options?.endDate) params.set('end_date', options.endDate)
    if (options?.materialId) params.set('material_id', String(options.materialId))
    if (options?.chartType) params.set('chart_type', options.chartType)
    const query = params.toString()
    return fetchApi<ChartData>(`/characteristics/${id}/chart-data${query ? `?${query}` : ''}`)
  },

  recalculateLimits: (
    id: number,
    options?: {
      excludeOoc?: boolean
      startDate?: string
      endDate?: string
      lastN?: number
    },
  ) => {
    const params = new URLSearchParams()
    if (options?.excludeOoc !== undefined) params.set('exclude_ooc', String(options.excludeOoc))
    if (options?.startDate) params.set('start_date', options.startDate)
    if (options?.endDate) params.set('end_date', options.endDate)
    if (options?.lastN) params.set('last_n', String(options.lastN))
    const query = params.toString()
    return fetchApi<{ before: object; after: object; calculation: object }>(
      `/characteristics/${id}/recalculate-limits${query ? `?${query}` : ''}`,
      { method: 'POST' },
    )
  },

  setManualLimits: (
    id: number,
    data: {
      ucl: number
      lcl: number
      center_line: number
      sigma: number
      change_reason?: string
    },
  ) =>
    fetchApi<{ before: object; after: object; calculation: object }>(
      `/characteristics/${id}/set-limits`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    ),

  getRules: async (id: number) => {
    // Backend returns [{rule_id, is_enabled, require_acknowledgement, parameters}, ...]
    const rules = await fetchApi<
      { rule_id: number; is_enabled: boolean; require_acknowledgement: boolean; parameters: Record<string, number> | null }[]
    >(`/characteristics/${id}/rules`)
    return {
      enabled_rules: rules.filter((r) => r.is_enabled).map((r) => r.rule_id),
      rule_configs: rules,
    }
  },

  updateRules: (
    id: number,
    ruleConfigs: { rule_id: number; is_enabled: boolean; require_acknowledgement: boolean; parameters?: Record<string, number> | null }[],
  ) => {
    // Backend expects array of {rule_id, is_enabled, require_acknowledgement, parameters} for all 8 rules
    // Fill in any missing rules with defaults
    const allRules = Array.from({ length: 8 }, (_, i) => {
      const config = ruleConfigs.find((r) => r.rule_id === i + 1)
      return config || { rule_id: i + 1, is_enabled: true, require_acknowledgement: true, parameters: null }
    })
    return fetchApi<{ rule_id: number; is_enabled: boolean; require_acknowledgement: boolean; parameters: Record<string, number> | null }[]>(
      `/characteristics/${id}/rules`,
      {
        method: 'PUT',
        body: JSON.stringify(allRules),
      },
    )
  },

  changeMode: (id: number, newMode: string, changeReason?: string) =>
    fetchApi<{
      previous_mode: string
      new_mode: string
      samples_migrated: number
      characteristic: Characteristic
    }>(`/characteristics/${id}/change-mode`, {
      method: 'POST',
      body: JSON.stringify({ new_mode: newMode, change_reason: changeReason }),
    }),

  freezeLimits: (id: number) =>
    fetchApi<{
      status: string
      limits_frozen: boolean
      limits_frozen_at: string
      limits_frozen_by: string
    }>(`/characteristics/${id}/freeze-limits`, { method: 'POST' }),

  unfreezeLimits: (id: number) =>
    fetchApi<{
      status: string
      limits_frozen: boolean
      limits_frozen_at: null
      limits_frozen_by: null
    }>(`/characteristics/${id}/unfreeze-limits`, { method: 'POST' }),

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
    /** Items per page (maps to backend limit) */
    per_page?: number
    /** Sort direction for timestamp ordering */
    sort_dir?: 'asc' | 'desc'
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.characteristic_id)
      searchParams.set('characteristic_id', String(params.characteristic_id))
    if (params?.start_date) searchParams.set('start_date', params.start_date)
    if (params?.end_date) searchParams.set('end_date', params.end_date)
    if (params?.include_excluded) searchParams.set('include_excluded', 'true')
    // Convert page/per_page to offset/limit for the backend
    const perPage = params?.per_page ?? 100
    const page = params?.page ?? 1
    searchParams.set('offset', String((page - 1) * perPage))
    searchParams.set('limit', String(perPage))
    if (params?.sort_dir) searchParams.set('sort_dir', params.sort_dir)

    const query = searchParams.toString()
    return fetchApi<PaginatedResponse<Sample>>(`/samples/${query ? `?${query}` : ''}`)
  },

  get: (id: number) => fetchApi<Sample>(`/samples/${id}`),

  submit: (data: {
    characteristic_id: number
    measurements: number[]
    material_id?: number
    batch_number?: string
    operator_id?: string
  }) =>
    fetchApi<SampleProcessingResult>('/samples/', {
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

  delete: (id: number) => fetchApi<void>(`/samples/${id}`, { method: 'DELETE' }),

  update: (id: number, data: { measurements: number[]; reason: string; edited_by?: string }) =>
    fetchApi<SampleProcessingResult>(`/samples/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  getEditHistory: (id: number) => fetchApi<SampleEditHistory[]>(`/samples/${id}/history`),
}

// Data Entry API — attribute chart data submission
export const dataEntryApi = {
  submitAttribute: (data: {
    characteristic_id: number
    defect_count: number
    sample_size?: number
    units_inspected?: number
    material_id?: number
    batch_number?: string
    operator_id?: string
  }) =>
    fetchApi<{
      sample_id: number
      characteristic_id: number
      timestamp: string
      plotted_value: number
      defect_count: number
      sample_size: number | null
      in_control: boolean
      center_line: number
      ucl: number
      lcl: number
      violations: { violation_id: number; rule_id: number; rule_name: string; severity: string }[]
    }>('/data-entry/submit-attribute', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

// Annotation API
export const annotationApi = {
  list: (characteristicId: number, type?: AnnotationType) =>
    fetchApi<Annotation[]>(
      `/characteristics/${characteristicId}/annotations${type ? `?annotation_type=${type}` : ''}`,
    ),

  create: (characteristicId: number, data: AnnotationCreate) =>
    fetchApi<Annotation>(`/characteristics/${characteristicId}/annotations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (characteristicId: number, annotationId: number, data: AnnotationUpdate) =>
    fetchApi<Annotation>(`/characteristics/${characteristicId}/annotations/${annotationId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (characteristicId: number, annotationId: number) =>
    fetchApi<void>(`/characteristics/${characteristicId}/annotations/${annotationId}`, {
      method: 'DELETE',
    }),
}
