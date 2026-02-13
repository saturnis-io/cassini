import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, Download, Trash2, RefreshCw, HardDrive, Server } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { characteristicApi, sampleApi, violationApi } from '@/api/client'
import { useDatabaseStatus } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess } from '@/lib/roles'
import { DatabaseConnectionForm } from '@/components/DatabaseConnectionForm'
import { DatabaseMigrationStatus } from '@/components/DatabaseMigrationStatus'
import { DatabaseMaintenancePanel } from '@/components/DatabaseMaintenancePanel'
import type { Sample } from '@/types'

/** Maximum records per entity for client-side export */
const EXPORT_MAX_RECORDS = 10_000

interface DatabaseStats {
  characteristics_count: number
  samples_count: number
  violations_count: number
}

// TODO: Replace with a single GET /api/v1/stats endpoint when available.
// Currently makes 3 parallel requests with per_page=1 to extract total counts.
async function fetchDatabaseStats(): Promise<DatabaseStats> {
  const [chars, samples, violations] = await Promise.all([
    characteristicApi.list().catch(() => ({ total: 0 })),
    sampleApi.list({ per_page: 1 }).catch(() => ({ total: 0 })),
    violationApi.list({ per_page: 1 }).catch(() => ({ total: 0 })),
  ])

  return {
    characteristics_count: (chars as { total?: number }).total || 0,
    samples_count: (samples as { total?: number }).total || 0,
    violations_count: (violations as { total?: number }).total || 0,
  }
}

const DIALECT_LABELS: Record<string, string> = {
  sqlite: 'SQLite',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mssql: 'MSSQL',
}

type DatabaseSubTab = 'status' | 'connection' | 'migrations' | 'maintenance'

const SUB_TABS: { id: DatabaseSubTab; label: string; adminOnly?: boolean }[] = [
  { id: 'status', label: 'Status' },
  { id: 'connection', label: 'Connection', adminOnly: true },
  { id: 'migrations', label: 'Migrations', adminOnly: true },
  { id: 'maintenance', label: 'Maintenance' },
]

