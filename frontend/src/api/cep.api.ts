import { fetchApi } from './client'

// ---- Types mirroring backend Pydantic schemas (1:1) ----

export type CepConditionKind =
  | 'above_mean_consecutive'
  | 'below_mean_consecutive'
  | 'above_value'
  | 'below_value'
  | 'out_of_control'
  | 'increasing'
  | 'decreasing'

export type CepSeverity = 'low' | 'medium' | 'high' | 'critical'

export interface CepCondition {
  characteristic: string
  rule: CepConditionKind
  count: number
  threshold?: number | null
}

export interface CepAction {
  violation: string
  severity: CepSeverity
  message?: string | null
}

export interface CepRuleSpec {
  name: string
  description?: string | null
  window: string
  conditions: CepCondition[]
  action: CepAction
  enabled: boolean
}

export interface CepRule {
  id: number
  plant_id: number
  name: string
  description: string | null
  yaml_text: string
  enabled: boolean
  parsed: CepRuleSpec
  created_at: string
  updated_at: string
}

export interface CepValidationError {
  line: number
  column: number
  message: string
  location: string
}

export interface CepRuleValidateResponse {
  valid: boolean
  errors: CepValidationError[]
  parsed: CepRuleSpec | null
}

export interface CepRuleCreatePayload {
  plant_id: number
  yaml_text: string
  enabled?: boolean
}

export interface CepRuleUpdatePayload {
  yaml_text?: string
  enabled?: boolean
}

// ---- API surface ----

export const cepApi = {
  list: (plantId: number) =>
    fetchApi<CepRule[]>(`/cep_rules?plant_id=${plantId}`),

  get: (ruleId: number, plantId: number) =>
    fetchApi<CepRule>(`/cep_rules/${ruleId}?plant_id=${plantId}`),

  create: (payload: CepRuleCreatePayload) =>
    fetchApi<CepRule>('/cep_rules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (ruleId: number, plantId: number, payload: CepRuleUpdatePayload) =>
    fetchApi<CepRule>(`/cep_rules/${ruleId}?plant_id=${plantId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  remove: (ruleId: number, plantId: number) =>
    fetchApi<void>(`/cep_rules/${ruleId}?plant_id=${plantId}`, {
      method: 'DELETE',
    }),

  validate: (yaml_text: string) =>
    fetchApi<CepRuleValidateResponse>('/cep_rules/validate', {
      method: 'POST',
      body: JSON.stringify({ yaml_text }),
    }),
}
