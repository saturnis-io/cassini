import type {
  CreateReportSchedule,
  ReportRun,
  ReportSchedule,
  UpdateReportSchedule,
} from '@/types'
import { fetchApi } from './client'

// Report Schedule API
export const reportScheduleApi = {
  list: (plantId: number) =>
    fetchApi<ReportSchedule[]>(`/reports/schedules/?plant_id=${plantId}`),

  get: (id: number) => fetchApi<ReportSchedule>(`/reports/schedules/${id}`),

  create: (data: CreateReportSchedule) =>
    fetchApi<ReportSchedule>('/reports/schedules/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: number, data: UpdateReportSchedule) =>
    fetchApi<ReportSchedule>(`/reports/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    fetchApi<void>(`/reports/schedules/${id}`, { method: 'DELETE' }),

  trigger: (id: number) =>
    fetchApi<ReportRun>(`/reports/schedules/${id}/trigger`, { method: 'POST' }),

  runs: (id: number) => fetchApi<ReportRun[]>(`/reports/schedules/${id}/runs`),
}
