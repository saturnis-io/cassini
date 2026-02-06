---
phase: plant-scoped-config
plan: 5
type: execute
wave: 3
depends_on: [4]
files_modified:
  - frontend/src/providers/PlantProvider.tsx
  - frontend/src/components/PlantSelector.tsx
autonomous: true
must_haves:
  truths:
    - "PlantProvider fetches plants from API instead of mock data"
    - "PlantSelector shows loading state while fetching"
    - "Changing plant invalidates all plant-specific cached data"
    - "First plant is auto-selected if none selected"
  artifacts:
    - "PlantProvider.tsx uses usePlants hook"
    - "PlantSelector.tsx handles loading/error states"
  key_links:
    - "PlantProvider calls GET /api/v1/plants"
    - "Plant change triggers query cache invalidation"
---

# Phase plant-scoped-config - Plan 5: PlantProvider API Integration

## Objective
Wire the PlantProvider to fetch plants from the API instead of using mock data, and update PlantSelector to handle loading/error states.

## Tasks

<task type="auto">
  <name>Task 1: Update PlantProvider to Fetch from API</name>
  <files>frontend/src/providers/PlantProvider.tsx</files>
  <action>
    Refactor `frontend/src/providers/PlantProvider.tsx` to use the API:

    1. Remove MOCK_PLANTS constant

    2. Import required hooks:
       ```typescript
       import { usePlants } from '@/api/hooks'
       import { useQueryClient } from '@tanstack/react-query'
       ```

    3. Update Plant interface to match backend (if different):
       ```typescript
       export interface Plant {
         id: number  // Changed from string to number
         name: string
         code: string
         is_active?: boolean
         settings?: Record<string, unknown> | null
       }
       ```

    4. Update PlantProvider component:
       ```typescript
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
       ```

    5. Update PlantContextValue interface:
       ```typescript
       interface PlantContextValue {
         plants: Plant[]
         selectedPlant: Plant | null
         setSelectedPlant: (plant: Plant) => void
         isLoading: boolean
         error: string | null
       }
       ```

    6. Update usePlant hook return type.
  </action>
  <verify>
    ```bash
    # Mock plants removed
    ! grep -q "MOCK_PLANTS" frontend/src/providers/PlantProvider.tsx

    # Uses usePlants hook
    grep -q "usePlants" frontend/src/providers/PlantProvider.tsx

    # Has loading state
    grep -q "isLoading" frontend/src/providers/PlantProvider.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit src/providers/PlantProvider.tsx 2>/dev/null || echo "Check for type errors"
    ```
  </verify>
  <done>
    - Mock data removed
    - Plants fetched from API via usePlants hook
    - Loading and error states exposed
    - Plant change invalidates cached queries
    - Auto-select first plant if none selected
  </done>
</task>

<task type="auto">
  <name>Task 2: Update PlantSelector for Loading States</name>
  <files>frontend/src/components/PlantSelector.tsx</files>
  <action>
    Update `frontend/src/components/PlantSelector.tsx` to handle loading/error states:

    1. Update usePlant usage to include loading/error:
       ```typescript
       export function PlantSelector() {
         const { plants, selectedPlant, setSelectedPlant, isLoading, error } = usePlant()

         // Show loading skeleton
         if (isLoading) {
           return (
             <div className="flex items-center gap-2 px-3 py-2">
               <Skeleton className="h-4 w-4 rounded" />
               <Skeleton className="h-4 w-24" />
             </div>
           )
         }

         // Show error state
         if (error) {
           return (
             <div className="flex items-center gap-2 px-3 py-2 text-destructive">
               <AlertCircle className="h-4 w-4" />
               <span className="text-xs">Failed to load plants</span>
             </div>
           )
         }

         // Show empty state if no plants
         if (plants.length === 0) {
           return (
             <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
               <Building2 className="h-4 w-4" />
               <span className="text-xs">No plants configured</span>
             </div>
           )
         }

         // Existing dropdown implementation...
       }
       ```

    2. Add required imports:
       ```typescript
       import { AlertCircle } from 'lucide-react'
       import { Skeleton } from '@/components/ui/skeleton'
       ```

    3. Ensure dropdown uses plant.id (number) for value matching:
       ```typescript
       <Select
         value={selectedPlant?.id.toString()}
         onValueChange={(value) => {
           const plant = plants.find((p) => p.id.toString() === value)
           if (plant) setSelectedPlant(plant)
         }}
       >
       ```
  </action>
  <verify>
    ```bash
    # Loading state handled
    grep -q "isLoading" frontend/src/components/PlantSelector.tsx

    # Error state handled
    grep -q "error" frontend/src/components/PlantSelector.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit src/components/PlantSelector.tsx 2>/dev/null || echo "Check for type errors"
    ```
  </verify>
  <done>
    - Loading skeleton shown while fetching
    - Error state with message displayed
    - Empty state for no plants
    - Plant ID handled as number
    - Proper dropdown value matching
  </done>
</task>

<task type="auto">
  <name>Task 3: Update uiStore for Number Plant ID</name>
  <files>frontend/src/stores/uiStore.ts</files>
  <action>
    Update `frontend/src/stores/uiStore.ts` to use number for plant ID:

    1. Change selectedPlantId type from string to number | null:
       ```typescript
       interface UIState {
         // ... other fields
         selectedPlantId: number | null
         setSelectedPlantId: (id: number | null) => void
       }
       ```

    2. Update any default value from empty string to null:
       ```typescript
       selectedPlantId: null,
       ```

    3. If persist is used, the stored value will need migration.
       Add a version or handle both string and number in the getter:
       ```typescript
       // In the store, handle legacy string values
       selectedPlantId: null,
       setSelectedPlantId: (id) => set({ selectedPlantId: typeof id === 'string' ? parseInt(id, 10) : id }),
       ```
  </action>
  <verify>
    ```bash
    # Plant ID type is number or null
    grep -q "selectedPlantId.*number" frontend/src/stores/uiStore.ts || grep -q "number | null" frontend/src/stores/uiStore.ts

    # TypeScript compiles
    cd frontend && npx tsc --noEmit src/stores/uiStore.ts 2>/dev/null || echo "Check for type errors"
    ```
  </verify>
  <done>
    - selectedPlantId type changed to number | null
    - Default value is null
    - Legacy string values handled in setter
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] PlantProvider fetches from API
- [ ] Mock data removed
- [ ] Loading and error states handled
- [ ] Plant change invalidates cached data
- [ ] uiStore uses number for plant ID
- [ ] TypeScript compiles without errors
- [ ] Atomic commit created
