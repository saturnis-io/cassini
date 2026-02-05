# Plan 2: Violations Display Update

## Objective
Update violations page and footer to visually distinguish violations that don't require acknowledgement.

---

## Task 1: Frontend Type + Hook Updates

### Changes
1. Update violation types with `requires_acknowledgement`
2. Update violation stats types with new counts
3. Update API hooks

### Files
- `frontend/src/types/index.ts`
- `frontend/src/api/hooks.ts`

### Implementation

**Types:**
```typescript
interface Violation {
  // ... existing fields ...
  requires_acknowledgement: boolean
}

interface ViolationStats {
  total: number
  unacknowledged: number  // Only required acks
  informational: number   // Non-required, unacknowledged
  by_severity: Record<string, number>
}
```

### Verification
- [ ] Types compile without errors
- [ ] Hooks return new fields

---

## Task 2: Violations Page Visual Distinction

### Changes
1. Add visual distinction for non-required ack violations
2. Add filter option for "Informational" violations
3. Show "Info" badge instead of "Pending" for non-required

### Files
- `frontend/src/pages/ViolationsView.tsx`

### UI Treatment (SPC/UI Expert Recommendation)
- **Non-required ack violations:**
  - Muted row styling (opacity-60 or lighter background)
  - "Info" status badge (blue) instead of "Pending" (red)
  - No "Acknowledge" button shown (or disabled with tooltip)
  - Optional: Collapsible "Informational" section at bottom

- **Filter tabs update:**
  - `pending` → `required` (violations needing acknowledgement)
  - `informational` → New tab for non-required
  - `acknowledged` → Same
  - `all` → Same

### Implementation

```tsx
// Status filter options
type FilterStatus = 'all' | 'required' | 'informational' | 'acknowledged'

// Row styling
const getRowClass = (violation: Violation) => {
  if (!violation.requires_acknowledgement) {
    return 'opacity-60 bg-muted/20'
  }
  return 'hover:bg-muted/30'
}

// Status display
const getStatusDisplay = (violation: Violation) => {
  if (violation.acknowledged) {
    return { icon: Check, text: 'Acknowledged', class: 'text-green-600' }
  }
  if (!violation.requires_acknowledgement) {
    return { icon: Info, text: 'Informational', class: 'text-blue-500' }
  }
  return { icon: Clock, text: 'Pending', class: 'text-destructive' }
}
```

### Verification
- [ ] Non-required ack violations visually distinct
- [ ] Filter tabs work correctly
- [ ] Acknowledge button hidden for informational

---

## Task 3: Footer Stats Update

### Changes
1. Update footer to show separate counts
2. Only show "required" unacknowledged in red badge
3. Optionally show "informational" count separately

### Files
- `frontend/src/components/Layout.tsx`

### Implementation

```tsx
// Footer display
<div className="flex items-center gap-4">
  {/* Required pending alerts - prominent */}
  <Link
    to="/violations?status=required"
    className={cn(
      'flex items-center gap-1',
      stats?.unacknowledged ? 'text-destructive' : 'text-muted-foreground'
    )}
  >
    <AlertTriangle className="h-4 w-4" />
    Pending: <span className="font-medium">{stats?.unacknowledged ?? 0}</span>
  </Link>

  {/* Informational - subtle */}
  {stats?.informational > 0 && (
    <Link
      to="/violations?status=informational"
      className="flex items-center gap-1 text-muted-foreground"
    >
      <Info className="h-4 w-4" />
      Info: <span className="font-medium">{stats.informational}</span>
    </Link>
  )}
</div>
```

### Verification
- [ ] Footer shows separate counts
- [ ] Only required unacknowledged shown in red
- [ ] Informational count shown subtly (if any)

---

## Dependencies
- Plan 1 (backend changes)

## Commits
After each task:
```
feat(3.5-2): update violation types and hooks for require_ack
feat(3.5-2): add visual distinction for informational violations
feat(3.5-2): update footer stats with separate counts
```

## Estimated Scope
- 3 frontend files
- ~100 lines of changes
