import { useState } from 'react'
import { Plus, Usb } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'
import { useGageBridges, useDeleteGageBridge } from '@/api/hooks'
import { GageBridgeList } from './GageBridgeList'
import { GageBridgeRegisterDialog } from './GageBridgeRegisterDialog'
import { GagePortConfig } from './GagePortConfig'

/**
 * Gages tab — top-level view for RS-232/USB gage bridge management.
 * Lists registered bridges, allows registration, and manages port configurations.
 */
export function GagesTab() {
  const selectedPlantId = useUIStore((s) => s.selectedPlantId)
  const { data: bridges, isLoading } = useGageBridges(selectedPlantId ?? 0)
  const deleteBridge = useDeleteGageBridge()

  const [selectedBridgeId, setSelectedBridgeId] = useState<number | null>(null)
  const [registerOpen, setRegisterOpen] = useState(false)

  const bridgeList = bridges ?? []

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Usb className="text-muted-foreground h-5 w-5" />
          <div>
            <h2 className="text-lg font-semibold">Gage Bridges</h2>
            <p className="text-muted-foreground text-sm">
              {bridgeList.length} bridge{bridgeList.length !== 1 ? 's' : ''} registered
            </p>
          </div>
        </div>
        <button
          onClick={() => setRegisterOpen(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          Register Bridge
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="text-muted-foreground py-12 text-center text-sm">
          Loading bridges...
        </div>
      ) : bridgeList.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed py-16 text-center">
          <Usb className="text-muted-foreground/50 mx-auto mb-3 h-10 w-10" />
          <p className="text-muted-foreground text-sm">
            No gage bridges registered for this plant
          </p>
          <p className="text-muted-foreground mt-1 mb-4 text-xs">
            Register a bridge to connect RS-232/USB gages and stream measurement data
          </p>
          <button
            onClick={() => setRegisterOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            Register Bridge
          </button>
        </div>
      ) : (
        <>
          <GageBridgeList
            bridges={bridgeList}
            selectedBridgeId={selectedBridgeId}
            onSelect={setSelectedBridgeId}
            onDelete={(id) => {
              deleteBridge.mutate(id)
              if (selectedBridgeId === id) setSelectedBridgeId(null)
            }}
          />

          {selectedBridgeId && <GagePortConfig bridgeId={selectedBridgeId} />}
        </>
      )}

      {/* Register dialog */}
      {selectedPlantId && (
        <GageBridgeRegisterDialog
          open={registerOpen}
          onClose={() => setRegisterOpen(false)}
          plantId={selectedPlantId}
        />
      )}
    </div>
  )
}
