import { useState } from 'react'
import {
  TrendingUp,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Check,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpTooltip } from '@/components/HelpTooltip'
import { GuidedEmptyState } from '@/components/GuidedEmptyState'
import { InterpretResult } from '@/components/InterpretResult'
import { emptyStates, interpretPrediction } from '@/lib/guidance'
import { useDateFormat } from '@/hooks/useDateFormat'
import { usePlantContext } from '@/providers/PlantProvider'
import { usePredictionDashboard, useUpdatePredictionConfig, useIntervalStats } from '@/api/hooks'
import { PredictionConfig } from './PredictionConfig'
import { PredictionOverlay } from './PredictionOverlay'
import { useForecast } from '@/api/hooks'
import type { PredictionDashboardItem } from '@/api/predictions.api'
import type { IntervalStats } from '@/api/predictions.api'

/**
 * PredictionsTab -- dashboard list of characteristics with active predictions.
 * Each card shows model info and can expand to show forecast data.
 */
export function PredictionsTab() {
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  const { data: dashboard, isLoading } = usePredictionDashboard(plantId)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [configId, setConfigId] = useState<number | null>(null)

  if (!selectedPlant) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <TrendingUp className="text-muted-foreground/40 h-12 w-12" />
        <p className="text-muted-foreground mt-3 text-sm">Select a plant to view predictions.</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        <span className="text-muted-foreground ml-2 text-sm">Loading predictions...</span>
      </div>
    )
  }

  const items = dashboard ?? []

  if (items.length === 0) {
    return <GuidedEmptyState content={emptyStates.predictions} />
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {items.filter((i) => i.is_enabled).length} of {items.length} characteristics with
          predictions enabled
        </p>
      </div>

      {/* Card list */}
      <div className="space-y-2">
        {items.map((item) => (
          <PredictionCard
            key={item.characteristic_id}
            item={item}
            isExpanded={expandedId === item.characteristic_id}
            isConfigOpen={configId === item.characteristic_id}
            onToggleExpand={() =>
              setExpandedId(expandedId === item.characteristic_id ? null : item.characteristic_id)
            }
            onToggleConfig={() =>
              setConfigId(configId === item.characteristic_id ? null : item.characteristic_id)
            }
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PredictionCard
// ---------------------------------------------------------------------------

interface PredictionCardProps {
  item: PredictionDashboardItem
  isExpanded: boolean
  isConfigOpen: boolean
  onToggleExpand: () => void
  onToggleConfig: () => void
}

function PredictionCard({
  item,
  isExpanded,
  isConfigOpen,
  onToggleExpand,
  onToggleConfig,
}: PredictionCardProps) {
  const { formatDate } = useDateFormat()
  const updateConfig = useUpdatePredictionConfig()

  const handleToggleEnabled = () => {
    updateConfig.mutate({
      charId: item.characteristic_id,
      data: { is_enabled: !item.is_enabled },
    })
  }

  return (
    <div className="bg-card text-card-foreground rounded-lg border">
      {/* Header row — entire row is clickable to expand */}
      <div
        onClick={onToggleExpand}
        className="flex cursor-pointer items-center gap-3 p-4 transition-colors hover:bg-muted/30"
      >
        <span className="text-muted-foreground shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-foreground truncate text-sm font-medium">
              {item.characteristic_name}
            </h3>
            {item.predicted_ooc && (
              <HelpTooltip helpKey="prediction-ooc" triggerAs="span">
                <span className="inline-flex cursor-help items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" />
                  OOC Predicted
                </span>
              </HelpTooltip>
            )}
          </div>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-3 text-xs">
            {item.model_type && (
              <span>
                Model: <span className="text-foreground font-medium">{item.model_type}</span>
              </span>
            )}
            {item.aic != null && (
              <span className="inline-flex items-center gap-1">
                AIC: <span className="text-foreground font-medium">{item.aic.toFixed(1)}</span>
                <HelpTooltip helpKey="prediction-aic" />
              </span>
            )}
            {item.last_trained && (
              <span>Trained: {formatDate(item.last_trained)}</span>
            )}
            {item.training_samples > 0 && <span>{item.training_samples} samples</span>}
          </div>
        </div>

        {/* Enable toggle — stop propagation so clicking doesn't expand */}
        <label
          className="relative inline-flex shrink-0 cursor-pointer items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            className="peer sr-only"
            checked={item.is_enabled}
            onChange={handleToggleEnabled}
            disabled={updateConfig.isPending}
          />
          <div className="bg-muted peer-checked:bg-primary h-5 w-9 rounded-full transition-colors after:absolute after:top-0.5 after:left-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:after:translate-x-4" />
        </label>

        {/* Config button — stop propagation */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleConfig()
          }}
          className={cn(
            'text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-xs transition-colors',
            isConfigOpen && 'bg-muted text-foreground',
          )}
        >
          Configure
        </button>
      </div>

      {/* Expanded forecast view */}
      {isExpanded && (
        <div className="border-border border-t px-4 py-3">
          <ExpandedForecast charId={item.characteristic_id} hasForecast={item.has_forecast} />
        </div>
      )}

      {/* Config panel */}
      {isConfigOpen && (
        <div className="border-border border-t px-4 py-3">
          <PredictionConfig characteristicId={item.characteristic_id} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ExpandedForecast
// ---------------------------------------------------------------------------

function ExpandedForecast({ charId, hasForecast }: { charId: number; hasForecast: boolean }) {
  const { formatDateTime } = useDateFormat()
  const { data: forecastResult, isLoading } = useForecast(charId)
  const { data: intervalStats } = useIntervalStats(charId, hasForecast)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
        <span className="text-muted-foreground text-xs">Loading forecast...</span>
      </div>
    )
  }

  if (!forecastResult || !forecastResult.points || forecastResult.points.length === 0) {
    return (
      <p className="text-muted-foreground py-4 text-center text-xs">
        {hasForecast
          ? 'Forecast data unavailable.'
          : 'No forecast generated yet. Train a model and generate a forecast.'}
      </p>
    )
  }

  const forecast = forecastResult.points
  const oocPoints = forecast.filter((p) => p.predicted_ooc)

  return (
    <div className="space-y-3">
      {/* Summary stats */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">
          {forecast.length} steps forecasted
        </span>
        <span className="text-muted-foreground">
          Model: {forecastResult.model_type}
        </span>
        <span className="text-muted-foreground">
          Generated: {formatDateTime(forecastResult.generated_at)}
        </span>
        {oocPoints.length > 0 ? (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            {oocPoints.length} predicted OOC
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Check className="h-3 w-3" />
            All in control
          </span>
        )}
      </div>

      {/* Forecast chart */}
      <PredictionOverlay forecast={forecast} />

      {/* Interval interpretation panel */}
      {intervalStats && <IntervalInterpretation stats={intervalStats} />}

      <InterpretResult
        interpretation={interpretPrediction({
          forecastSteps: forecast.length,
          predictedOOCCount: oocPoints.length,
          modelType: forecastResult.model_type ?? 'Auto',
          aic: forecastResult.aic ?? null,
        })}
        className="mt-3"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// IntervalInterpretation
// ---------------------------------------------------------------------------

const TREND_CONFIG = {
  widening: { label: 'Widening', Icon: TrendingUp, className: 'text-amber-600 dark:text-amber-400' },
  narrowing: {
    label: 'Narrowing',
    Icon: TrendingDown,
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  stable: { label: 'Stable', Icon: Minus, className: 'text-muted-foreground' },
} as const

function IntervalInterpretation({ stats }: { stats: IntervalStats }) {
  const trend = TREND_CONFIG[stats.width_trend]
  const TrendIcon = trend.Icon
  const isWarning = stats.sigma_ratio >= 1.0

  return (
    <div className="bg-muted/30 mt-3 rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-chart-tertiary">
          Interval Analysis
        </span>
        {isWarning && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
            <AlertTriangle className="h-3 w-3" />
            High Uncertainty
          </span>
        )}
      </div>

      {/* Metrics row */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="text-muted-foreground">
          80% CI width:{' '}
          <span className="text-foreground font-medium">{stats.median_width_80.toFixed(4)}</span>
        </span>
        <span className="text-muted-foreground">
          95% CI width:{' '}
          <span className="text-foreground font-medium">{stats.median_width_95.toFixed(4)}</span>
        </span>
        <span className="text-muted-foreground">
          Sigma ratio:{' '}
          <span
            className={cn('font-medium', isWarning ? 'text-warning' : 'text-foreground')}
          >
            {stats.sigma_ratio.toFixed(2)}
          </span>
        </span>
        <span className={cn('flex items-center gap-1', trend.className)}>
          <TrendIcon className="h-3 w-3" />
          {trend.label}
        </span>
      </div>

      {/* Interpretation text */}
      <p className="text-foreground mt-2 text-sm leading-relaxed">{stats.interpretation}</p>

      {/* Horizon recommendation */}
      {stats.horizon_recommendation != null && (
        <p className="mt-1.5 text-xs font-medium text-warning">
          Consider reducing forecast horizon to {stats.horizon_recommendation} steps.
        </p>
      )}
    </div>
  )
}
