// Auth types
export interface AuthUser {
  id: number
  username: string
  email: string | null
  full_name: string | null
  pending_email: string | null
  is_active: boolean
  plant_roles: PlantRole[]
}

export interface PlantRole {
  plant_id: number
  plant_name: string
  plant_code: string
  role: 'operator' | 'supervisor' | 'engineer' | 'admin'
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: AuthUser
  must_change_password: boolean
}

export interface RefreshResponse {
  access_token: string
  token_type: string
}

// Plant types
export interface Plant {
  id: number
  name: string
  code: string
  is_active: boolean
  settings: Record<string, unknown> | null
  capability_green_threshold?: number | null
  capability_yellow_threshold?: number | null
  created_at: string
  updated_at: string
}

export interface PlantCreate {
  name: string
  code: string
  is_active?: boolean
  settings?: Record<string, unknown> | null
}

export interface PlantUpdate {
  name?: string
  code?: string
  is_active?: boolean
  settings?: Record<string, unknown> | null
  change_reason?: string
}

// Hierarchy types - UNS-compatible generic hierarchy
export interface HierarchyNode {
  id: number
  name: string
  type: string // Flexible: Folder, Enterprise, Site, Area, Line, Cell, Equipment, Tag, or custom
  parent_id: number | null
  children?: HierarchyNode[]
  characteristic_count?: number
}

// Characteristic types
export type SubgroupMode = 'STANDARDIZED' | 'VARIABLE_LIMITS' | 'NOMINAL_TOLERANCE'

