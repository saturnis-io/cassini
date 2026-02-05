# Plan 4: Hierarchy-Based TodoList

## Objective
Replace flat TodoList with hierarchy tree that has status filtering and visual indicators.

---

## Task 1: Extend HierarchyTree with Status Indicators

### Changes
1. Add status badge bubbles to characteristic nodes
2. Add roll-up status counts to parent folder nodes
3. Add subtle background color coding

### Files
- `frontend/src/components/HierarchyTree.tsx`
- `frontend/src/api/hooks.ts` (if new endpoint needed)

### Implementation

**Status badge on characteristic:**
```tsx
const StatusBadge = ({ status }: { status: 'OOC' | 'DUE' | 'OK' }) => {
  const styles = {
    OOC: 'bg-destructive text-destructive-foreground',
    DUE: 'bg-yellow-500 text-white',
    OK: 'bg-green-500 text-white',
  }
  return (
    <span className={cn('px-1.5 py-0.5 text-xs rounded-full', styles[status])}>
      {status}
    </span>
  )
}
```

**Roll-up count on folder:**
```tsx
const FolderStatusSummary = ({ oocCount, dueCount }: { oocCount: number; dueCount: number }) => (
  <span className="flex items-center gap-1 text-xs">
    {oocCount > 0 && (
      <span className="px-1 rounded bg-destructive/20 text-destructive">{oocCount}</span>
    )}
    {dueCount > 0 && (
      <span className="px-1 rounded bg-yellow-500/20 text-yellow-600">{dueCount}</span>
    )}
  </span>
)
```

**Row background:**
```tsx
const getRowBackground = (status?: 'OOC' | 'DUE' | 'OK') => {
  if (!status) return ''
  return {
    OOC: 'bg-destructive/5',
    DUE: 'bg-yellow-500/5',
    OK: '',
  }[status]
}
```

### Verification
- [ ] OOC characteristics show red badge
- [ ] DUE characteristics show yellow badge
- [ ] OK characteristics show green badge (or no badge)
- [ ] Parent folders show aggregated counts
- [ ] Row backgrounds subtly indicate status

---

## Task 2: Add Status Filter Tabs

### Changes
1. Add filter tabs above the tree (All / OOC / Due / OK)
2. Filter/highlight tree nodes based on selection
3. Auto-expand parents of matching nodes

### Files
- `frontend/src/components/HierarchyTree.tsx` (or new wrapper)
- `frontend/src/pages/DashboardView.tsx`

### Implementation

**Filter tabs:**
```tsx
type StatusFilter = 'ALL' | 'OOC' | 'DUE' | 'OK'

const StatusFilterTabs = ({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) => (
  <div className="flex border border-border rounded-lg overflow-hidden">
    {(['ALL', 'OOC', 'DUE', 'OK'] as StatusFilter[]).map((status) => (
      <button
        key={status}
        onClick={() => onChange(status)}
        className={cn(
          'px-3 py-1.5 text-sm transition-colors',
          value === status ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
        )}
      >
        {status}
      </button>
    ))}
  </div>
)
```

**Filtering logic:**
- ALL: Show all nodes
- OOC/DUE/OK: Show only characteristics matching status + their parent folders
- Non-matching nodes hidden or grayed out

### Verification
- [ ] All tabs visible and clickable
- [ ] Filtering correctly shows/hides nodes
- [ ] Parent folders remain visible when children match
- [ ] Count badges update based on filter

---

## Task 3: Replace TodoList Usage

### Changes
1. Update DashboardView to use HierarchyTree instead of TodoList
2. Make hierarchy view the default
3. Remove or deprecate flat TodoList
4. Ensure characteristic selection still works

### Files
- `frontend/src/pages/DashboardView.tsx`
- `frontend/src/components/TodoList.tsx` (potentially remove)

### Implementation

**DashboardView update:**
```tsx
// Replace TodoList with filtered HierarchyTree
<div className="h-full flex flex-col">
  <StatusFilterTabs value={statusFilter} onChange={setStatusFilter} />
  <div className="flex-1 overflow-auto mt-2">
    <HierarchyTree
      statusFilter={statusFilter}
      onSelectCharacteristic={handleCharacteristicSelect}
      selectedCharacteristicId={selectedId}
    />
  </div>
</div>
```

### Verification
- [ ] Dashboard shows hierarchy tree by default
- [ ] Characteristic selection works
- [ ] Status filtering works
- [ ] Selected characteristic highlighted
- [ ] Chart updates when selection changes

---

## Dependencies
- Plans 1-3 (backend + frontend for violations display)
- Characteristic status data from existing API

## Commits
After each task:
```
feat(3.5-4): add status badges and roll-up counts to HierarchyTree
feat(3.5-4): add status filter tabs to hierarchy view
feat(3.5-4): replace TodoList with hierarchy-based view
```

## Estimated Scope
- 2-3 frontend files
- ~200 lines of changes
