/**
 * Help content registry for contextual tooltips throughout the application.
 * Provides SPC-specific explanations for Nelson rules, statistical terms, and concepts.
 */

/**
 * Interface defining the structure of help content entries.
 */
export interface HelpContent {
  /** Title displayed in the tooltip header */
  title: string
  /** Brief description (1-2 sentences) */
  description: string
  /** Optional longer explanation with practical details */
  details?: string
  /** Severity level for rules (used for visual styling) */
  severity?: 'CRITICAL' | 'WARNING' | 'INFO'
  /** Optional external link for more information */
  learnMoreUrl?: string
}

/**
 * Registry of all help content entries indexed by unique keys.
 * Keys follow conventions:
 * - nelson-rule-{1-8}: Nelson rule explanations
 * - {term}-explanation: Statistical term definitions
 * - subgroup-mode-{mode}: Subgroup mode descriptions
 * - zone-{letter}: Zone definitions
 */
export const helpContent: Record<string, HelpContent> = {
  // Nelson Rules (1-8)
  'nelson-rule-1': {
    title: 'Rule 1: Beyond 3 Sigma',
    description: 'One point lies beyond 3 standard deviations from the center line.',
    details:
      'This indicates an extreme outlier that is highly unlikely to occur by chance alone (0.27% probability). Immediate investigation is recommended to identify special causes.',
    severity: 'CRITICAL',
  },
  'nelson-rule-2': {
    title: 'Rule 2: Zone Bias',
    description: '9 consecutive points fall on the same side of the center line.',
    details:
      'This pattern suggests a shift in the process mean. The probability of 9 consecutive points on one side by chance is less than 0.4%. Check for equipment drift, material changes, or environmental factors.',
    severity: 'WARNING',
  },
  'nelson-rule-3': {
    title: 'Rule 3: Trend',
    description: '6 consecutive points steadily increasing or decreasing.',
    details:
      'A monotonic trend indicates a gradual process shift, often caused by tool wear, operator fatigue, or temperature drift. Address before the trend leads to out-of-spec conditions.',
    severity: 'WARNING',
  },
  'nelson-rule-4': {
    title: 'Rule 4: Oscillation',
    description: '14 consecutive points alternating up and down.',
    details:
      'Systematic alternation suggests over-adjustment, two alternating measurement systems, or cyclical environmental effects. This non-random pattern warrants investigation.',
    severity: 'WARNING',
  },
  'nelson-rule-5': {
    title: 'Rule 5: Zone A Pattern',
    description: '2 of 3 consecutive points in Zone A or beyond.',
    details:
      'Zone A is 2-3 sigma from center. Having 2 of 3 points this far out indicates increased process variability or a mean shift beginning. Monitor closely for developing issues.',
    severity: 'WARNING',
  },
  'nelson-rule-6': {
    title: 'Rule 6: Zone B Pattern',
    description: '4 of 5 consecutive points in Zone B or beyond.',
    details:
      'Zone B is 1-2 sigma from center. This clustering pattern suggests the process is not centered properly or variability is changing. Investigate potential assignable causes.',
    severity: 'WARNING',
  },
  'nelson-rule-7': {
    title: 'Rule 7: Zone C Stability',
    description: '15 consecutive points within Zone C.',
    details:
      'Zone C is within 1 sigma of center. While appearing "too good," this may indicate stratified sampling, incorrect control limits, or manipulated data. Verify sampling methods.',
    severity: 'INFO',
  },
  'nelson-rule-8': {
    title: 'Rule 8: Mixed Zones',
    description: '8 consecutive points outside Zone C on both sides.',
    details:
      'Points avoiding the center suggests a mixture of populations or systematic measurement issues. Check for batch-to-batch variation or multiple operators.',
    severity: 'WARNING',
  },

  // Statistical terms
  'ucl-explanation': {
    title: 'Upper Control Limit (UCL)',
    description: 'The upper boundary of expected process variation, typically set at +3 sigma from the center line.',
    details:
      'Points above the UCL indicate the process may be out of statistical control. The UCL is calculated from historical data and represents the expected upper limit of natural variation.',
  },
  'lcl-explanation': {
    title: 'Lower Control Limit (LCL)',
    description: 'The lower boundary of expected process variation, typically set at -3 sigma from the center line.',
    details:
      'Points below the LCL indicate the process may be out of statistical control. For some quality characteristics, only the UCL may be relevant (e.g., defect counts).',
  },
  'center-line': {
    title: 'Center Line',
    description: 'The process center, calculated as the mean of subgroup means (X-double-bar).',
    details:
      'Represents the expected average value when the process is in control. Deviations from this line are evaluated against control limits to detect process changes.',
  },
  'sigma-estimation': {
    title: 'Sigma Estimation',
    description: 'The estimated process standard deviation used to calculate control limits.',
    details:
      'For X-bar charts, sigma is typically estimated using R-bar/d2 or S-bar/c4 methods. This provides a more stable estimate than calculating standard deviation directly from all data.',
  },

  // Subgroup modes
  'subgroup-mode-nominal': {
    title: 'Nominal with Tolerance',
    description: 'Uses the nominal subgroup size for control limits with a minimum threshold.',
    details:
      'Default mode for backward compatibility. Samples below minimum are rejected, others use nominal n for calculations. Best when sample sizes are mostly consistent.',
  },
  'subgroup-mode-variable': {
    title: 'Variable Control Limits',
    description: 'Recalculates UCL/LCL per point based on actual sample size.',
    details:
      'Creates a "funnel effect" where larger samples have tighter limits. Requires stored sigma and center line from initial calculation. Best for varying sample sizes.',
  },
  'subgroup-mode-standardized': {
    title: 'Standardized (Z-Score)',
    description: 'Plots Z-scores with fixed +/-3 control limits.',
    details:
      'Normalizes each point by its expected variability: Z = (X-bar - CL) / (sigma/sqrt(n)). All points comparable regardless of sample size. Best for highly variable sizes.',
  },

  // Zone definitions
  'zone-a': {
    title: 'Zone A',
    description: 'The area between 2 and 3 sigma from the center line.',
    details:
      'Points in Zone A are relatively rare under normal operation (about 4.3% of points). Multiple points in this zone may indicate a developing problem.',
  },
  'zone-b': {
    title: 'Zone B',
    description: 'The area between 1 and 2 sigma from the center line.',
    details:
      'About 27% of points should fall in Zone B under normal operation. Used in Nelson Rules 5 and 6 to detect unusual clustering.',
  },
  'zone-c': {
    title: 'Zone C',
    description: 'The area within 1 sigma of the center line.',
    details:
      'About 68% of points should fall in Zone C under normal operation. Too many or too few points in this zone may indicate issues.',
  },

  // Nelson Rules overview (for CharacteristicForm section header)
  'nelson-rules-overview': {
    title: 'Nelson Rules',
    description: 'Statistical rules for detecting non-random patterns in control charts.',
    details:
      'Enable rules to automatically detect specific out-of-control conditions. Each rule looks for different patterns that indicate the process may be out of statistical control.',
  },
}

/**
 * Get help content by key with fallback for missing keys.
 * @param key The help content key to look up
 * @returns The help content or a default "not found" entry
 */
export function getHelpContent(key: string): HelpContent {
  return (
    helpContent[key] ?? {
      title: 'Help',
      description: 'Help content not available for this item.',
    }
  )
}
