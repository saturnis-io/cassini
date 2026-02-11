import { useState, useMemo } from 'react'
import { AlertTriangle, Check, Clock, Filter, RefreshCw, Info, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useViolations, useViolationStats, useAcknowledgeViolation } from '@/api/hooks'
import { violationApi } from '@/api/client'
import { useAuth } from '@/providers/AuthProvider'
import { canPerformAction } from '@/lib/roles'
import { NELSON_RULES } from '@/components/ViolationLegend'
import { TimeRangeSelector } from '@/components/TimeRangeSelector'
import { BulkAcknowledgeDialog } from '@/components/BulkAcknowledgeDialog'
import type { TimeRangeState } from '@/stores/dashboardStore'
import type { Severity } from '@/types'

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
      <span className="text-sm text-muted-foreground">
        Showing {showingFrom}–{showingTo} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="px-1.5 py-1 text-xs font-mono font-bold border border-border rounded hover:bg-muted disabled:opacity-40 transition-colors"
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="p-1 border border-border rounded hover:bg-muted disabled:opacity-40 transition-colors"
          title="Previous page"
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
            className="w-12 px-1 py-0.5 text-sm text-center tabular-nums border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <span className="text-sm text-muted-foreground">/ {totalPages}</span>
        </div>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="p-1 border border-border rounded hover:bg-muted disabled:opacity-40 transition-colors"
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="px-1.5 py-1 text-xs font-mono font-bold border border-border rounded hover:bg-muted disabled:opacity-40 transition-colors"
          title="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function ViolationsView() {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('required')
  const [selectedRule, setSelectedRule] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [dateRange, setDateRange] = useState<TimeRangeState>({
    type: 'points', pointsLimit: null, hoursBack: null, startDate: null, endDate: null,
  })
  const [bulkAckDialogOpen, setBulkAckDialogOpen] = useState(false)
  const [bulkIds, setBulkIds] = useState<number[]>([])
  const [fetchingBulkIds, setFetchingBulkIds] = useState(false)

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
  const { data: violations, isLoading, refetch } = useViolations({
    acknowledged: statusFilter === 'acknowledged' ? true : statusFilter === 'all' ? undefined : false,
    requires_acknowledgement:
      statusFilter === 'required' ? true
      : statusFilter === 'informational' ? false
      : undefined,
    rule_id: selectedRule ?? undefined,
    page: isPointsLimit ? 1 : page,
    per_page: effectivePerPage,
    ...dateParams,
  })

  // Pending IDs from the loaded page (always available)
  const pendingFromPage = useMemo(() => {
    if (!violations?.items) return []
    return violations.items
      .filter(v => !v.acknowledged && v.requires_acknowledgement)
      .map(v => v.id)
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
  const bulkPendingCount = isPointsLimit ? pendingFromPage.length : (pendingCountData?.total ?? pendingFromPage.length)

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
        allIds.push(...result.items.map(v => v.id))
        if (allIds.length >= result.total || result.items.length < batchSize) break
        fetchPage++
      }
      setBulkIds(allIds)
      setBulkAckDialogOpen(true)
    } finally {
      setFetchingBulkIds(false)
    }
  }

  const handleAcknowledge = (violationId: number) => {
    acknowledgeMutation.mutate(
      { id: violationId, reason: 'Acknowledged from violations view', user: user?.username ?? 'Unknown' },
      {
        onSuccess: () => {
          refetch()
          refetchStats()
        },
      }
    )
  }

  const getSeverityStyle = (severity: Severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-destructive/10 text-destructive border-destructive/20'
      case 'WARNING':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
      default:
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Violations</h1>
          <p className="text-muted-foreground">
            Monitor and acknowledge Nelson rule violations
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canBulkAck && (
            <button
              onClick={handleBulkAcknowledge}
              disabled={fetchingBulkIds}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {fetchingBulkIds ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )}
              {fetchingBulkIds ? 'Loading...' : `Bulk Acknowledge (${bulkPendingCount})`}
            </button>
          )}
          <button
            onClick={() => {
              refetch()
              refetchStats()
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total Violations</div>
          <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            Pending (Required)
          </div>
          <div className="text-2xl font-bold text-destructive">{stats?.unacknowledged ?? 0}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Info className="h-3.5 w-3.5 text-blue-500" />
            Informational
          </div>
          <div className="text-2xl font-bold text-blue-500">{stats?.informational ?? 0}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Critical</div>
          <div className="text-2xl font-bold">{stats?.by_severity?.CRITICAL ?? 0}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Warning</div>
          <div className="text-2xl font-bold">{stats?.by_severity?.WARNING ?? 0}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Status:</span>
          <div className="flex border border-border rounded-lg overflow-hidden">
            {(['required', 'informational', 'acknowledged', 'all'] as FilterStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-3 py-1.5 text-sm transition-colors',
                  statusFilter === status
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )}
              >
                {status === 'required' ? 'Pending' : status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rule:</span>
          <select
            value={selectedRule ?? ''}
            onChange={(e) => setSelectedRule(e.target.value ? Number(e.target.value) : null)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg bg-background"
          >
            <option value="">All Rules</option>
            {Object.entries(NELSON_RULES).map(([id, rule]) => (
              <option key={id} value={id}>
                Rule {id}: {rule.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Time:</span>
          <TimeRangeSelector value={dateRange} onChange={setDateRange} showAllTime />
        </div>
      </div>

      {/* Violations Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {/* Top Pager */}
        {showPager && (
          <div className="border-b border-border bg-muted/30">
            <Pager page={page} totalPages={totalPages} totalItems={displayedItems} perPage={effectivePerPage} onPageChange={setPage} />
          </div>
        )}

        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Time</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Characteristic</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Rule</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Severity</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Loading violations...
                </td>
              </tr>
            ) : !violations?.items || violations?.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No violations found
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
                        ? 'opacity-60 bg-muted/20 hover:bg-muted/40'
                        : 'hover:bg-muted/30'
                    )}
                  >
                    <td className="px-4 py-3 text-sm">
                      {violation.created_at ? (
                        <>
                          <div>{new Date(violation.created_at).toLocaleDateString()}</div>
                          <div className="text-xs text-muted-foreground">
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
                        <div className="text-xs text-muted-foreground">
                          {violation.hierarchy_path}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded-full',
                          isInformational
                            ? 'bg-blue-500/10 text-blue-600'
                            : 'bg-destructive/10 text-destructive'
                        )}>
                          {violation.rule_id}
                        </span>
                        <span className="text-sm">{NELSON_RULES[violation.rule_id]?.name || violation.rule_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-1 text-xs font-medium rounded border', getSeverityStyle(violation.severity))}>
                        {violation.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {violation.acknowledged ? (
                        <div className="flex items-center gap-1 text-sm text-green-600">
                          <Check className="h-4 w-4" />
                          <span>Acknowledged</span>
                        </div>
                      ) : isInformational ? (
                        <div className="flex items-center gap-1 text-sm text-blue-500">
                          <Info className="h-4 w-4" />
                          <span>Informational</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-sm text-destructive">
                          <Clock className="h-4 w-4" />
                          <span>Pending</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!violation.acknowledged && violation.requires_acknowledgement && (
                        <button
                          onClick={() => handleAcknowledge(violation.id)}
                          disabled={acknowledgeMutation.isPending}
                          className="px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          Acknowledge
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Bottom Pager */}
        {showPager && (
          <div className="border-t border-border bg-muted/30">
            <Pager page={page} totalPages={totalPages} totalItems={displayedItems} perPage={effectivePerPage} onPageChange={setPage} />
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
    </div>
  )
}
