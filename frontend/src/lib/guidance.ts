// ── Empty State Content ──

export interface EmptyStateContent {
  title: string
  purpose: string
  useCases: string[]
  ctaLabel: string
  icon: string
}

export const emptyStates: Record<string, EmptyStateContent> = {
  correlation: {
    title: 'Correlation Analysis',
    purpose:
      'Discover hidden relationships between your quality characteristics. Correlation analysis reveals which measurements move together, helping you find root causes faster and monitor fewer variables.',
    useCases: [
      'You suspect two or more measurements are related (e.g., temperature and thickness)',
      'You want to reduce the number of characteristics you monitor daily',
      'You need to identify which variables contribute most to variation (PCA)',
      'A root cause investigation needs data-driven evidence of relationships',
    ],
    ctaLabel: 'Select Characteristics to Begin',
    icon: 'GitCompareArrows',
  },
  multivariate: {
    title: 'Multivariate SPC',
    purpose:
      'Monitor multiple correlated characteristics simultaneously. When variables are related, a multivariate chart detects shifts that individual charts would miss \u2014 catching problems earlier with fewer false alarms.',
    useCases: [
      'You have 2+ characteristics that are physically correlated (e.g., dimensions of a machined part)',
      'Individual control charts are showing frequent false alarms on related variables',
      'You need to detect subtle process shifts that affect multiple outputs at once',
      'You want a single chart to replace monitoring several related charts',
    ],
    ctaLabel: 'Create a Multivariate Group',
    icon: 'BarChart3',
  },
  predictions: {
    title: 'Predictive Analytics',
    purpose:
      'Forecast future process behavior using time-series models. Predictions alert you before a process goes out of control \u2014 giving you time to act rather than react.',
    useCases: [
      'You want early warning of trends before they cause out-of-control conditions',
      'You need to plan maintenance windows based on predicted process drift',
      'You want to compare how different characteristics are trending',
      'You need to justify process adjustments with data-driven forecasts',
    ],
    ctaLabel: 'Enable Predictions in Configuration',
    icon: 'TrendingUp',
  },
  'ai-insights': {
    title: 'AI Insights',
    purpose:
      'Get AI-powered analysis of your SPC data. The AI examines patterns, violations, capability trends, and anomalies across your characteristics \u2014 then provides plain-English summaries with actionable recommendations.',
    useCases: [
      'You want a quick summary of which characteristics need attention',
      'You need to explain process behavior to non-technical stakeholders',
      'You want to identify patterns that are hard to spot manually across many charts',
      'You need a starting point for root cause investigation',
    ],
    ctaLabel: 'Select a Characteristic to Analyze',
    icon: 'Sparkles',
  },
}

// ── Contextual Hint Content ──

export interface HintContent {
  id: string
  text: string
}

export const hints: Record<string, HintContent> = {
  correlationMethod: {
    id: 'hint-correlation-method',
    text: 'Pearson measures linear relationships and assumes normally distributed data. If your characteristics are skewed or have outliers, switch to Spearman for a more robust rank-based measure.',
  },
  correlationPCA: {
    id: 'hint-correlation-pca',
    text: 'PCA reduces many variables into a few principal components that capture the most variation. Enable this to see which characteristics contribute most to overall process variation.',
  },
  multivariatePhaseI: {
    id: 'hint-multivariate-phase-i',
    text: "Phase I collects baseline data to estimate the process center and covariance. Collect at least 20\u201330 stable subgroups before freezing. Remove any known special-cause points first \u2014 they'll bias your control limits.",
  },
  multivariateFreeze: {
    id: 'hint-multivariate-freeze',
    text: 'Freezing locks the mean vector and covariance matrix from Phase I data. After freezing, the chart switches to Phase II monitoring \u2014 new points are compared against this baseline. Only freeze when Phase I data is stable and representative.',
  },
  doeDesignType: {
    id: 'hint-doe-design-type',
    text: 'Full Factorial tests every combination (best for 2\u20134 factors). Fractional Factorial uses fewer runs with aliasing (4\u20137 factors). Plackett-Burman is a quick screening design. Central Composite adds curvature detection for optimization.',
  },
  capabilityCpVsCpk: {
    id: 'hint-capability-cp-vs-cpk',
    text: 'Compare Cp and Cpk: if Cp is much higher than Cpk, the process is capable but off-center \u2014 centering it could significantly improve yield. If both are similar, the process is well-centered.',
  },
  capabilityCpkVsPpk: {
    id: 'hint-capability-cpk-vs-ppk',
    text: 'Compare Cpk (short-term) and Ppk (long-term): if Ppk is much lower, the process has significant variation between shifts, batches, or time periods. Investigate what changes between your short-term and long-term data.',
  },
}

