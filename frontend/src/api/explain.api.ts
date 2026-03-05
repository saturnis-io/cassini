import { fetchApi } from './client'

export interface ExplanationStep {
  label: string
  formula_latex: string
  substitution_latex: string
  result: number
  note: string | null
}

export interface Citation {
  standard: string
  reference: string
  section: string | null
}

export interface ExplanationResponse {
  metric: string
  display_name: string
  value: number
  formula_latex: string
  steps: ExplanationStep[]
  inputs: Record<string, number | string>
  citation: Citation | null
  method: string | null
  sigma_estimator: string | null
  warnings: string[]
}

export interface ExplainChartOptions {
  limit?: number
  startDate?: string
  endDate?: string
}

export const explainApi = {
  getCapabilityExplanation: (
    metricType: string,
    characteristicId: string | number,
    chartOptions?: ExplainChartOptions,
  ) => {
    const params = new URLSearchParams()
    if (chartOptions?.limit) params.set('limit', String(chartOptions.limit))
    if (chartOptions?.startDate) params.set('start_date', chartOptions.startDate)
    if (chartOptions?.endDate) params.set('end_date', chartOptions.endDate)
    const qs = params.toString()
    const suffix = qs ? `?${qs}` : ''
    return fetchApi<ExplanationResponse>(
      `/explain/capability/${metricType}/${characteristicId}${suffix}`,
    )
  },

  getMSAExplanation: (metricType: string, studyId: string | number) =>
    fetchApi<ExplanationResponse>(`/explain/msa/${metricType}/${studyId}`),

  getControlLimitsExplanation: (metricType: string, characteristicId: string | number) =>
    fetchApi<ExplanationResponse>(
      `/explain/control-limits/${metricType}/${characteristicId}`,
    ),

  getAttributeExplanation: (metricType: string, characteristicId: string | number) =>
    fetchApi<ExplanationResponse>(
      `/explain/attribute/${metricType}/${characteristicId}`,
    ),
}
