/**
 * Narrative Engine — deterministic textual assessments from statistical data.
 *
 * Every sentence maps to a threshold check. No AI/LLM text, no randomness.
 * Narratives are fully reproducible for regulated manufacturing environments.
 *
 * This module has ZERO React imports — pure TypeScript functions only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NarrativeSeverity = 'good' | 'warning' | 'critical'
export type NarrativeCategory =
  | 'stability'
  | 'capability'
  | 'centering'
  | 'variation'
  | 'measurement'
  | 'violations'
  | 'trend'

export interface NarrativeItem {
  severity: NarrativeSeverity
  category: NarrativeCategory
  text: string
  metric?: string
  value?: number
  threshold?: number
}

export interface ExecutiveSummary {
  overallHealth: NarrativeSeverity
  items: NarrativeItem[]
  recommendation: string
}

// ---------------------------------------------------------------------------
// Input interfaces (minimal shapes matching Cassini API responses)
// ---------------------------------------------------------------------------

interface ChartDataInput {
  data_points: Array<{ mean: number; excluded?: boolean; violations?: number[] }>
  control_limits: {
    ucl?: number | null
    lcl?: number | null
    center_line?: number | null
  }
  cusum_data_points?: Array<{ measurement: number; excluded?: boolean }>
  ewma_data_points?: Array<{ measurement: number; excluded?: boolean }>
  chart_type?: string | null
}

interface CapabilityInput {
  cp: number | null
  cpk: number | null
  pp: number | null
  ppk: number | null
  cpm?: number | null
  sample_count: number
  sigma_within: number | null
  usl: number | null
  lsl: number | null
  is_normal?: boolean
  normality_test?: string
  short_run_mode?: string | null
}

export interface ViolationInput {
  rule_id: number
  rule_name?: string
  severity: string | 'CRITICAL' | 'WARNING' | 'INFO' | 'alarm' | 'warning'
  acknowledged: boolean
  created_at?: string | null
}

// ---------------------------------------------------------------------------
// Nelson Rule name lookup
// ---------------------------------------------------------------------------

const NELSON_RULE_NAMES: Record<number, string> = {
  1: 'Point beyond 3\u03C3',
  2: '9 consecutive same side',
  3: '6 consecutive increasing/decreasing',
  4: '14 alternating up/down',
  5: '2 of 3 beyond 2\u03C3',
  6: '4 of 5 beyond 1\u03C3',
  7: '15 consecutive within 1\u03C3 (stratification)',
  8: '8 consecutive beyond 1\u03C3 (mixture)',
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<NarrativeSeverity, number> = {
  good: 0,
  warning: 1,
  critical: 2,
}

function worstSeverity(items: NarrativeItem[]): NarrativeSeverity {
  let worst: NarrativeSeverity = 'good'
  for (const item of items) {
    if (SEVERITY_ORDER[item.severity] > SEVERITY_ORDER[worst]) {
      worst = item.severity
    }
  }
  return worst
}

function sortBySeverity(items: NarrativeItem[]): NarrativeItem[] {
  return [...items].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
  )
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function pct(value: number): string {
  return value.toFixed(1)
}

function idx(value: number): string {
  return value.toFixed(2)
}

// ---------------------------------------------------------------------------
// assessStability
// ---------------------------------------------------------------------------

/**
 * Assesses process stability by examining out-of-control point frequency
 * and consecutive violation patterns within chart data.
 */