// DataSource (polymorphic base)
export interface DataSourceResponse {
  id: number
  type: string // "mqtt" | "opcua"
  characteristic_id: number
  trigger_strategy: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Characteristic {
  id: number
  name: string
  hierarchy_id: number
  description: string | null
  data_source: DataSourceResponse | null
  subgroup_size: number
  target_value: number | null
  usl: number | null
  lsl: number | null
  ucl: number | null
  lcl: number | null
  // Subgroup mode configuration
  subgroup_mode: SubgroupMode
  min_measurements: number
  warn_below_count: number | null
  stored_sigma: number | null
  stored_center_line: number | null
  decimal_precision: number
  // Attribute chart fields
  data_type: 'variable' | 'attribute'
  attribute_chart_type?: 'p' | 'np' | 'c' | 'u' | null
  default_sample_size?: number | null
  // Advanced chart type (CUSUM/EWMA)
  chart_type?: 'cusum' | 'ewma' | null
  cusum_target?: number | null
  cusum_k?: number | null
  cusum_h?: number | null
  ewma_lambda?: number | null
  ewma_l?: number | null
  // Laney correction (Sprint 5 - A3)
  use_laney_correction?: boolean
  // Short-run chart mode (Sprint 6 - B2)
  short_run_mode?: 'deviation' | 'standardized' | null
  // Distribution fitting (Sprint 5 - A1)
  distribution_method?: 'auto' | 'normal' | 'box_cox' | 'percentile' | 'distribution_fit' | null
  // Sigma estimation method override (null = auto-select)
  sigma_method?: 'r_bar_d2' | 's_bar_c4' | 'moving_range' | 'pooled' | null
  // Capability fields (populated by list endpoint)
  latest_cpk?: number | null
  latest_cp?: number | null
  // Optional metadata fields
  unit?: string
  active?: boolean
  created_at?: string
  updated_at?: string
  sample_count?: number
  // Optional computed fields (may be included by backend)
  in_control?: boolean
  unacknowledged_violations?: number
}

// For list views - currently same as Characteristic since backend doesn't have summary endpoint
export interface CharacteristicSummary extends Characteristic {
  // These fields will be computed client-side for now
  hierarchy_path?: string
  data_source_type: string | null
  in_control?: boolean
  last_sample_at?: string | null
  unacknowledged_violations?: number
}

// Material class types (hierarchical material taxonomy)
export interface MaterialClass {
  id: number
  plant_id: number
  parent_id: number | null
  name: string
  code: string
  path: string
  depth: number
  description: string | null
  material_count: number
  children_count: number
  created_at: string
  updated_at: string
}

export interface MaterialClassTreeNode extends MaterialClass {
  children: MaterialClassTreeNode[]
  materials: Material[]
}

export interface Material {
  id: number
  plant_id: number
  class_id: number | null
  name: string
  code: string
  description: string | null
  properties: Record<string, unknown> | null
  class_name: string | null
  class_path: string | null
  created_at: string
  updated_at: string
}

export interface MaterialUsageItem {
  characteristic_id: number
  name: string
  hierarchy_path: string | null
}

export interface MaterialLimitOverride {
  id: number
  characteristic_id: number
  material_id: number | null
  class_id: number | null
  material_name: string | null
  class_name: string | null
  class_path: string | null
  ucl: number | null
  lcl: number | null
  stored_sigma: number | null
  stored_center_line: number | null
  target_value: number | null
  usl: number | null
  lsl: number | null
  created_at: string
  updated_at: string
}

export interface ResolvedLimitField {
  value: number | null
  source_type: 'material' | 'class' | 'characteristic'
  source_name: string
  source_id: number | null
}

export interface ResolvedLimits {
  ucl: ResolvedLimitField
  lcl: ResolvedLimitField
  stored_sigma: ResolvedLimitField
  stored_center_line: ResolvedLimitField
  target_value: ResolvedLimitField
  usl: ResolvedLimitField
  lsl: ResolvedLimitField
}

// Sample types
export interface Sample {
  id: number
  characteristic_id: number
  timestamp: string
  mean: number
  range_value: number | null
  std_dev: number | null
  is_excluded: boolean
  source: string
  material_id: number | null
  batch_number?: string | null
  operator_id?: string | null
  measurements: Measurement[]
  // Audit trail fields
  is_modified?: boolean
  edit_count?: number
  display_key?: string
  // Attribute data fields (populated for attribute-type characteristics)
  defect_count?: number | null
  sample_size?: number | null
  units_inspected?: number | null
}

export interface SampleEditHistory {
  id: number
  sample_id: number
  edited_at: string
  edited_by: string | null
  reason: string
  previous_values: number[]
  new_values: number[]
  previous_mean: number
  new_mean: number
}

export interface Measurement {
  id: number
  sample_id: number
  sequence: number
  value: number
}

export interface ViolationInfo {
  violation_id: number
  rule_id: number
  rule_name: string
  severity: string
}

export interface SampleProcessingResult {
  sample_id: number
  timestamp: string
  mean: number
  range_value: number | null
  zone: string
  in_control: boolean
  violations: ViolationInfo[]
  processing_time_ms: number
}

export interface ChartDataPoint {
  sample_id: number
  timestamp: string
  mean: number
  range: number | null
  std_dev: number | null
  excluded: boolean
  violation_ids: number[]
  violation_rules: number[] // Nelson rule numbers (1-8) that were violated
  zone: string
  // Variable subgroup size fields
  actual_n: number
  is_undersized: boolean
  effective_ucl: number | null
  effective_lcl: number | null
  z_score: number | null
  display_value: number | null
  display_key: string
  unacknowledged_violation_ids: number[]
}

export interface AttributeChartSample {
  sample_id: number
  timestamp: string
  plotted_value: number
  defect_count: number
  sample_size?: number | null
  units_inspected?: number | null
  effective_ucl?: number | null
  effective_lcl?: number | null
  excluded: boolean
  violation_ids: number[]
  unacknowledged_violation_ids: number[]
  violation_rules: number[]
  display_key: string
}

export interface CUSUMChartSample {
  sample_id: number
  timestamp: string
  measurement: number
  cusum_high: number
  cusum_low: number
  excluded: boolean
  violation_ids: number[]
  unacknowledged_violation_ids: number[]
  violation_rules: number[]
  display_key: string
}

export interface EWMAChartSample {
  sample_id: number
  timestamp: string
  measurement: number
  ewma_value: number
  excluded: boolean
  violation_ids: number[]
  unacknowledged_violation_ids: number[]
  violation_rules: number[]
  display_key: string
}

export interface ChartData {
  characteristic_id: number
  characteristic_name: string
  data_points: ChartDataPoint[]
  control_limits: {
    ucl: number | null
    lcl: number | null
    center_line: number | null
    source?: 'stored' | 'trial' | null
  }
  spec_limits: {
    usl: number | null
    lsl: number | null
    target: number | null
  }
  zone_boundaries: {
    plus_1_sigma: number | null
    plus_2_sigma: number | null
    plus_3_sigma: number | null
    minus_1_sigma: number | null
    minus_2_sigma: number | null
    minus_3_sigma: number | null
  }
  // Subgroup mode configuration
  subgroup_mode: SubgroupMode
  nominal_subgroup_size: number
  decimal_precision: number
  stored_sigma: number | null
  // Attribute chart data (present when data_type is 'attribute')
  data_type?: 'variable' | 'attribute'
  attribute_chart_type?: string | null
  attribute_data_points?: AttributeChartSample[]
  // Advanced chart data (CUSUM/EWMA)
  chart_type?: 'cusum' | 'ewma' | null
  cusum_data_points?: CUSUMChartSample[]
  cusum_h?: number | null
  cusum_target?: number | null
  ewma_data_points?: EWMAChartSample[]
  ewma_target?: number | null
  ewma_ucl_values?: number[] | null
  ewma_lcl_values?: number[] | null
  ewma_lambda?: number | null
  ewma_l?: number | null
  cusum_k?: number | null
  // Shewhart control limits (present alongside CUSUM/EWMA-specific limits)
  shewhart_control_limits?: {
    center_line: number | null
    ucl: number | null
    lcl: number | null
  } | null
  // Laney correction (Sprint 5 - A3)
  sigma_z?: number | null
  // Short-run chart mode (Sprint 6 - B2)
  short_run_mode?: 'deviation' | 'standardized' | null
  // Per-material limits
  active_material_id?: number | null
  active_material_name?: string | null
}

// Violation types
export type Severity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface Violation {
  id: number
  sample_id: number
  rule_id: number
  rule_name: string
  severity: Severity
  message?: string
  involved_sample_ids?: number[]
  acknowledged: boolean
  requires_acknowledgement: boolean
  ack_user: string | null
  ack_reason: string | null
  ack_timestamp: string | null
  created_at: string | null
  characteristic_id: number | null
  characteristic_name: string | null
  hierarchy_path: string | null
}

export interface ViolationStats {
  total: number
  unacknowledged: number
  informational: number
  by_rule: Record<string, number>
  by_severity: Record<Severity, number>
}

// WebSocket message types

/** Sparse violation summary sent over WebSocket (not the full Violation shape) */
export interface WSViolationSummary {
  id: number
  sample_id: number
  characteristic_id: number
  rule_id: number
  rule_name: string
  severity: string
}

export interface WSSampleMessage {
  type: 'sample'
  characteristic_id: number
  sample: Sample
  violations: WSViolationSummary[]
}

export interface WSViolationMessage {
  type: 'violation'
  violation: Violation
}

export interface WSAckMessage {
  type: 'ack_update'
  violation_id: number
  characteristic_id: number
  acknowledged: boolean
  ack_user: string
  ack_reason: string
}

export interface WSLimitsMessage {
  type: 'limits_update'
  characteristic_id: number
  ucl: number | null
  lcl: number | null
  center_line: number | null
}

export interface WSAnomalyMessage {
  type: 'anomaly'
  characteristic_id: number
  event: {
    id: number
    detector_type: string
    event_type: string
    severity: string
    summary: string
  }
}

export interface WSCharacteristicUpdateMessage {
  type: 'characteristic_update'
  characteristic_id: number
  changes: Record<string, unknown>
}

export type WSMessage =
  | WSSampleMessage
  | WSViolationMessage
  | WSAckMessage
  | WSLimitsMessage
  | WSAnomalyMessage
  | WSCharacteristicUpdateMessage

// API response types
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  offset: number
  limit: number
}