// ── Interpretation Functions ──

export interface Interpretation {
  summary: string
  highlights: InterpretHighlight[]
  actions: string[]
}

export interface InterpretHighlight {
  value: string
  color: 'success' | 'warning' | 'destructive' | 'accent'
}

export function interpretCapability(data: {
  cp: number | null
  cpk: number | null
  pp: number | null
  ppk: number | null
  cpm: number | null
}): Interpretation | null {
  const { cp, cpk, ppk } = data
  if (cpk === null) return null

  const highlights: InterpretHighlight[] = []
  const actions: string[] = []
  let summary: string

  if (cpk < 1.0) {
    summary = `Your Cpk of ${cpk.toFixed(2)} indicates the process cannot consistently meet specifications. The process spread is wider than the tolerance band, meaning defective parts are likely being produced.`
    highlights.push({ value: cpk.toFixed(2), color: 'destructive' })
    actions.push(
      'Investigate the largest sources of variation (machine, material, operator, environment)',
      'Check if the process mean can be re-centered to the target value',
    )
  } else if (cpk < 1.33) {
    summary = `Your Cpk of ${cpk.toFixed(2)} is marginal \u2014 the process is barely capable. Most automotive and aerospace standards require Cpk \u2265 1.33 for production approval.`
    highlights.push({ value: cpk.toFixed(2), color: 'warning' })
    actions.push(
      'Prioritize centering the process closer to the target value',
      'Investigate sources of variation that could be reduced',
    )
  } else {
    summary = `Your Cpk of ${cpk.toFixed(2)} indicates a capable process. The specification limits are comfortably within the process spread.`
    highlights.push({ value: cpk.toFixed(2), color: 'success' })
  }

  if (cp !== null && cpk !== null && cp - cpk > 0.2) {
    summary += ` Cp of ${cp.toFixed(2)} is noticeably higher than Cpk, suggesting the process is capable but off-center \u2014 a centering adjustment could improve yield.`
    actions.push(
      'Adjust the process mean toward the target to close the Cp\u2013Cpk gap',
    )
  }

  if (cpk !== null && ppk !== null && cpk - ppk > 0.15) {
    summary += ` Ppk of ${ppk.toFixed(2)} is lower than Cpk, indicating long-term variation is larger than short-term \u2014 investigate what changes between shifts, batches, or time periods.`
    actions.push(
      'Investigate sources of long-term variation (shift changes, tool changes, batch effects)',
    )
  }

  if (cpk >= 1.33 && actions.length === 0) {
    if (cpk >= 2.0) {
      actions.push(
        'Process is performing well \u2014 maintain current controls and monitor for drift',
      )
    } else {
      actions.push(
        'Monitor the Cpk trend chart for any downward drift over time',
        'Consider whether reducing variation further would improve yield',
      )
    }
  }

  if (cpk < 1.33 && cpk >= 0.8) {
    actions.push(
      "Consider a Gage R&R study to confirm your measurement system isn't inflating apparent variation",
    )
  }

  return { summary, highlights, actions }
}

export function interpretCorrelation(data: {
  r: number
  pValue?: number
  method: 'pearson' | 'spearman'
  label1: string
  label2: string
}): Interpretation | null {
  const { r, pValue, method, label1, label2 } = data
  const absR = Math.abs(r)
  const direction = r > 0 ? 'positive' : 'negative'
  const rSquared = Math.round(r * r * 100)

  let strength: string
  let color: InterpretHighlight['color']
  if (absR >= 0.8) {
    strength = 'strong'
    color = 'accent'
  } else if (absR >= 0.5) {
    strength = 'moderate'
    color = 'warning'
  } else if (absR >= 0.3) {
    strength = 'weak'
    color = 'warning'
  } else {
    strength = 'negligible'
    color = 'success'
  }

  const highlights: InterpretHighlight[] = [{ value: r.toFixed(2), color }]
  const actions: string[] = []
  let summary: string

  if (absR >= 0.7) {
    summary = `The ${method} correlation between ${label1} and ${label2} is ${strength} ${direction} (r = ${r.toFixed(2)}). This explains ${rSquared}% of the shared variation.`
    if (r > 0) {
      summary += ` As ${label1} increases, ${label2} tends to increase proportionally.`
    } else {
      summary += ` As ${label1} increases, ${label2} tends to decrease.`
    }
    actions.push(
      `Investigate the physical mechanism linking ${label1} and ${label2}`,
      `Consider monitoring ${label1} as a leading indicator for ${label2} shifts`,
      'A Hotelling T\u00B2 chart may be more effective than monitoring these separately',
    )
  } else if (absR >= 0.3) {
    summary = `The correlation between ${label1} and ${label2} is ${strength} ${direction} (r = ${r.toFixed(2)}), explaining only ${rSquared}% of the variation. Other factors likely dominate.`
    actions.push(
      'The relationship exists but is not strong enough to rely on for prediction',
      'Investigate other potential factors that may explain more variation',
    )
  } else {
    summary = `The correlation between ${label1} and ${label2} is ${strength} (r = ${r.toFixed(2)}). These characteristics appear to vary independently.`
    actions.push(
      'These variables can be monitored independently with standard control charts',
    )
  }

  if (pValue !== undefined) {
    if (pValue < 0.01) {
      summary += ' This result is statistically significant (p < 0.01).'
    } else if (pValue < 0.05) {
      summary += ` This result is statistically significant (p = ${pValue.toFixed(3)}).`
    } else {
      summary += ` However, this result is not statistically significant (p = ${pValue.toFixed(3)}) \u2014 the observed correlation may be due to chance.`
    }
  }

  return { summary, highlights, actions }
}

