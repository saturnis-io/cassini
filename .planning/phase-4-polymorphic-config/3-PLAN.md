---
phase: phase-4-polymorphic-config
plan: 3
type: execute
wave: 2
depends_on: [1, 2]
files_modified:
  - frontend/src/api/client.ts
  - frontend/src/api/hooks.ts
  - frontend/src/components/CharacteristicForm.tsx
autonomous: true
must_haves:
  truths:
    - "User can save schedule config and it persists across sessions"
    - "User can load existing schedule config when editing characteristic"
    - "Config is saved when Save Changes button is clicked"
  artifacts:
    - "API client has getConfig/updateConfig methods"
    - "React Query hooks for config exist"
    - "CharacteristicForm persists config on save"
  key_links:
    - "Frontend hooks call backend API"
    - "CharacteristicForm uses config hooks"
    - "ScheduleConfig type maps to ManualConfig.schedule"
---

# Phase 4 - Plan 3: Frontend Integration

## Objective
Connect frontend ScheduleConfigSection to backend persistence.

## Tasks

<task type="auto">
  <name>Task 1: Add API Client Methods</name>
  <files>frontend/src/api/client.ts</files>
  <action>
    Update client.ts:
    1. Import ScheduleConfig type (or define inline):
       ```typescript
       import type { ScheduleConfig } from '@/components/ScheduleConfigSection'
       ```

    2. Add CharacteristicConfigResponse type:
       ```typescript
       export interface CharacteristicConfigResponse {
         characteristic_id: number
         config: {
           config_type: 'MANUAL' | 'TAG'
           // ManualConfig fields
           instructions?: string
           schedule?: ScheduleConfig
           grace_period_minutes?: number
           // TagConfig fields
           source_tag_path?: string
           trigger?: {
             trigger_type: 'ON_UPDATE' | 'ON_EVENT' | 'ON_VALUE_CHANGE'
             [key: string]: unknown
           }
           batch_tag_path?: string
           min_valid_value?: number
           max_valid_value?: number
         }
         is_active: boolean
       }
       ```

    3. Add to characteristicApi object:
       ```typescript
       getConfig: (id: number) =>
         fetchApi<CharacteristicConfigResponse | null>(`/characteristics/${id}/config`),

       updateConfig: (id: number, config: object) =>
         fetchApi<CharacteristicConfigResponse>(`/characteristics/${id}/config`, {
           method: 'PUT',
           body: JSON.stringify({ config }),
         }),
       ```

    Follow patterns from existing API methods.
  </action>
  <verify>
    ```bash
    cd C:/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit src/api/client.ts 2>&1 | head -20
    ```
  </verify>
  <done>
    - CharacteristicConfigResponse type defined
    - getConfig method added to characteristicApi
    - updateConfig method added to characteristicApi
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Add React Query Hooks</name>
  <files>frontend/src/api/hooks.ts</files>
  <action>
    Update hooks.ts:
    1. Add to queryKeys.characteristics:
       ```typescript
       config: (id: number) => [...queryKeys.characteristics.all, 'config', id] as const,
       ```

    2. Add useCharacteristicConfig hook:
       ```typescript
       export function useCharacteristicConfig(characteristicId: number | null) {
         return useQuery({
           queryKey: queryKeys.characteristics.config(characteristicId ?? 0),
           queryFn: () => characteristicApi.getConfig(characteristicId!),
           enabled: characteristicId !== null,
         })
       }
       ```

    3. Add useUpdateCharacteristicConfig hook:
       ```typescript
       export function useUpdateCharacteristicConfig() {
         const queryClient = useQueryClient()

         return useMutation({
           mutationFn: ({ id, config }: { id: number; config: object }) =>
             characteristicApi.updateConfig(id, config),
           onSuccess: (_, variables) => {
             queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.config(variables.id) })
             toast.success('Configuration saved')
           },
           onError: (error: Error) => {
             toast.error(`Failed to save config: ${error.message}`)
           },
         })
       }
       ```

    Follow patterns from existing hooks.
  </action>
  <verify>
    ```bash
    cd C:/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit src/api/hooks.ts 2>&1 | head -20
    ```
  </verify>
  <done>
    - Query key for config added
    - useCharacteristicConfig hook created
    - useUpdateCharacteristicConfig hook created
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 3: Update CharacteristicForm</name>
  <files>frontend/src/components/CharacteristicForm.tsx</files>
  <action>
    Update CharacteristicForm to persist config:
    1. Import new hooks:
       ```typescript
       import { useCharacteristicConfig, useUpdateCharacteristicConfig } from '@/api/hooks'
       ```

    2. Add hooks at component top:
       ```typescript
       const { data: configData } = useCharacteristicConfig(characteristicId)
       const updateConfig = useUpdateCharacteristicConfig()
       ```

    3. Add useEffect to load config:
       ```typescript
       useEffect(() => {
         if (configData?.config?.schedule) {
           setScheduleConfig(configData.config.schedule)
         }
       }, [configData])
       ```

    4. Update handleSave to save config for MANUAL characteristics:
       After existing updateCharacteristic.mutateAsync, add:
       ```typescript
       // Save schedule config for MANUAL characteristics
       if (characteristic.provider_type === 'MANUAL' && characteristicId) {
         await updateConfig.mutateAsync({
           id: characteristicId,
           config: {
             config_type: 'MANUAL',
             instructions: '',
             schedule: {
               schedule_type: scheduleConfig.type,
               ...(scheduleConfig.type === 'INTERVAL' && {
                 interval_minutes: scheduleConfig.interval_minutes,
                 align_to_hour: scheduleConfig.align_to_hour,
               }),
               ...(scheduleConfig.type === 'SHIFT' && {
                 shift_count: scheduleConfig.shift_count,
                 shift_times: scheduleConfig.shift_times,
                 samples_per_shift: scheduleConfig.samples_per_shift,
               }),
               ...(scheduleConfig.type === 'CRON' && {
                 cron_expression: scheduleConfig.cron_expression,
               }),
               ...(scheduleConfig.type === 'BATCH_START' && {
                 batch_tag_path: scheduleConfig.batch_tag,
                 delay_minutes: scheduleConfig.delay_minutes,
               }),
             },
             grace_period_minutes: 30,
           },
         })
       }
       ```

    5. Remove "Preview" badge from Schedule Configuration section.
  </action>
  <verify>
    ```bash
    cd C:/Users/djbra/Projects/SPC-client/frontend && npx tsc --noEmit src/components/CharacteristicForm.tsx 2>&1 | head -20
    ```
  </verify>
  <done>
    - Hooks imported and used
    - Config loaded from backend on mount
    - Config saved on handleSave for MANUAL characteristics
    - Preview badge removed
    - TypeScript compiles without errors
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] Atomic commit created
- [ ] SUMMARY.md updated