export function assessStability(chartData: ChartDataInput): NarrativeItem[] {
  const items: NarrativeItem[] = []
  const activePoints = chartData.data_points.filter((p) => !p.excluded)
  const total = activePoints.length

  if (total === 0) {
    items.push({
      severity: 'warning',
      category: 'stability',
      text: 'No data points available for stability assessment',
    })
    return items
  }

  // OOC percentage
  const oocPoints = activePoints.filter(
    (p) => p.violations && p.violations.length > 0,
  )
  const oocCount = oocPoints.length
  const oocPct = (oocCount / total) * 100

  if (oocPct > 5) {
    items.push({
      severity: 'critical',
      category: 'stability',
      text: `${pct(oocPct)}% of data points are out of control (${oocCount} of ${total} points have violations)`,
      metric: 'OOC%',
      value: oocPct,
      threshold: 5,
    })
  } else if (oocPct >= 1) {
    items.push({
      severity: 'warning',
      category: 'stability',
      text: `${pct(oocPct)}% of data points are out of control (${oocCount} of ${total} points have violations)`,
      metric: 'OOC%',
      value: oocPct,
      threshold: 1,
    })
  } else {
    items.push({
      severity: 'good',
      category: 'stability',
      text: 'Process is stable \u2014 no out-of-control points detected',
      metric: 'OOC%',
      value: 0,
      threshold: 1,
    })
  }

  // Consecutive violation pattern
  let maxConsecutive = 0
  let currentRun = 0
  for (const point of activePoints) {
    if (point.violations && point.violations.length > 0) {
      currentRun++
      if (currentRun > maxConsecutive) {
        maxConsecutive = currentRun
      }
    } else {
      currentRun = 0
    }
  }

  if (maxConsecutive > 3) {
    items.push({
      severity: 'critical',
      category: 'stability',
      text: `${maxConsecutive} consecutive data points have violations \u2014 indicates a sustained process disturbance`,
      metric: 'ConsecutiveOOC',
      value: maxConsecutive,
      threshold: 3,
    })
  }

  // CUSUM/EWMA chart type note
  const chartType = chartData.chart_type?.toLowerCase()
  if (chartType === 'cusum' || chartType === 'ewma') {
    const label = chartType.toUpperCase()
    items.push({
      severity: 'good',
      category: 'stability',
      text: `Stability assessed using ${label} chart \u2014 optimized for detecting small sustained shifts`,
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// assessCapability
// ---------------------------------------------------------------------------

/**
 * Assesses process capability against AIAG thresholds for Cpk, Ppk,
 * centering (Cp vs Cpk gap), normality, and spec limit configuration.
 */
export function assessCapability(capability: CapabilityInput): NarrativeItem[] {
  const items: NarrativeItem[] = []

  // One-sided spec check
  const hasUsl = capability.usl != null
  const hasLsl = capability.lsl != null
  if (hasUsl && !hasLsl) {
    items.push({
      severity: 'good',
      category: 'capability',
      text: 'One-sided specification (USL only) \u2014 capability indices reflect upper bound only',
      metric: 'USL',
      value: capability.usl!,
    })
  } else if (!hasUsl && hasLsl) {
    items.push({
      severity: 'good',
      category: 'capability',
      text: 'One-sided specification (LSL only) \u2014 capability indices reflect lower bound only',
      metric: 'LSL',
      value: capability.lsl!,
    })
  }

  // Cpk assessment
  if (capability.cpk != null) {
    const cpk = capability.cpk
    if (cpk >= 1.67) {
      items.push({
        severity: 'good',
        category: 'capability',
        text: `Process is highly capable (Cpk = ${idx(cpk)}, exceeds 1.67 target)`,
        metric: 'Cpk',
        value: cpk,
        threshold: 1.67,
      })
    } else if (cpk >= 1.33) {
      items.push({
        severity: 'good',
        category: 'capability',
        text: `Process is capable (Cpk = ${idx(cpk)}, meets 1.33 minimum)`,
        metric: 'Cpk',
        value: cpk,
        threshold: 1.33,
      })
    } else if (cpk >= 1.0) {
      items.push({
        severity: 'warning',
        category: 'capability',
        text: `Process capability is marginal (Cpk = ${idx(cpk)}, below 1.33 target)`,
        metric: 'Cpk',
        value: cpk,
        threshold: 1.33,
      })
    } else {
      items.push({
        severity: 'critical',
        category: 'capability',
        text: `Process is not capable (Cpk = ${idx(cpk)}, below 1.0 minimum)`,
        metric: 'Cpk',
        value: cpk,
        threshold: 1.0,
      })
    }
  }

  // Ppk assessment (overall capability)
  if (capability.ppk != null) {
    const ppk = capability.ppk
    if (ppk >= 1.67) {
      items.push({
        severity: 'good',
        category: 'capability',
        text: `Overall performance is highly capable (Ppk = ${idx(ppk)}, exceeds 1.67 target)`,
        metric: 'Ppk',
        value: ppk,
        threshold: 1.67,
      })
    } else if (ppk >= 1.33) {
      items.push({
        severity: 'good',
        category: 'capability',
        text: `Overall performance is capable (Ppk = ${idx(ppk)}, meets 1.33 minimum)`,
        metric: 'Ppk',
        value: ppk,
        threshold: 1.33,
      })
    } else if (ppk >= 1.0) {
      items.push({
        severity: 'warning',
        category: 'capability',
        text: `Overall performance is marginal (Ppk = ${idx(ppk)}, below 1.33 target)`,
        metric: 'Ppk',
        value: ppk,
        threshold: 1.33,
      })
    } else {
      items.push({
        severity: 'critical',
        category: 'capability',
        text: `Overall performance is not capable (Ppk = ${idx(ppk)}, below 1.0 minimum)`,
        metric: 'Ppk',
        value: ppk,
        threshold: 1.0,
      })
    }
  }

  // Centering: Cp vs Cpk gap
  if (capability.cp != null && capability.cpk != null) {
    const gap = capability.cp - capability.cpk
    if (gap > 0.3) {
      items.push({
        severity: 'warning',
        category: 'centering',
        text: `Process is off-center (Cp = ${idx(capability.cp)}, Cpk = ${idx(capability.cpk)}, gap = ${idx(gap)}) \u2014 centering adjustment could improve capability`,
        metric: 'Cp-Cpk gap',
        value: gap,
        threshold: 0.3,
      })
    }
  }

  // Normality check
  if (capability.is_normal === false && !capability.short_run_mode) {
    items.push({
      severity: 'warning',
      category: 'variation',
      text: `Data does not follow a normal distribution${capability.normality_test ? ` (${capability.normality_test} test)` : ''} \u2014 capability indices may not be reliable without transformation`,
    })
  }

  // Short-run mode
  if (capability.short_run_mode) {
    items.push({
      severity: 'good',
      category: 'capability',
      text: `Short-run mode active (${capability.short_run_mode}) \u2014 indices are adjusted for limited sample size (n = ${capability.sample_count})`,
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// assessViolationPattern
// ---------------------------------------------------------------------------

/**
 * Assesses violation patterns by examining severity distribution,
 * acknowledgment status, and dominant Nelson rule occurrences.
 */
export function assessViolationPattern(
  violations: ViolationInput[],
): NarrativeItem[] {
  const items: NarrativeItem[] = []

  if (violations.length === 0) {
    items.push({
      severity: 'good',
      category: 'violations',
      text: 'No Nelson rule violations detected in the analysis window',
    })
    return items
  }

  // Count by severity
  const alarmCount = violations.filter(
    (v) => v.severity.toLowerCase() === 'alarm',
  ).length
  const warningCount = violations.filter(
    (v) => v.severity.toLowerCase() === 'warning',
  ).length

  if (alarmCount > 0) {
    items.push({
      severity: 'critical',
      category: 'violations',
      text: `${alarmCount} alarm-level violation${alarmCount !== 1 ? 's' : ''} detected${warningCount > 0 ? ` along with ${warningCount} warning${warningCount !== 1 ? 's' : ''}` : ''}`,
      metric: 'AlarmCount',
      value: alarmCount,
    })
  } else if (warningCount > 0) {
    items.push({
      severity: 'warning',
      category: 'violations',
      text: `${warningCount} warning-level violation${warningCount !== 1 ? 's' : ''} detected`,
      metric: 'WarningCount',
      value: warningCount,
    })
  }

  // Unacknowledged count
  const unacknowledged = violations.filter((v) => !v.acknowledged).length
  if (unacknowledged > 3) {
    items.push({
      severity: 'warning',
      category: 'violations',
      text: `${unacknowledged} violations require acknowledgment`,
      metric: 'Unacknowledged',
      value: unacknowledged,
      threshold: 3,
    })
  }

  // Group by rule_id, find most frequent
  const ruleGroups = new Map<number, number>()
  for (const v of violations) {
    ruleGroups.set(v.rule_id, (ruleGroups.get(v.rule_id) ?? 0) + 1)
  }

  let dominantRuleId = 0
  let dominantCount = 0
  for (const [ruleId, count] of ruleGroups) {
    if (count > dominantCount) {
      dominantCount = count
      dominantRuleId = ruleId
    }
  }

  if (
    dominantRuleId > 0 &&
    dominantCount / violations.length > 0.5
  ) {
    const ruleName =
      NELSON_RULE_NAMES[dominantRuleId] ?? `Rule ${dominantRuleId}`
    const dominantPct = (dominantCount / violations.length) * 100
    items.push({
      severity: 'warning',
      category: 'violations',
      text: `Dominant pattern: Nelson Rule ${dominantRuleId} (${ruleName}) accounts for ${pct(dominantPct)}% of violations (${dominantCount} of ${violations.length})`,
      metric: `Rule${dominantRuleId}`,
      value: dominantCount,
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// assessTrend
// ---------------------------------------------------------------------------

/**
 * Assesses temporal trends by examining drift (linear regression slope),
 * mean shift (first-half vs second-half), and sigma trend (widening/narrowing).
 * Requires at least 10 non-excluded data points.
 */
export function assessTrend(chartData: ChartDataInput): NarrativeItem[] {
  const items: NarrativeItem[] = []
  const activePoints = chartData.data_points.filter((p) => !p.excluded)

  if (activePoints.length < 10) {
    items.push({
      severity: 'warning',
      category: 'trend',
      text: 'Insufficient data for trend analysis (minimum 10 non-excluded points required)',
    })
    return items
  }

  const values = activePoints.map((p) => p.mean)
  const n = values.length

  // Compute sigma from center line ± control limits, or from data std dev
  const cl = chartData.control_limits.center_line
  const ucl = chartData.control_limits.ucl
  let sigma: number
  if (cl != null && ucl != null && ucl > cl) {
    sigma = (ucl - cl) / 3
  } else {
    const mean = values.reduce((s, v) => s + v, 0) / n
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
    sigma = Math.sqrt(variance)
  }

  // Guard against near-zero sigma
  if (sigma < 1e-12) {
    items.push({
      severity: 'good',
      category: 'trend',
      text: 'No measurable variation detected — trend analysis not applicable',
    })
    return items
  }

  // --- Drift detection: linear regression slope over 5-point moving average ---
  const windowSize = 5
  const ma: number[] = []
  for (let i = 0; i <= n - windowSize; i++) {
    let sum = 0
    for (let j = i; j < i + windowSize; j++) sum += values[j]
    ma.push(sum / windowSize)
  }

  if (ma.length >= 2) {
    const maN = ma.length
    const xMean = (maN - 1) / 2
    const yMean = ma.reduce((s, v) => s + v, 0) / maN
    let num = 0
    let den = 0
    for (let i = 0; i < maN; i++) {
      num += (i - xMean) * (ma[i] - yMean)
      den += (i - xMean) ** 2
    }
    const slope = den > 0 ? num / den : 0
    const normalizedSlope = Math.abs(slope) / sigma

    if (normalizedSlope > 0.1) {
      const direction = slope > 0 ? 'upward' : 'downward'
      items.push({
        severity: 'critical',
        category: 'trend',
        text: `Significant ${direction} drift detected (slope/\u03C3 = ${normalizedSlope.toFixed(3)}/point, threshold 0.1)`,
        metric: 'DriftSlope',
        value: normalizedSlope,
        threshold: 0.1,
      })
    } else if (normalizedSlope > 0.05) {
      const direction = slope > 0 ? 'upward' : 'downward'
      items.push({
        severity: 'warning',
        category: 'trend',
        text: `Moderate ${direction} drift detected (slope/\u03C3 = ${normalizedSlope.toFixed(3)}/point, threshold 0.05)`,
        metric: 'DriftSlope',
        value: normalizedSlope,
        threshold: 0.05,
      })
    }
  }

  // --- Mean shift: first-half vs second-half ---
  const half = Math.floor(n / 2)
  const firstHalf = values.slice(0, half)
  const secondHalf = values.slice(n - half)
  const firstMean = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length
  const secondMean = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length
  const meanShift = Math.abs(secondMean - firstMean) / sigma

  if (meanShift > 2) {
    const direction = secondMean > firstMean ? 'increased' : 'decreased'
    items.push({
      severity: 'critical',
      category: 'trend',
      text: `Large mean shift detected \u2014 process mean ${direction} by ${meanShift.toFixed(2)}\u03C3 between first and second half`,
      metric: 'MeanShift',
      value: meanShift,
      threshold: 2,
    })
  } else if (meanShift > 1) {
    const direction = secondMean > firstMean ? 'increased' : 'decreased'
    items.push({
      severity: 'warning',
      category: 'trend',
      text: `Mean shift detected \u2014 process mean ${direction} by ${meanShift.toFixed(2)}\u03C3 between first and second half`,
      metric: 'MeanShift',
      value: meanShift,
      threshold: 1,
    })
  }

  // --- Sigma trend: first-third vs last-third rolling std dev ---
  const third = Math.floor(n / 3)
  const firstThird = values.slice(0, third)
  const lastThird = values.slice(n - third)

  function stdDev(arr: number[]): number {
    const m = arr.reduce((s, v) => s + v, 0) / arr.length
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1))
  }

  const sigmaFirst = stdDev(firstThird)
  const sigmaLast = stdDev(lastThird)

  if (sigmaFirst > 1e-12) {
    const ratio = sigmaLast / sigmaFirst

    if (ratio > 1.6) {
      items.push({
        severity: 'critical',
        category: 'trend',
        text: `Process variation is widening significantly (last-third \u03C3 / first-third \u03C3 = ${ratio.toFixed(2)}, threshold 1.6)`,
        metric: 'SigmaRatio',
        value: ratio,
        threshold: 1.6,
      })
    } else if (ratio > 1.3) {
      items.push({
        severity: 'warning',
        category: 'trend',
        text: `Process variation is widening (last-third \u03C3 / first-third \u03C3 = ${ratio.toFixed(2)}, threshold 1.3)`,
        metric: 'SigmaRatio',
        value: ratio,
        threshold: 1.3,
      })
    }
  }

  // If no trend issues found, report good
  if (items.length === 0) {
    items.push({
      severity: 'good',
      category: 'trend',
      text: 'No significant trends detected \u2014 process mean and variation are stable over time',
    })
  }

  return items
}

// ---------------------------------------------------------------------------
// generateExecutiveSummary
// ---------------------------------------------------------------------------

/**
 * Generates a consolidated executive summary by running all three
 * assessments and producing an overall health rating with a
 * prioritized recommendation.
 */
export function generateExecutiveSummary(
  chartData: ChartDataInput,
  capability: CapabilityInput,
  violations: ViolationInput[],
): ExecutiveSummary {
  const stabilityItems = assessStability(chartData)
  const capabilityItems = assessCapability(capability)
  const violationItems = assessViolationPattern(violations)
  const trendItems = assessTrend(chartData)

  const allItems = sortBySeverity([
    ...stabilityItems,
    ...capabilityItems,
    ...violationItems,
    ...trendItems,
  ])

  const overallHealth = worstSeverity(allItems)

  // Determine recommendation from worst items
  let recommendation: string
  if (overallHealth === 'critical') {
    const criticalItems = allItems.filter((i) => i.severity === 'critical')
    const hasStability = criticalItems.some(
      (i) => i.category === 'stability',
    )
    const hasCapability = criticalItems.some(
      (i) => i.category === 'capability',
    )
    const hasViolations = criticalItems.some(
      (i) => i.category === 'violations',
    )
    const hasTrend = criticalItems.some(
      (i) => i.category === 'trend',
    )

    if (hasStability) {
      recommendation =
        'Investigate and resolve out-of-control conditions before assessing capability'
    } else if (hasTrend) {
      recommendation =
        'Significant process drift or shift detected \u2014 investigate assignable cause immediately'
    } else if (hasCapability) {
      recommendation =
        'Process improvement needed \u2014 Cpk below minimum threshold'
    } else if (hasViolations) {
      recommendation =
        'Address unacknowledged violations and investigate root cause patterns'
    } else {
      recommendation =
        'Critical conditions detected \u2014 investigate and resolve before continuing production'
    }
  } else if (overallHealth === 'warning') {
    recommendation =
      'Monitor process closely \u2014 marginal conditions detected'
  } else {
    recommendation =
      'Process is performing within acceptable limits \u2014 continue routine monitoring'
  }

  return {
    overallHealth,
    items: allItems,
    recommendation,
  }
}