export interface ApiError {
  detail: string
}

// MQTT Broker types
export interface MQTTBroker {
  id: number
  name: string
  host: string
  port: number
  username: string | null
  client_id: string
  keepalive: number
  max_reconnect_delay: number
  use_tls: boolean
  has_ca_cert: boolean
  has_client_cert: boolean
  tls_insecure: boolean
  is_active: boolean
  plant_id: number | null
  outbound_enabled: boolean
  outbound_topic_prefix: string
  outbound_format: 'json' | 'sparkplug'
  outbound_rate_limit: number
  created_at: string
  updated_at: string
}

export interface BrokerConnectionStatus {
  broker_id: number
  broker_name: string
  is_connected: boolean
  last_connected: string | null
  error_message: string | null
  subscribed_topics: string[]
}

export interface BrokerTestResult {
  success: boolean
  message: string
  latency_ms: number | null
}

// Topic discovery types
export interface SparkplugMetricInfo {
  name: string
  data_type: string
}

export interface DiscoveredTopic {
  topic: string
  message_count: number
  last_seen: string
  last_payload_size: number
  is_sparkplug: boolean
  sparkplug_group: string | null
  sparkplug_node: string | null
  sparkplug_device: string | null
  sparkplug_message_type: string | null
  sparkplug_metrics: SparkplugMetricInfo[]
}

