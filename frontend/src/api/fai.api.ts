import type {
  FAIItem,
  FAIItemCreate,
  FAIReport,
  FAIReportCreate,
  FAIReportDetail,
} from './client'
import { fetchApi } from './client'

// ---- FAI API ----

export const faiApi = {
  listReports: (params?: { plant_id?: number; status?: string }) => {
    const searchParams = new URLSearchParams()
    if (params?.plant_id) searchParams.set('plant_id', String(params.plant_id))
    if (params?.status) searchParams.set('status', params.status)
    const query = searchParams.toString()
    return fetchApi<FAIReport[]>(`/fai/reports${query ? `?${query}` : ''}`)
  },

  getReport: (id: number) => fetchApi<FAIReportDetail>(`/fai/reports/${id}`),

  createReport: (data: FAIReportCreate) =>
    fetchApi<FAIReport>('/fai/reports', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateReport: (id: number, data: Partial<FAIReportCreate>) =>
    fetchApi<FAIReport>(`/fai/reports/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteReport: (id: number) =>
    fetchApi<void>(`/fai/reports/${id}`, { method: 'DELETE' }),

  addItem: (reportId: number, data: FAIItemCreate) =>
    fetchApi<FAIItem>(`/fai/reports/${reportId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateItem: (reportId: number, itemId: number, data: Partial<FAIItemCreate>) =>
    fetchApi<FAIItem>(`/fai/reports/${reportId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteItem: (reportId: number, itemId: number) =>
    fetchApi<void>(`/fai/reports/${reportId}/items/${itemId}`, { method: 'DELETE' }),

  submit: (reportId: number) =>
    fetchApi<FAIReport>(`/fai/reports/${reportId}/submit`, { method: 'POST' }),

  approve: (reportId: number) =>
    fetchApi<FAIReport>(`/fai/reports/${reportId}/approve`, { method: 'POST' }),

  reject: (reportId: number, reason: string) =>
    fetchApi<FAIReport>(`/fai/reports/${reportId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  getForms: (reportId: number) =>
    fetchApi<FAIReportDetail>(`/fai/reports/${reportId}/forms`),
}
