---
phase: plant-scoped-config
plan: 4
type: execute
wave: 2
depends_on: [2, 3]
files_modified:
  - frontend/src/types/index.ts
  - frontend/src/api/client.ts
  - frontend/src/api/hooks.ts
autonomous: true
must_haves:
  truths:
    - "Plant type matches backend PlantResponse schema"
    - "API client has plantApi for CRUD operations"
    - "hierarchyApi and brokerApi methods accept plantId parameter"
    - "Query hooks include plantId in keys for cache isolation"
  artifacts:
    - "frontend/src/api/client.ts has plantApi object"
    - "frontend/src/api/hooks.ts has usePlants, useCreatePlant, etc."
  key_links:
    - "plantApi.list() calls GET /api/v1/plants"
    - "hierarchyApi.getTree(plantId) calls GET /api/v1/plants/{plantId}/hierarchies"
---

# Phase plant-scoped-config - Plan 4: Frontend API Client Updates

## Objective
Update the frontend API client and hooks to support plant-scoped operations, including plant CRUD and plant-filtered hierarchy/broker calls.

## Tasks

<task type="auto">
  <name>Task 1: Update Plant Type Definition</name>
  <files>frontend/src/types/index.ts</files>
  <action>
    Update or add Plant type in `frontend/src/types/index.ts`:

    1. Find existing Plant interface or add new one:
       ```typescript
       export interface Plant {
         id: number
         name: string
         code: string
         is_active: boolean
         settings: Record<string, unknown> | null
         created_at: string
         updated_at: string
       }
       ```

    2. Add PlantCreate and PlantUpdate types:
       ```typescript
       export interface PlantCreate {
         name: string
         code: string
         is_active?: boolean
         settings?: Record<string, unknown> | null
       }

       export interface PlantUpdate {
         name?: string
         code?: string
         is_active?: boolean
         settings?: Record<string, unknown> | null
       }
       ```

    Note: The frontend PlantProvider uses `id: string` but backend uses `id: number`.
    We need to align these - use number to match backend.
  </action>
  <verify>
    ```bash
    # Plant type exists with required fields
    grep -q "interface Plant" frontend/src/types/index.ts
    grep -q "is_active" frontend/src/types/index.ts
    ```
  </verify>
  <done>
    - Plant interface with id, name, code, is_active, settings, timestamps
    - PlantCreate interface for creation
    - PlantUpdate interface for updates
    - Types match backend schema
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Plant API Client</name>
  <files>frontend/src/api/client.ts</files>
  <action>
    Add plantApi object to `frontend/src/api/client.ts`:

    1. Add import for Plant types (if in types/index.ts, import from there)

    2. Add plantApi object after existing API objects:
       ```typescript
       // Plant API
       export const plantApi = {
         list: (activeOnly?: boolean) => {
           const params = activeOnly ? '?active_only=true' : ''
           return fetchApi<Plant[]>(`/plants/${params}`)
         },

         get: (id: number) => fetchApi<Plant>(`/plants/${id}`),

         create: (data: PlantCreate) =>
           fetchApi<Plant>('/plants/', {
             method: 'POST',
             body: JSON.stringify(data),
           }),

         update: (id: number, data: PlantUpdate) =>
           fetchApi<Plant>(`/plants/${id}`, {
             method: 'PUT',
             body: JSON.stringify(data),
           }),

         delete: (id: number) =>
           fetchApi<void>(`/plants/${id}`, { method: 'DELETE' }),
       }
       ```

    3. Update hierarchyApi to support plant-scoped calls:
       ```typescript
       export const hierarchyApi = {
         // Existing global endpoints (backward compat)
         getTree: () => fetchApi<HierarchyNode[]>('/hierarchy/'),

         // Plant-scoped endpoints
         getTreeByPlant: (plantId: number) =>
           fetchApi<HierarchyNode[]>(`/plants/${plantId}/hierarchies/`),

         createNodeInPlant: (plantId: number, data: { name: string; type: string; parent_id: number | null }) =>
           fetchApi<HierarchyNode>(`/plants/${plantId}/hierarchies/`, {
             method: 'POST',
             body: JSON.stringify(data),
           }),

         // Keep existing methods for backward compatibility
         getNode: (id: number) => fetchApi<HierarchyNode>(`/hierarchy/${id}`),
         createNode: (data: { name: string; type: string; parent_id: number | null }) =>
           fetchApi<HierarchyNode>('/hierarchy/', {
             method: 'POST',
             body: JSON.stringify(data),
           }),
         // ... rest of existing methods
       }
       ```

    4. Update brokerApi similarly with plant-scoped methods:
       ```typescript
       export const brokerApi = {
         // Existing methods...

         // Add plant-scoped methods
         listByPlant: (plantId: number, activeOnly?: boolean) => {
           const params = activeOnly ? '?active_only=true' : ''
           return fetchApi<PaginatedResponse<MQTTBroker>>(`/plants/${plantId}/brokers/${params}`)
         },

         createInPlant: (plantId: number, data: {...}) =>
           fetchApi<MQTTBroker>(`/plants/${plantId}/brokers/`, {
             method: 'POST',
             body: JSON.stringify(data),
           }),
       }
       ```
  </action>
  <verify>
    ```bash
    # plantApi exists
    grep -q "export const plantApi" frontend/src/api/client.ts

    # Plant-scoped hierarchy method
    grep -q "getTreeByPlant" frontend/src/api/client.ts

    # TypeScript compiles
    cd frontend && npx tsc --noEmit src/api/client.ts 2>/dev/null || echo "Check for type errors"
    ```
  </verify>
  <done>
    - plantApi with list, get, create, update, delete
    - hierarchyApi.getTreeByPlant(plantId) for plant-scoped tree
    - hierarchyApi.createNodeInPlant(plantId, data) for plant-scoped creation
    - brokerApi.listByPlant(plantId) for plant-scoped brokers
    - Backward compatible global endpoints preserved
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Plant Query Hooks</name>
  <files>frontend/src/api/hooks.ts</files>
  <action>
    Add plant-related hooks to `frontend/src/api/hooks.ts`:

    1. Add import for plantApi:
       ```typescript
       import { characteristicApi, hierarchyApi, plantApi, sampleApi, violationApi } from './client'
       ```

    2. Add plant query keys:
       ```typescript
       export const queryKeys = {
         plants: {
           all: ['plants'] as const,
           list: (activeOnly?: boolean) => [...queryKeys.plants.all, 'list', { activeOnly }] as const,
           detail: (id: number) => [...queryKeys.plants.all, 'detail', id] as const,
         },
         hierarchy: {
           // ... existing
           treeByPlant: (plantId: number) => [...queryKeys.hierarchy.all, 'tree', 'plant', plantId] as const,
         },
         // ... rest of existing keys
       }
       ```

    3. Add plant hooks:
       ```typescript
       // Plant hooks
       export function usePlants(activeOnly?: boolean) {
         return useQuery({
           queryKey: queryKeys.plants.list(activeOnly),
           queryFn: () => plantApi.list(activeOnly),
         })
       }

       export function usePlant(id: number) {
         return useQuery({
           queryKey: queryKeys.plants.detail(id),
           queryFn: () => plantApi.get(id),
           enabled: id > 0,
         })
       }

       export function useCreatePlant() {
         const queryClient = useQueryClient()

         return useMutation({
           mutationFn: (data: PlantCreate) => plantApi.create(data),
           onSuccess: (data) => {
             queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
             toast.success(`Created plant "${data.name}"`)
           },
           onError: (error: Error) => {
             toast.error(`Failed to create plant: ${error.message}`)
           },
         })
       }

       export function useUpdatePlant() {
         const queryClient = useQueryClient()

         return useMutation({
           mutationFn: ({ id, data }: { id: number; data: PlantUpdate }) =>
             plantApi.update(id, data),
           onSuccess: (data) => {
             queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
             toast.success(`Updated plant "${data.name}"`)
           },
           onError: (error: Error) => {
             toast.error(`Failed to update plant: ${error.message}`)
           },
         })
       }

       export function useDeletePlant() {
         const queryClient = useQueryClient()

         return useMutation({
           mutationFn: (id: number) => plantApi.delete(id),
           onSuccess: () => {
             queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
             toast.success('Plant deleted')
           },
           onError: (error: Error) => {
             toast.error(`Failed to delete plant: ${error.message}`)
           },
         })
       }
       ```

    4. Add plant-scoped hierarchy hook:
       ```typescript
       export function useHierarchyTreeByPlant(plantId: number) {
         return useQuery({
           queryKey: queryKeys.hierarchy.treeByPlant(plantId),
           queryFn: () => hierarchyApi.getTreeByPlant(plantId),
           enabled: plantId > 0,
         })
       }
       ```
  </action>
  <verify>
    ```bash
    # Plant hooks exist
    grep -q "usePlants" frontend/src/api/hooks.ts
    grep -q "useCreatePlant" frontend/src/api/hooks.ts

    # Plant-scoped hierarchy hook
    grep -q "useHierarchyTreeByPlant" frontend/src/api/hooks.ts

    # TypeScript compiles
    cd frontend && npx tsc --noEmit src/api/hooks.ts 2>/dev/null || echo "Check for type errors"
    ```
  </verify>
  <done>
    - Plant query keys added
    - usePlants(activeOnly?) hook
    - usePlant(id) hook
    - useCreatePlant() mutation hook
    - useUpdatePlant() mutation hook
    - useDeletePlant() mutation hook
    - useHierarchyTreeByPlant(plantId) hook
    - All hooks with proper cache invalidation
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] Plant type matches backend schema
- [ ] plantApi with CRUD operations
- [ ] hierarchyApi with plant-scoped methods
- [ ] Plant query hooks with cache management
- [ ] Plant-scoped hierarchy hook
- [ ] TypeScript compiles without errors
- [ ] Atomic commit created
