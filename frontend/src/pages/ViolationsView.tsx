import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Check,
  Clock,
  Eye,
  Filter,
  RefreshCw,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDateFormat } from '@/hooks/useDateFormat'
import { useViolations, useViolationStats, useAcknowledgeViolation } from '@/api/hooks'
import { violationApi } from '@/api/client'
import { useAuth } from '@/providers/AuthProvider'
import { canPerformAction } from '@/lib/roles'
import { NELSON_RULES } from '@/components/ViolationLegend'
import { TimeRangeSelector } from '@/components/TimeRangeSelector'
import { BulkAcknowledgeDialog } from '@/components/BulkAcknowledgeDialog'
import { ViolationContextModal } from '@/components/ViolationContextModal'
import type { TimeRangeState } from '@/stores/dashboardStore'
import type { Severity, Violation } from '@/types'

/** Number of violations to fetch per page */
const VIOLATIONS_PER_PAGE = 50

type FilterStatus = 'all' | 'required' | 'informational' | 'acknowledged'

function Pager({
  page,
  totalPages,
  totalItems,
  perPage,
  onPageChange,
}: {
  page: number
  totalPages: number
  totalItems: number
  perPage: number
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation('common')
  const showingFrom = totalItems > 0 ? (page - 1) * perPage + 1 : 0
  const showingTo = Math.min(page * perPage, totalItems)

  const handleInputCommit = (value: string) => {
    const n = parseInt(value, 10)
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onPageChange(n)
    }
  }

  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span className="text-muted-foreground text-sm">
        {t('pagination.showingRange', { from: showingFrom, to: showingTo, total: totalItems })}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="border-border hover:bg-muted rounded border px-1.5 py-1 font-mono text-xs font-bold transition-colors disabled:opacity-40"
          title={t('pagination.firstPage')}
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="border-border hover:bg-muted rounded border p-1 transition-colors disabled:opacity-40"
          title={t('pagination.previousPage')}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-1 px-1">
          <input
            type="text"
            inputMode="numeric"
            defaultValue={page}
            key={page}
            onBlur={(e) => handleInputCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleInputCommit((e.target as HTMLInputElement).value)
            }}
            className="border-border bg-background focus:ring-primary/50 w-12 rounded border px-1 py-0.5 text-center text-sm tabular-nums focus:ring-1 focus:outline-none"
          />
          <span className="text-muted-foreground text-sm">/ {totalPages}</span>
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="border-border hover:bg-muted rounded border p-1 transition-colors disabled:opacity-40"
          title={t('pagination.nextPage')}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="border-border hover:bg-muted rounded border px-1.5 py-1 font-mono text-xs font-bold transition-colors disabled:opacity-40"
          title={t('pagination.lastPage')}
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function ViolationsView() {
  const { t } = useTranslation('violations')
  const { t: tCommon } = useTranslation('common')
  const { formatDate, formatDateTime } = useDateFormat()
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('required')
  const [selectedRule, setSelectedRule] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [dateRange, setDateRange] = useState<TimeRangeState>({
    type: 'points',
    pointsLimit: null,
    hoursBack: null,
    startDate: null,
    endDate: null,
  })
  const [bulkAckDialogOpen, setBulkAckDialogOpen] = useState(false)
  const [bulkIds, setBulkIds] = useState<number[]>([])
  const [fetchingBulkIds, setFetchingBulkIds] = useState(false)
  const [ackViolationId, setAckViolationId] = useState<number | null>(null)
  const [ackReason, setAckReason] = useState('')
  const [inspectedViolation, setInspectedViolation] = useState<Violation | null>(null)

  // Convert date range to API params + effective page size
  // "Last N" (points) → fetch N most recent, single page
  // Duration/custom → date filter with standard pagination
  // All time (points, null) → no filter, standard pagination
  const { dateParams, effectivePerPage } = useMemo(() => {
    if (dateRange.type === 'points' && dateRange.pointsLimit) {
      return { dateParams: {}, effectivePerPage: dateRange.pointsLimit }
    }
    if (dateRange.type === 'duration' && dateRange.hoursBack) {
      const now = new Date()
      const start = new Date(now.getTime() - dateRange.hoursBack * 60 * 60 * 1000)
      return {
        dateParams: { start_date: start.toISOString(), end_date: now.toISOString() },
        effectivePerPage: VIOLATIONS_PER_PAGE,
      }
    }
    if (dateRange.type === 'custom' && dateRange.startDate && dateRange.endDate) {
      return {
        dateParams: { start_date: dateRange.startDate, end_date: dateRange.endDate },
        effectivePerPage: VIOLATIONS_PER_PAGE,
      }
    }
    return { dateParams: {}, effectivePerPage: VIOLATIONS_PER_PAGE }
  }, [dateRange])

  // When "Last N" is active, force page 1 (all results fit in one page)
  const isPointsLimit = dateRange.type === 'points' && dateRange.pointsLimit !== null

  // Reset page when filters change
  const filterKey = `${statusFilter}-${selectedRule}-${dateRange.type}-${dateRange.pointsLimit}-${dateRange.hoursBack}-${dateRange.startDate}-${dateRange.endDate}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey)
    setPage(1)
  }

  const { data: stats, refetch: refetchStats } = useViolationStats()
  const {
    data: violations,
    isLoading,
    refetch,
  } = useViolations({
    acknowledged:
      statusFilter === 'acknowledged' ? true : statusFilter === 'all' ? undefined : false,
    requires_acknowledgement:
      statusFilter === 'required' ? true : statusFilter === 'informational' ? false : undefined,
    rule_id: selectedRule ?? undefined,
    page: isPointsLimit ? 1 : page,
    per_page: effectivePerPage,
    ...dateParams,
  })

  // Pending IDs from the loaded page (always available)
  const pendingFromPage = useMemo(() => {
    if (!violations?.items) return []
    return violations.items
      .filter((v) => !v.acknowledged && v.requires_acknowledgement)
      .map((v) => v.id)
  }, [violations])

  // For paginated modes, get the total pending count across all pages
  const { data: pendingCountData } = useViolations({
    acknowledged: false,
    requires_acknowledgement: true,
    rule_id: selectedRule ?? undefined,
    per_page: 1,
    ...dateParams,
  })
  // Points mode: scope is exactly the loaded items. Otherwise: total across all pages.
  const bulkPendingCount = isPointsLimit
    ? pendingFromPage.length
    : (pendingCountData?.total ?? pendingFromPage.length)

  const { user, role } = useAuth()
  const acknowledgeMutation = useAcknowledgeViolation()
  const canBulkAck = canPerformAction(role, 'violations:acknowledge') && bulkPendingCount > 0

  // Pagination — hidden when "Last N" is active (single page of N items)
  const totalItems = violations?.total ?? 0
  const displayedItems = isPointsLimit ? Math.min(effectivePerPage, totalItems) : totalItems
  const totalPages = Math.max(1, Math.ceil(displayedItems / effectivePerPage))
  const showPager = !isPointsLimit && totalItems > effectivePerPage

  const handleBulkAcknowledge = async () => {
    if (isPointsLimit) {
      // Points mode: we already have all the IDs from the loaded page
      setBulkIds(pendingFromPage)
      setBulkAckDialogOpen(true)
      return
    }
    // Paginated mode: fetch all pending IDs matching current filters
    setFetchingBulkIds(true)
    try {
      const allIds: number[] = []
      let fetchPage = 1
      const batchSize = 500
      while (true) {
        const result = await violationApi.list({
          acknowledged: false,
          requires_acknowledgement: true,
          rule_id: selectedRule ?? undefined,
          page: fetchPage,
          per_page: batchSize,
          ...dateParams,
        })
        allIds.push(...result.items.map((v) => v.id))
        if (allIds.length >= result.total || result.items.length < batchSize) break
        fetchPage++
      }
      setBulkIds(allIds)
      setBulkAckDialogOpen(true)
    } finally {
      setFetchingBulkIds(false)
    }
  }

  const handleAcknowledge = () => {
    if (!ackViolationId || !ackReason.trim()) return
    acknowledgeMutation.mutate(
      {
        id: ackViolationId,
        reason: ackReason.trim(),
        user: user?.username ?? 'Unknown',
      },
      {
        onSuccess: () => {
          setAckViolationId(null)
          setAckReason('')
          refetch()
          refetchStats()
        },
      },
    )
  }

  const getSeverityStyle = (severity: Severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-destructive/10 text-destructive border-destructive/20'
      case 'WARNING':
        return 'bg-warning/10 text-warning border-warning/20'
      default:
        return 'bg-primary/10 text-primary border-primary/20'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold md:text-2xl">{t('title')}</h1>
          <p className="text-muted-foreground text-sm">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canBulkAck && (
            <button
              onClick={handleBulkAcknowledge}
              disabled={fetchingBulkIds}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {fetchingBulkIds ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              {fetchingBulkIds ? tCommon('phrases.loading') : t('bulkAcknowledge', { count: bulkPendingCount })}
            </button>
          )}
          <button
            onClick={() => {
              refetch()
              refetchStats()
            }}
            className="border-border hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            {tCommon('buttons.refresh')}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 md:gap-4">
        <div className="bg-card border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-sm">{t('stats.totalViolations')}</div>
          <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
        </div>
        <div className="bg-card border-border rounded-lg border p-4">
          <div className="text-muted-foreground flex items-center gap-1 text-sm">
            <AlertTriangle className="text-destructive h-3.5 w-3.5" />
            {t('stats.pendingRequired')}
          </div>
          <div className="text-destructive text-2xl font-bold">{stats?.unacknowledged ?? 0}</div>
        </div>
        <div className="bg-card border-border rounded-lg border p-4">
          <div className="text-muted-foreground flex items-center gap-1 text-sm">
            <Info className="text-primary h-3.5 w-3.5" />
            {t('stats.informational')}
          </div>
          <div className="text-primary text-2xl font-bold">{stats?.informational ?? 0}</div>
        </div>
        <div className="bg-card border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-sm">{t('stats.critical')}</div>
          <div className="text-2xl font-bold">{stats?.by_severity?.CRITICAL ?? 0}</div>
        </div>
        <div className="bg-card border-border rounded-lg border p-4">
          <div className="text-muted-foreground text-sm">{t('stats.warning')}</div>
          <div className="text-2xl font-bold">{stats?.by_severity?.WARNING ?? 0}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-sm">{t('filters.status')}</span>
          <div className="border-border flex overflow-hidden rounded-lg border">
            {(['required', 'informational', 'acknowledged', 'all'] as FilterStatus[]).map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    'px-3 py-1.5 text-sm transition-colors',
                    statusFilter === status
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted',
                  )}
                >
                  {t(`filters.${status === 'required' ? 'pending' : status}`)}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">{t('filters.rule')}</span>
          <select
            value={selectedRule ?? ''}
            onChange={(e) => setSelectedRule(e.target.value ? Number(e.target.value) : null)}
            className="border-border bg-background rounded-lg border px-3 py-1.5 text-sm"
          >
            <option value="">{t('filters.allRules')}</option>
            {Object.entries(NELSON_RULES).map(([id, rule]) => (
              <option key={id} value={id}>
                Rule {id}: {rule.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">{t('filters.time')}</span>
          <TimeRangeSelector value={dateRange} onChange={setDateRange} showAllTime />
        </div>
      </div>

      {/* Violations Table */}
      <div className="bg-card border-border overflow-hidden rounded-lg border">
        {/* Top Pager */}
        {showPager && (
          <div className="border-border bg-muted/30 border-b">
            <Pager
              page={page}
              totalPages={totalPages}
              totalItems={displayedItems}
              perPage={effectivePerPage}
              onPageChange={setPage}
            />
          </div>
        )}

        {/* Desktop table layout */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[700px]">
            <thead className="bg-muted/50 border-border border-b">
              <tr>
                <th className="text-muted-foreground px-4 py-3 text-left text-sm font-medium">
                  {t('table.time')}
                </th>
                <th className="text-muted-foreground px-4 py-3 text-left text-sm font-medium">
                  {t('table.characteristic')}
                </th>
                <th className="text-muted-foreground px-4 py-3 text-left text-sm font-medium">
                  {t('table.rule')}
                </th>
                <th className="text-muted-foreground px-4 py-3 text-left text-sm font-medium">
                  {t('table.severity')}
                </th>
                <th className="text-muted-foreground px-4 py-3 text-left text-sm font-medium">
                  {t('table.status')}
                </th>
                <th className="text-muted-foreground px-4 py-3 text-right text-sm font-medium">
                  {t('table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground px-4 py-8 text-center">
                    {t('loadingViolations')}
                  </td>
                </tr>
              ) : !violations?.items || violations?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-muted-foreground px-4 py-8 text-center">
                    {t('noViolationsFound')}
                  </td>
                </tr>
              ) : (
                violations?.items.map((violation) => {
                  const isInformational = !violation.requires_acknowledgement
                  return (
                    <tr
                      key={violation.id}
                      className={cn(
                        'transition-colors',
                        isInformational && !violation.acknowledged
                          ? 'bg-muted/20 hover:bg-muted/40 opacity-60'
                          : 'hover:bg-muted/30',
                      )}
                    >
                      <td className="px-4 py-3 text-sm">
                        {violation.created_at ? (
                          <>
                            <div>{formatDate(violation.created_at)}</div>
                            <div className="text-muted-foreground text-xs">
                              {new Date(violation.created_at).toLocaleTimeString()}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">
                          {violation.characteristic_name || 'Unknown'}
                        </div>
                        {violation.hierarchy_path && (
                          <div className="text-muted-foreground text-xs">
                            {violation.hierarchy_path}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
                              isInformational
                                ? 'bg-primary/10 text-primary'
                                : 'bg-destructive/10 text-destructive',
                            )}
                          >
                            {violation.rule_id}
                          </span>
                          <span className="text-sm">
                            {NELSON_RULES[violation.rule_id]?.name || violation.rule_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded border px-2 py-1 text-xs font-medium',
                            getSeverityStyle(violation.severity),
                          )}
                        >
                          {violation.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {violation.acknowledged ? (
                          <div>
                            <div className="text-success flex items-center gap-1 text-sm">
                              <Check className="h-4 w-4" />
                              <span>{tCommon('status.acknowledged')}</span>
                            </div>
                            <div className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                              {violation.ack_user && (
                                <div>By: <span className="text-foreground">{violation.ack_user}</span></div>
                              )}
                              {violation.ack_timestamp && (
                                <div>{formatDateTime(violation.ack_timestamp)}</div>
                              )}
                              {violation.ack_reason && (
                                <div className="bg-muted/50 mt-1 rounded px-2 py-1 italic">
                                  {violation.ack_reason}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : isInformational ? (
                          <div className="text-primary flex items-center gap-1 text-sm">
                            <Info className="h-4 w-4" />
                            <span>{tCommon('status.informational')}</span>
                          </div>
                        ) : (
                          <div className="text-destructive flex items-center gap-1 text-sm">
                            <Clock className="h-4 w-4" />
                            <span>{tCommon('status.pending')}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setInspectedViolation(violation)}
                            className="border-border hover:bg-muted rounded border p-1.5 text-xs transition-colors"
                            title="View context"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {!violation.acknowledged && violation.requires_acknowledgement && (
                            ackViolationId === violation.id ? (
                              <div className="space-y-2 text-left">
                                <textarea
                                  placeholder="Reason for acknowledgment..."
                                  value={ackReason}
                                  onChange={(e) => setAckReason(e.target.value)}
                                  className="bg-background border-border focus:ring-primary w-full min-w-[200px] resize-none rounded-lg border px-3 py-2 text-sm focus:ring-1 focus:outline-none"
                                  rows={2}
                                  autoFocus
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={handleAcknowledge}
                                    disabled={!ackReason.trim() || acknowledgeMutation.isPending}
                                    className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                                  >
                                    {tCommon('buttons.confirm')}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setAckViolationId(null)
                                      setAckReason('')
                                    }}
                                    className="border-border hover:bg-muted rounded border px-3 py-1.5 text-xs font-medium transition-colors"
                                  >
                                    {tCommon('buttons.cancel')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setAckViolationId(violation.id)
                                  setAckReason('')
                                }}
                                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1.5 text-xs font-medium transition-colors"
                              >
                                {tCommon('buttons.acknowledge')}
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card layout */}
        <div className="space-y-2 p-3 md:hidden">
          {isLoading ? (
            <div className="text-muted-foreground py-8 text-center text-sm">
              {t('loadingViolations')}
            </div>
          ) : !violations?.items || violations?.items.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center text-sm">
              {t('noViolationsFound')}
            </div>
          ) : (
            violations?.items.map((violation) => (
              <div key={violation.id} className="border-border rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {NELSON_RULES[violation.rule_id]?.name || violation.rule_name}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      violation.severity === 'CRITICAL'
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-yellow-500/10 text-yellow-600',
                    )}
                  >
                    {violation.severity}
                  </span>
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {violation.characteristic_name || 'Unknown'}
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground text-xs">
                    {violation.created_at
                      ? formatDateTime(violation.created_at)
                      : '-'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setInspectedViolation(violation)}
                      className="border-border hover:bg-muted rounded border p-1 text-xs transition-colors"
                      title="View context"
                    >
                      <Eye className="h-3 w-3" />
                    </button>
                    {violation.acknowledged ? (
                      <span className="text-success flex items-center gap-1 text-xs">
                        <Check className="h-3 w-3" />
                        {tCommon('status.acknowledged')}
                      </span>
                    ) : !violation.requires_acknowledgement ? (
                      <span className="text-primary flex items-center gap-1 text-xs">
                        <Info className="h-3 w-3" />
                        {tCommon('status.informational')}
                      </span>
                    ) : (
                      <button
                        onClick={() => {
                          setAckViolationId(violation.id)
                          setAckReason('')
                        }}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-2 py-1 text-xs font-medium transition-colors"
                      >
                        {tCommon('buttons.acknowledge')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Bottom Pager */}
        {showPager && (
          <div className="border-border bg-muted/30 border-t">
            <Pager
              page={page}
              totalPages={totalPages}
              totalItems={displayedItems}
              perPage={effectivePerPage}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {/* Bulk Acknowledge Dialog */}
      {bulkAckDialogOpen && bulkIds.length > 0 && (
        <BulkAcknowledgeDialog
          violationIds={bulkIds}
          onClose={() => {
            setBulkAckDialogOpen(false)
            setBulkIds([])
            refetch()
            refetchStats()
          }}
          contextLabel="matching current filters"
        />
      )}

      {/* Violation Context Modal */}
      {inspectedViolation && (
        <ViolationContextModal
          sampleId={inspectedViolation.sample_id}
          characteristicId={inspectedViolation.characteristic_id ?? 0}
          violationId={inspectedViolation.id}
          ruleId={inspectedViolation.rule_id}
          ruleName={inspectedViolation.rule_name}
          severity={inspectedViolation.severity}
          characteristicName={inspectedViolation.characteristic_name}
          hierarchyPath={inspectedViolation.hierarchy_path}
          createdAt={inspectedViolation.created_at}
          acknowledged={inspectedViolation.acknowledged}
          requiresAcknowledgement={inspectedViolation.requires_acknowledgement}
          onClose={() => setInspectedViolation(null)}
          onAcknowledged={() => {
            setInspectedViolation(null)
            refetch()
            refetchStats()
          }}
        />
      )}
    </div>
  )
}
