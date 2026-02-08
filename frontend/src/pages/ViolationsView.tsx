import { useState } from 'react'
import { AlertTriangle, Check, Clock, Filter, RefreshCw, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useViolations, useViolationStats, useAcknowledgeViolation } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { NELSON_RULES } from '@/components/ViolationLegend'
import type { Severity } from '@/types'

type FilterStatus = 'all' | 'required' | 'informational' | 'acknowledged'

export function ViolationsView() {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('required')
  const [selectedRule, setSelectedRule] = useState<number | null>(null)

  const { data: stats, refetch: refetchStats } = useViolationStats()
  const { data: violations, isLoading, refetch } = useViolations({
    acknowledged: statusFilter === 'acknowledged' ? true : statusFilter === 'all' ? undefined : false,
    rule_id: selectedRule ?? undefined,
    per_page: 50,
  })

  // Filter violations based on requires_acknowledgement
  const filteredViolations = violations?.items.filter((v) => {
    if (statusFilter === 'required') {
      return v.requires_acknowledgement && !v.acknowledged
    }
    if (statusFilter === 'informational') {
      return !v.requires_acknowledgement && !v.acknowledged
    }
    return true // 'all' or 'acknowledged'
  })

  const { user } = useAuth()
  const acknowledgeMutation = useAcknowledgeViolation()

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
      <div className="flex items-center gap-4">
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
      </div>

      {/* Violations Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
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
            ) : !filteredViolations || filteredViolations.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  No violations found
                </td>
              </tr>
            ) : (
              filteredViolations.map((violation) => {
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
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={violation.hierarchy_path}>
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
      </div>
    </div>
  )
}
