import { useState, useMemo } from 'react'
import { Download, ChevronDown, ChevronRight, Shield, LogIn, Settings, Trash2, RefreshCw, Search, X } from 'lucide-react'
import { useAuditLogs, useAuditStats, useExportAuditLogs } from '@/api/hooks'
import { cn } from '@/lib/utils'
import type { AuditLogEntry } from '@/types'
import type { AuditLogParams } from '@/api/client'

const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  login_failed: 'Login Failed',
  logout: 'Logout',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  recalculate: 'Recalculate',
  acknowledge: 'Acknowledge',
  export: 'Export',
  connect: 'Connect',
  disconnect: 'Disconnect',
  violation_created: 'Violation',
}

const RESOURCE_LABELS: Record<string, string> = {
  characteristic: 'Characteristic',
  sample: 'Sample',
  plant: 'Plant',
  user: 'User',
  broker: 'Broker',
  opcua_server: 'OPC-UA Server',
  hierarchy: 'Hierarchy',
  violation: 'Violation',
  retention: 'Retention',
  database: 'Database',
  api_key: 'API Key',
  tag_mapping: 'Tag Mapping',
  annotation: 'Annotation',
  import: 'Import',
}

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    login: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    login_failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    logout: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400',
    create: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    update: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    delete: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    recalculate: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    violation_created: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    acknowledge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  }
  return (
    <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', colorMap[action] || 'bg-muted text-muted-foreground')}>
      {ACTION_LABELS[action] || action}
    </span>
  )
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  )
}

function ExpandableRow({ entry }: { entry: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <tr
        className="border-b border-border hover:bg-muted/50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
          <div className="flex items-center gap-1">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {new Date(entry.timestamp).toLocaleString()}
          </div>
        </td>
        <td className="px-3 py-2 text-sm">{entry.username || '--'}</td>
        <td className="px-3 py-2"><ActionBadge action={entry.action} /></td>
        <td className="px-3 py-2 text-sm text-muted-foreground">
          {entry.resource_type ? (
            <>
              {RESOURCE_LABELS[entry.resource_type] || entry.resource_type}
              {entry.resource_id ? ` #${entry.resource_id}` : ''}
            </>
          ) : '--'}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{entry.ip_address || '--'}</td>
      </tr>
      {expanded && entry.detail && (
        <tr className="border-b border-border bg-muted/30">
          <td colSpan={5} className="px-6 py-3">
            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono max-w-full overflow-x-auto">
              {JSON.stringify(entry.detail, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  )
}

export function AuditLogViewer() {
  const [filters, setFilters] = useState<AuditLogParams>({
    limit: 50,
    offset: 0,
  })
  const [actionFilter, setActionFilter] = useState('')
  const [resourceFilter, setResourceFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const params: AuditLogParams = useMemo(() => ({
    ...filters,
    action: actionFilter || undefined,
    resource_type: resourceFilter || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  }), [filters, actionFilter, resourceFilter, startDate, endDate])

  const { data: logsData, isLoading } = useAuditLogs(params)
  const { data: stats } = useAuditStats()
  const exportMutation = useExportAuditLogs()

  const totalPages = logsData ? Math.ceil(logsData.total / (filters.limit || 50)) : 0
  const currentPage = Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1

  const actionOptions = useMemo(() => {
    if (!stats?.events_by_action) return []
    return Object.keys(stats.events_by_action).sort()
  }, [stats])

  const resourceOptions = useMemo(() => {
    if (!stats?.events_by_resource) return []
    return Object.keys(stats.events_by_resource).sort()
  }, [stats])

  function clearFilters() {
    setActionFilter('')
    setResourceFilter('')
    setStartDate('')
    setEndDate('')
    setFilters({ limit: 50, offset: 0 })
  }

  const hasActiveFilters = actionFilter || resourceFilter || startDate || endDate

  const loginCount = stats?.events_by_action?.login ?? 0
  const loginFailedCount = stats?.events_by_action?.login_failed ?? 0
  const configChanges = (stats?.events_by_action?.update ?? 0) + (stats?.events_by_action?.create ?? 0) + (stats?.events_by_action?.delete ?? 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Audit Log</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Track all user actions and system events</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Events" value={stats?.total_events ?? 0} icon={Shield} />
        <StatCard label="Logins" value={loginCount} icon={LogIn} />
        <StatCard label="Failed Logins" value={loginFailedCount} icon={LogIn} />
        <StatCard label="Config Changes" value={configChanges} icon={Settings} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Filters</span>
        </div>

        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setFilters(f => ({ ...f, offset: 0 })) }}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All Actions</option>
          {actionOptions.map(a => (
            <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
          ))}
        </select>

        <select
          value={resourceFilter}
          onChange={(e) => { setResourceFilter(e.target.value); setFilters(f => ({ ...f, offset: 0 })) }}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">All Resources</option>
          {resourceOptions.map(r => (
            <option key={r} value={r}>{RESOURCE_LABELS[r] || r}</option>
          ))}
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setFilters(f => ({ ...f, offset: 0 })) }}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          placeholder="Start"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setFilters(f => ({ ...f, offset: 0 })) }}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          placeholder="End"
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 h-8 px-2 text-xs rounded-md border border-input hover:bg-muted"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <div className="ml-auto">
          <button
            onClick={() => exportMutation.mutate(params)}
            disabled={exportMutation.isPending}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">Timestamp</th>
                <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">User</th>
                <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">Action</th>
                <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">Resource</th>
                <th className="px-3 py-2 text-xs font-semibold text-muted-foreground">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin inline mr-2" />
                    Loading audit logs...
                  </td>
                </tr>
              ) : logsData?.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    No audit log entries found
                  </td>
                </tr>
              ) : (
                logsData?.items.map(entry => (
                  <ExpandableRow key={entry.id} entry={entry} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {logsData && logsData.total > (filters.limit || 50) && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {(filters.offset || 0) + 1} - {Math.min((filters.offset || 0) + (filters.limit || 50), logsData.total)} of {logsData.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setFilters(f => ({ ...f, offset: Math.max(0, (f.offset || 0) - (f.limit || 50)) }))}
                disabled={currentPage <= 1}
                className="h-7 px-3 text-xs rounded-md border border-input hover:bg-muted disabled:opacity-50"
              >
                Previous
              </button>
              <span className="flex items-center text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setFilters(f => ({ ...f, offset: (f.offset || 0) + (f.limit || 50) }))}
                disabled={currentPage >= totalPages}
                className="h-7 px-3 text-xs rounded-md border border-input hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
