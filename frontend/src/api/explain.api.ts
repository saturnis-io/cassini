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
  warnings: string[]
}

export const explainApi = {
  getCapabilityExplanation: (metricType: string, characteristicId: string | number) =>
    fetchApi<ExplanationResponse>(`explain/capability/${metricType}/${characteristicId}`),
}
