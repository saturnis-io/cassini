import { useState } from 'react'
import {
  Database,
  Cloud,
  Server,
  Webhook,
  RefreshCw,
  TestTube,
  Trash2,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { hasAccess } from '@/lib/roles'
import {
  useTestERPConnection,
  useTriggerERPSync,
  useDeleteERPConnector,
} from '@/api/hooks'
import type { ERPConnector } from '@/api/erp.api'
import { FieldMappingEditor } from './FieldMappingEditor'
import { SyncScheduleConfig } from './SyncScheduleConfig'
import { SyncLogViewer } from './SyncLogViewer'
import { WebhookConfig } from './WebhookConfig'

const TYPE_ICONS: Record<string, typeof Database> = {
  sap_odata: Database,
  oracle_rest: Cloud,
  generic_lims: Server,
  generic_webhook: Webhook,
}

const TYPE_LABELS: Record<string, string> = {
  sap_odata: 'SAP OData',
  oracle_rest: 'Oracle REST',
  generic_lims: 'Generic LIMS',
  generic_webhook: 'Webhook',
}

const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-green-500',
  disconnected: 'bg-gray-400',
  error: 'bg-red-500',
}

type DetailPanel = 'mappings' | 'schedule' | 'logs' | 'webhook' | null

/**
 * ConnectorCard - Card showing connector status and quick actions.
 * Expandable to show mappings, schedule, logs, and webhook config.
 */
export function ConnectorCard({ connector }: { connector: ERPConnector }) {
  const { role } = useAuth()
  const isAdmin = hasAccess(role, 'admin')
  const testMutation = useTestERPConnection()
  const syncMutation = useTriggerERPSync()
  const deleteMutation = useDeleteERPConnector()
  const [activePanel, setActivePanel] = useState<DetailPanel>(null)
  const Icon = TYPE_ICONS[connector.connector_type] || Database

  const togglePanel = (panel: DetailPanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel))
  }

  return (
    <div className="border-border bg-card col-span-1 rounded-lg border p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-lg p-2">
            <Icon className="text-primary h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">{connector.name}</h3>
            <p className="text-muted-foreground text-xs">
              {TYPE_LABELS[connector.connector_type] || connector.connector_type}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              STATUS_COLORS[connector.status] || 'bg-gray-400',
            )}
          />
          <span className="text-muted-foreground text-xs capitalize">{connector.status}</span>
        </div>
      </div>

      {/* URL */}
      <div className="text-muted-foreground truncate text-xs">{connector.base_url}</div>

      {/* Metadata */}
      {connector.last_sync_at && (
        <div className="text-muted-foreground text-xs">
          Last sync: {new Date(connector.last_sync_at).toLocaleString()}
        </div>
      )}
      {connector.last_error && (
        <div
          className="text-destructive truncate text-xs"
          title={connector.last_error}
        >
          Error: {connector.last_error}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={() => testMutation.mutate(connector.id)}
          disabled={testMutation.isPending}
          className="text-muted-foreground hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-xs"
        >
          <TestTube className="h-3 w-3" /> Test
        </button>
        <button
          onClick={() => syncMutation.mutate({ id: connector.id })}
          disabled={syncMutation.isPending}
          className="text-muted-foreground hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-xs"
        >
          <RefreshCw
            className={cn('h-3 w-3', syncMutation.isPending && 'animate-spin')}
          />{' '}
          Sync
        </button>
        <button
          onClick={() => togglePanel('mappings')}
          className={cn(
            'text-muted-foreground hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-xs',
            activePanel === 'mappings' && 'bg-accent',
          )}
        >
          <Settings className="h-3 w-3" /> Mappings
        </button>
        <button
          onClick={() => togglePanel('schedule')}
          className={cn(
            'text-muted-foreground hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-xs',
            activePanel === 'schedule' && 'bg-accent',
          )}
        >
          Schedule
        </button>
        <button
          onClick={() => togglePanel('logs')}
          className={cn(
            'text-muted-foreground hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-xs',
            activePanel === 'logs' && 'bg-accent',
          )}
        >
          Logs
        </button>
        {connector.connector_type === 'generic_webhook' && (
          <button
            onClick={() => togglePanel('webhook')}
            className={cn(
              'text-muted-foreground hover:bg-accent flex items-center gap-1 rounded px-2 py-1 text-xs',
              activePanel === 'webhook' && 'bg-accent',
            )}
          >
            Webhook
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => {
              if (confirm(`Delete "${connector.name}"?`))
                deleteMutation.mutate(connector.id)
            }}
            disabled={deleteMutation.isPending}
            className="text-destructive hover:bg-destructive/10 ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Detail panels */}
      {activePanel === 'mappings' && (
        <div className="border-border border-t pt-3">
          <FieldMappingEditor connectorId={connector.id} />
        </div>
      )}
      {activePanel === 'schedule' && (
        <div className="border-border border-t pt-3">
          <SyncScheduleConfig connectorId={connector.id} />
        </div>
      )}
      {activePanel === 'logs' && (
        <div className="border-border border-t pt-3">
          <SyncLogViewer connectorId={connector.id} />
        </div>
      )}
      {activePanel === 'webhook' && (
        <div className="border-border border-t pt-3">
          <WebhookConfig connector={connector} />
        </div>
      )}
    </div>
  )
}
