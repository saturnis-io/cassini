import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useUIStore } from '@/stores/uiStore'

/**
 * Plant/Site definition for multi-tenant operation
 */
export interface Plant {
  id: string
  name: string
  code: string
}

/**
 * Context value for plant selection
 */
interface PlantContextValue {
  plants: Plant[]
  selectedPlant: Plant | null
  setSelectedPlant: (plant: Plant) => void
}

const PlantContext = createContext<PlantContextValue | null>(null)

/**
 * Mock plant list for development
 * In production, this would be fetched from the API
 */
const MOCK_PLANTS: Plant[] = [
  { id: 'demo', name: 'Demo Plant', code: 'DEMO' },
  { id: 'plant-a', name: 'Plant A', code: 'PLA' },
  { id: 'plant-b', name: 'Plant B', code: 'PLB' },
]

interface PlantProviderProps {
  children: ReactNode
}

/**
 * Provider for plant/site context
 *
 * Manages the currently selected plant and syncs with uiStore for persistence.
 * Wrap your app with this provider to enable plant selection throughout.
 *
 * @example
 * <PlantProvider>
 *   <App />
 * </PlantProvider>
 */
export function PlantProvider({ children }: PlantProviderProps) {
  const { selectedPlantId, setSelectedPlantId } = useUIStore()
  const [plants] = useState<Plant[]>(MOCK_PLANTS)

  // Derive selected plant from store's selectedPlantId
  const selectedPlant = selectedPlantId
    ? plants.find((p) => p.id === selectedPlantId) ?? null
    : null

  // Initialize with first plant if none selected
  useEffect(() => {
    if (!selectedPlantId && plants.length > 0) {
      setSelectedPlantId(plants[0].id)
    }
  }, [selectedPlantId, plants, setSelectedPlantId])

  const setSelectedPlant = (plant: Plant) => {
    setSelectedPlantId(plant.id)
  }

  return (
    <PlantContext.Provider value={{ plants, selectedPlant, setSelectedPlant }}>
      {children}
    </PlantContext.Provider>
  )
}

/**
 * Hook to access plant context
 *
 * @returns PlantContextValue with plants list and selection controls
 * @throws Error if used outside PlantProvider
 *
 * @example
 * const { selectedPlant, setSelectedPlant } = usePlant()
 */
export function usePlant() {
  const context = useContext(PlantContext)
  if (!context) {
    throw new Error('usePlant must be used within a PlantProvider')
  }
  return context
}
