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
    description:
      'The upper boundary of expected process variation, typically set at +3 sigma from the center line.',
    details:
      'Points above the UCL indicate the process may be out of statistical control. The UCL is calculated from historical data and represents the expected upper limit of natural variation.',
  },
  'lcl-explanation': {
    title: 'Lower Control Limit (LCL)',
    description:
      'The lower boundary of expected process variation, typically set at -3 sigma from the center line.',
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

  // Z-score explanations
  'z-score': {
    title: 'Z-Score',
    description:
      'A standardized value showing how many standard deviations a point is from the center line.',
    details:
      'Z = (X-bar - Center Line) / (sigma / sqrt(n)). A Z-score of 0 means the point is at the center. Z = +2 means 2 sigma above center, Z = -1.5 means 1.5 sigma below. Control limits are always at +/-3 in standardized mode.',
  },
  'z-score-interpretation': {
    title: 'Interpreting Z-Scores',
    description:
      'Z-scores tell you how unusual a data point is relative to normal process variation.',
    details:
      '|Z| < 1: Common, within Zone C (68% of points). |Z| 1-2: Uncommon, Zone B (27% of points). |Z| 2-3: Rare, Zone A (4% of points). |Z| > 3: Very rare, out of control (0.3% of points). The same interpretation applies regardless of the underlying data scale.',
  },

  // UCL/LCL interpretation per mode
  'ucl-lcl-nominal': {
    title: 'Control Limits (Nominal Mode)',
    description: 'Fixed limits calculated from your data assuming constant sample sizes.',
    details:
      'UCL and LCL are calculated once using R-bar or S-bar methods. All samples are compared against these fixed limits. If your actual sample sizes vary, consider using Variable Limits or Standardized mode for more accurate detection.',
  },
  'ucl-lcl-variable': {
    title: 'Control Limits (Variable Mode)',
    description: 'Limits that adjust for each sample based on its actual size.',
    details:
      'Larger samples have tighter limits (more precision = smaller expected variation). Smaller samples have wider limits. Creates a "funnel" effect on the chart. More accurate for varying sample sizes but can be harder to read visually.',
  },
  'ucl-lcl-standardized': {
    title: 'Control Limits (Standardized Mode)',
    description: 'Fixed at +3 and -3, representing 3 sigma in Z-score units.',
    details:
      'Because Z-scores normalize for sample size, the limits are always +/-3 regardless of your data. This makes it easy to compare different characteristics or time periods. A point at Z = 2.8 is close to the limit; Z = 3.2 is out of control.',
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

  // MQTT and Data Collection
  mqtt_connection: {
    title: 'MQTT Connection',
    description: 'Real-time connection to MQTT broker for automated data collection.',
    details:
      'MQTT is a lightweight messaging protocol used for machine-to-machine communication. When connected, Cassini subscribes to topics configured for TAG-type characteristics and automatically processes incoming data.',
  },
  mqtt_broker: {
    title: 'MQTT Broker',
    description: 'Server that routes MQTT messages between publishers and subscribers.',
    details:
      'Configure connection details for your MQTT broker (e.g., Mosquitto, HiveMQ, AWS IoT). You can have multiple brokers configured but only one can be active at a time.',
  },
  tag_provider: {
    title: 'Data Providers',
    description: 'Automated data collection from machine tags via MQTT or OPC-UA.',
    details:
      'Data providers subscribe to topics or nodes for characteristics with a configured data source. Measurements are buffered into subgroups and processed through the SPC engine automatically. Configure data sources in the Connectivity Hub.',
  },

  // Chart Type explanations
  'chart-type-xbar': {
    title: 'X-bar Chart',
    description: 'Control chart for monitoring process average (mean) over time.',
    details:
      'Plots the average (X-bar) of each subgroup. Best used with companion Range or S chart to monitor both location and spread. Control limits are calculated using sigma estimated from within-subgroup variation.',
  },
  'chart-type-xbar-r': {
    title: 'X-bar and Range Chart',
    description: 'Dual chart combining X-bar with Range chart for complete process monitoring.',
    details:
      'X-bar tracks the process mean while Range tracks within-subgroup variation. Recommended for subgroups of 2-10 observations. The Range chart uses D3/D4 constants for control limits.',
  },
  'chart-type-xbar-s': {
    title: 'X-bar and S Chart',
    description: 'Dual chart combining X-bar with Standard Deviation chart.',
    details:
      'Similar to X-bar R but uses standard deviation instead of range. Preferred for larger subgroups (n > 10) where standard deviation provides a more efficient estimate of variation. Uses B3/B4 constants.',
  },
  'chart-type-i-mr': {
    title: 'Individuals and Moving Range',
    description: 'Control charts for individual measurements (n=1).',
    details:
      'When subgrouping is not possible or practical, I-MR charts track individual values and the moving range between consecutive observations. Uses E2 constant (2.66) for control limits.',
  },
  'chart-type-cusum': {
    title: 'CUSUM Chart',
    description: 'Cumulative Sum chart for detecting small, persistent process shifts.',
    details:
      'Accumulates deviations from a target value over time. More sensitive than Shewhart charts for detecting small sustained shifts (0.5–2 sigma). Uses V-mask or tabular CUSUM with decision interval H and slack value K.',
  },
  'chart-type-ewma': {
    title: 'EWMA Chart',
    description: 'Exponentially Weighted Moving Average chart for detecting gradual process shifts.',
    details:
      'Applies exponentially decreasing weights to older observations. Smoothing parameter lambda (0 < λ ≤ 1) controls sensitivity — smaller λ detects smaller shifts. Effective for autocorrelated or non-normal data.',
  },
  'chart-type-p': {
    title: 'P Chart (Proportion Defective)',
    description: 'Attribute chart for proportion of defective items.',
    details:
      'Used when each item is classified as pass/fail and sample sizes may vary. Control limits adjust based on sample size (variable limits). Assumes binomial distribution.',
  },
  'chart-type-np': {
    title: 'NP Chart (Number Defective)',
    description: 'Attribute chart for count of defective items.',
    details:
      'Similar to p-chart but plots the actual count of defectives rather than proportion. Requires constant sample size. Simpler to interpret when sample size is fixed.',
  },
  'chart-type-c': {
    title: 'C Chart (Defects per Unit)',
    description: 'Attribute chart for counting defects in a constant area of opportunity.',
    details:
      'Used when counting defects (not defectives) where multiple defects can occur per item. Assumes Poisson distribution. Area of opportunity (inspection size) must be constant.',
  },
  'chart-type-u': {
    title: 'U Chart (Defects per Unit - Variable)',
    description: 'Attribute chart for defect rate with variable inspection area.',
    details:
      'Like c-chart but normalizes for varying area of opportunity. Plots defects per unit. Control limits vary with inspection size. Use when inspection area/size cannot be held constant.',
  },
  'chart-type-pareto': {
    title: 'Pareto Chart',
    description: 'Analysis chart showing defect categories by frequency.',
    details:
      'Bar chart sorted by frequency with cumulative percentage line. Helps identify the "vital few" causes that account for most problems (80/20 rule). Essential for root cause prioritization.',
  },
  'chart-type-box-whisker': {
    title: 'Box and Whisker Plot',
    description: 'Distribution visualization using quartiles.',
    details:
      'Shows median, quartiles, and outliers. Useful for comparing distributions across groups, shifts, or time periods. Outliers are typically defined as points beyond 1.5 * IQR from quartiles.',
  },

  // Branding — semantic colors and contrast
  'brand-semantic-colors': {
    title: 'Semantic Colors',
    description:
      'These colors carry meaning throughout the application, independent of your brand palette.',
    details:
      'Destructive is used for delete buttons, error messages, and critical alerts. Warning appears on caution banners, expiring items, and attention-needed badges. Success is used for confirmations, passing checks, and positive indicators like "Cpk OK".',
  },
  'brand-contrast-ratio': {
    title: 'WCAG AA Contrast Ratio',
    description:
      'Measures readability of this color as text against the background.',
    details:
      'WCAG 2.x requires a minimum 4.5:1 contrast ratio for normal-sized text to be accessible. Ratios below this threshold mean some users may struggle to read text in that color. The system auto-adjusts colors per mode, but if you set a manual override, verify it still passes.',
  },
  'brand-color-destructive': {
    title: 'Destructive',
    description: 'Color for irreversible or dangerous actions.',
    details:
      'Applied to delete buttons, error toasts, critical violation markers, and "out of control" badges throughout the application.',
  },
  'brand-color-warning': {
    title: 'Warning',
    description: 'Color for caution and attention-needed states.',
    details:
      'Applied to warning alerts, Nelson rule badges, expiring retention notices, capability caution indicators, and "needs review" statuses.',
  },
  'brand-color-success': {
    title: 'Success',
    description: 'Color for positive outcomes and confirmations.',
    details:
      'Applied to success toasts, "Cpk OK" indicators, approved FAI reports, passing MSA studies, and WCAG AA contrast badges.',
  },

  // TLS Certificate Configuration
  'tls-ca-cert': {
    title: 'CA Certificate',
    description:
      'The Certificate Authority (CA) certificate used to verify the server\'s identity.',
    details:
      'Paste the PEM-encoded CA certificate provided by your IT team or certificate authority. This ensures your client only connects to trusted servers. Required when using self-signed or internal CA certificates.',
  },
  'tls-client-cert': {
    title: 'Client Certificate',
    description:
      'Your client certificate for mutual TLS (mTLS) authentication.',
    details:
      'Used when the server requires clients to prove their identity with a certificate. Must be paired with a private key. Your IT team or PKI administrator provides this.',
  },
  'tls-client-key': {
    title: 'Client Private Key',
    description:
      'The private key that pairs with your client certificate.',
    details:
      'Must match the client certificate above. Keep this secret — never share it. PEM format, typically starts with "-----BEGIN PRIVATE KEY-----" or "-----BEGIN RSA PRIVATE KEY-----".',
  },
  'tls-insecure': {
    title: 'Skip Certificate Verification',
    description:
      'Disables server certificate validation. Only use for testing with self-signed certificates.',
    details:
      'When enabled, the client will accept any server certificate without verifying it against a CA. This makes the connection vulnerable to man-in-the-middle attacks. Never use in production.',
    severity: 'WARNING',
  },

  // Analytics — Correlation
  'correlation-analysis': {
    title: 'Correlation Analysis',
    description:
      'Measures the strength and direction of linear relationships between pairs of characteristics.',
    details:
      'Use correlation to identify characteristics that move together. Strong correlations (|r| > 0.7) may indicate shared root causes, co-dependent processes, or opportunities for multivariate monitoring. Requires at least 2 characteristics with time-aligned samples.',
  },
  'correlation-method-pearson': {
    title: 'Pearson Correlation',
    description:
      'Measures linear relationships between variables. Assumes approximately normal data.',
    details:
      'Pearson r ranges from -1 (perfect inverse) to +1 (perfect direct). Values near 0 indicate no linear relationship. Best for continuous data that is roughly normally distributed. For non-normal or ordinal data, use Spearman instead.',
  },
  'correlation-method-spearman': {
    title: 'Spearman Rank Correlation',
    description:
      'Measures monotonic relationships using ranked data. No normality assumption required.',
    details:
      'Spearman rho uses the ranks of values rather than raw values, making it robust to outliers and non-normal distributions. Detects any monotonic relationship (not just linear). Preferred for skewed data, ordinal measurements, or when outliers are present.',
  },
  'pca-analysis': {
    title: 'Principal Component Analysis (PCA)',
    description:
      'Reduces correlated variables into a smaller set of uncorrelated principal components.',
    details:
      'PCA reveals hidden structure in multivariate data. PC1 captures the most variance, PC2 the next most, etc. The biplot shows both scores (sample positions) and loadings (variable contributions). Variables pointing in similar directions are positively correlated.',
  },
  'correlation-matrix': {
    title: 'Correlation Matrix',
    description:
      'A symmetric matrix showing pairwise correlation coefficients between all selected characteristics.',
    details:
      'Values range from -1 to +1. The diagonal is always 1.0 (self-correlation). Colors indicate strength: deep blue/red for strong correlations, neutral for weak. Click a cell to see the p-value, which indicates statistical significance.',
  },
  'pca-biplot': {
    title: 'PCA Biplot',
    description:
      'Visualizes principal component scores (dots) and loading vectors (arrows) in a single plot.',
    details:
      'Each dot is a sample projected onto the first two principal components. Arrows show how much each original variable contributes to each PC. Longer arrows mean stronger influence. Arrows pointing in the same direction indicate positively correlated variables; opposite directions indicate negative correlation.',
  },

  // Analytics — Multivariate
  'multivariate-groups': {
    title: 'Multivariate Groups',
    description:
      'Groups of correlated characteristics monitored simultaneously for joint out-of-control conditions.',
    details:
      'Univariate charts can miss problems that only appear when multiple characteristics shift together. Multivariate groups use Hotelling T\u00B2 or MEWMA to detect these joint shifts. Group characteristics that are physically related or share common process inputs.',
  },
  'hotelling-t2': {
    title: 'Hotelling T\u00B2 Chart',
    description:
      'Monitors the multivariate distance of each sample from the process center.',
    details:
      'T\u00B2 combines all group characteristics into a single statistic that measures how far each observation is from the mean in a multivariate sense. Points above the UCL indicate the combined characteristics have shifted. Click OOC points to see which variables contributed most.',
  },
  'chart-type-mewma': {
    title: 'MEWMA Chart',
    description:
      'Multivariate Exponentially Weighted Moving Average — detects small, persistent multivariate shifts.',
    details:
      'Like EWMA for univariate data, MEWMA smooths multivariate observations to increase sensitivity to gradual process shifts. More sensitive than T\u00B2 for detecting small sustained changes across multiple characteristics simultaneously.',
  },
  'multivariate-phase-i': {
    title: 'Phase I (Estimation)',
    description:
      'Initial phase where the in-control process parameters (mean vector, covariance) are estimated.',
    details:
      'During Phase I, collect data from a stable process to establish baseline statistics. Review and remove any out-of-control points. Once satisfied that the process is in control, freeze Phase I to lock in the parameters for ongoing monitoring.',
  },
  'multivariate-phase-ii': {
    title: 'Phase II (Monitoring)',
    description:
      'Ongoing monitoring phase using frozen Phase I parameters to detect future process shifts.',
    details:
      'After freezing Phase I, new samples are compared against the established baseline. The UCL is fixed and any exceedance signals a genuine process change, not just estimation noise. This is the operational monitoring state.',
  },
  'freeze-phase-i': {
    title: 'Freeze Phase I',
    description:
      'Locks the current mean vector and covariance matrix as the baseline for Phase II monitoring.',
    details:
      'Freezing transitions the group from estimation (Phase I) to monitoring (Phase II). The current data defines what "in control" means going forward. Only freeze when you are confident the process is stable and any outliers have been addressed.',
    severity: 'INFO',
  },
  'ooc-decomposition': {
    title: 'OOC Decomposition',
    description:
      'Breaks down a T\u00B2 signal into individual variable contributions to identify the root cause.',
    details:
      'When a point exceeds the T\u00B2 UCL, decomposition shows which characteristics drove the signal. Higher contribution means that variable deviated most from its expected value. This replaces the need to check each univariate chart individually.',
  },

  // Analytics — Predictions
  'prediction-model-type': {
    title: 'Prediction Model Type',
    description:
      'The time-series algorithm used to forecast future process values.',
    details:
      'Auto selects the best model by AIC. ARIMA handles trends and seasonality via differencing. Exponential Smoothing applies weighted averaging with recency bias. Auto is recommended unless you have domain knowledge favoring a specific model.',
  },
  'prediction-forecast-horizon': {
    title: 'Forecast Horizon',
    description:
      'How many steps (samples) ahead the model will predict.',
    details:
      'Longer horizons increase uncertainty — prediction intervals widen with each step. For SPC, 10-30 steps is typical. Very long horizons (50+) may be unreliable if the process is subject to frequent changes.',
  },
  'prediction-refit-interval': {
    title: 'Refit Interval',
    description:
      'How often the model is automatically retrained as new data arrives.',
    details:
      'After this many new samples, the model is refitted to incorporate recent data. Lower values keep the model current but increase computation. Higher values are more stable but may lag behind process changes. 50-100 is a good default.',
  },
  'prediction-aic': {
    title: 'AIC (Akaike Information Criterion)',
    description:
      'A measure of model quality that balances goodness-of-fit against complexity.',
    details:
      'Lower AIC indicates a better model. AIC penalizes models with more parameters to prevent overfitting. Compare AIC values across model types for the same data — the model with the lowest AIC is preferred.',
  },
  'prediction-ooc': {
    title: 'Predicted OOC',
    description:
      'The forecast predicts this characteristic will go out of control within the forecast horizon.',
    details:
      'The model projects that future values will exceed control limits based on current trends. This is an early warning — not a certainty. Investigate whether process drift, tool wear, or material changes could cause the predicted shift.',
    severity: 'WARNING',
  },

  // Analytics — AI Insights
  'ai-insights': {
    title: 'AI Insights',
    description:
      'AI-generated analysis of process data, identifying patterns, risks, and recommendations.',
    details:
      'An AI model reviews your SPC data — recent trends, violations, capability, and statistical patterns — then provides a structured summary. Results depend on the configured AI provider and model. Use insights as a starting point for investigation, not as definitive conclusions.',
  },

  // When to recalculate control limits
  'recalculate-limits': {
    title: 'When to Recalculate Control Limits',
    description:
      'Control limits should be recalculated after process improvements or when starting fresh.',
    details:
      'Recalculate when: (1) Process has been improved and is now stable at new level, (2) Sufficient data collected after a change (25+ subgroups recommended), (3) Original limits were based on out-of-control process. Do NOT recalculate just to make points "in control" - that defeats the purpose of SPC.',
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
