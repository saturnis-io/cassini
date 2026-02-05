---
phase: 2-high-priority
plan: 2
type: execute
wave: 2
depends_on: [1]
files_modified:
  - frontend/src/components/NelsonRulesConfigPanel.tsx
  - frontend/src/components/CharacteristicForm.tsx
  - frontend/src/api/hooks.ts
  - frontend/src/api/client.ts
autonomous: true
must_haves:
  truths:
    - "User can toggle each of 8 Nelson rules on/off for a characteristic"
    - "User sees help tooltip for each rule explaining what it detects"
    - "Changes are saved to backend when user clicks Save"
    - "Current rule states are loaded when editing a characteristic"
  artifacts:
    - "frontend/src/components/NelsonRulesConfigPanel.tsx exists"
    - "CharacteristicForm.tsx includes Nelson Rules section"
    - "API hooks for fetching/updating rules exist"
  key_links:
    - "NelsonRulesConfigPanel uses HelpTooltip component from Plan 1"
    - "Panel calls GET/PUT /{char_id}/rules endpoints"
    - "Integrates into CharacteristicForm.tsx as new section"
---

# Phase 2 High Priority - Plan 2: Nelson Rules Configuration UI

## Objective

Create a UI panel for configuring Nelson rules per characteristic with toggle switches and help tooltips.

## Tasks

<task type="auto">
  <name>Task 1: Add API hooks for Nelson rules</name>
  <files>frontend/src/api/hooks.ts, frontend/src/api/client.ts</files>
  <action>
    Add hooks and API client methods for Nelson rules:

    1. In `client.ts`, add to `characteristicApi`:
       ```typescript
       getNelsonRules: async (id: number) => {
         const response = await api.get(`/characteristics/${id}/rules`)
         return response.data as NelsonRuleConfig[]
       },
       updateNelsonRules: async (id: number, rules: NelsonRuleConfig[]) => {
         const response = await api.put(`/characteristics/${id}/rules`, rules)
         return response.data as NelsonRuleConfig[]
       },
       ```

    2. In `types/index.ts`, add:
       ```typescript
       export interface NelsonRuleConfig {
         rule_id: number
         is_enabled: boolean
       }
       ```

    3. In `hooks.ts`, add query key:
       ```typescript
       rules: (id: number) => [...queryKeys.characteristics.all, 'rules', id] as const,
       ```

    4. In `hooks.ts`, add hooks:
       ```typescript
       export function useNelsonRules(charId: number) {
         return useQuery({
           queryKey: queryKeys.characteristics.rules(charId),
           queryFn: () => characteristicApi.getNelsonRules(charId),
           enabled: charId > 0,
         })
       }

       export function useUpdateNelsonRules() {
         const queryClient = useQueryClient()
         return useMutation({
           mutationFn: ({ id, rules }: { id: number; rules: NelsonRuleConfig[] }) =>
             characteristicApi.updateNelsonRules(id, rules),
           onSuccess: (_, variables) => {
             queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.rules(variables.id) })
           },
         })
       }
       ```

    Constraints:
    - Follow existing hook patterns exactly
    - Use existing API client instance
    - Ensure proper typing
  </action>
  <verify>
    ```powershell
    # Hooks exist
    Select-String -Path "frontend/src/api/hooks.ts" -Pattern "useNelsonRules"
    Select-String -Path "frontend/src/api/hooks.ts" -Pattern "useUpdateNelsonRules"

    # Client methods exist
    Select-String -Path "frontend/src/api/client.ts" -Pattern "getNelsonRules"
    Select-String -Path "frontend/src/api/client.ts" -Pattern "updateNelsonRules"

    # Type exists
    Select-String -Path "frontend/src/types/index.ts" -Pattern "NelsonRuleConfig"
    ```
  </verify>
  <done>
    - API client has getNelsonRules and updateNelsonRules methods
    - useNelsonRules hook fetches rule config
    - useUpdateNelsonRules hook saves rule config
    - NelsonRuleConfig type is exported
  </done>
</task>

