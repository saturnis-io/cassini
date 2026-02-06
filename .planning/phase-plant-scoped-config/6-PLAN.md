---
phase: plant-scoped-config
plan: 6
type: execute
wave: 3
depends_on: [3, 5]
files_modified:
  - frontend/src/components/HierarchyTree.tsx
  - frontend/src/components/MQTTConfigPanel.tsx
  - frontend/src/pages/SettingsPage.tsx
autonomous: true
must_haves:
  truths:
    - "HierarchyTree shows only hierarchies from selected plant"
    - "MQTTConfigPanel shows only brokers from selected plant"
    - "Creating hierarchy uses plant-scoped endpoint"
    - "Creating broker uses plant-scoped endpoint"
  artifacts:
    - "HierarchyTree.tsx uses useHierarchyTreeByPlant hook"
    - "MQTTConfigPanel.tsx uses plant-scoped broker API"
  key_links:
    - "HierarchyTree gets plantId from PlantContext"
    - "Broker list filtered by selectedPlant.id"
---

# Phase plant-scoped-config - Plan 6: Plant-Scoped Component Updates

## Objective
Update HierarchyTree and MQTTConfigPanel components to use plant-scoped API calls, showing only data for the selected plant.

## Tasks

<task type="auto">
  <name>Task 1: Update HierarchyTree for Plant Scoping</name>
  <files>frontend/src/components/HierarchyTree.tsx</files>
  <action>
    Update `frontend/src/components/HierarchyTree.tsx` to use plant-scoped data:

    1. Import usePlant hook:
       ```typescript
       import { usePlant } from '@/providers/PlantProvider'
       ```

    2. Get selected plant from context:
       ```typescript
       const { selectedPlant } = usePlant()
       ```

    3. Replace useHierarchyTree with plant-scoped version:
       ```typescript
       // Instead of:
       const { data: hierarchyTree, isLoading, error } = useHierarchyTree()

       // Use:
       const { data: hierarchyTree, isLoading, error } = useHierarchyTreeByPlant(
         selectedPlant?.id ?? 0
       )
       ```

    4. Update createNode mutation to use plant-scoped endpoint:
       ```typescript
       // If using inline mutation, update to:
       const createNode = useCreateHierarchyNodeInPlant()

       // In the handler:
       createNode.mutate({
         plantId: selectedPlant!.id,
         data: { name, type, parent_id: parentId }
       })
       ```

    5. Handle case when no plant is selected:
       ```typescript
       if (!selectedPlant) {
         return (
           <div className="flex items-center justify-center p-4 text-muted-foreground">
             Select a plant to view hierarchy
           </div>
         )
       }
       ```

    6. Update any hardcoded API calls to use plant-scoped versions.
  </action>
  <verify>
    ```bash
    # Uses plant context
    grep -q "usePlant\|selectedPlant" frontend/src/components/HierarchyTree.tsx

    # Uses plant-scoped hook
    grep -q "useHierarchyTreeByPlant\|selectedPlant" frontend/src/components/HierarchyTree.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit src/components/HierarchyTree.tsx 2>/dev/null || echo "Check for type errors"
    ```
  </verify>
  <done>
    - Gets selectedPlant from context
    - Uses plant-scoped hierarchy tree hook
    - Creates nodes using plant-scoped endpoint
    - Shows message when no plant selected
    - Only displays hierarchies from selected plant
  </done>
</task>

