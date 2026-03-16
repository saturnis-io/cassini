/**
 * Shared Nelson Rule metadata and detailed descriptions.
 * Used by RulesTab (configuration) and SampleInspectorModal (violation display).
 */

export type NelsonSeverity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface NelsonRuleMeta {
  id: number
  name: string
  shortDesc: string
  severity: NelsonSeverity
}

export interface NelsonRuleDetail {
  description: string
  cause: string
  action: string
}

/**
 * Nelson rule metadata with display information.
 * Rules 1-8: Nelson Rules (Shewhart pattern detection)
 * Rules 9-10: CUSUM shift detection (cumulative sum crossing decision interval)
 * Rules 11-12: EWMA limit violations (weighted moving average crossing control limits)
 */
export const NELSON_RULES: readonly NelsonRuleMeta[] = [
  { id: 1, name: 'Beyond 3σ', shortDesc: 'Single point outside limits', severity: 'CRITICAL' },
  { id: 2, name: 'Zone Bias', shortDesc: '9 consecutive on same side', severity: 'WARNING' },
  { id: 3, name: 'Trend', shortDesc: '6 consecutive increasing/decreasing', severity: 'WARNING' },
  { id: 4, name: 'Oscillation', shortDesc: '14 consecutive alternating', severity: 'WARNING' },
  { id: 5, name: 'Zone A Pattern', shortDesc: '2 of 3 beyond 2σ', severity: 'WARNING' },
  { id: 6, name: 'Zone B Pattern', shortDesc: '4 of 5 beyond 1σ', severity: 'WARNING' },
  { id: 7, name: 'Zone C Stability', shortDesc: '15 consecutive within 1σ', severity: 'INFO' },
  { id: 8, name: 'Mixed Zones', shortDesc: '8 consecutive outside C', severity: 'WARNING' },
  // CUSUM shift detection
  { id: 9, name: 'CUSUM+ Shift', shortDesc: 'Upper CUSUM exceeded threshold', severity: 'CRITICAL' },
  { id: 10, name: 'CUSUM− Shift', shortDesc: 'Lower CUSUM exceeded threshold', severity: 'CRITICAL' },
  // EWMA limit violations
  { id: 11, name: 'EWMA Above UCL', shortDesc: 'EWMA exceeded upper limit', severity: 'CRITICAL' },
  { id: 12, name: 'EWMA Below LCL', shortDesc: 'EWMA below lower limit', severity: 'CRITICAL' },
] as const

/**
 * Detailed descriptions for each Nelson rule — educational content.
 */
