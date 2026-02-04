# Plan 5: Multi-Selection Infrastructure

## Objective
Add checkbox multi-select to hierarchy tree for report generation.

---

## Task 1: Add Checkbox Multi-Select

### Changes
1. Add checkbox to each characteristic node
2. Track selection state
3. Support shift-click for range selection

### Files
- `frontend/src/components/HierarchyTree.tsx`
- `frontend/src/stores/dashboardStore.ts` (or new selection store)

### Implementation

**Selection state:**
```typescript
interface SelectionState {
  selectedIds: Set<number>
  isMultiSelectMode: boolean
}

const useSelectionStore = create<SelectionState>((set) => ({
  selectedIds: new Set(),
  isMultiSelectMode: false,
  toggleSelection: (id: number) => set((state) => {
    const next = new Set(state.selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    return { selectedIds: next }
  }),
  selectAll: (ids: number[]) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),
}))
```

**Checkbox in tree:**
```tsx
{isMultiSelectMode && (
  <input
    type="checkbox"
    checked={selectedIds.has(char.id)}
    onChange={() => toggleSelection(char.id)}
    onClick={(e) => e.stopPropagation()}
    className="h-4 w-4 rounded border-border mr-2"
  />
)}
```

### Verification
- [ ] Checkboxes appear in multi-select mode
- [ ] Selection state persists across navigation
- [ ] Multiple items can be selected
- [ ] Clear selection works

---

## Task 2: Node-Level Selection

### Changes
1. Add checkbox to folder nodes
2. Checking a folder selects all children
3. Indeterminate state when some children selected

### Files
- `frontend/src/components/HierarchyTree.tsx`

### Implementation

**Folder checkbox:**
```tsx
const FolderCheckbox = ({ nodeId, childIds, selectedIds, onSelectAll, onDeselectAll }) => {
  const allSelected = childIds.every(id => selectedIds.has(id))
  const someSelected = childIds.some(id => selectedIds.has(id))
  const indeterminate = someSelected && !allSelected

  return (
    <input
      type="checkbox"
      checked={allSelected}
      ref={(el) => el && (el.indeterminate = indeterminate)}
      onChange={(e) => {
        if (e.target.checked) {
          onSelectAll(childIds)
        } else {
          onDeselectAll(childIds)
        }
      }}
      className="h-4 w-4 rounded border-border mr-2"
    />
  )
}
```

### Verification
- [ ] Folder checkbox selects all children
- [ ] Folder checkbox deselects all children
- [ ] Indeterminate state shows when partial
- [ ] Nested folders work correctly

---

## Task 3: Selection Toolbar

### Changes
1. Add floating toolbar when items selected
2. Show selection count
3. Add "Generate Report" action
4. Add "Clear Selection" action

### Files
- `frontend/src/components/SelectionToolbar.tsx` (new)
- `frontend/src/pages/DashboardView.tsx`

### Implementation

**Selection toolbar:**
```tsx
const SelectionToolbar = ({ count, onGenerateReport, onClear }) => {
  if (count === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2 bg-card border border-border rounded-lg shadow-lg">
      <span className="text-sm font-medium">{count} selected</span>
      <button
        onClick={onGenerateReport}
        className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
      >
        Generate Report
      </button>
      <button
        onClick={onClear}
        className="px-3 py-1.5 text-sm border border-border rounded hover:bg-muted"
      >
        Clear
      </button>
    </div>
  )
}
```

### Verification
- [ ] Toolbar appears when items selected
- [ ] Count updates correctly
- [ ] Generate Report navigates to reports page with selection
- [ ] Clear Selection clears all

---

## Dependencies
- Plan 4 (hierarchy-based TodoList)

## Commits
After each task:
```
feat(3.5-5): add checkbox multi-select to HierarchyTree
feat(3.5-5): implement node-level selection for folders
feat(3.5-5): add selection toolbar with report action
```

## Estimated Scope
- 3-4 frontend files
- ~150 lines of changes
