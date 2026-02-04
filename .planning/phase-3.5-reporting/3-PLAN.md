# Plan 3: Nelson Rules Config Panel Update

## Objective
Add "Require Acknowledgement" checkbox to the NelsonRulesConfigPanel UI.

---

## Task 1: Update NelsonRulesConfigPanel Component

### Changes
1. Track `require_acknowledgement` state per rule
2. Add checkbox toggle next to enable toggle
3. Update save logic to include new field

### Files
- `frontend/src/components/NelsonRulesConfigPanel.tsx`

### Implementation

**State management:**
```typescript
// Track both enabled and require_ack per rule
const [ruleConfigs, setRuleConfigs] = useState<Map<number, { enabled: boolean; requireAck: boolean }>>(new Map())
```

**UI layout per rule row:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Rule 1: Beyond 3 Sigma  [?]  CRITICAL    [✓ Require Ack]  [ON] │
└─────────────────────────────────────────────────────────────────┘
```

- Left: Rule name + help tooltip + severity badge
- Middle: "Require Ack" checkbox (only visible when rule enabled)
- Right: Enable/disable toggle

**Checkbox component:**
```tsx
{enabledRules.has(rule.id) && (
  <label className="flex items-center gap-2 text-sm text-muted-foreground">
    <input
      type="checkbox"
      checked={ruleConfigs.get(rule.id)?.requireAck ?? true}
      onChange={(e) => handleRequireAckChange(rule.id, e.target.checked)}
      className="h-4 w-4 rounded border-border"
    />
    Require Ack
  </label>
)}
```

**Save payload update:**
```typescript
const save = async () => {
  const configs = Array.from(enabledRules).map(ruleId => ({
    rule_id: ruleId,
    is_enabled: true,
    require_acknowledgement: ruleConfigs.get(ruleId)?.requireAck ?? true,
  }))

  await updateRules.mutateAsync({
    id: characteristicId,
    rules: configs,
  })
}
```

### Verification
- [ ] Checkbox visible for enabled rules only
- [ ] Checkbox defaults to checked
- [ ] Unchecking marks rule as not requiring ack
- [ ] Changes persist after save

---

## Task 2: Update API Hooks

### Changes
1. Update `useNelsonRules` response type
2. Update `useUpdateNelsonRules` payload type

### Files
- `frontend/src/api/hooks.ts`

### Implementation

**Response type:**
```typescript
interface NelsonRulesResponse {
  enabled_rules: number[]
  rule_configs: Array<{
    rule_id: number
    is_enabled: boolean
    require_acknowledgement: boolean
  }>
}
```

**Mutation payload:**
```typescript
interface UpdateNelsonRulesPayload {
  id: number
  rules: Array<{
    rule_id: number
    is_enabled: boolean
    require_acknowledgement: boolean
  }>
}
```

### Verification
- [ ] Hook types match backend schema
- [ ] Mutation sends correct payload format

---

## Task 3: Help Tooltip Update

### Changes
1. Add explanation of "Require Acknowledgement" to help content
2. Optional: Add tooltip to the checkbox itself

### Files
- `frontend/src/lib/help-content.ts`

### Implementation

Add to help registry:
```typescript
'require-acknowledgement': {
  title: 'Require Acknowledgement',
  description: 'When enabled, violations of this rule must be acknowledged by an operator. When disabled, violations are recorded for informational purposes but do not require acknowledgement and won\'t appear in the "Pending Alerts" count.',
  severity: 'INFO',
},
```

### Verification
- [ ] Help tooltip explains the feature
- [ ] Users understand impact of unchecking

---

## Dependencies
- Plan 1 (backend API changes)

## Commits
After each task:
```
feat(3.5-3): add require_ack checkbox to NelsonRulesConfigPanel
feat(3.5-3): update nelson rules hooks for require_ack
feat(3.5-3): add help content for require acknowledgement
```

## Estimated Scope
- 3 frontend files
- ~80 lines of changes