export const NELSON_RULE_DETAILS: Record<number, NelsonRuleDetail> = {
  1: {
    description:
      'A single point falls outside the 3-sigma control limits (beyond UCL or LCL). This is the most severe violation as it indicates an extreme deviation from the process mean.',
    cause:
      'Equipment malfunction, measurement error, material defect, operator error, or a significant process upset.',
    action:
      'Immediately investigate the assignable cause. Check recent changes to materials, equipment, or procedures. Verify measurement accuracy.',
  },
  2: {
    description:
      'Nine or more consecutive points fall on the same side of the center line (all above or all below the mean). This indicates a shift in the process average.',
    cause:
      'Process mean has shifted due to tool wear, different raw material batch, environmental change, or calibration drift.',
    action:
      'Investigate what changed around the time the shift began. Check for material lot changes, equipment adjustments, or environmental factors.',
  },
  3: {
    description:
      'Six or more consecutive points are continuously increasing or decreasing. This indicates a trend in the process.',
    cause:
      'Tool wear, gradual equipment degradation, temperature drift, operator fatigue, or depleting consumables.',
    action:
      'Identify and address the source of drift. Consider implementing preventive maintenance or recalibration schedules.',
  },
  4: {
    description:
      'Fourteen or more consecutive points alternate up and down in a sawtooth pattern. This indicates over-adjustment or two alternating causes.',
    cause:
      'Over-correction by operators, alternating materials from two sources, fixture switching, or inspection by alternating gauges.',
    action:
      'Review operator adjustment procedures. Check if multiple material sources or equipment are being alternated. Verify measurement consistency.',
  },
  5: {
    description:
      'Two out of three consecutive points fall in Zone A (beyond 2σ from center) on the same side. Zone A is the outer third between 2σ and 3σ.',
    cause:
      'Process variance has increased, or the mean is shifting. Early warning of a potential Rule 1 violation.',
    action:
      'Monitor closely for further deterioration. Investigate recent changes that may have increased variability.',
  },
  6: {
    description:
      'Four out of five consecutive points fall in Zone B or beyond (beyond 1σ from center) on the same side. Zone B is between 1σ and 2σ.',
    cause: 'Small shift in process mean or gradually increasing variance.',
    action:
      'Investigate potential causes of shift. This is often an early indicator before a more serious violation occurs.',
  },
  7: {
    description:
      'Fifteen consecutive points fall within Zone C (within 1σ of center). While this looks "good," it indicates stratification or mixture of data from different sources.',
    cause:
      'Data from multiple streams being mixed, incorrect subgrouping, measurement resolution too coarse, or calculated/fabricated data.',
    action:
      'Review data collection methods. Verify subgroups contain data from the same source. Check that measurement resolution is adequate.',
  },
  8: {
    description:
      'Eight consecutive points fall outside Zone C (beyond 1σ on either side) with points on both sides of center. This bimodal pattern suggests mixture.',
    cause:
      'Two distinct processes or conditions being mixed, alternating operators with different techniques, or two measurement systems.',
    action:
      'Separate and analyze data by source. Identify the two populations and address the cause of inconsistency.',
  },
  // CUSUM shift detection (not Nelson Rules — different detection method)
  9: {
    description:
      'The upper CUSUM accumulator (C+) has exceeded the decision interval H. This indicates a sustained upward shift in the process mean that the cumulative sum has detected.',
    cause:
      'A persistent small-to-moderate upward shift in the process mean (typically 0.5–2 sigma). Common causes include tool wear, material change, or environmental drift.',
    action:
      'Investigate what changed around the time the CUSUM signaled. The CUSUM is more sensitive than Shewhart charts for small sustained shifts — the root cause may be subtle.',
  },
  10: {
    description:
      'The lower CUSUM accumulator (C−) has exceeded the decision interval H. This indicates a sustained downward shift in the process mean that the cumulative sum has detected.',
    cause:
      'A persistent small-to-moderate downward shift in the process mean (typically 0.5–2 sigma). Common causes include tool wear, material change, or environmental drift.',
    action:
      'Investigate what changed around the time the CUSUM signaled. The CUSUM is more sensitive than Shewhart charts for small sustained shifts — the root cause may be subtle.',
  },
  // EWMA limit violations (not Nelson Rules — different detection method)
  11: {
    description:
      'The EWMA statistic has exceeded the upper control limit. The exponentially weighted moving average smooths recent observations, making it sensitive to gradual shifts.',
    cause:
      'A sustained upward shift in the process mean, possibly too small for Shewhart detection. EWMA gives more weight to recent data, so this often indicates a developing trend.',
    action:
      'Investigate recent process changes. The EWMA signal may precede a Shewhart Rule 1 violation — early intervention can prevent further drift.',
  },
  12: {
    description:
      'The EWMA statistic has fallen below the lower control limit. The exponentially weighted moving average smooths recent observations, making it sensitive to gradual shifts.',
    cause:
      'A sustained downward shift in the process mean, possibly too small for Shewhart detection. EWMA gives more weight to recent data, so this often indicates a developing trend.',
    action:
      'Investigate recent process changes. The EWMA signal may precede a Shewhart Rule 1 violation — early intervention can prevent further drift.',
  },
}