export interface TopicTreeNode {
  name: string
  full_topic: string | null
  children: TopicTreeNode[]
  message_count: number
  is_sparkplug: boolean
  sparkplug_metrics: SparkplugMetricInfo[]
}

// Tag mapping types
export interface TagMappingCreate {
  characteristic_id: number
  mqtt_topic: string
  trigger_strategy: string
  trigger_tag: string | null
  broker_id: number
  metric_name: string | null
  json_path: string | null
}

export interface TagMappingResponse {
  characteristic_id: number
  characteristic_name: string
  mqtt_topic: string
  trigger_strategy: string
  trigger_tag: string | null
  broker_id: number | null
  broker_name: string | null
  metric_name: string | null
  json_path: string | null
  data_source_id: number
  is_active: boolean
}

export interface TagPreviewValue {
  value: number | string | boolean
  timestamp: string
  raw_payload: string
  metric_name: string | null
}

export interface TagPreviewResponse {
  topic: string
  values: TagPreviewValue[]
  sample_count: number
  started_at: string
  duration_seconds: number
}

// Provider Status types
export interface TagProviderStatus {
  is_running: boolean
  subscribed_topics: string[]
  characteristics_count: number
  samples_processed: number
  last_sample_time: string | null
  error_message: string | null
}

export interface MQTTStatus {
  is_connected: boolean
  broker_id: number | null
  broker_name: string | null
  last_connected: string | null
  error_message: string | null
  subscribed_topics: string[]
}

export interface ProviderStatus {
  mqtt: MQTTStatus
  tag_provider: TagProviderStatus
}

// Annotation types
export type AnnotationType = 'point' | 'period'

export interface AnnotationHistoryEntry {
  id: number
  previous_text: string
  changed_by: string | null
  changed_at: string
}

export interface Annotation {
  id: number
  characteristic_id: number
  annotation_type: AnnotationType
  text: string
  color: string | null
  sample_id: number | null
  start_sample_id: number | null
  end_sample_id: number | null
  start_time: string | null
  end_time: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  history: AnnotationHistoryEntry[]
}

export interface AnnotationCreate {
  annotation_type: AnnotationType
  text: string
  color?: string | null
  sample_id?: number | null
  start_time?: string | null
  end_time?: string | null
}

export interface AnnotationUpdate {
  text?: string
  color?: string | null
}

// Database Administration types
export type DatabaseDialect = 'sqlite' | 'postgresql' | 'mysql' | 'mssql'

export interface DatabaseConfig {
  dialect: DatabaseDialect
  host: string
  port: number
  database: string
  username: string
  has_password: boolean
  options: Record<string, string | number | boolean>
}

export interface DatabaseStatus {
  dialect: string
  is_connected: boolean
  version: string
  table_count: number
  database_size_mb: number | null
  migration_current: string | null
  migration_head: string | null
  is_up_to_date: boolean
}

export interface ConnectionTestResult {
  success: boolean
  message: string
  latency_ms: number | null
  server_version: string | null
}

export interface MigrationInfo {
  current_revision: string | null
  head_revision: string | null
  pending_count: number
  is_up_to_date: boolean
}

// OPC-UA Server types
export interface OPCUAServer {
  id: number
  plant_id: number | null
  name: string
  endpoint_url: string
  auth_mode: 'anonymous' | 'username_password'
  username: string | null
  security_policy: string
  security_mode: string
  has_ca_cert: boolean
  has_client_cert: boolean
  tls_insecure: boolean
  is_active: boolean
  session_timeout: number
  publishing_interval: number
  sampling_interval: number
  created_at: string
  updated_at: string
}

export interface OPCUAServerCreate {
  name: string
  endpoint_url: string
  auth_mode: 'anonymous' | 'username_password'
  username?: string
  password?: string
  security_policy?: string
  security_mode?: string
  is_active?: boolean
  session_timeout?: number
  publishing_interval?: number
  sampling_interval?: number
  plant_id?: number
  ca_cert_pem?: string | null
  client_cert_pem?: string | null
  client_key_pem?: string | null
  tls_insecure?: boolean
}

