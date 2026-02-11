import { RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMigrationStatus } from '@/api/hooks'

export function DatabaseMigrationStatus() {
  const { data: migration, isLoading, refetch } = useMigrationStatus()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Schema Migrations</h4>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="p-1.5 hover:bg-muted rounded-lg"
          title="Refresh migration status"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
        </button>
      </div>

      {migration && (
        <div className="space-y-2">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            {migration.is_up_to_date ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm text-emerald-600 dark:text-emerald-400">Up to date</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  {migration.pending_count} pending migration{migration.pending_count !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>

          {/* Revision Details */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="text-muted-foreground mb-0.5">Current Revision</div>
              <div className="font-mono font-medium">{migration.current_revision || 'None'}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-3">
              <div className="text-muted-foreground mb-0.5">Head Revision</div>
              <div className="font-mono font-medium">{migration.head_revision || 'None'}</div>
            </div>
          </div>

          {/* Instructions if behind */}
          {!migration.is_up_to_date && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Run <code className="bg-amber-500/20 px-1 py-0.5 rounded font-mono">alembic upgrade head</code> to
                apply pending migrations.
              </p>
            </div>
          )}
        </div>
      )}

      {!migration && !isLoading && (
        <p className="text-sm text-muted-foreground">Unable to determine migration status.</p>
      )}
    </div>
  )
}
