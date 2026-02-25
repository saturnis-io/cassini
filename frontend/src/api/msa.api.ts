import type {
  AttributeMSAResult,
  GageRRResult,
  MSAAttributeInput,
  MSAMeasurement,
  MSAMeasurementInput,
  MSAOperator,
  MSAPart,
  MSAStudy,
  MSAStudyCreate,
  MSAStudyDetail,
} from './client'
import { fetchApi } from './client'

// ---- MSA API ----

export const msaApi = {
  listStudies: (plantId: number, status?: string) =>
    fetchApi<MSAStudy[]>(`/msa/studies?plant_id=${plantId}${status ? `&status=${status}` : ''}`),

  getStudy: (id: number) =>
    fetchApi<MSAStudyDetail>(`/msa/studies/${id}`),

  createStudy: (data: MSAStudyCreate) =>
    fetchApi<MSAStudy>('/msa/studies', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteStudy: (id: number) =>
    fetchApi<void>(`/msa/studies/${id}`, { method: 'DELETE' }),

  setOperators: (studyId: number, operators: string[]) =>
    fetchApi<MSAOperator[]>(`/msa/studies/${studyId}/operators`, {
      method: 'POST',
      body: JSON.stringify({ operators }),
    }),

  setParts: (studyId: number, parts: { name: string; reference_value?: number | null }[]) =>
    fetchApi<MSAPart[]>(`/msa/studies/${studyId}/parts`, {
      method: 'POST',
      body: JSON.stringify({ parts }),
    }),

  submitMeasurements: (studyId: number, measurements: MSAMeasurementInput[]) =>
    fetchApi<MSAMeasurement[]>(`/msa/studies/${studyId}/measurements`, {
      method: 'POST',
      body: JSON.stringify({ measurements }),
    }),

  getMeasurements: (studyId: number) =>
    fetchApi<MSAMeasurement[]>(`/msa/studies/${studyId}/measurements`),

  calculate: (studyId: number) =>
    fetchApi<GageRRResult>(`/msa/studies/${studyId}/calculate`, {
      method: 'POST',
    }),

  submitAttributeMeasurements: (studyId: number, measurements: MSAAttributeInput[]) =>
    fetchApi<MSAMeasurement[]>(`/msa/studies/${studyId}/attribute-measurements`, {
      method: 'POST',
      body: JSON.stringify({ measurements }),
    }),

  calculateAttribute: (studyId: number) =>
    fetchApi<AttributeMSAResult>(`/msa/studies/${studyId}/attribute-calculate`, {
      method: 'POST',
    }),

  getResults: (studyId: number) =>
    fetchApi<GageRRResult | AttributeMSAResult>(`/msa/studies/${studyId}/results`),
}
