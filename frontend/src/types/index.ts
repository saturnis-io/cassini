// Hierarchy types
export interface HierarchyNode {
  id: number
  name: string
  node_type: 'ENTERPRISE' | 'SITE' | 'AREA' | 'PRODUCTION_LINE' | 'WORK_CELL' | 'EQUIPMENT'
  parent_id: number | null
  children?: HierarchyNode[]
  characteristic_count?: number
}

// Characteristic types
export type ProviderType = 'MANUAL' | 'TAG'
export type DataType = 'VARIABLE' | 'ATTRIBUTE'

export interface Characteristic {
  id: number
  name: string
  hierarchy_id: number
  provider_type: ProviderType
  data_type: DataType
  subgroup_size: number
  target: number | null
  usl: number | null
  lsl: number | null
  ucl: number | null
  lcl: number | null
  center_line: number | null
  sigma: number | null
  sample_interval_minutes: number | null
  enabled_rules: number[]
  in_control: boolean
  last_sample_at: string | null
  created_at: string
  updated_at: string
}

export interface CharacteristicSummary {
  id: number
  name: string
  hierarchy_id: number
  hierarchy_path: string
  provider_type: ProviderType
  in_control: boolean
  last_sample_at: string | null
  unacknowledged_violations: number
}

// Sample types
export interface Sample {
  id: number
  characteristic_id: number
  timestamp: string
  mean: number
  range: number | null
  std_dev: number | null
  excluded: boolean
  source: string
  measurements: Measurement[]
}

export interface Measurement {
  id: number
  sample_id: number
  sequence: number
  value: number
}

export interface ChartDataPoint {
  sample_id: number
  timestamp: string
  mean: number
  range: number | null
  excluded: boolean
  violation_ids: number[]
  zone: 'BEYOND_UCL' | 'ZONE_A_UPPER' | 'ZONE_B_UPPER' | 'ZONE_C_UPPER' | 'ZONE_C_LOWER' | 'ZONE_B_LOWER' | 'ZONE_A_LOWER' | 'BEYOND_LCL'
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
}

// Violation types
export type Severity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface Violation {
  id: number
  sample_id: number
  rule_id: number
  rule_name: string
  severity: Severity
  message: string
  involved_sample_ids: number[]
  acknowledged: boolean
  ack_user: string | null
  ack_reason: string | null
  ack_timestamp: string | null
  created_at: string
}

export interface ViolationStats {
  total: number
  unacknowledged: number
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
  page: number
  per_page: number
  pages: number
}

export interface ApiError {
  detail: string
}
