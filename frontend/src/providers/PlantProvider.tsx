import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useUIStore } from '@/stores/uiStore'
import { usePlants } from '@/api/hooks'
import type { Plant } from '@/types'

// Re-export Plant type for convenience
export type { Plant }

/**
 * Context value for plant selection
 */
interface PlantContextValue {
  plants: Plant[]
  selectedPlant: Plant | null
  setSelectedPlant: (plant: Plant) => void
  isLoading: boolean
  error: string | null
}

const PlantContext = createContext<PlantContextValue | null>(null)

interface PlantProviderProps {
  children: ReactNode
}

/**
 * Provider for plant/site context
 *
 * Manages the currently selected plant and syncs with uiStore for persistence.
 * Fetches plants from the API and invalidates queries when plant changes.
 * Wrap your app with this provider to enable plant selection throughout.
 *
 * @example
 * <PlantProvider>
 *   <App />
 * </PlantProvider>
 */
export function PlantProvider({ children }: PlantProviderProps) {
  const { selectedPlantId, setSelectedPlantId } = useUIStore()
  const queryClient = useQueryClient()

  // Fetch plants from API
  const { data: plants = [], isLoading, error } = usePlants(true) // active only

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

  // Invalidate queries when plant changes
  const setSelectedPlant = (plant: Plant) => {
    setSelectedPlantId(plant.id)
    // Invalidate all plant-specific data
    queryClient.invalidateQueries({ queryKey: ['hierarchy'] })
    queryClient.invalidateQueries({ queryKey: ['characteristics'] })
    queryClient.invalidateQueries({ queryKey: ['samples'] })
    queryClient.invalidateQueries({ queryKey: ['violations'] })
  }

  return (
    <PlantContext.Provider value={{
      plants,
      selectedPlant,
      setSelectedPlant,
      isLoading,
      error: error?.message ?? null,
    }}>
      {children}
    </PlantContext.Provider>
  )
}

/**
 * Hook to access plant context
 *
 * @returns PlantContextValue with plants list, selection controls, and loading state
 * @throws Error if used outside PlantProvider
 *
 * @example
 * const { selectedPlant, setSelectedPlant, isLoading, error } = usePlantContext()
 */
export function usePlantContext() {
  const context = useContext(PlantContext)
  if (!context) {
    throw new Error('usePlantContext must be used within a PlantProvider')
  }
  return context
}

// Keep the old name for backward compatibility
export const usePlant = usePlantContext