export interface OPCUAServerUpdate {
  name?: string
  endpoint_url?: string
  auth_mode?: 'anonymous' | 'username_password'
  username?: string
  password?: string
  security_policy?: string
  security_mode?: string
  is_active?: boolean
  session_timeout?: number
  publishing_interval?: number
  sampling_interval?: number
  ca_cert_pem?: string | null
  client_cert_pem?: string | null
  client_key_pem?: string | null
  tls_insecure?: boolean
  change_reason?: string
}

export interface OPCUAServerStatus {
  server_id: number
  server_name: string
  endpoint_url: string
  is_connected: boolean
  last_connected: string | null
  error_message: string | null
  monitored_nodes: string[]
}

/** Alias used by connectivity components */
export type OPCUAServerConnectionStatus = OPCUAServerStatus

export interface OPCUABrowsedNode {
  node_id: string
  browse_name: string
  display_name: string
  node_class: string
  data_type: string | null
  is_readable: boolean
  is_folder: boolean
  children_count: number
}

export interface OPCUANodeValue {
  node_id: string
  value: unknown
  data_type: string
  source_timestamp: string | null
  server_timestamp: string | null
  status_code: string
}

export interface OPCUATestResult {
  success: boolean
  message: string
  server_info: Record<string, unknown> | null
}

// Retention policy types
export interface RetentionPolicy {
  id: number
  plant_id: number
  scope: string
  hierarchy_id: number | null
  characteristic_id: number | null
  retention_type: 'forever' | 'sample_count' | 'time_delta'
  retention_value: number | null
  retention_unit: 'days' | 'weeks' | 'months' | 'years' | null
  created_at: string
  updated_at: string
}

export interface RetentionPolicySet {
  retention_type: 'forever' | 'sample_count' | 'time_delta'
  retention_value?: number | null
  retention_unit?: 'days' | 'weeks' | 'months' | 'years' | null
}

export interface EffectiveRetention {
  retention_type: string
  retention_value: number | null
  retention_unit: string | null
  source: 'characteristic' | 'hierarchy' | 'global' | 'default'
  source_id: number | null
  source_name: string | null
}

export interface RetentionOverride {
  id: number
  scope: string
  hierarchy_id: number | null
  characteristic_id: number | null
  hierarchy_name: string | null
  characteristic_name: string | null
  retention_type: string
  retention_value: number | null
  retention_unit: string | null
  updated_at: string
}

export interface PurgeHistory {
  id: number
  plant_id: number
  started_at: string
  completed_at: string | null
  status: 'running' | 'completed' | 'failed'
  samples_deleted: number
  violations_deleted: number
  characteristics_processed: number
  error_message: string | null
}

export interface NextPurgeInfo {
  next_run_at: string | null
  interval_hours: number
  last_run: PurgeHistory | null
}

// Audit log types
export interface AuditLogEntry {
  id: number
  user_id: number | null
  username: string | null
  action: string
  resource_type: string | null
  resource_id: number | null
  resource_display: string | null
  detail: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  timestamp: string
}

export interface AuditLogListResponse {
  items: AuditLogEntry[]
  total: number
  limit: number
  offset: number
}

export interface AuditStats {
  total_events: number
  events_by_action: Record<string, number>
  events_by_resource: Record<string, number>
}

// Capability types
export interface CapabilityResult {
  cp: number | null
  cpk: number | null
  pp: number | null
  ppk: number | null
  cpm: number | null
  sample_count: number
  normality_p_value: number | null
  normality_test: string
  is_normal: boolean
  calculated_at: string
  usl: number | null
  lsl: number | null
  target: number | null
  sigma_within: number | null
  short_run_mode: string | null
  // Bootstrap confidence intervals (present when include_ci=true)
  cpk_ci: [number, number] | null
  ppk_ci: [number, number] | null
  pp_ci: [number, number] | null
  ci_confidence: number | null
  ci_method: string | null
  n_bootstrap: number | null
}

export interface CapabilityHistoryItem {
  id: number
  cp: number | null
  cpk: number | null
  pp: number | null
  ppk: number | null
  cpm: number | null
  sample_count: number
  normality_p_value: number | null
  normality_test: string | null
  calculated_at: string
  calculated_by: string
}

export interface CapabilitySnapshotResponse {
  id: number
  capability: CapabilityResult
}

// Rule preset types (Sprint 5 - A2)
export interface RulePreset {
  id: number
  name: string
  description: string | null
  is_builtin: boolean
  rules_config: RuleConfig[]
  plant_id: number | null
}