export function DatabaseSettings() {
  const [subTab, setSubTab] = useState<DatabaseSubTab>('status')
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [clearTarget, setClearTarget] = useState<'samples' | 'all' | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const { role } = useAuth()
  const isAdmin = hasAccess(role, 'admin')

  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['database-stats'],
    queryFn: fetchDatabaseStats,
    refetchInterval: 30000,
  })

  const { data: dbStatus, isLoading: statusLoading, refetch: refetchStatus } = useDatabaseStatus()

  // Paginated fetch helper — fetches all pages up to EXPORT_MAX_RECORDS
  const fetchAllPages = async <T,>(
    fetcher: (params: { page: number; per_page: number }) => Promise<{ items: T[]; total: number }>,
    pageSize = 1000,
  ): Promise<{ items: T[]; total: number }> => {
    const allItems: T[] = []
    let page = 1
    let total = 0
    while (allItems.length < EXPORT_MAX_RECORDS) {
      const result = await fetcher({ page, per_page: pageSize })
      total = result.total
      const items = result.items || []
      if (items.length === 0) break
      allItems.push(...items)
      if (allItems.length >= total) break
      page++
    }
    return { items: allItems.slice(0, EXPORT_MAX_RECORDS), total }
  }

  const handleExport = async (format: 'json' | 'csv') => {
    setIsExporting(true)
    try {
      const [chars, samples, violations] = await Promise.all([
        characteristicApi.list(),
        fetchAllPages((p) => sampleApi.list(p)),
        fetchAllPages((p) => violationApi.list(p)),
      ])

      const totalSamples = (samples as { total?: number }).total ?? 0
      const totalViolations = (violations as { total?: number }).total ?? 0
      if (totalSamples > EXPORT_MAX_RECORDS || totalViolations > EXPORT_MAX_RECORDS) {
        toast.warning(
          `Export truncated: ${totalSamples} samples, ${totalViolations} violations (max ${EXPORT_MAX_RECORDS.toLocaleString()} each)`,
        )
      }

      const exportData = {
        exported_at: new Date().toISOString(),
        characteristics: chars.items || [],
        samples: samples.items || [],
        violations: violations.items || [],
      }

      let content: string
      let filename: string
      let mimeType: string

      if (format === 'json') {
        content = JSON.stringify(exportData, null, 2)
        filename = `openspc-export-${new Date().toISOString().split('T')[0]}.json`
        mimeType = 'application/json'
      } else {
        // Simple CSV export for samples
        const headers = [
          'id',
          'characteristic_id',
          'timestamp',
          'mean',
          'range_value',
          'is_excluded',
        ]
        const rows = (samples.items || []).map((s: Sample) =>
          [s.id, s.characteristic_id, s.timestamp, s.mean, s.range_value, s.is_excluded].join(','),
        )
        content = [headers.join(','), ...rows].join('\n')
        filename = `openspc-samples-${new Date().toISOString().split('T')[0]}.csv`
        mimeType = 'text/csv'
      }

      // Download
      const blob = new Blob([content], { type: mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`Exported to ${filename}`)
    } catch (error) {
      toast.error('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsExporting(false)
    }
  }

  const handleClearData = async () => {
    toast.error('Data clearing is disabled for safety. Use database tools directly.')
    setShowClearDialog(false)
    setClearTarget(null)
  }

  // Filter sub-tabs by role
  const visibleSubTabs = SUB_TABS.filter((t) => !t.adminOnly || isAdmin)

  // If active sub-tab becomes invisible (role change), reset
  if (!visibleSubTabs.find((t) => t.id === subTab)) {
    setSubTab('status')
  }

  return (
    <div className="space-y-5">
      {/* Pill Sub-Navigation */}
      <div className="flex gap-1.5">
        {visibleSubTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              subTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-Tab Content */}
      {subTab === 'status' && (
        <StatusContent
          dbStatus={dbStatus}
          statusLoading={statusLoading}
          refetchStatus={refetchStatus}
          stats={stats}
          statsLoading={statsLoading}
          refetchStats={refetchStats}
        />
      )}

      {subTab === 'connection' && isAdmin && (
        <div className="bg-muted rounded-xl p-6">
          <div className="mb-4 flex items-center gap-2">
            <Server className="text-muted-foreground h-5 w-5" />
            <h3 className="font-semibold">Connection Configuration</h3>
          </div>
          <DatabaseConnectionForm />
        </div>
      )}

      {subTab === 'migrations' && isAdmin && (
        <div className="bg-muted rounded-xl p-6">
          <h3 className="mb-4 font-semibold">Migration Status</h3>
          <DatabaseMigrationStatus />
        </div>
      )}

      {subTab === 'maintenance' && (
        <MaintenanceContent isExporting={isExporting} onExport={handleExport} />
      )}

      {/* Danger Zone — separated with extra spacing */}
      <div className="pt-4">
        <div className="bg-destructive/5 border-destructive/20 rounded-xl border p-6">
          <div className="mb-4 flex items-center gap-2">
            <Trash2 className="text-destructive h-5 w-5" />
            <h3 className="text-destructive font-semibold">Danger Zone</h3>
          </div>

          <p className="text-muted-foreground mb-4 text-sm">
            These actions are irreversible. Please be certain before proceeding.
          </p>

          <div className="space-y-3">
            <div className="bg-card border-border flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Clear Sample Data</div>
                <div className="text-muted-foreground text-xs">
                  Delete all samples and violations while keeping characteristics
                </div>
              </div>
              <button
                onClick={() => {
                  setClearTarget('samples')
                  setShowClearDialog(true)
                }}
                className="text-destructive border-destructive/30 hover:bg-destructive/10 rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Clear Samples
              </button>
            </div>

            <div className="bg-card border-border flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Reset Database</div>
                <div className="text-muted-foreground text-xs">
                  Delete all data including hierarchy, characteristics, and samples
                </div>
              </div>
              <button
                onClick={() => {
                  setClearTarget('all')
                  setShowClearDialog(true)
                }}
                className="text-destructive border-destructive/30 hover:bg-destructive/10 rounded-lg border px-4 py-2 text-sm font-medium"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Clear Confirmation Dialog */}
      {showClearDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowClearDialog(false)}
        >
          <div
            className="bg-card border-border mx-4 w-full max-w-md rounded-2xl border p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-destructive mb-2 text-lg font-semibold">
              {clearTarget === 'all' ? 'Reset Database?' : 'Clear Sample Data?'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {clearTarget === 'all'
                ? 'This will permanently delete ALL data including hierarchy, characteristics, samples, and violations. This cannot be undone.'
                : 'This will permanently delete all samples and violations. Your hierarchy and characteristic configurations will be preserved.'}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowClearDialog(false)
                  setClearTarget(null)
                }}
                className="border-border bg-secondary hover:bg-secondary/80 rounded-xl border px-5 py-2.5 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleClearData}
                className="bg-destructive text-destructive-foreground rounded-xl px-5 py-2.5 text-sm font-medium"
              >
                {clearTarget === 'all' ? 'Reset Everything' : 'Clear Samples'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Status Sub-Tab
 * ----------------------------------------------------------------------- */

function StatusContent({
  dbStatus,
  statusLoading,
  refetchStatus,
  stats,
  statsLoading,
  refetchStats,
}: {
  dbStatus: ReturnType<typeof useDatabaseStatus>['data']
  statusLoading: boolean
  refetchStatus: () => void
  stats: DatabaseStats | undefined
  statsLoading: boolean
  refetchStats: () => void
}) {
  const statCards = [
    { label: 'Characteristics', value: stats?.characteristics_count ?? '-', icon: Database },
    { label: 'Samples', value: stats?.samples_count ?? '-', icon: HardDrive },
    { label: 'Violations', value: stats?.violations_count ?? '-', icon: Database },
  ]

  return (
    <div className="space-y-5">
      {/* Database Status */}
      <div className="bg-muted rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="text-muted-foreground h-5 w-5" />
            <h3 className="font-semibold">Database Status</h3>
          </div>
          <button
            onClick={() => refetchStatus()}
            disabled={statusLoading}
            className="hover:bg-card rounded-lg p-2"
            title="Refresh status"
          >
            <RefreshCw className={cn('h-4 w-4', statusLoading && 'animate-spin')} />
          </button>
        </div>

        {dbStatus ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="bg-card border-border rounded-lg border p-3">
              <div className="text-muted-foreground mb-1 text-xs">Engine</div>
              <div className="text-sm font-medium">
                <span className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold">
                  {DIALECT_LABELS[dbStatus.dialect] || dbStatus.dialect}
                </span>
              </div>
            </div>
            <div className="bg-card border-border rounded-lg border p-3">
              <div className="text-muted-foreground mb-1 text-xs">Status</div>
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'h-2 w-2 rounded-full',
                    dbStatus.is_connected ? 'bg-success' : 'bg-destructive',
                  )}
                />
                <span className="text-sm font-medium">
                  {dbStatus.is_connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            <div className="bg-card border-border rounded-lg border p-3">
              <div className="text-muted-foreground mb-1 text-xs">Tables</div>
              <div className="text-sm font-medium">{dbStatus.table_count}</div>
            </div>
            <div className="bg-card border-border rounded-lg border p-3">
              <div className="text-muted-foreground mb-1 text-xs">Size</div>
              <div className="text-sm font-medium">
                {dbStatus.database_size_mb != null ? `${dbStatus.database_size_mb} MB` : 'N/A'}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">Loading status...</div>
        )}

        {dbStatus?.version && (
          <div className="text-muted-foreground mt-3 truncate text-xs">
            Version: {dbStatus.version}
          </div>
        )}
      </div>

      {/* Database Statistics */}
      <div className="bg-muted rounded-xl p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="text-muted-foreground h-5 w-5" />
            <h3 className="font-semibold">Statistics</h3>
          </div>
          <button
            onClick={() => refetchStats()}
            disabled={statsLoading}
            className="hover:bg-card rounded-lg p-2"
            title="Refresh statistics"
          >
            <RefreshCw className={cn('h-4 w-4', statsLoading && 'animate-spin')} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="bg-card border-border rounded-lg border p-4 text-center"
            >
              <stat.icon className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
              <div className="text-2xl font-bold">
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </div>
              <div className="text-muted-foreground text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Maintenance Sub-Tab
 * ----------------------------------------------------------------------- */

function MaintenanceContent({
  isExporting,
  onExport,
}: {
  isExporting: boolean
  onExport: (format: 'json' | 'csv') => void
}) {
  return (
    <div className="space-y-5">
      {/* Maintenance Tools */}
      <div className="bg-muted rounded-xl p-6">
        <h3 className="mb-4 font-semibold">Maintenance</h3>
        <DatabaseMaintenancePanel />
      </div>

      {/* Export Data */}
      <div className="bg-muted rounded-xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Download className="text-muted-foreground h-5 w-5" />
          <h3 className="font-semibold">Export Data</h3>
        </div>

        <p className="text-muted-foreground mb-4 text-sm">
          Download all characteristics, samples, and violations data for backup or analysis.
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => onExport('json')}
            disabled={isExporting}
            className="border-border bg-card hover:bg-card/80 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export JSON
          </button>
          <button
            onClick={() => onExport('csv')}
            disabled={isExporting}
            className="border-border bg-card hover:bg-card/80 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export Samples CSV
          </button>
        </div>
      </div>
    </div>
  )
}
