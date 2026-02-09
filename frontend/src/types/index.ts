// Auth types
export interface AuthUser {
  id: number
  username: string
  email: string | null
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
}

// Hierarchy types - UNS-compatible generic hierarchy
export interface HierarchyNode {
  id: number
  name: string
  type: string  // Flexible: Folder, Enterprise, Site, Area, Line, Cell, Equipment, Tag, or custom
  parent_id: number | null
  children?: HierarchyNode[]
  characteristic_count?: number
}

// Characteristic types
export type ProviderType = 'MANUAL' | 'TAG'
export type SubgroupMode = 'STANDARDIZED' | 'VARIABLE_LIMITS' | 'NOMINAL_TOLERANCE'

export interface Characteristic {
  id: number
  name: string
  hierarchy_id: number
  description: string | null
  provider_type: ProviderType
  subgroup_size: number
  target_value: number | null
  usl: number | null
  lsl: number | null
  ucl: number | null
  lcl: number | null
  mqtt_topic: string | null
  trigger_tag: string | null
  metric_name: string | null
  // Subgroup mode configuration
  subgroup_mode: SubgroupMode
  min_measurements: number
  warn_below_count: number | null
  stored_sigma: number | null
  stored_center_line: number | null
  decimal_precision: number
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
  in_control?: boolean
  last_sample_at?: string | null
  unacknowledged_violations?: number
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
  batch_number?: string | null
  operator_id?: string | null
  measurements: Measurement[]
  // Audit trail fields
  is_modified?: boolean
  edit_count?: number
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
  violation_rules: number[]  // Nelson rule numbers (1-8) that were violated
  zone: string
  // Variable subgroup size fields
  actual_n: number
  is_undersized: boolean
  effective_ucl: number | null
  effective_lcl: number | null
  z_score: number | null
  display_value: number | null
}

export interface ChartData {
  characteristic_id: number
  characteristic_name: string
  data_points: ChartDataPoint[]
  control_limits: {
    ucl: number | null
    lcl: number | null
    center_line: number | null
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
export interface WSSampleMessage {
  type: 'sample'
  characteristic_id: number
  sample: Sample
  violations: Violation[]
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

export type WSMessage = WSSampleMessage | WSViolationMessage | WSAckMessage | WSLimitsMessage

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
  is_active: boolean
  plant_id: number | null
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
}

export interface TagMappingResponse {
  characteristic_id: number
  characteristic_name: string
  mqtt_topic: string
  trigger_strategy: string
  trigger_tag: string | null
  broker_id: number
  broker_name: string
  metric_name: string | null
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
