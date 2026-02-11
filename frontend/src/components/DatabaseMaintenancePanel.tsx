import { useState } from 'react'
import { Loader2, HardDrive, Archive, FolderOpen, Copy, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDatabaseBackup, useDatabaseVacuum } from '@/api/hooks'

interface BackupResult {
  message: string
  path?: string
  directory?: string
  size_mb?: number
  command?: string
}

export function DatabaseMaintenancePanel() {
  const backupMutation = useDatabaseBackup()
  const vacuumMutation = useDatabaseVacuum()
  const [showVacuumConfirm, setShowVacuumConfirm] = useState(false)
  const [backupDir, setBackupDir] = useState('')
  const [showBackupDir, setShowBackupDir] = useState(false)
  const [lastBackup, setLastBackup] = useState<BackupResult | null>(null)
  const [copiedPath, setCopiedPath] = useState(false)

  const handleBackup = () => {
    setLastBackup(null)
    const params = backupDir.trim() ? { backup_dir: backupDir.trim() } : undefined
    backupMutation.mutate(params, {
      onSuccess: (data) => {
        setLastBackup(data as BackupResult)
      },
    })
  }

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path)
    setCopiedPath(true)
    setTimeout(() => setCopiedPath(false), 2000)
  }

  return (
    <div className="space-y-3">
      {/* Backup */}
      <div className="p-4 bg-card border border-border rounded-xl space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Database Backup</div>
            <div className="text-xs text-muted-foreground">
              SQLite: creates a file copy. Others: shows CLI command.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBackupDir(!showBackupDir)}
              className={cn(
                'p-1.5 rounded-md border border-border hover:bg-muted transition-colors',
                showBackupDir && 'bg-muted border-primary/50',
              )}
              title="Custom backup directory"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleBackup}
              disabled={backupMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-50"
            >
              {backupMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Archive className="h-3.5 w-3.5" />
              )}
              Backup
            </button>
          </div>
        </div>

        {/* Optional backup directory input */}
        {showBackupDir && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Backup Directory (leave empty for default)
            </label>
            <input
              type="text"
              value={backupDir}
              onChange={(e) => setBackupDir(e.target.value)}
              placeholder="e.g. /mnt/backups or \\\\server\\share\\backups"
              className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        )}

        {/* Backup result */}
        {lastBackup && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 space-y-1.5">
            <div className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              {lastBackup.message}
            </div>
            {lastBackup.path && (
              <div className="flex items-center gap-2">
                <code className="text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded flex-1 truncate">
                  {lastBackup.path}
                </code>
                <button
                  onClick={() => copyPath(lastBackup.path!)}
                  className="p-1 hover:bg-muted rounded shrink-0"
                  title="Copy path"
                >
                  {copiedPath ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
            )}
            {lastBackup.size_mb != null && (
              <div className="text-xs text-muted-foreground">
                Size: {lastBackup.size_mb} MB
              </div>
            )}
            {lastBackup.command && (
              <div className="mt-2">
                <div className="text-xs text-muted-foreground mb-1">CLI command:</div>
                <code className="text-xs bg-background/50 px-2 py-1 rounded block">
                  {lastBackup.command}
                </code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vacuum/Optimize */}
      <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
        <div>
          <div className="text-sm font-medium">Optimize Database</div>
          <div className="text-xs text-muted-foreground">
            Reclaims space and updates statistics (VACUUM/ANALYZE).
          </div>
        </div>
        {!showVacuumConfirm ? (
          <button
            onClick={() => setShowVacuumConfirm(true)}
            disabled={vacuumMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium border border-border rounded-lg hover:bg-muted disabled:opacity-50"
          >
            {vacuumMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <HardDrive className="h-3.5 w-3.5" />
            )}
            Optimize
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVacuumConfirm(false)}
              className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                vacuumMutation.mutate()
                setShowVacuumConfirm(false)
              }}
              className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