export function interpretMultivariate(data: {
  oocCount: number
  totalPoints: number
  phase: 'phase_i' | 'phase_ii'
  chartType: string
}): Interpretation | null {
  const { oocCount, totalPoints, phase, chartType } = data
  const oocPct =
    totalPoints > 0 ? ((oocCount / totalPoints) * 100).toFixed(1) : '0'

  const highlights: InterpretHighlight[] = []
  const actions: string[] = []
  let summary: string

  const chartLabel = chartType === 'mewma' ? 'MEWMA' : 'T\u00B2'

  if (oocCount === 0) {
    summary = `All ${totalPoints} points are within the ${chartLabel} upper control limit. The process appears stable across all monitored characteristics.`
    highlights.push({ value: '0 OOC', color: 'success' })
    if (phase === 'phase_i') {
      actions.push(
        'If you have collected enough stable data (20\u201330+ subgroups), consider freezing Phase I',
        'After freezing, the chart switches to Phase II monitoring with locked control limits',
      )
    } else {
      actions.push('Continue routine monitoring \u2014 no action required')
    }
  } else {
    summary = `${oocCount} of ${totalPoints} points (${oocPct}%) exceed the ${chartLabel} upper control limit, indicating the process moved away from its established center in a multivariate sense.`
    highlights.push({
      value: `${oocCount} OOC`,
      color: oocCount > 3 ? 'destructive' : 'warning',
    })
    actions.push(
      'Click out-of-control points to see the decomposition \u2014 it shows which variables drove each signal',
      'If one variable dominates the decomposition, investigate that variable first',
      'Check if OOC points cluster in time \u2014 this suggests a process event rather than random variation',
    )
    if (phase === 'phase_i') {
      actions.push(
        'Consider removing known special-cause points and recomputing before freezing',
      )
    } else {
      actions.push(
        'Once root causes are resolved, consider re-estimating Phase I parameters',
      )
    }
  }

  return { summary, highlights, actions }
}

export function interpretPrediction(data: {
  forecastSteps: number
  predictedOOCCount: number
  modelType: string
  aic?: number | null
}): Interpretation | null {
  const { forecastSteps, predictedOOCCount, modelType, aic } = data

  const highlights: InterpretHighlight[] = []
  const actions: string[] = []
  let summary: string

  if (predictedOOCCount === 0) {
    summary = `The ${modelType} model forecasts ${forecastSteps} steps ahead with all predictions within control limits. No out-of-control conditions are anticipated.`
    highlights.push({ value: 'All in control', color: 'success' })
    actions.push(
      'Continue routine monitoring \u2014 no preemptive action needed',
    )
  } else {
    summary = `The ${modelType} model predicts ${predictedOOCCount} out-of-control point${predictedOOCCount > 1 ? 's' : ''} within the next ${forecastSteps} steps. This is an early warning \u2014 the process may drift beyond control limits.`
    highlights.push({
      value: `${predictedOOCCount} predicted OOC`,
      color: 'warning',
    })
    actions.push(
      'Review the predicted OOC points on the forecast chart to understand timing',
      'Investigate whether current trends (tool wear, material changes) could cause this drift',
      'Consider preemptive adjustments or increased monitoring frequency',
    )
  }

  if (forecastSteps > 30) {
    summary +=
      ' Note: longer forecast horizons have wider prediction intervals and are less reliable.'
    actions.push(
      'For higher confidence, focus on the first 10\u201320 forecast steps',
    )
  }

  if (aic !== null && aic !== undefined) {
    summary += ` Model fit: AIC = ${aic.toFixed(1)} (lower is better).`
  }

  return { summary, highlights, actions }
}
