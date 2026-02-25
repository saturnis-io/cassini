import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { GitCompareArrows, BarChart3, TrendingUp, Sparkles } from 'lucide-react'
import { CorrelationTab } from '@/components/analytics/CorrelationTab'
import { MultivariateTab } from '@/components/analytics/MultivariateTab'
import { PredictionsTab } from '@/components/analytics/PredictionsTab'
import { AIInsightsTab } from '@/components/analytics/AIInsightsTab'
import type { LucideIcon } from 'lucide-react'

const TABS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'correlation', label: 'Correlation', icon: GitCompareArrows },
  { id: 'multivariate', label: 'Multivariate', icon: BarChart3 },
  { id: 'predictions', label: 'Predictions', icon: TrendingUp },
  { id: 'ai-insights', label: 'AI Insights', icon: Sparkles },
]

/**
 * Analytics page — tabbed container for Correlation, Multivariate SPC,
 * Predictions, and AI Insights views.
 */
export function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') || 'correlation'

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border bg-background/80 shrink-0 border-b px-6 pt-5 pb-3 backdrop-blur-sm">
        <h1 className="text-foreground text-xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Multivariate SPC, correlation analysis, and advanced analytics
        </p>

        {/* Tab bar */}
        <div className="mt-4 flex gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-2 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-card text-foreground border-border border border-b-transparent shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'correlation' && <CorrelationTab />}
        {activeTab === 'multivariate' && <MultivariateTab />}
        {activeTab === 'predictions' && <PredictionsTab />}
        {activeTab === 'ai-insights' && <AIInsightsTab />}
      </div>
    </div>
  )
}
