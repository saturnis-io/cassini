import {
  BarChart2,
  TrendingUp,
  AlertTriangle,
  LineChart,
  Activity,
  ClipboardCheck,
  FlaskConical,
  Ruler,
  GitBranch,
  ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ReportSection =
  | 'header'
  | 'executiveSummary'
  | 'controlChart'
  | 'statistics'
  | 'violations'
  | 'samples'
  | 'histogram'
  | 'capabilityMetrics'
  | 'interpretation'
  | 'violationStats'
  | 'violationTable'
  | 'trendChart'
  | 'violationTrend'
  | 'annotations'
  | 'capabilityScorecard'
  | 'riskRanking'
  | 'trendNarrative'
  | 'measurementSystemHealth'
  | 'doeFindings'
  | 'faiStatus'
  | 'studySetup'
  | 'anovaResults'
  | 'effectPlots'
  | 'optimalSettings'
  | 'doeConfirmation'
  | 'studyInfo'
  | 'gageRR'
  | 'attributeAgreement'
  | 'msaResolution'
  | 'msaRecommendation'
  | 'lineOverview'
  | 'characteristicComparison'
  | 'capabilityMatrix'
  | 'violationPatterns'
  | 'auditSummary'
  | 'signatureEvidence'
  | 'capabilityEvidence'
  | 'measurementData'

export type RequiredData = 'chartData' | 'violations' | 'samples' | 'stats'

/** Template scope: single characteristic, plant-wide, study-level, or line-level */
export type ReportScope = 'characteristic' | 'plant' | 'study' | 'line'

export interface ReportTemplate {
  id: string
  name: string
  description: string
  icon: LucideIcon
  sections: ReportSection[]
  requiredData: RequiredData[]
  /** Scope determines whether this template needs a single characteristic or works plant-wide */
  scope?: ReportScope
  /** Whether this template requires a commercial license */
  commercial?: boolean
  /** For study-scoped templates, which study type this template applies to */
  studyType?: 'doe' | 'msa'
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'characteristic-summary',
    name: 'Characteristic Summary',
    description: 'Control chart, statistics, and recent violations for a single characteristic',
    icon: BarChart2,
    sections: ['header', 'executiveSummary', 'controlChart', 'statistics', 'violations', 'annotations', 'samples'],
    requiredData: ['chartData', 'violations', 'samples'],
  },
  {
    id: 'capability-analysis',
    name: 'Capability Analysis',
    description: 'Process capability metrics (Cp, Cpk, Pp, Ppk) with distribution analysis',
    icon: TrendingUp,
    sections: ['header', 'executiveSummary', 'histogram', 'capabilityMetrics', 'measurementSystemHealth', 'interpretation', 'annotations'],
    requiredData: ['chartData', 'samples'],
  },
  {
    id: 'violation-summary',
    name: 'Violation Summary',
    description: 'All violations across selected characteristics with trends',
    icon: AlertTriangle,
    sections: ['header', 'violationStats', 'violationTable', 'violationTrend'],
    requiredData: ['violations'],
  },
  {
    id: 'trend-analysis',
    name: 'Trend Analysis',
    description: 'Time-series analysis with moving average and trend detection',
    icon: LineChart,
    sections: ['header', 'trendChart', 'trendNarrative', 'statistics', 'interpretation', 'annotations'],
    requiredData: ['chartData', 'samples'],
  },
  {
    id: 'full-quality-report',
    name: 'Full Quality Report',
    description: 'Comprehensive report combining SPC, capability, trend, MSA, DOE, and FAI findings',
    icon: ClipboardCheck,
    sections: [
      'header',
      'executiveSummary',
      'controlChart',
      'trendChart',
      'trendNarrative',
      'statistics',
      'histogram',
      'capabilityMetrics',
      'measurementSystemHealth',
      'doeFindings',
      'faiStatus',
      'violations',
      'interpretation',
      'annotations',
    ],
    requiredData: ['chartData', 'violations', 'samples'],
    commercial: true,
  },
  {
    id: 'plant-health',
    name: 'Plant Health Report',
    description: 'Plant-wide capability scorecard with risk prioritization across all characteristics',
    icon: Activity,
    sections: ['header', 'executiveSummary', 'capabilityScorecard', 'riskRanking', 'violationTrend'],
    requiredData: ['stats'],
    scope: 'plant',
    commercial: true,
  },
  {
    id: 'doe-summary',
    name: 'DOE Study Report',
    description: 'Full factorial/RSM analysis results: ANOVA, effects, optimal settings',
    icon: FlaskConical,
    sections: ['header', 'studySetup', 'anovaResults', 'effectPlots', 'optimalSettings', 'doeConfirmation'],
    requiredData: [],
    scope: 'study',
    studyType: 'doe',
    commercial: true,
  },
  {
    id: 'msa-report',
    name: 'MSA Study Report',
    description: 'Gage R&R or Attribute Agreement results with AIAG acceptance criteria',
    icon: Ruler,
    sections: ['header', 'studyInfo', 'gageRR', 'attributeAgreement', 'msaRecommendation'],
    requiredData: [],
    scope: 'study',
    studyType: 'msa',
    commercial: true,
  },
  {
    id: 'line-assessment',
    name: 'Line Assessment',
    description: 'Cross-characteristic capability comparison and violation patterns for a production line',
    icon: GitBranch,
    sections: ['header', 'lineOverview', 'characteristicComparison', 'capabilityMatrix', 'violationPatterns'],
    requiredData: [],
    scope: 'line',
    commercial: true,
  },
  {
    id: 'audit-package',
    name: 'Audit Package',
    description: 'Compliance evidence bundle: audit trail, signatures, measurements, capability',
    icon: ShieldCheck,
    sections: ['header', 'auditSummary', 'signatureEvidence', 'capabilityEvidence', 'measurementData'],
    requiredData: [],
    commercial: true,
  },
]

export function getTemplateById(id: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES.find((t) => t.id === id)
}
