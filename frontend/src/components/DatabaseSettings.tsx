import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, Download, Trash2, RefreshCw, HardDrive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Sample } from '@/types'

interface DatabaseStats {
  characteristics_count: number
  samples_count: number
  violations_count: number
  hierarchy_nodes_count: number
  api_keys_count: number
}

// Fetch database stats from various endpoints
async function fetchDatabaseStats(): Promise<DatabaseStats> {
  const [chars, samples, violations] = await Promise.all([
    fetch('/api/v1/characteristics/').then((r) => r.json()),
    fetch('/api/v1/samples?per_page=1').then((r) => r.json()),
    fetch('/api/v1/violations?per_page=1').then((r) => r.json()),
  ])

  return {
    characteristics_count: chars.total || 0,
    samples_count: samples.total || 0,
    violations_count: violations.total || 0,
    hierarchy_nodes_count: 0, // Would need endpoint
    api_keys_count: 0, // Would need endpoint
  }
}

export function DatabaseSettings() {
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [clearTarget, setClearTarget] = useState<'samples' | 'all' | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const { data: stats, isLoading, refetch } = useQuery({
    queryKey: ['database-stats'],
    queryFn: fetchDatabaseStats,
    refetchInterval: 30000,
  })

  const handleExport = async (format: 'json' | 'csv') => {
    setIsExporting(true)
    try {
      // Fetch all data
      const [chars, samples, violations] = await Promise.all([
        fetch('/api/v1/characteristics/?limit=10000').then((r) => r.json()),
        fetch('/api/v1/samples?per_page=10000').then((r) => r.json()),
        fetch('/api/v1/violations?per_page=10000').then((r) => r.json()),
      ])

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
        const headers = ['id', 'characteristic_id', 'timestamp', 'mean', 'range', 'excluded']
        const rows = (samples.items || []).map((s: Sample) =>
          [s.id, s.characteristic_id, s.timestamp, s.mean, s.range, s.excluded].join(',')
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

  const statCards = [
    { label: 'Characteristics', value: stats?.characteristics_count ?? '-', icon: Database },
    { label: 'Samples', value: stats?.samples_count ?? '-', icon: HardDrive },
    { label: 'Violations', value: stats?.violations_count ?? '-', icon: Database },
  ]

  return (
    <div className="space-y-6">
      {/* Database Statistics */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Database Statistics</h3>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="p-2 hover:bg-muted rounded-lg"
            title="Refresh statistics"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="bg-muted/50 rounded-lg p-4 text-center"
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

      {/* Export Data */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Export Data</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Download all characteristics, samples, and violations data for backup or analysis.
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => handleExport('json')}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export JSON
          </button>
          <button
            onClick={() => handleExport('csv')}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg hover:bg-muted disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Export Samples CSV
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-card border border-destructive/50 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Trash2 className="h-5 w-5 text-destructive" />
          <h3 className="font-semibold text-destructive">Danger Zone</h3>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          These actions are irreversible. Please be certain before proceeding.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <div className="font-medium">Clear Sample Data</div>
              <div className="text-sm text-muted-foreground">
                Delete all samples and violations while keeping characteristics
              </div>
            </div>
            <button
              onClick={() => {
                setClearTarget('samples')
                setShowClearDialog(true)
              }}
              className="px-4 py-2 text-sm font-medium text-destructive border border-destructive/50 rounded-lg hover:bg-destructive/10"
            >
              Clear Samples
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div>
              <div className="font-medium">Reset Database</div>
              <div className="text-sm text-muted-foreground">
                Delete all data including hierarchy, characteristics, and samples
              </div>
            </div>
            <button
              onClick={() => {
                setClearTarget('all')
                setShowClearDialog(true)
              }}
              className="px-4 py-2 text-sm font-medium text-destructive border border-destructive/50 rounded-lg hover:bg-destructive/10"
            >
              Reset All
            </button>
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
                className={cn(
                  'px-5 py-2.5 text-sm font-medium rounded-xl',
                  'bg-destructive text-destructive-foreground'
                )}
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
