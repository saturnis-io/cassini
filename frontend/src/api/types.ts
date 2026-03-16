import type { ScheduleConfig } from '@/components/ScheduleConfigSection'

// ---- Characteristic Config Types ----

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

// ---- API Key Types ----

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

// ---- User Management Types ----

export interface UserResponse {
  id: number
  username: string
  email: string | null
  is_active: boolean
  roles_locked: boolean
  created_at: string
  updated_at: string
  plant_roles: {
    plant_id: number
    plant_name: string
    plant_code: string
    role: string
  }[]
}

// ---- Notification Types ----

export interface SmtpConfigResponse {
  id: number
  server: string
  port: number
  username_set: boolean
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
  severity_filter?: string
}

export interface NotificationPreferenceItem {
  event_type: string
  channel: string
  is_enabled: boolean
  severity_filter?: string
}

// ---- OIDC SSO Types ----

export interface OIDCProviderPublic {
  id: number
  name: string
  sso_only: boolean
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
  sso_only: boolean
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
  sso_only?: boolean
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
  sso_only?: boolean
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
  fai_type: 'full' | 'partial'
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
  created_by: number | null
  submitted_by: number | null
  approved_by: number | null
  created_at: string
  submitted_at: string | null
  approved_at: string | null
}

export interface FAIItem {
  id: number
  report_id: number
  balloon_number: number
  characteristic_name: string
  drawing_zone: string | null
  nominal: number | null
  usl: number | null
  lsl: number | null
  actual_value: number | null
  value_type: 'numeric' | 'text' | 'pass_fail'
  actual_value_text: string | null
  measurements: number[] | null
  unit: string
  tools_used: string | null
  designed_char: boolean
  result: string
  deviation_reason: string | null
  characteristic_id: number | null
  sequence_order: number
}

export interface FAIMaterial {
  id: number
  report_id: number
  material_part_number: string | null
  material_spec: string | null
  cert_number: string | null
  supplier: string | null
  result: string
}

export interface FAISpecialProcess {
  id: number
  report_id: number
  process_name: string | null
  process_spec: string | null
  cert_number: string | null
  approved_supplier: string | null
  result: string
}

export interface FAIFunctionalTest {
  id: number
  report_id: number
  test_description: string | null
  procedure_number: string | null
  actual_results: string | null
  result: string
}

export interface FAIReportDetail extends FAIReport {
  items: FAIItem[]
  materials: FAIMaterial[]
  special_processes_items: FAISpecialProcess[]
  functional_tests_items: FAIFunctionalTest[]
}

export interface FAIReportCreate {
  plant_id: number
  part_number: string
  fai_type?: 'full' | 'partial'
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
  drawing_zone?: string | null
  nominal?: number | null
  usl?: number | null
  lsl?: number | null
  actual_value?: number | null
  value_type?: 'numeric' | 'text' | 'pass_fail'
  actual_value_text?: string | null
  measurements?: number[] | null
  unit?: string | null
  tools_used?: string | null
  designed_char?: boolean
  result?: string | null
  deviation_reason?: string | null
  characteristic_id?: number | null
}

export interface FAIMaterialCreate {
  material_part_number?: string | null
  material_spec?: string | null
  cert_number?: string | null
  supplier?: string | null
  result?: string
}

export interface FAISpecialProcessCreate {
  process_name?: string | null
  process_spec?: string | null
  cert_number?: string | null
  approved_supplier?: string | null
  result?: string
}

export interface FAIFunctionalTestCreate {
  test_description?: string | null
  procedure_number?: string | null
  actual_results?: string | null
  result?: string
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
  reference_decision: string | null
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

export interface OperatorData {
  name: string
  measurements: number[]
  part_means: number[]
  mean: number
  range: number
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
  anova_table: Record<
    string,
    { SS: number; df: number; MS: number; F: number | null; p: number | null }
  > | null
  verdict: string
  operator_data: OperatorData[] | null
  grr_ci_lower: number | null
  grr_ci_upper: number | null
  grr_ci_df: number | null
}

export interface AttributeMSAResult {
  within_appraiser: Record<string, number>
  between_appraiser: number
  vs_reference: Record<string, number> | null
  cohens_kappa_pairs: Record<string, number>
  fleiss_kappa: number
  verdict: string
  miss_rates: Record<string, number> | null
  false_alarm_rates: Record<string, number> | null
  effectiveness: number | null
  confusion_matrix: Record<string, Record<string, Record<string, number>>> | null
}

export interface LinearityResult {
  reference_values: number[]
  bias_values: number[]
  bias_percentages: (number | null)[]
  slope: number
  intercept: number
  r_squared: number
  linearity: number
  linearity_percent: number | null
  bias_avg: number
  bias_percent: number | null
  is_acceptable: boolean
  individual_points: {
    reference: number
    measured: number
    bias: number
    replicate: number
  }[]
  verdict: string
  p_value: number
}

export interface StabilityResult {
  values: number[]
  center_line: number
  ucl: number
  lcl: number
  sigma: number
  moving_ranges: number[]
  mr_center_line: number
  mr_ucl: number
  mr_lcl: number
  violations: {
    rule_id: number
    rule_name: string
    indices: number[]
    message: string
  }[]
  verdict: string
  verdict_reason: string
  warnings: string[]
}

export interface BiasResult {
  reference_value: number
  n: number
  mean: number
  std_dev: number
  bias: number
  bias_percent: number | null
  t_statistic: number
  p_value: number
  df: number
  is_significant: boolean
  verdict: string
  denominator_used: string
  measurements: number[]
  warnings: string[]
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

// ---- Plant Health Analytics Types ----

export interface CharacteristicHealth {
  characteristic_id: number
  name: string
  hierarchy_path: string
  data_type: string
  cpk: number | null
  ppk: number | null
  in_control_pct: number
  sample_count: number
  violation_count: number
  unacknowledged_count: number
  risk_score: number
  health_status: 'good' | 'warning' | 'critical'
  last_sample_at: string | null
}

export interface HealthSummary {
  good_count: number
  warning_count: number
  critical_count: number
  avg_cpk: number | null
  worst_characteristic: string | null
  worst_cpk: number | null
}

export interface PlantHealthResponse {
  plant_id: number
  plant_name: string
  generated_at: string
  window_days: number
  total_characteristics: number
  summary: HealthSummary
  characteristics: CharacteristicHealth[]
}