export interface RuleConfig {
  rule_id: number
  is_enabled: boolean
  parameters: Record<string, number> | null
}

export interface CharacteristicRuleWithParams {
  rule_id: number
  is_enabled: boolean
  require_acknowledgement: boolean
  parameters: Record<string, number> | null
}

// Scheduled Report types
export interface ReportSchedule {
  id: number
  plant_id: number
  name: string
  template_id: string
  scope_type: 'plant' | 'hierarchy' | 'characteristic'
  scope_id: number | null
  frequency: 'daily' | 'weekly' | 'monthly'
  hour: number
  day_of_week: number | null
  day_of_month: number | null
  recipients: string[]
  window_days: number
  is_active: boolean
  last_run_at: string | null
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface ReportRun {
  id: number
  schedule_id: number
  started_at: string
  completed_at: string | null
  status: 'running' | 'success' | 'failed'
  error_message: string | null
  recipients_count: number
  pdf_size_bytes: number | null
}

export interface CreateReportSchedule {
  name: string
  template_id: string
  scope_type: 'plant' | 'hierarchy' | 'characteristic'
  scope_id?: number | null
  frequency: 'daily' | 'weekly' | 'monthly'
  hour?: number
  day_of_week?: number | null
  day_of_month?: number | null
  recipients: string[]
  window_days?: number
  is_active?: boolean
  plant_id: number
}

export interface UpdateReportSchedule {
  name?: string
  template_id?: string
  scope_type?: 'plant' | 'hierarchy' | 'characteristic'
  scope_id?: number | null
  frequency?: 'daily' | 'weekly' | 'monthly'
  hour?: number
  day_of_week?: number | null
  day_of_month?: number | null
  recipients?: string[]
  window_days?: number
  is_active?: boolean
}

// Non-normal capability types (Sprint 5 - A1)
export interface HistogramData {
  bin_edges: number[] // n+1 edges
  counts: number[] // n bin counts
  density: number[] // n density values
}

export interface NonNormalCapabilityResult extends CapabilityResult {
  method: string
  method_detail: string
  fitted_distribution: DistributionFitResultData | null
  percentile_pp: number | null
  percentile_ppk: number | null
  p0_135: number | null
  p50: number | null
  p99_865: number | null
  histogram: HistogramData | null
  qq_points: QQPoints | null
}

export interface QQPoints {
  sample_quantiles: number[]
  theoretical_quantiles: number[]
}

export interface DistributionFitResultData {
  family: string
  parameters: Record<string, number>
  ad_statistic: number
  ad_p_value: number | null
  aic: number
  is_adequate_fit: boolean
  gof_test_type: string // "anderson_darling" or "kolmogorov_smirnov"
  qq_points: QQPoints | null
}

export interface DistributionFitResponse {
  fits: DistributionFitResultData[]
  best_fit: DistributionFitResultData | null
  recommendation: string
}

// Brand config types (server-side)
export interface BrandColorSeedDTO {
  hex: string
  light_override?: string | null
  dark_override?: string | null
}

export interface LogoColorsDTO {
  planet?: string | null
  ring?: string | null
  line?: string | null
  dot?: string | null
}

export interface BrandConfigDTO {
  app_name?: string | null
  logo_url?: string | null
  logo_colors?: LogoColorsDTO | null
  primary?: BrandColorSeedDTO | null
  accent?: BrandColorSeedDTO | null
  destructive?: BrandColorSeedDTO | null
  warning?: BrandColorSeedDTO | null
  success?: BrandColorSeedDTO | null
  heading_font?: string | null
  body_font?: string | null
  visual_style?: string | null
  login_mode?: string | null
  login_background_url?: string | null
  preset_id?: string | null
}

// Display key format (site-wide)
export interface DisplayKeyFormatDTO {
  date_pattern: string
  separator: '-' | '.' | '/' | '#'
  number_placement: 'after' | 'before'
  number_digits: number
}

// System settings
export interface SystemSettings {
  date_format: string
  datetime_format: string
  brand_config?: BrandConfigDTO | null
  display_key_format?: DisplayKeyFormatDTO | null
  updated_at: string
}

export interface SystemSettingsUpdate {
  date_format?: string
  datetime_format?: string
  brand_config?: BrandConfigDTO | null
  display_key_format?: DisplayKeyFormatDTO | null
}
