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

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
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
        toast.warning(`Export truncated: ${totalSamples} samples, ${totalViolations} violations (max ${EXPORT_MAX_RECORDS.toLocaleString()} each)`)
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
        const headers = ['id', 'characteristic_id', 'timestamp', 'mean', 'range_value', 'is_excluded']
        const rows = (samples.items || []).map((s: Sample) =>
          [s.id, s.characteristic_id, s.timestamp, s.mean, s.range_value, s.is_excluded].join(',')
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
              'px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors',
              subTab === tab.id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
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
          <div className="flex items-center gap-2 mb-4">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Connection Configuration</h3>
          </div>
          <DatabaseConnectionForm />
        </div>
      )}

      {subTab === 'migrations' && isAdmin && (
        <div className="bg-muted rounded-xl p-6">
          <h3 className="font-semibold mb-4">Migration Status</h3>
          <DatabaseMigrationStatus />
        </div>
      )}

      {subTab === 'maintenance' && (
        <MaintenanceContent
          isExporting={isExporting}
          onExport={handleExport}
        />
      )}

      {/* Danger Zone — separated with extra spacing */}
      <div className="pt-4">
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Trash2 className="h-5 w-5 text-destructive" />
            <h3 className="font-semibold text-destructive">Danger Zone</h3>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            These actions are irreversible. Please be certain before proceeding.
          </p>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
              <div>
                <div className="font-medium text-sm">Clear Sample Data</div>
                <div className="text-xs text-muted-foreground">
                  Delete all samples and violations while keeping characteristics
                </div>
              </div>
              <button
                onClick={() => {
                  setClearTarget('samples')
                  setShowClearDialog(true)
                }}
                className="px-4 py-2 text-sm font-medium text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10"
              >
                Clear Samples
              </button>
            </div>

            <div className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
              <div>
                <div className="font-medium text-sm">Reset Database</div>
                <div className="text-xs text-muted-foreground">
                  Delete all data including hierarchy, characteristics, and samples
                </div>
              </div>
              <button
                onClick={() => {
                  setClearTarget('all')
                  setShowClearDialog(true)
                }}
                className="px-4 py-2 text-sm font-medium text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/10"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Clear Confirmation Dialog */}
      {showClearDialog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowClearDialog(false)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2 text-destructive">
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
                className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl bg-secondary hover:bg-secondary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleClearData}
                className="px-5 py-2.5 text-sm font-medium rounded-xl bg-destructive text-destructive-foreground"
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
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Database Status</h3>
          </div>
          <button
            onClick={() => refetchStatus()}
            disabled={statusLoading}
            className="p-2 hover:bg-card rounded-lg"
            title="Refresh status"
          >
            <RefreshCw className={cn('h-4 w-4', statusLoading && 'animate-spin')} />
          </button>
        </div>

        {dbStatus ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Engine</div>
              <div className="font-medium text-sm">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-semibold">
                  {DIALECT_LABELS[dbStatus.dialect] || dbStatus.dialect}
                </span>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Status</div>
              <div className="flex items-center gap-1.5">
                <div className={cn('h-2 w-2 rounded-full', dbStatus.is_connected ? 'bg-emerald-500' : 'bg-red-500')} />
                <span className="text-sm font-medium">{dbStatus.is_connected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Tables</div>
              <div className="text-sm font-medium">{dbStatus.table_count}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Size</div>
              <div className="text-sm font-medium">
                {dbStatus.database_size_mb != null ? `${dbStatus.database_size_mb} MB` : 'N/A'}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Loading status...</div>
        )}

        {dbStatus?.version && (
          <div className="mt-3 text-xs text-muted-foreground truncate">
            Version: {dbStatus.version}
          </div>
        )}
      </div>

      {/* Database Statistics */}
      <div className="bg-muted rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Statistics</h3>
          </div>
          <button
            onClick={() => refetchStats()}
            disabled={statsLoading}
            className="p-2 hover:bg-card rounded-lg"
            title="Refresh statistics"
          >
            <RefreshCw className={cn('h-4 w-4', statsLoading && 'animate-spin')} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="bg-card border border-border rounded-lg p-4 text-center"
            >
              <stat.icon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <div className="text-2xl font-bold">
                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
              </div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
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
        <h3 className="font-semibold mb-4">Maintenance</h3>
        <DatabaseMaintenancePanel />
      </div>

      {/* Export Data */}
      <div className="bg-muted rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Export Data</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Download all characteristics, samples, and violations data for backup or analysis.
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => onExport('json')}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg bg-card hover:bg-card/80 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export JSON
          </button>
          <button
            onClick={() => onExport('csv')}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg bg-card hover:bg-card/80 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export Samples CSV
          </button>
        </div>
      </div>
    </div>
  )
}
