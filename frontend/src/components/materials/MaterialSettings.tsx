import { usePlantContext } from '@/providers/PlantProvider'
import { MaterialTreeManager } from '@/components/materials/MaterialTreeManager'

/**
 * Settings page wrapper — provides plantId from context to MaterialTreeManager.
 */
export function MaterialSettings() {
  const { selectedPlant } = usePlantContext()

  if (!selectedPlant) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground text-sm">Select a plant to manage materials.</p>
      </div>
    )
  }

  return <MaterialTreeManager plantId={selectedPlant.id} />
}
