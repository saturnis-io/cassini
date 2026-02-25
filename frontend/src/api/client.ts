import i18n from 'i18next'
import type { RefreshResponse } from '@/types'
import type { ScheduleConfig } from '@/components/ScheduleConfigSection'

// ---- Exported types (used by domain API files and consumers) ----

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

// Notification types
export interface SmtpConfigResponse {
  id: number
  server: string
  port: number
  username: string | null
  password_set: boolean
  use_tls: boolean
  from_address: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SmtpConfigUpdate {
  server: string
  port: number
  username?: string | null
  password?: string | null
  use_tls: boolean
  from_address: string
  is_active: boolean
}

export interface WebhookConfigResponse {
  id: number
  name: string
  url: string
  has_secret: boolean
  is_active: boolean
  retry_count: number
  events_filter: string[] | null
  created_at: string
  updated_at: string
}

export interface WebhookConfigCreate {
  name: string
  url: string
  secret?: string | null
  is_active?: boolean
  retry_count?: number
  events_filter?: string[] | null
}

export interface WebhookConfigUpdate {
  name?: string
  url?: string
  secret?: string | null
  is_active?: boolean
  retry_count?: number
  events_filter?: string[] | null
}

export interface NotificationPreference {
  id: number
  event_type: string
  channel: string
  is_enabled: boolean
}

export interface NotificationPreferenceItem {
  event_type: string
  channel: string
  is_enabled: boolean
}

// ---- OIDC SSO Types ----

export interface OIDCProviderPublic {
  id: number
  name: string
}

export interface OIDCConfigResponse {
  id: number
  name: string
  issuer_url: string
  client_id: string
  client_secret_masked: string
  scopes: string[]
  role_mapping: Record<string, string>
  auto_provision: boolean
  default_role: string
  is_active: boolean
  created_at: string
  updated_at: string | null
  claim_mapping: Record<string, string>
  end_session_endpoint: string | null
  post_logout_redirect_uri: string | null
}

export interface OIDCConfigCreate {
  name: string
  issuer_url: string
  client_id: string
  client_secret: string
  scopes?: string[]
  role_mapping?: Record<string, string>
  auto_provision?: boolean
  default_role?: string
  claim_mapping?: Record<string, string>
  end_session_endpoint?: string | null
  post_logout_redirect_uri?: string | null
}

export interface OIDCConfigUpdate {
  name?: string
  issuer_url?: string
  client_id?: string
  client_secret?: string
  scopes?: string[]
  role_mapping?: Record<string, string>
  auto_provision?: boolean
  default_role?: string
  is_active?: boolean
  claim_mapping?: Record<string, string>
  end_session_endpoint?: string | null
  post_logout_redirect_uri?: string | null
}

export interface OIDCAuthorizationResponse {
  authorization_url: string
}

export interface OIDCCallbackResponse {
  access_token: string
  token_type: string
  user_id: number
  username: string
}

// ---- Signature Types ----

export interface SignRequest {
  resource_type: string
  resource_id: number
  password: string
  meaning_code: string
  comment?: string | null
  workflow_instance_id?: number | null
}

export interface RejectRequest {
  workflow_instance_id: number
  password: string
  reason: string
}

export interface SignatureHistoryParams {
  resource_type?: string
  user_id?: number
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
}

export interface MeaningCreate {
  code: string
  display_name: string
  description?: string | null
  requires_comment?: boolean
  is_active?: boolean
  sort_order?: number
}

export interface MeaningUpdate {
  code?: string
  display_name?: string
  description?: string | null
  requires_comment?: boolean
  is_active?: boolean
  sort_order?: number
}

export interface WorkflowCreate {
  name: string
  resource_type: string
  is_active?: boolean
  is_required?: boolean
  description?: string | null
}

export interface WorkflowUpdate {
  name?: string
  resource_type?: string
  is_active?: boolean
  is_required?: boolean
  description?: string | null
}

export interface StepCreate {
  step_order: number
  name: string
  min_role: string
  meaning_code: string
  is_required?: boolean
  allow_self_sign?: boolean
  timeout_hours?: number | null
}

export interface StepUpdate {
  step_order?: number
  name?: string
  min_role?: string
  meaning_code?: string
  is_required?: boolean
  allow_self_sign?: boolean
  timeout_hours?: number | null
}

// ---- Import Types ----

export interface ImportColumn {
  name: string
  index: number
  sample_values: string[]
  detected_type: string
}

export interface ImportUploadResponse {
  columns: ImportColumn[]
  row_count: number
  preview_rows: string[][]
}

export interface ImportValidateResponse {
  valid_rows: {
    measurements: number[]
    timestamp?: string
    batch_number?: string
    operator_id?: string
  }[]
  warnings: string[]
  error_rows: { row: number; error: string }[]
  total_rows: number
  valid_count: number
}

export interface ImportConfirmResponse {
  imported: number
  errors: number
  error_details: { row: number; error: string }[]
  total_rows: number
}

// ---- Audit Types ----

export interface AuditLogParams {
  user_id?: number
  action?: string
  resource_type?: string
  start_date?: string
  end_date?: string
  limit?: number
  offset?: number
}

// ---- FAI Types ----

export interface FAIReport {
  id: number
  plant_id: number
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
  material_supplier: string | null
  material_spec: string | null
  special_processes: string | null
  functional_test_results: string | null
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  rejection_reason: string | null
  created_by: number
  created_at: string
  updated_at: string | null
  submitted_at: string | null
  approved_at: string | null
}

export interface FAIItem {
  id: number
  report_id: number
  balloon_number: number
  characteristic_name: string
  nominal: number | null
  usl: number | null
  lsl: number | null
  actual_value: number | null
  unit: string
  tools_used: string | null
  designed_char: boolean
  result: string
  deviation_reason: string | null
  characteristic_id: number | null
  sequence_order: number
}

export interface FAIReportDetail extends FAIReport {
  items: FAIItem[]
}

export interface FAIReportCreate {
  plant_id: number
  part_number: string
  part_name?: string | null
  revision?: string | null
  serial_number?: string | null
  lot_number?: string | null
  drawing_number?: string | null
  organization_name?: string | null
  supplier?: string | null
  purchase_order?: string | null
  reason_for_inspection?: string | null
  material_supplier?: string | null
  material_spec?: string | null
  special_processes?: string | null
  functional_test_results?: string | null
}

export interface FAIItemCreate {
  balloon_number?: number
  characteristic_name?: string
  nominal?: number | null
  usl?: number | null
  lsl?: number | null
  actual_value?: number | null
  unit?: string | null
  tools_used?: string | null
  designed_char?: boolean
  result?: string | null
  deviation_reason?: string | null
  characteristic_id?: number | null
}

// ---- MSA Types ----

export interface MSAStudy {
  id: number
  plant_id: number
  name: string
  study_type: string
  characteristic_id: number | null
  num_operators: number
  num_parts: number
  num_replicates: number
  tolerance: number | null
  status: string
  created_by: number
  created_at: string
  completed_at: string | null
}

export interface MSAOperator {
  id: number
  name: string
  sequence_order: number
}

export interface MSAPart {
  id: number
  name: string
  reference_value: number | null
  sequence_order: number
}

export interface MSAStudyDetail extends MSAStudy {
  operators: MSAOperator[]
  parts: MSAPart[]
  measurement_count: number
}

export interface MSAStudyCreate {
  name: string
  study_type: string
  characteristic_id?: number | null
  num_operators: number
  num_parts: number
  num_replicates: number
  tolerance?: number | null
  plant_id: number
}

export interface MSAMeasurement {
  id: number
  operator_id: number
  part_id: number
  replicate_num: number
  value: number
  attribute_value: string | null
  timestamp: string
}

export interface MSAMeasurementInput {
  operator_id: number
  part_id: number
  replicate_num: number
  value: number
}

export interface MSAAttributeInput {
  operator_id: number
  part_id: number
  replicate_num: number
  attribute_value: string
}

export interface GageRRResult {
  method: string
  repeatability_ev: number
  reproducibility_av: number
  interaction: number | null
  gage_rr: number
  part_variation: number
  total_variation: number
  pct_contribution_ev: number
  pct_contribution_av: number
  pct_contribution_interaction: number | null
  pct_contribution_grr: number
  pct_contribution_pv: number
  pct_study_ev: number
  pct_study_av: number
  pct_study_grr: number
  pct_study_pv: number
  pct_tolerance_grr: number | null
  ndc: number
  anova_table: Record<string, { SS: number; df: number; MS: number; F: number | null; p: number | null }> | null
  verdict: string
}

export interface AttributeMSAResult {
  within_appraiser: Record<string, number>
  between_appraiser: number
  vs_reference: Record<string, number> | null
  cohens_kappa_pairs: Record<string, number>
  fleiss_kappa: number
  verdict: string
}

// ---- Gage Bridge Types ----

export interface GageBridge {
  id: number
  plant_id: number
  name: string
  mqtt_broker_id: number | null
  status: string
  last_heartbeat_at: string | null
  registered_by: number
  created_at: string
}

export interface GageBridgeDetail extends GageBridge {
  ports: GagePort[]
}

export interface GageBridgeRegistered extends GageBridge {
  api_key: string
}

export interface GagePort {
  id: number
  bridge_id: number
  port_name: string
  baud_rate: number
  data_bits: number
  parity: string
  stop_bits: number
  protocol_profile: string
  parse_pattern: string | null
  mqtt_topic: string
  characteristic_id: number | null
  is_active: boolean
  created_at: string
}

export interface GageProfile {
  id: string
  name: string
  description: string
  default_baud_rate: number
  default_data_bits: number
  default_parity: string
  default_stop_bits: number
  parse_pattern: string | null
}

export interface GageBridgeCreate {
  plant_id: number
  name: string
  mqtt_broker_id?: number | null
}

export interface GagePortCreate {
  port_name: string
  baud_rate?: number
  data_bits?: number
  parity?: string
  stop_bits?: number
  protocol_profile?: string
  parse_pattern?: string | null
  characteristic_id?: number | null
  is_active?: boolean
}

// ---- Core API infrastructure ----

export const API_BASE = '/api/v1'

/** Minimum seconds before token expiry to trigger proactive refresh */
const TOKEN_EXPIRY_BUFFER_SEC = 120

/** Cooldown period (ms) after a refresh completes before allowing another */
const REFRESH_COOLDOWN_MS = 5_000

// Access token stored in memory only (not localStorage).
// Module-scope is acceptable here: this runs in a single browser JS context
// and the token is never persisted to storage. Only fetchApi and auth hooks
// access it via the exported getter/setter.
let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null
let lastRefreshTime = 0

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function getAccessToken(): string | null {
  return accessToken
}

/**
 * Decode JWT payload without signature verification (just base64).
 * Returns the exp timestamp in seconds, or null if unparseable.
 */
function getTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

/**
 * Check if the access token is about to expire (within 2 minutes).
 */
function isTokenExpiringSoon(): boolean {
  if (!accessToken) return false
  const exp = getTokenExpiry(accessToken)
  if (exp === null) return false
  const nowSec = Math.floor(Date.now() / 1000)
  return exp - nowSec < TOKEN_EXPIRY_BUFFER_SEC
}

/**
 * Perform a token refresh. If a refresh is already in flight, return the
 * existing promise so all concurrent 401 callers wait on the same refresh.
 */
function doRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  // If a refresh just completed within the cooldown window, skip to avoid overlap
  // between proactive refresh and 401-triggered refresh
  if (Date.now() - lastRefreshTime < REFRESH_COOLDOWN_MS && accessToken) {
    return Promise.resolve(accessToken)
  }

  refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (res) => {
      if (res.ok) {
        const data: RefreshResponse = await res.json()
        accessToken = data.access_token
        return accessToken
      }
      // Refresh failed — force logout
      accessToken = null
      window.dispatchEvent(new CustomEvent('auth:logout'))
      return null
    })
    .catch(() => {
      accessToken = null
      window.dispatchEvent(new CustomEvent('auth:logout'))
      return null
    })
    .finally(() => {
      lastRefreshTime = Date.now()
      refreshPromise = null
    })

  return refreshPromise
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // Proactively refresh token before it expires to avoid 401 round-trips
  if (accessToken && isTokenExpiringSoon() && !endpoint.startsWith('/auth/')) {
    await doRefresh()
  }

  const buildHeaders = () => {
    const h: Record<string, string> = {
      ...((options?.headers as Record<string, string>) || {}),
    }
    // Only set Content-Type for requests that have a body.
    // Skip for FormData — browser must set multipart boundary automatically.
    if (options?.body && !(options.body instanceof FormData)) {
      h['Content-Type'] = h['Content-Type'] || 'application/json'
    }
    if (accessToken) {
      h['Authorization'] = `Bearer ${accessToken}`
    }
    h['Accept-Language'] = i18n.language || 'en'
    return h
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: buildHeaders(),
    credentials: 'include',
  })

  // Handle 401 with automatic token refresh (skip for auth endpoints)
  if (response.status === 401 && !endpoint.startsWith('/auth/')) {
    const newToken = await doRefresh()
    if (newToken) {
      // Retry with the refreshed token
      const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: buildHeaders(),
        credentials: 'include',
      })
      if (!retryResponse.ok) {
        const error = await retryResponse.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(
          typeof error.detail === 'string' ? error.detail : `HTTP ${retryResponse.status}`,
        )
      }
      if (retryResponse.status === 204) return undefined as T
      return retryResponse.json()
    }
    throw new Error('Session expired')
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    // Handle Pydantic validation errors (array of errors) and standard errors
    let message = 'Unknown error'
    if (typeof error.detail === 'string') {
      message = error.detail
    } else if (Array.isArray(error.detail)) {
      // Pydantic validation error format: [{loc: [...], msg: "...", type: "..."}]
      message = error.detail
        .map((e: { msg: string; loc?: string[] }) =>
          e.loc ? `${e.loc.join('.')}: ${e.msg}` : e.msg,
        )
        .join('; ')
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

// ---- Re-export all domain API namespaces for backward compatibility ----

export { authApi, oidcApi } from './auth.api'
export { plantApi, hierarchyApi } from './plants.api'
export { characteristicApi, sampleApi, dataEntryApi, annotationApi } from './characteristics.api'
export { violationApi, anomalyApi, distributionApi, capabilityApi, rulePresetApi } from './quality.api'
export { brokerApi, providerApi, opcuaApi, tagApi, gageBridgeApi } from './connectivity.api'
export { databaseApi, userApi, auditApi, retentionApi, importApi, devtoolsApi, apiKeysApi } from './admin.api'
export { notificationApi } from './notifications.api'
export { signatureApi } from './signatures.api'
export { reportScheduleApi } from './reports.api'
export { msaApi } from './msa.api'
export { faiApi } from './fai.api'
export { pushApi } from './push.api'
export { erpApi } from './erp.api'
export { predictionApi, aiApi } from './predictions.api'