<task type="auto">
  <name>Task 2: Update MQTTConfigPanel for Plant Scoping</name>
  <files>frontend/src/components/MQTTConfigPanel.tsx</files>
  <action>
    Update `frontend/src/components/MQTTConfigPanel.tsx` to use plant-scoped data:

    1. Import usePlant hook:
       ```typescript
       import { usePlant } from '@/providers/PlantProvider'
       ```

    2. Get selected plant:
       ```typescript
       const { selectedPlant } = usePlant()
       ```

    3. Update broker list query to filter by plant:
       ```typescript
       // If using useBrokers hook, update it to accept plantId
       // Or use the plant-scoped API directly:
       const { data: brokersResponse, isLoading } = useQuery({
         queryKey: ['brokers', 'list', selectedPlant?.id],
         queryFn: () => selectedPlant
           ? brokerApi.listByPlant(selectedPlant.id)
           : Promise.resolve({ items: [], total: 0 }),
         enabled: !!selectedPlant,
       })
       ```

    4. Update broker creation to include plant_id:
       ```typescript
       const handleCreate = async (data: BrokerFormData) => {
         if (!selectedPlant) return

         await brokerApi.createInPlant(selectedPlant.id, {
           ...data,
           plant_id: selectedPlant.id,
         })
         // ... success handling
       }
       ```

    5. Handle no plant selected:
       ```typescript
       if (!selectedPlant) {
         return (
           <Alert>
             <AlertDescription>
               Select a plant to configure MQTT brokers
             </AlertDescription>
           </Alert>
         )
       }
       ```
  </action>
  <verify>
    ```bash
    # Uses plant context
    grep -q "usePlant\|selectedPlant" frontend/src/components/MQTTConfigPanel.tsx

    # Plant-scoped queries
    grep -q "selectedPlant" frontend/src/components/MQTTConfigPanel.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit src/components/MQTTConfigPanel.tsx 2>/dev/null || echo "Check for type errors"
    ```
  </verify>
  <done>
    - Gets selectedPlant from context
    - Broker list filtered by plant
    - Broker creation includes plant_id
    - Message shown when no plant selected
    - Only displays brokers from selected plant
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Plant Management to Settings</name>
  <files>frontend/src/pages/SettingsPage.tsx</files>
  <action>
    Add plant management section to `frontend/src/pages/SettingsPage.tsx`:

    1. Create a PlantSettings component (inline or separate file):
       ```typescript
       function PlantSettings() {
         const { data: plants, isLoading } = usePlants()
         const createPlant = useCreatePlant()
         const updatePlant = useUpdatePlant()
         const deletePlant = useDeletePlant()

         const [newPlantName, setNewPlantName] = useState('')
         const [newPlantCode, setNewPlantCode] = useState('')

         const handleCreate = () => {
           if (!newPlantName || !newPlantCode) return
           createPlant.mutate({
             name: newPlantName,
             code: newPlantCode.toUpperCase(),
           })
           setNewPlantName('')
           setNewPlantCode('')
         }

         return (
           <Card>
             <CardHeader>
               <CardTitle>Plants</CardTitle>
               <CardDescription>
                 Manage plant locations for data isolation
               </CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
               {/* Plant list */}
               {plants?.map((plant) => (
                 <div key={plant.id} className="flex items-center justify-between">
                   <div>
                     <p className="font-medium">{plant.name}</p>
                     <p className="text-sm text-muted-foreground">{plant.code}</p>
                   </div>
                   {plant.code !== 'DEFAULT' && (
                     <Button
                       variant="ghost"
                       size="sm"
                       onClick={() => deletePlant.mutate(plant.id)}
                     >
                       <Trash2 className="h-4 w-4" />
                     </Button>
                   )}
                 </div>
               ))}

               {/* Add new plant */}
               <Separator />
               <div className="grid gap-2">
                 <Label>Add New Plant</Label>
                 <div className="flex gap-2">
                   <Input
                     placeholder="Plant Name"
                     value={newPlantName}
                     onChange={(e) => setNewPlantName(e.target.value)}
                   />
                   <Input
                     placeholder="CODE"
                     value={newPlantCode}
                     onChange={(e) => setNewPlantCode(e.target.value.toUpperCase())}
                     maxLength={10}
                     className="w-24"
                   />
                   <Button onClick={handleCreate} disabled={!newPlantName || !newPlantCode}>
                     <Plus className="h-4 w-4" />
                   </Button>
                 </div>
               </div>
             </CardContent>
           </Card>
         )
       }
       ```

    2. Add PlantSettings to the settings page layout, preferably in an admin section.

    3. Import required hooks and components.
  </action>
  <verify>
    ```bash
    # Plant management section exists
    grep -q "Plant" frontend/src/pages/SettingsPage.tsx

    # Uses plant hooks
    grep -q "usePlants\|useCreatePlant" frontend/src/pages/SettingsPage.tsx

    # TypeScript compiles
    cd frontend && npx tsc --noEmit src/pages/SettingsPage.tsx 2>/dev/null || echo "Check for type errors"
    ```
  </verify>
  <done>
    - Plant list displayed in settings
    - Can create new plants
    - Can delete non-default plants
    - Default plant protected from deletion
    - Admin section for plant management
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] HierarchyTree uses plant-scoped data
- [ ] MQTTConfigPanel uses plant-scoped data
- [ ] Plant management in Settings page
- [ ] Can create and delete plants
- [ ] Default plant cannot be deleted
- [ ] TypeScript compiles without errors
- [ ] Atomic commit created
