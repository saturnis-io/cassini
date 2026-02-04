---
plan: 2
completed: 2026-02-04T00:00:00Z
commit: pending
tasks_completed: 3
verification: passed
---

# Plan 2 Summary: Nelson Rules Configuration UI

## Tasks Completed
- [x] Task 1: Add API hooks for Nelson rules (useNelsonRules, useUpdateNelsonRules)
- [x] Task 2: Create NelsonRulesConfigPanel component
- [x] Task 3: Integrate Nelson Rules into CharacteristicForm

## Artifacts Created
- `frontend/src/components/NelsonRulesConfigPanel.tsx` - Nelson rules toggle panel
- Modified `frontend/src/api/hooks.ts` - Added useNelsonRules, useUpdateNelsonRules hooks
- Modified `frontend/src/components/CharacteristicForm.tsx` - Added Nelson Rules section

## Implementation Details

### NelsonRulesConfigPanel.tsx
- Displays all 8 Nelson rules with toggle switches
- Each rule shows:
  - Rule name and short description
  - HelpTooltip with detailed explanation
  - Severity badge (CRITICAL/WARNING/INFO)
  - Toggle switch for enable/disable
- Tracks dirty state for unsaved changes
- Exposes ref with `save()` and `isDirty` for parent form

### API Hooks (hooks.ts)
- `useNelsonRules(charId)` - Query hook for fetching rule config
- `useUpdateNelsonRules()` - Mutation hook for saving rule config
- Uses existing `characteristicApi.getRules` and `updateRules` methods

### CharacteristicForm.tsx Changes
- Added imports: useRef, NelsonRulesConfigPanel, HelpTooltip
- Added ref for panel: `nelsonRulesRef`
- Added "Nelson Rules" section after Subgroup Size Handling
- Updated handleSave to save Nelson rules if panel is dirty

## Verification Results
- TypeScript compiles without errors
- NelsonRulesConfigPanel imports HelpTooltip correctly
- CharacteristicForm displays Nelson Rules section

## Commit
`pending` - feat: add Nelson rules configuration UI with toggles and help tooltips
