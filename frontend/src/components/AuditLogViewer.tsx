import { useState, useMemo } from 'react'
import {
  Download,
  ChevronDown,
  ChevronRight,
  Shield,
  LogIn,
  Settings,
  Trash2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
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
  submit: 'Submit',
  approve: 'Approve',
  reject: 'Reject',
  calculate: 'Calculate',
  freeze: 'Freeze',
  train: 'Train',
  generate: 'Generate',
  analyze: 'Analyze',
  sign: 'Sign',
  sync: 'Sync',
  dismiss: 'Dismiss',
  purge: 'Purge',
  forecast: 'Forecast',
  test: 'Test',
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
  rule_preset: 'Rule Preset',
  msa_study: 'MSA Study',
  fai_report: 'FAI Report',
  gage_bridge: 'Gage Bridge',
  anomaly: 'Anomaly',
  signature: 'Signature',
  oidc_config: 'OIDC Config',
  oidc_link: 'OIDC Link',
  push_subscription: 'Push Subscription',
  erp_connector: 'ERP Connector',
  multivariate_group: 'Multivariate Group',
  correlation: 'Correlation',
  prediction: 'Prediction',
  ai_config: 'AI Config',
  doe_study: 'DOE Study',
}

function ActionBadge({ action }: { action: string }) {
  const colorMap: Record<string, string> = {
    login: 'bg-success/10 text-success',
    login_failed: 'bg-destructive/10 text-destructive',
    logout: 'bg-muted text-muted-foreground',
    create: 'bg-primary/10 text-primary',
    update: 'bg-warning/10 text-warning',
    delete: 'bg-destructive/10 text-destructive',
    recalculate: 'bg-accent/10 text-accent',
    violation_created: 'bg-warning/10 text-warning',
    acknowledge: 'bg-success/10 text-success',
    submit: 'bg-primary/10 text-primary',
    sign: 'bg-primary/10 text-primary',
    approve: 'bg-success/10 text-success',
    reject: 'bg-destructive/10 text-destructive',
    calculate: 'bg-accent/10 text-accent',
    analyze: 'bg-accent/10 text-accent',
    train: 'bg-accent/10 text-accent',
    generate: 'bg-accent/10 text-accent',
    forecast: 'bg-accent/10 text-accent',
    freeze: 'bg-accent/10 text-accent',
    sync: 'bg-primary/10 text-primary',
    test: 'bg-primary/10 text-primary',
    connect: 'bg-primary/10 text-primary',
    dismiss: 'bg-destructive/10 text-destructive',
    purge: 'bg-destructive/10 text-destructive',
  }
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        colorMap[action] || 'bg-muted text-muted-foreground',
      )}
    >
      {ACTION_LABELS[action] || action}
    </span>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | string
  icon: React.ElementType
}) {
  return (
    <div className="border-border bg-card rounded-lg border p-4">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 rounded-md p-2">
          <Icon className="text-primary h-4 w-4" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{label}</p>
          <p className="text-foreground text-xl font-bold">{value}</p>
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
        className="border-border hover:bg-muted/50 cursor-pointer border-b"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="text-muted-foreground px-3 py-2 text-xs whitespace-nowrap">
          <div className="flex items-center gap-1">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {new Date(entry.timestamp).toLocaleString()}
          </div>
        </td>
        <td className="px-3 py-2 text-sm">{entry.username || '--'}</td>
        <td className="px-3 py-2">
          <ActionBadge action={entry.action} />
        </td>
        <td className="text-muted-foreground px-3 py-2 text-sm">
          {entry.resource_type ? (
            <>
              {RESOURCE_LABELS[entry.resource_type] || entry.resource_type}
              {entry.resource_id ? ` #${entry.resource_id}` : ''}
            </>
          ) : (
            '--'
          )}
        </td>
        <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
          {entry.ip_address || '--'}
        </td>
      </tr>
      {expanded && entry.detail && (
        <tr className="border-border bg-muted/30 border-b">
          <td colSpan={5} className="px-6 py-3">
            <pre className="text-muted-foreground max-w-full overflow-x-auto font-mono text-xs whitespace-pre-wrap">
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

  const params: AuditLogParams = useMemo(
    () => ({
      ...filters,
      action: actionFilter || undefined,
      resource_type: resourceFilter || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    }),
    [filters, actionFilter, resourceFilter, startDate, endDate],
  )

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
  const configChanges =
    (stats?.events_by_action?.update ?? 0) +
    (stats?.events_by_action?.create ?? 0) +
    (stats?.events_by_action?.delete ?? 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-foreground text-lg font-semibold">Audit Log</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          Track all user actions and system events
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Events" value={stats?.total_events ?? 0} icon={Shield} />
        <StatCard label="Logins" value={loginCount} icon={LogIn} />
        <StatCard label="Failed Logins" value={loginFailedCount} icon={LogIn} />
        <StatCard label="Config Changes" value={configChanges} icon={Settings} />
      </div>

      {/* Filter bar */}
      <div className="border-border bg-card flex flex-wrap items-center gap-3 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <Search className="text-muted-foreground h-4 w-4" />
          <span className="text-muted-foreground text-sm font-medium">Filters</span>
        </div>

        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value)
            setFilters((f) => ({ ...f, offset: 0 }))
          }}
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
        >
          <option value="">All Actions</option>
          {actionOptions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a] || a}
            </option>
          ))}
        </select>

        <select
          value={resourceFilter}
          onChange={(e) => {
            setResourceFilter(e.target.value)
            setFilters((f) => ({ ...f, offset: 0 }))
          }}
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
        >
          <option value="">All Resources</option>
          {resourceOptions.map((r) => (
            <option key={r} value={r}>
              {RESOURCE_LABELS[r] || r}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value)
            setFilters((f) => ({ ...f, offset: 0 }))
          }}
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
          placeholder="Start"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value)
            setFilters((f) => ({ ...f, offset: 0 }))
          }}
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
          placeholder="End"
        />

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="border-input hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}

        <div className="ml-auto">
          <button
            onClick={() => exportMutation.mutate(params)}
            disabled={exportMutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border-border bg-card overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left">
            <thead>
              <tr className="border-border bg-muted/50 border-b">
                <th className="text-muted-foreground px-3 py-2 text-xs font-semibold">Timestamp</th>
                <th className="text-muted-foreground px-3 py-2 text-xs font-semibold">User</th>
                <th className="text-muted-foreground px-3 py-2 text-xs font-semibold">Action</th>
                <th className="text-muted-foreground px-3 py-2 text-xs font-semibold">Resource</th>
                <th className="text-muted-foreground px-3 py-2 text-xs font-semibold">IP</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-3 py-8 text-center text-sm">
                    <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />
                    Loading audit logs...
                  </td>
                </tr>
              ) : logsData?.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground px-3 py-8 text-center text-sm">
                    No audit log entries found
                  </td>
                </tr>
              ) : (
                logsData?.items.map((entry) => <ExpandableRow key={entry.id} entry={entry} />)
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {logsData && logsData.total > (filters.limit || 50) && (
          <div className="border-border flex items-center justify-between border-t px-4 py-3">
            <p className="text-muted-foreground text-xs">
              Showing {(filters.offset || 0) + 1} -{' '}
              {Math.min((filters.offset || 0) + (filters.limit || 50), logsData.total)} of{' '}
              {logsData.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    offset: Math.max(0, (f.offset || 0) - (f.limit || 50)),
                  }))
                }
                disabled={currentPage <= 1}
                className="border-input hover:bg-muted h-7 rounded-md border px-3 text-xs disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-muted-foreground flex items-center text-xs">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setFilters((f) => ({ ...f, offset: (f.offset || 0) + (f.limit || 50) }))
                }
                disabled={currentPage >= totalPages}
                className="border-input hover:bg-muted h-7 rounded-md border px-3 text-xs disabled:opacity-50"
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
