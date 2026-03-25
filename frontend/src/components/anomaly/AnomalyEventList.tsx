import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { useAnomalyEvents, useAcknowledgeAnomaly, useDismissAnomaly } from '@/api/hooks'
import type { AnomalyEvent } from '@/types/anomaly'
import { AnomalyEventDetail } from './AnomalyEventDetail'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Filter,
} from 'lucide-react'

interface AnomalyEventListProps {
  characteristicId: number
  className?: string
}

const SEVERITY_ICON: Record<string, typeof AlertTriangle> = {
  CRITICAL: AlertTriangle,
  WARNING: AlertCircle,
  INFO: Info,
}

import {
  SEVERITY_BADGE_CLASS,
  DETECTOR_LABELS,
  EVENT_TYPE_LABELS,
} from '@/lib/anomaly-labels'

type FilterStatus = 'all' | 'active' | 'acknowledged' | 'dismissed'

export function AnomalyEventList({ characteristicId, className }: AnomalyEventListProps) {
  const { t } = useTranslation('anomaly')
  const { formatDateTime } = useDateFormat()
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [detectorFilter, setDetectorFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)

  const { data, isLoading } = useAnomalyEvents(characteristicId, {
    severity: severityFilter || undefined,
    detector_type: detectorFilter || undefined,
    limit: 50,
  })

  const acknowledgeAnomaly = useAcknowledgeAnomaly()
  const dismissAnomaly = useDismissAnomaly()

  const events = data?.events ?? []

  // Client-side status filtering
  const filteredEvents = events.filter((e) => {
    if (statusFilter === 'active') return !e.is_acknowledged && !e.is_dismissed
    if (statusFilter === 'acknowledged') return e.is_acknowledged
    if (statusFilter === 'dismissed') return e.is_dismissed
    return true
  })

  const handleAcknowledge = (event: AnomalyEvent) => {
    acknowledgeAnomaly.mutate({ charId: event.char_id, eventId: event.id })
  }

  const handleDismiss = (event: AnomalyEvent, reason: string) => {
    dismissAnomaly.mutate({ charId: event.char_id, eventId: event.id, reason })
  }

  if (isLoading) {
    return (
      <div className={cn('animate-pulse space-y-2 rounded-lg border border-border bg-card p-4', className)}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-muted h-10 rounded" />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>
      {/* Header + Filters */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h3 className="text-sm font-semibold text-foreground">
          {t('events.title')}
          {data?.total ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({data.total})
            </span>
          ) : null}
        </h3>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            'flex items-center gap-1 rounded px-2 py-0.5 text-xs transition-colors',
            showFilters
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Filter className="h-3 w-3" />
          {t('events.filters')}
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/50 px-4 py-2">
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
          >
            <option value="">{t('filters.allSeverities')}</option>
            <option value="CRITICAL">{t('filters.critical')}</option>
            <option value="WARNING">{t('filters.warning')}</option>
            <option value="INFO">{t('filters.info')}</option>
          </select>

          <select
            value={detectorFilter}
            onChange={(e) => setDetectorFilter(e.target.value)}
            className="rounded border border-border bg-background px-2 py-0.5 text-xs text-foreground"
          >
            <option value="">{t('filters.allDetectors')}</option>
            <option value="pelt">{t('filters.processShift')}</option>
            <option value="isolation_forest">{t('filters.unusualPattern')}</option>
            <option value="ks_test">{t('filters.distributionDrift')}</option>
          </select>

          <div className="flex gap-0.5 rounded border border-border">
            {(['all', 'active', 'acknowledged', 'dismissed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-2 py-0.5 text-xs capitalize transition-colors',
                  statusFilter === status
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`filters.${status}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Event list */}
      <div className="max-h-96 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            {t('events.noEventsFound')}
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {filteredEvents.map((event) => {
              const Icon = SEVERITY_ICON[event.severity] ?? Info
              const isExpanded = expandedId === event.id

              return (
                <li key={event.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-muted/30"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    )}

                    {/* Severity badge */}
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                        SEVERITY_BADGE_CLASS[event.severity],
                      )}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {event.severity}
                    </span>

                    {/* Event type */}
                    <span className="text-xs text-foreground">
                      {EVENT_TYPE_LABELS[event.event_type] ?? event.event_type}
                    </span>

                    {/* Detector */}
                    <span className="text-[10px] text-muted-foreground">
                      {DETECTOR_LABELS[event.detector_type] ?? event.detector_type}
                    </span>

                    {/* Timestamp */}
                    <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                      {formatDateTime(event.detected_at)}
                    </span>

                    {/* Status indicators */}
                    {event.is_acknowledged && (
                      <span className="text-[10px] text-green-500">ACK</span>
                    )}
                    {event.is_dismissed && (
                      <span className="text-[10px] text-muted-foreground line-through">
                        DIS
                      </span>
                    )}
                  </button>

                  {isExpanded && (
                    <AnomalyEventDetail
                      event={event}
                      onAcknowledge={() => handleAcknowledge(event)}
                      onDismiss={(reason) => handleDismiss(event, reason)}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
