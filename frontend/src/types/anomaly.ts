export interface AnomalyDetectorConfig {
  id: number
  char_id: number
  is_enabled: boolean
  pelt_enabled: boolean
  pelt_model: 'l2' | 'rbf' | 'normal'
  pelt_penalty: string
  pelt_min_segment: number
  iforest_enabled: boolean
  iforest_contamination: number
  iforest_n_estimators: number
  iforest_min_training: number
  iforest_retrain_interval: number
  ks_enabled: boolean
  ks_reference_window: number
  ks_test_window: number
  ks_alpha: number
  notify_on_changepoint: boolean
  notify_on_anomaly_score: boolean
  notify_on_distribution_shift: boolean
  anomaly_score_threshold: number
  created_at: string
  updated_at: string
}

export interface AnomalyEvent {
  id: number
  char_id: number
  detector_type: 'pelt' | 'isolation_forest' | 'ks_test'
  event_type: 'changepoint' | 'outlier' | 'distribution_shift'
  severity: 'INFO' | 'WARNING' | 'CRITICAL'
  details: Record<string, unknown>
  sample_id: number | null
  window_start_id: number | null
  window_end_id: number | null
  is_acknowledged: boolean
  acknowledged_by: string | null
  acknowledged_at: string | null
  is_dismissed: boolean
  dismissed_by: string | null
  dismissed_reason: string | null
  summary: string | null
  detected_at: string
}

export interface AnomalySummary {
  characteristic_id: number
  characteristic_name: string
  active_anomalies: number
  latest_summary: string
  detectors: DetectorStatus[]
  last_analysis_at: string | null
}

export interface DetectorStatus {
  detector_type: string
  enabled: boolean
  last_detection_at: string | null
  model_age_samples: number | null
  events_last_24h: number
}

export interface AnomalyDashboardStats {
  total_active: number
  by_severity: Record<string, number>
  by_type: Record<string, number>
  by_detector: Record<string, number>
  acknowledged_count: number
  unacknowledged_count: number
}
