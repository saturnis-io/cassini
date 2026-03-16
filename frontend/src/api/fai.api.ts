import type {
  FAIFunctionalTest,
  FAIFunctionalTestCreate,
  FAIItem,
  FAIItemCreate,
  FAIMaterial,
  FAIMaterialCreate,
  FAIReport,
  FAIReportCreate,
  FAIReportDetail,
  FAISpecialProcess,
  FAISpecialProcessCreate,
} from './client'
import { fetchApi, getAccessToken } from './client'

// ---- FAI Form Data (AS9102 export) ----

interface FAIForm1PartAccountability {
  part_number: string
  part_name: string | null
  revision: string | null
  serial_number: string | null
  lot_number: string | null
  drawing_number: string | null
  organization_name: string | null
  supplier: string | null
  purchase_order: string | null
  reason_for_inspection: string | null
  created_by: number | null
  created_at: string | null
  submitted_at: string | null
  approved_by: number | null
  approved_at: string | null
}

interface FAIForm2ProductAccountability {
  materials: FAIMaterial[]
  special_processes: FAISpecialProcess[]
  functional_tests: FAIFunctionalTest[]
  material_supplier: string | null
  material_spec: string | null
}

interface FAIForm3CharacteristicAccountability {
  total_characteristics: number
  pass_count: number
  fail_count: number
  deviation_count: number
  items: FAIItem[]
}

export interface FAIFormData {
  report_id: number
  status: string
  fai_type: string
  form1_part_accountability: FAIForm1PartAccountability
  form2_product_accountability: FAIForm2ProductAccountability
  form3_characteristic_accountability: FAIForm3CharacteristicAccountability
}

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

  // Items (Form 3)
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

  // Materials (Form 2 child)
  addMaterial: (reportId: number, data: FAIMaterialCreate) =>
    fetchApi<FAIMaterial>(`/fai/reports/${reportId}/materials`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteMaterial: (reportId: number, materialId: number) =>
    fetchApi<void>(`/fai/reports/${reportId}/materials/${materialId}`, { method: 'DELETE' }),

  // Special Processes (Form 2 child)
  addSpecialProcess: (reportId: number, data: FAISpecialProcessCreate) =>
    fetchApi<FAISpecialProcess>(`/fai/reports/${reportId}/special-processes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteSpecialProcess: (reportId: number, processId: number) =>
    fetchApi<void>(`/fai/reports/${reportId}/special-processes/${processId}`, {
      method: 'DELETE',
    }),

  // Functional Tests (Form 2 child)
  addFunctionalTest: (reportId: number, data: FAIFunctionalTestCreate) =>
    fetchApi<FAIFunctionalTest>(`/fai/reports/${reportId}/functional-tests`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteFunctionalTest: (reportId: number, testId: number) =>
    fetchApi<void>(`/fai/reports/${reportId}/functional-tests/${testId}`, {
      method: 'DELETE',
    }),

  // Workflow
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
    fetchApi<FAIFormData>(`/fai/reports/${reportId}/forms`),

  // AS9102 Standard Export (raw fetch for binary downloads)
  exportPdf: async (reportId: number): Promise<Blob> => {
    const token = getAccessToken()
    const response = await fetch(`/api/v1/fai/reports/${reportId}/export/pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
    if (!response.ok) {
      throw new Error(`PDF export failed: ${response.status}`)
    }
    return response.blob()
  },

  exportExcel: async (reportId: number): Promise<Blob> => {
    const token = getAccessToken()
    const response = await fetch(
      `/api/v1/fai/reports/${reportId}/export/excel`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      },
    )
    if (!response.ok) {
      throw new Error(`Excel export failed: ${response.status}`)
    }
    return response.blob()
  },

  // Delta FAI
  createDelta: (reportId: number) =>
    fetchApi<FAIReportDetail>(`/fai/reports/${reportId}/delta`, {
      method: 'POST',
    }),
}
