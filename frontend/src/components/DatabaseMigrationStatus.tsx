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
          className="hover:bg-muted rounded-lg p-1.5"
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
                <CheckCircle2 className="text-success h-4 w-4" />
                <span className="text-success text-sm">Up to date</span>
              </>
            ) : (
              <>
                <AlertTriangle className="text-warning h-4 w-4" />
                <span className="text-warning text-sm">
                  {migration.pending_count} pending migration
                  {migration.pending_count !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>

          {/* Revision Details */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-card border-border rounded-xl border p-3">
              <div className="text-muted-foreground mb-0.5">Current Revision</div>
              <div className="font-mono font-medium">{migration.current_revision || 'None'}</div>
            </div>
            <div className="bg-card border-border rounded-xl border p-3">
              <div className="text-muted-foreground mb-0.5">Head Revision</div>
              <div className="font-mono font-medium">{migration.head_revision || 'None'}</div>
            </div>
          </div>

          {/* Instructions if behind */}
          {!migration.is_up_to_date && (
            <div className="border-warning/20 bg-warning/10 rounded-xl border p-3">
              <p className="text-warning text-xs">
                Run{' '}
                <code className="bg-warning/20 rounded px-1 py-0.5 font-mono">
                  alembic upgrade head
                </code>{' '}
                to apply pending migrations.
              </p>
            </div>
          )}
        </div>
      )}

      {!migration && !isLoading && (
        <p className="text-muted-foreground text-sm">Unable to determine migration status.</p>
      )}
    </div>
  )
}
