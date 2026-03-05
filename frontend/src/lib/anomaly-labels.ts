/** Shared anomaly detection labels and utilities.
 *
 * Single source of truth for human-friendly labels used across
 * ControlChart, AnomalyOverlay, AnomalyEventList, ChartToolbar,
 * and SampleInspectorModal.
 */

// ─── Event type → human label ───────────────────────────────────────────────

export const EVENT_TYPE_LABELS: Record<string, string> = {
  changepoint: 'Process Shift',
  outlier: 'Unusual Pattern',
  distribution_shift: 'Distribution Drift',
  anomaly_score: 'Unusual Pattern',
}

// ─── Detector → human label (what it found, not which algorithm) ────────────

export const DETECTOR_LABELS: Record<string, string> = {
  pelt: 'Process Shift',
  ks_test: 'Distribution Drift',
  isolation_forest: 'Unusual Pattern',
}

/** Human-friendly descriptions of what each detector looks for. */
export const DETECTOR_FRIENDLY: Record<string, string> = {
  pelt: 'Sudden change in process mean',
  ks_test: 'Gradual change in data distribution',
  isolation_forest: 'Data point deviates from normal behavior',
}

/** Technical algorithm names — shown as subtle parenthetical for engineers. */
export const DETECTOR_TECHNICAL: Record<string, string> = {
  pelt: 'PELT',
  ks_test: 'K-S Test',
  isolation_forest: 'Isolation Forest',
}

// ─── Severity colours (raw strings for ECharts innerHTML tooltips) ──────────

export const SEVERITY_COLORS: Record<string, string> = {
  INFO: '#3b82f6',
  WARNING: '#f59e0b',
  CRITICAL: '#ef4444',
}

export function severityColor(severity: string): string {
  return SEVERITY_COLORS[severity.toUpperCase()] ?? '#6b7280'
}

// ─── Severity → Tailwind theme-token classes (for DOM components) ───────────

export const SEVERITY_THEME_CLASS: Record<string, string> = {
  CRITICAL: 'text-destructive',
  WARNING: 'text-warning',
  INFO: 'text-primary',
}

export const SEVERITY_BADGE_CLASS: Record<string, string> = {
  CRITICAL: 'bg-destructive/15 text-destructive border-destructive/30',
  WARNING: 'bg-warning/15 text-warning border-warning/30',
  INFO: 'bg-primary/15 text-primary border-primary/30',
}

export const SEVERITY_PILL_CLASS: Record<string, string> = {
  CRITICAL: 'bg-destructive text-destructive-foreground',
  WARNING: 'bg-warning text-warning-foreground',
  INFO: 'bg-primary text-primary-foreground',
}

// ─── Severity priority for "worst wins" logic ───────────────────────────────

export const SEVERITY_PRIORITY: Record<string, number> = {
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2,
}

// ─── HTML escaping (for ECharts innerHTML tooltips) ─────────────────────────

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
