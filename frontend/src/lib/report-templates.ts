import { BarChart2, TrendingUp, AlertTriangle, LineChart } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type ReportSection =
  | 'header'
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

export type RequiredData = 'chartData' | 'violations' | 'samples' | 'stats'

export interface ReportTemplate {
  id: string
  name: string
  description: string
  icon: LucideIcon
  sections: ReportSection[]
  requiredData: RequiredData[]
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'characteristic-summary',
    name: 'Characteristic Summary',
    description: 'Control chart, statistics, and recent violations for a single characteristic',
    icon: BarChart2,
    sections: ['header', 'controlChart', 'statistics', 'violations', 'samples'],
    requiredData: ['chartData', 'violations', 'samples'],
  },
  {
    id: 'capability-analysis',
    name: 'Capability Analysis',
    description: 'Process capability metrics (Cp, Cpk, Pp, Ppk) with distribution analysis',
    icon: TrendingUp,
    sections: ['header', 'histogram', 'capabilityMetrics', 'interpretation'],
    requiredData: ['chartData', 'samples'],
  },
  {
    id: 'violation-summary',
    name: 'Violation Summary',
    description: 'All violations across selected characteristics with trends',
    icon: AlertTriangle,
    sections: ['header', 'violationStats', 'violationTable', 'trendChart'],
    requiredData: ['violations'],
  },
  {
    id: 'trend-analysis',
    name: 'Trend Analysis',
    description: 'Time-series analysis with moving average and trend detection',
    icon: LineChart,
    sections: ['header', 'trendChart', 'statistics', 'interpretation'],
    requiredData: ['chartData', 'samples'],
  },
]

export function getTemplateById(id: string): ReportTemplate | undefined {
  return REPORT_TEMPLATES.find((t) => t.id === id)
}
