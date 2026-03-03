import { useState } from 'react'
import { Plus, Loader2, Building2 } from 'lucide-react'
import { useAuth } from '@/providers/AuthProvider'
import { usePlantContext } from '@/providers/PlantProvider'
import { hasAccess } from '@/lib/roles'
import { useERPConnectors } from '@/api/hooks'
import { ConnectorCard } from './ConnectorCard'
import { ConnectorWizard } from './ConnectorWizard'

/**
 * IntegrationsTab - Top-level view for ERP/LIMS connector management.
 * Lists configured connectors, allows creation, test, sync, and deletion.
 */
export function IntegrationsTab() {
  const { role } = useAuth()
  const selectedPlantId = usePlantContext().selectedPlant?.id ?? null
  const plantId = selectedPlantId ?? 0
  const { data: connectors, isLoading } = useERPConnectors(plantId)
  const [showWizard, setShowWizard] = useState(false)
  const isAdmin = hasAccess(role, 'admin')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="text-muted-foreground h-5 w-5" />
          <div>
            <h2 className="text-lg font-semibold">ERP/LIMS Integrations</h2>
            <p className="text-muted-foreground text-sm">
              Connect to enterprise systems for bidirectional data sync
            </p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowWizard(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Connector
          </button>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-12 text-sm">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading connectors...
        </div>
      ) : !connectors || connectors.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed py-16 text-center">
          <Building2 className="text-muted-foreground/50 mx-auto mb-3 h-10 w-10" />
          <p className="text-muted-foreground text-sm">
            No ERP/LIMS connectors configured for this plant.
          </p>
          {isAdmin && (
            <p className="text-muted-foreground mt-1 text-xs">
              Click "Add Connector" to get started.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connectors.map((c) => (
            <ConnectorCard key={c.id} connector={c} />
          ))}
        </div>
      )}

      {/* Creation wizard */}
      {showWizard && plantId > 0 && (
        <ConnectorWizard plantId={plantId} onClose={() => setShowWizard(false)} />
      )}
    </div>
  )
}
