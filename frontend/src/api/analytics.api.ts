import { fetchApi } from './client'

// Multivariate SPC API
export const multivariateApi = {
  listGroups: (plantId: number) =>
    fetchApi(`/multivariate/groups?plant_id=${plantId}`),

  createGroup: (data: {
    name: string
    plant_id: number
    characteristic_ids: number[]
    chart_type?: string
    lambda_param?: number
    alpha?: number
    description?: string
  }) =>
    fetchApi('/multivariate/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getGroup: (id: number) =>
    fetchApi(`/multivariate/groups/${id}`),

  updateGroup: (id: number, data: Record<string, unknown>) =>
    fetchApi(`/multivariate/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteGroup: (id: number) =>
    fetchApi(`/multivariate/groups/${id}`, { method: 'DELETE' }),

  computeChart: (id: number) =>
    fetchApi(`/multivariate/groups/${id}/compute`, { method: 'POST' }),

  getChartData: (
    id: number,
    params?: { limit?: number; start_date?: string; end_date?: string },
  ) => {
    const sp = new URLSearchParams()
    if (params?.limit) sp.set('limit', String(params.limit))
    if (params?.start_date) sp.set('start_date', params.start_date)
    if (params?.end_date) sp.set('end_date', params.end_date)
    const query = sp.toString()
    return fetchApi(`/multivariate/groups/${id}/chart-data${query ? `?${query}` : ''}`)
  },

  freezePhaseI: (id: number) =>
    fetchApi(`/multivariate/groups/${id}/freeze`, { method: 'POST' }),
}

// Correlation API
export const correlationApi = {
  compute: (data: {
    characteristic_ids: number[]
    method?: string
    include_pca?: boolean
    plant_id: number
  }) =>
    fetchApi('/multivariate/correlation/compute', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listResults: (plantId: number, limit?: number) =>
    fetchApi(
      `/multivariate/correlation/results?plant_id=${plantId}&limit=${limit ?? 10}`,
    ),

  getResult: (id: number) =>
    fetchApi(`/multivariate/correlation/results/${id}`),

  computePCA: (data: { characteristic_ids: number[]; plant_id: number }) =>
    fetchApi('/multivariate/correlation/compute-pca', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}
