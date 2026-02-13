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
      <div className="bg-card border-border space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Database Backup</div>
            <div className="text-muted-foreground text-xs">
              SQLite: creates a file copy. Others: shows CLI command.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBackupDir(!showBackupDir)}
              className={cn(
                'border-border hover:bg-muted rounded-md border p-1.5 transition-colors',
                showBackupDir && 'bg-muted border-primary/50',
              )}
              title="Custom backup directory"
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleBackup}
              disabled={backupMutation.isPending}
              className="border-border hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
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
            <label className="text-muted-foreground mb-1 block text-xs font-medium">
              Backup Directory (leave empty for default)
            </label>
            <input
              type="text"
              value={backupDir}
              onChange={(e) => setBackupDir(e.target.value)}
              placeholder="e.g. /mnt/backups or \\\\server\\share\\backups"
              className="bg-background border-border focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-1.5 text-sm focus:ring-2"
            />
          </div>
        )}

        {/* Backup result */}
        {lastBackup && (
          <div className="border-success/20 bg-success/10 space-y-1.5 rounded-xl border p-3">
            <div className="text-success text-sm font-medium">{lastBackup.message}</div>
            {lastBackup.path && (
              <div className="flex items-center gap-2">
                <code className="text-muted-foreground bg-background/50 flex-1 truncate rounded px-2 py-1 text-xs">
                  {lastBackup.path}
                </code>
                <button
                  onClick={() => copyPath(lastBackup.path!)}
                  className="hover:bg-muted shrink-0 rounded p-1"
                  title="Copy path"
                >
                  {copiedPath ? (
                    <CheckCircle2 className="text-success h-3.5 w-3.5" />
                  ) : (
                    <Copy className="text-muted-foreground h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}
            {lastBackup.size_mb != null && (
              <div className="text-muted-foreground text-xs">Size: {lastBackup.size_mb} MB</div>
            )}
            {lastBackup.command && (
              <div className="mt-2">
                <div className="text-muted-foreground mb-1 text-xs">CLI command:</div>
                <code className="bg-background/50 block rounded px-2 py-1 text-xs">
                  {lastBackup.command}
                </code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Vacuum/Optimize */}
      <div className="bg-card border-border flex items-center justify-between rounded-xl border p-4">
        <div>
          <div className="text-sm font-medium">Optimize Database</div>
          <div className="text-muted-foreground text-xs">
            Reclaims space and updates statistics (VACUUM/ANALYZE).
          </div>
        </div>
        {!showVacuumConfirm ? (
          <button
            onClick={() => setShowVacuumConfirm(true)}
            disabled={vacuumMutation.isPending}
            className="border-border hover:bg-muted flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
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
              className="border-border hover:bg-muted rounded-lg border px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                vacuumMutation.mutate()
                setShowVacuumConfirm(false)
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-1.5 text-sm font-medium"
            >
              Confirm
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
