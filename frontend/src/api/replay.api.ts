/**
 * Time-travel SPC replay API client.
 *
 * Reconstructs a control chart's state (limits, rules, signatures, samples)
 * at any historical moment by replaying the hash-chained audit log up to
 * the target timestamp. Read-only — replay snapshots are never persisted.
 *
 * Tier: Pro+. The backend returns 403 when the active license does not
 * include the `time_travel_replay` feature, so callers should gate the UI
 * via `useLicense().isProOrAbove` to avoid surfacing dead controls.
 */
import { fetchApi } from './client'

/** Subset of Characteristic fields relevant to a control chart replay. */
export interface ReplayCharacteristicConfig {
  id: number
  name: string
  description: string | null
  chart_type: string | null
  subgroup_size: number
  subgroup_mode: string
  target_value: number | null
  usl: number | null
  lsl: number | null
  ucl: number | null
  lcl: number | null
  stored_sigma: number | null
  stored_center_line: number | null
  decimal_precision: number
  data_type: string
  attribute_chart_type: string | null
  use_laney_correction: boolean
  short_run_mode: string | null
  sigma_method: string | null
  limits_frozen: boolean
  limits_frozen_at: string | null
}

export interface ReplayRule {
  rule_id: number
  is_enabled: boolean
  require_acknowledgement: boolean
  parameters: string | null
}

export interface ReplaySample {
  id: number
  timestamp: string
  batch_number: string | null
  operator_id: string | null
  is_excluded: boolean
  actual_n: number
}

export interface ReplaySignatureState {
  id: number
  timestamp: string
  username: string
  full_name: string | null
  meaning_code: string
  meaning_display: string
  resource_hash: string
  is_valid_at_replay: boolean
  invalidated_at: string | null
  invalidated_reason: string | null
}

export interface ReplaySnapshot {
  resource_type: string
  resource_id: number
  requested_at: string
  generated_at: string
  plant_id: number
  characteristic: ReplayCharacteristicConfig
  rules: ReplayRule[]
  samples: ReplaySample[]
  signatures: ReplaySignatureState[]
  audit_event_count: number
  earliest_known_state_at: string | null
}

/** Resource types the replay endpoint can reconstruct. */
export type ReplayResourceType = 'characteristic'

export const replayApi = {
  /**
   * Fetch a historical state snapshot for a given resource at `at`.
   *
   * @param resourceType Currently only `'characteristic'` is supported.
   * @param resourceId Numeric ID of the resource.
   * @param at ISO-8601 UTC timestamp to replay to.
   *
   * Note: paths NEVER include `/api/v1/` — `fetchApi` prepends it.
   */
  getSnapshot: (resourceType: ReplayResourceType, resourceId: number, at: string) =>
    fetchApi<ReplaySnapshot>(
      `/replay/${resourceType}/${resourceId}?at=${encodeURIComponent(at)}`,
    ),
}