<task type="auto">
  <name>Task 2: Create NelsonRulesConfigPanel component</name>
  <files>frontend/src/components/NelsonRulesConfigPanel.tsx</files>
  <action>
    Create the Nelson Rules configuration panel:

    1. Define props:
       ```typescript
       interface NelsonRulesConfigPanelProps {
         characteristicId: number
         onDirty?: () => void  // Called when user makes changes
       }
       ```

    2. Define Nelson rule metadata (constant array):
       ```typescript
       const NELSON_RULES = [
         { id: 1, name: "Rule 1: Beyond 3 Sigma", shortName: "Outlier", severity: "CRITICAL" },
         { id: 2, name: "Rule 2: Zone Bias", shortName: "9 same side", severity: "WARNING" },
         { id: 3, name: "Rule 3: Trend", shortName: "6 trending", severity: "WARNING" },
         { id: 4, name: "Rule 4: Oscillation", shortName: "14 alternating", severity: "WARNING" },
         { id: 5, name: "Rule 5: Zone A Pattern", shortName: "2 of 3 in A", severity: "WARNING" },
         { id: 6, name: "Rule 6: Zone B Pattern", shortName: "4 of 5 in B", severity: "WARNING" },
         { id: 7, name: "Rule 7: Zone C Stability", shortName: "15 in C", severity: "INFO" },
         { id: 8, name: "Rule 8: Mixed Zones", shortName: "8 outside C", severity: "WARNING" },
       ] as const
       ```

    3. Component implementation:
       - Use `useNelsonRules(characteristicId)` to fetch current state
       - Local state for pending changes: `useState<Record<number, boolean>>({})`
       - Initialize local state from fetched rules
       - Track dirty state when user toggles

    4. UI structure:
       ```tsx
       <div className="space-y-3">
         {NELSON_RULES.map(rule => (
           <div key={rule.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
             <div className="flex items-center gap-2">
               <span className="font-medium">{rule.name}</span>
               <HelpTooltip helpKey={`nelson-rule-${rule.id}`} />
               <SeverityBadge severity={rule.severity} />
             </div>
             <ToggleSwitch
               checked={ruleStates[rule.id]}
               onChange={(checked) => handleToggle(rule.id, checked)}
             />
           </div>
         ))}
       </div>
       ```

    5. Create simple ToggleSwitch subcomponent:
       - Use native checkbox with styled appearance
       - Tailwind classes for switch appearance
       - transition-colors for smooth animation

    6. Create SeverityBadge subcomponent:
       - CRITICAL: red badge
       - WARNING: orange badge
       - INFO: blue badge
       - Use existing stat-badge classes from index.css

    7. Export save handler for parent to call:
       ```typescript
       // Use imperative handle or pass callback
       export interface NelsonRulesConfigPanelRef {
         save: () => Promise<void>
         isDirty: boolean
       }
       ```

    Constraints:
    - Import HelpTooltip from '@/components/HelpTooltip'
    - Follow existing component patterns
    - Use Sepasoft brand colors for badges
    - Keep component focused - no save button (parent handles)
  </action>
  <verify>
    ```powershell
    # File exists
    Test-Path "frontend/src/components/NelsonRulesConfigPanel.tsx"

    # Component export
    Select-String -Path "frontend/src/components/NelsonRulesConfigPanel.tsx" -Pattern "export.*NelsonRulesConfigPanel"

    # Uses HelpTooltip
    Select-String -Path "frontend/src/components/NelsonRulesConfigPanel.tsx" -Pattern "HelpTooltip"

    # Uses hooks
    Select-String -Path "frontend/src/components/NelsonRulesConfigPanel.tsx" -Pattern "useNelsonRules"
    ```
  </verify>
  <done>
    - File exists at frontend/src/components/NelsonRulesConfigPanel.tsx
    - Exports NelsonRulesConfigPanel component
    - Renders 8 toggle switches with rule names
    - Each rule has HelpTooltip with appropriate helpKey
    - Severity badges show rule severity
    - Tracks dirty state for unsaved changes
  </done>
</task>

<task type="auto">
  <name>Task 3: Integrate Nelson Rules into CharacteristicForm</name>
  <files>frontend/src/components/CharacteristicForm.tsx</files>
  <action>
    Add Nelson Rules section to CharacteristicForm:

    1. Import NelsonRulesConfigPanel and useRef:
       ```typescript
       import { NelsonRulesConfigPanel, NelsonRulesConfigPanelRef } from './NelsonRulesConfigPanel'
       import { useRef } from 'react'
       ```

    2. Add ref for panel:
       ```typescript
       const nelsonRulesRef = useRef<NelsonRulesConfigPanelRef>(null)
       ```

    3. Add new section after "Subgroup Size Handling" section (around line 356):
       ```tsx
       {/* Nelson Rules Configuration */}
       <div className="space-y-4">
         <div className="flex items-center justify-between">
           <h3 className="font-medium">Nelson Rules</h3>
           <HelpTooltip helpKey="nelson-rules-overview" />
         </div>
         <p className="text-sm text-muted-foreground">
           Enable or disable specific Nelson rules for detecting out-of-control conditions.
         </p>
         <NelsonRulesConfigPanel
           ref={nelsonRulesRef}
           characteristicId={characteristicId!}
           onDirty={() => setIsDirty(true)}
         />
       </div>
       ```

    4. Modify handleSave to also save Nelson rules:
       ```typescript
       const handleSave = async () => {
         if (!characteristicId) return
         // ... existing validation and save logic ...

         // Save Nelson rules if panel has changes
         if (nelsonRulesRef.current?.isDirty) {
           await nelsonRulesRef.current.save()
         }

         setIsDirty(false)
       }
       ```

    5. Add nelson-rules-overview to help-content.ts:
       ```typescript
       "nelson-rules-overview": {
         title: "Nelson Rules",
         description: "Statistical rules for detecting non-random patterns in control charts.",
         details: "Enable rules to automatically detect specific out-of-control conditions. Each rule looks for different patterns that indicate the process may be out of statistical control."
       }
       ```

    Constraints:
    - Place section after Subgroup Size Handling
    - Maintain existing form structure and styling
    - Ensure dirty tracking works correctly
    - Handle save errors gracefully
  </action>
  <verify>
    ```powershell
    # Import exists
    Select-String -Path "frontend/src/components/CharacteristicForm.tsx" -Pattern "NelsonRulesConfigPanel"

    # Section header exists
    Select-String -Path "frontend/src/components/CharacteristicForm.tsx" -Pattern "Nelson Rules"

    # Help content added
    Select-String -Path "frontend/src/lib/help-content.ts" -Pattern "nelson-rules-overview"
    ```
  </verify>
  <done>
    - CharacteristicForm imports NelsonRulesConfigPanel
    - New "Nelson Rules" section appears in form
    - Section includes help tooltip
    - Panel receives characteristicId prop
    - Save button saves both form data and rule config
    - Help content includes nelson-rules-overview
  </done>
</task>

## Completion Criteria

Plan is complete when:
- [ ] All tasks marked done
- [ ] All verify commands pass
- [ ] TypeScript compiles without errors
- [ ] Nelson Rules section visible in CharacteristicForm
- [ ] Toggles load and save correctly
- [ ] Atomic commit created with message: "feat: add Nelson rules configuration UI with toggles and help tooltips"
- [ ] SUMMARY.md updated
