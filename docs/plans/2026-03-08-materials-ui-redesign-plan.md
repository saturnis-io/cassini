# Materials UI Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move material management from Settings into Configuration page as a peer tab, with tree-driven context-aware interactions matching the existing hierarchy tree pattern.

**Architecture:** Add a tab bar to ConfigurationView that switches between Characteristics and Materials views. Rewrite MaterialTreeManager as a two-pane layout (tree left, detail right) that mirrors ConfigurationView's pattern. Add a backend "used-by" endpoint so the detail panel can show which characteristics reference a material/class. Remove the Settings route.

**Tech Stack:** React 19, TypeScript 5.9, TanStack Query v5, Zustand v5, FastAPI, SQLAlchemy async

---

## Wave 1: Backend — "Used By" Endpoint

### Task 1: Add repository method for material/class usage lookup

**Files:**
- Modify: `backend/src/cassini/db/repositories/material_limit_override.py`
- Test: `backend/tests/unit/test_repositories.py`

**Step 1: Write the failing test**

In `backend/tests/unit/test_repositories.py`, add a test (at the end of the file) for the new repository method. The test should:

```python
@pytest.mark.asyncio
async def test_list_characteristics_by_material(db_session):
    """MaterialLimitOverrideRepository.list_characteristics_by_material returns char info."""
    from cassini.db.repositories.material_limit_override import MaterialLimitOverrideRepository

    repo = MaterialLimitOverrideRepository(db_session)
    # Should return empty list for non-existent material
    result = await repo.list_characteristics_by_material(material_id=99999)
    assert result == []
```

**Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/unit/test_repositories.py::test_list_characteristics_by_material -v`
Expected: FAIL with `AttributeError: 'MaterialLimitOverrideRepository' object has no attribute 'list_characteristics_by_material'`

**Step 3: Write the repository methods**

Add two methods to `MaterialLimitOverrideRepository` in `backend/src/cassini/db/repositories/material_limit_override.py`:

```python
async def list_characteristics_by_material(
    self, material_id: int
) -> list[dict]:
    """Find all characteristics that have an override for this material.

    Returns list of dicts with characteristic_id, characteristic name,
    and hierarchy_path string.
    """
    from cassini.db.models.characteristic import Characteristic

    stmt = (
        select(
            MaterialLimitOverride.characteristic_id,
            Characteristic.name,
            Characteristic.hierarchy_path,
        )
        .join(Characteristic, MaterialLimitOverride.characteristic_id == Characteristic.id)
        .where(MaterialLimitOverride.material_id == material_id)
    )
    result = await self.session.execute(stmt)
    return [
        {
            "characteristic_id": row.characteristic_id,
            "name": row.name,
            "hierarchy_path": row.hierarchy_path,
        }
        for row in result.all()
    ]

async def list_characteristics_by_class(
    self, class_id: int
) -> list[dict]:
    """Find all characteristics that have an override for this material class."""
    from cassini.db.models.characteristic import Characteristic

    stmt = (
        select(
            MaterialLimitOverride.characteristic_id,
            Characteristic.name,
            Characteristic.hierarchy_path,
        )
        .join(Characteristic, MaterialLimitOverride.characteristic_id == Characteristic.id)
        .where(MaterialLimitOverride.class_id == class_id)
    )
    result = await self.session.execute(stmt)
    return [
        {
            "characteristic_id": row.characteristic_id,
            "name": row.name,
            "hierarchy_path": row.hierarchy_path,
        }
        for row in result.all()
    ]
```

**Important:** Check whether `Characteristic` has a `hierarchy_path` column. If not, use a subquery or join through `HierarchyNode` to build the path. The key is returning enough info for the frontend to display "Plant > Line > Station > CharName" breadcrumbs.

**Step 4: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/unit/test_repositories.py::test_list_characteristics_by_material -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/cassini/db/repositories/material_limit_override.py backend/tests/unit/test_repositories.py
git commit -m "feat: add material/class usage lookup repository methods"
```

---

### Task 2: Add "used-by" API endpoints

**Files:**
- Modify: `backend/src/cassini/api/v1/materials.py`
- Modify: `backend/src/cassini/api/v1/material_classes.py`
- Modify: `backend/src/cassini/api/schemas/material.py`

**Step 1: Add response schema**

In `backend/src/cassini/api/schemas/material.py`, add after the `MaterialResponse` class:

```python
class MaterialUsageItem(BaseModel):
    characteristic_id: int
    name: str
    hierarchy_path: str | None = None
```

**Step 2: Add endpoint to materials router**

In `backend/src/cassini/api/v1/materials.py`, add a new route BEFORE the `/{material_id}` route (static before param rule):

```python
from cassini.api.schemas.material import MaterialUsageItem
from cassini.db.repositories.material_limit_override import MaterialLimitOverrideRepository

@router.get("/usage/{material_id}", response_model=list[MaterialUsageItem])
async def get_material_usage(
    plant_id: int,
    material_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[MaterialUsageItem]:
    """Get characteristics that reference this material via overrides."""
    check_plant_role(_user, plant_id, "operator")

    repo = MaterialLimitOverrideRepository(session)
    items = await repo.list_characteristics_by_material(material_id)
    return [MaterialUsageItem(**item) for item in items]
```

**Step 3: Add endpoint to material_classes router**

In `backend/src/cassini/api/v1/material_classes.py`, add a similar endpoint BEFORE any `/{class_id}` routes:

```python
from cassini.api.schemas.material import MaterialUsageItem
from cassini.db.repositories.material_limit_override import MaterialLimitOverrideRepository

@router.get("/usage/{class_id}", response_model=list[MaterialUsageItem])
async def get_class_usage(
    plant_id: int,
    class_id: int,
    session: AsyncSession = Depends(get_db_session),
    _user: User = Depends(get_current_user),
) -> list[MaterialUsageItem]:
    """Get characteristics that reference this material class via overrides."""
    check_plant_role(_user, plant_id, "operator")

    repo = MaterialLimitOverrideRepository(session)
    items = await repo.list_characteristics_by_class(class_id)
    return [MaterialUsageItem(**item) for item in items]
```

**Step 4: Run full backend tests**

Run: `cd backend && python -m pytest tests/ -x --tb=short -q`
Expected: All 720+ tests pass

**Step 5: Commit**

```bash
git add backend/src/cassini/api/v1/materials.py backend/src/cassini/api/v1/material_classes.py backend/src/cassini/api/schemas/material.py
git commit -m "feat: add material/class usage lookup endpoints"
```

---

## Wave 2: Frontend API Layer

### Task 3: Add frontend API functions and hooks for usage endpoints

**Files:**
- Modify: `frontend/src/api/materials.api.ts`
- Modify: `frontend/src/api/hooks/materials.ts`
- Modify: `frontend/src/api/hooks/queryKeys.ts`
- Modify: `frontend/src/types/index.ts`

**Step 1: Add TypeScript type**

In `frontend/src/types/index.ts`, find the material types section and add:

```typescript
export interface MaterialUsageItem {
  characteristic_id: number
  name: string
  hierarchy_path: string | null
}
```

**Step 2: Add API functions**

In `frontend/src/api/materials.api.ts`, add:

```typescript
export function getMaterialUsage(
  plantId: number,
  materialId: number,
): Promise<MaterialUsageItem[]> {
  return fetchApi(`/plants/${plantId}/materials/usage/${materialId}`)
}

export function getMaterialClassUsage(
  plantId: number,
  classId: number,
): Promise<MaterialUsageItem[]> {
  return fetchApi(`/plants/${plantId}/material-classes/usage/${classId}`)
}
```

Import the type at the top: add `MaterialUsageItem` to the import from `@/types`.

**Step 3: Add query keys**

In `frontend/src/api/hooks/queryKeys.ts`, add to the `materialKeys` object:

```typescript
materialUsage: (plantId: number, materialId: number) =>
  ['materials', 'usage', plantId, materialId] as const,
classUsage: (plantId: number, classId: number) =>
  ['materials', 'classUsage', plantId, classId] as const,
```

**Step 4: Add React Query hooks**

In `frontend/src/api/hooks/materials.ts`, add:

```typescript
import { getMaterialUsage, getMaterialClassUsage } from '../materials.api'

export function useMaterialUsage(plantId: number, materialId: number) {
  return useQuery({
    queryKey: materialKeys.materialUsage(plantId, materialId),
    queryFn: () => getMaterialUsage(plantId, materialId),
    enabled: plantId > 0 && materialId > 0,
  })
}

export function useMaterialClassUsage(plantId: number, classId: number) {
  return useQuery({
    queryKey: materialKeys.classUsage(plantId, classId),
    queryFn: () => getMaterialClassUsage(plantId, classId),
    enabled: plantId > 0 && classId > 0,
  })
}
```

**Step 5: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/api/materials.api.ts frontend/src/api/hooks/materials.ts frontend/src/api/hooks/queryKeys.ts
git commit -m "feat: add material/class usage API hooks"
```

---

## Wave 3: Zustand Store Extension

### Task 4: Add material tree state to configStore

**Files:**
- Modify: `frontend/src/stores/configStore.ts`

**Step 1: Extend the store**

Add material tree state alongside the existing hierarchy state. Add these fields and methods:

```typescript
// Material tree state
selectedMaterialClassId: number | null
selectedMaterialId: number | null
expandedClassIds: Set<number>
materialFormMode: 'view' | 'add-class' | 'add-material'
materialFormParentId: number | null  // pre-filled parent for context-aware creation

setSelectedMaterialClassId: (id: number | null) => void
setSelectedMaterialId: (id: number | null) => void
toggleClassExpanded: (id: number) => void
setMaterialFormMode: (mode: 'view' | 'add-class' | 'add-material', parentId?: number | null) => void
```

Add `configView: 'characteristics' | 'materials'` and `setConfigView` for the tab bar state.

Update `resetForPlantChange` to also reset the material tree state.

**Step 2: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/stores/configStore.ts
git commit -m "feat: add material tree state to configStore"
```

---

## Wave 4: Material Tree Component

### Task 5: Create MaterialTree recursive tree component

**Files:**
- Create: `frontend/src/components/materials/MaterialTree.tsx`

**Step 1: Build the component**

Model this after `HierarchyTree.tsx` (285 lines). Key behaviors:

- Recursive `MaterialClassNode` renders class nodes with expand/collapse
- `MaterialLeafNode` renders individual materials under their class
- Click-to-select: class click sets `selectedMaterialClassId`, material click sets `selectedMaterialId`
- Hover actions: `+` icon on class nodes (opens a small popover/menu: "Add Subclass" / "Add Material"), trash icon on both
- Selection highlight: `bg-primary/10 text-primary` (same as HierarchyTree)
- Icons: `FolderTree`/`FolderOpen` for classes, `Package` for materials
- Material count badge on class nodes: `bg-muted rounded-full px-1.5 py-0.5 text-[10px]`
- "Unclassified" section at bottom for materials with `class_id === null`
- Search filtering via prop (parent manages search state)
- Tree built from `MaterialClass[]` + `Material[]` using the existing `buildTree` logic (move from MaterialTreeManager)
- Delete: two-step confirmation — hover trash → click → "Confirm Delete" button replaces icon (match HierarchyTree modal pattern)

Store integration: read/write via `useConfigStore` (selectedMaterialClassId, selectedMaterialId, expandedClassIds, materialFormMode, materialFormParentId).

Context-aware `+` button: when clicking `+` on a class node, show two options (can be a simple dropdown or two buttons in a popover):
- "Add Subclass" → calls `setMaterialFormMode('add-class', classId)`
- "Add Material" → calls `setMaterialFormMode('add-material', classId)`

This pre-fills the parent/class in the form that appears in the right panel.

**Step 2: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/materials/MaterialTree.tsx
git commit -m "feat: add MaterialTree recursive tree component"
```

---

### Task 6: Create MaterialClassDetail right-panel component

**Files:**
- Create: `frontend/src/components/materials/MaterialClassDetail.tsx`

**Step 1: Build the component**

Three sections in the right panel when a class is selected:

**Section 1 — Details** (top):
- Name, code (auto-uppercase on blur), description fields
- Inline editable: starts in view mode (read-only display), "Edit" button switches to edit mode
- Save/Cancel buttons in edit mode
- Uses `useUpdateMaterialClass` mutation
- Delete button with two-step confirmation, uses `useDeleteMaterialClass`
- Warn on delete if class has children or materials (show count)

**Section 2 — Materials** (middle):
- Header: "Materials" with count badge
- Table/list of materials belonging to this class (name, code columns)
- Each row clickable → sets `selectedMaterialId` in store
- Quick-add row at bottom: name + code inputs + "Add" button
- Uses `useCreateMaterial` with `class_id` pre-filled from the selected class

**Section 3 — Used By** (bottom):
- Header: "Used By" with count badge (or "Used By Characteristics")
- Uses `useMaterialClassUsage(plantId, classId)` hook
- Each item shows hierarchy_path breadcrumb (e.g., "Plant > Line > Diameter")
- Each item is a clickable link: navigates to `/configuration?view=characteristics` and sets `editingCharacteristicId` in the store
- Empty state: `text-muted-foreground text-sm` "No characteristics use this class."

**Styling:** Follow Cassini UI system — `bg-card rounded-lg border`, semantic tokens only, section dividers with `border-t`.

**Step 2: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/materials/MaterialClassDetail.tsx
git commit -m "feat: add MaterialClassDetail right-panel component"
```

---

### Task 7: Create MaterialDetail right-panel component

**Files:**
- Create: `frontend/src/components/materials/MaterialDetail.tsx`

**Step 1: Build the component**

Full detail form when a material is selected:

- Name, code (auto-uppercase), description fields — inline editable with Edit/Save/Cancel
- Class: read-only breadcrumb path (clickable → navigates to the class in the tree by setting `selectedMaterialClassId`)
- Properties: JSON key-value editor if properties exist (or a simple textarea for JSON, or skip if properties are rarely used — keep it simple)
- Delete button with two-step confirmation
- Warn on delete if referenced by overrides (show count from `useMaterialUsage`)

**Used By section:**
- Uses `useMaterialUsage(plantId, materialId)` hook
- Same pattern as MaterialClassDetail's Used By section

**Step 2: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/materials/MaterialDetail.tsx
git commit -m "feat: add MaterialDetail right-panel component"
```

---

### Task 8: Create MaterialConfigView container component

**Files:**
- Create: `frontend/src/components/materials/MaterialConfigView.tsx`

**Step 1: Build the component**

This is the container for the Materials tab in ConfigurationView. It orchestrates:

- Left panel (w-80): toolbar (search + "Root Class" button + "Material" button) + `<MaterialTree>` component
- Right panel (flex-1): conditional rendering based on store state:
  - `materialFormMode === 'add-class'` → inline add-class form (name, code, description; parent pre-filled from `materialFormParentId`)
  - `materialFormMode === 'add-material'` → inline add-material form (name, code, description; class pre-filled from `materialFormParentId`)
  - `selectedMaterialClassId` set → `<MaterialClassDetail>`
  - `selectedMaterialId` set → `<MaterialDetail>`
  - Nothing selected → empty state message

Props: `plantId: number`

Layout: `flex min-h-0 flex-1 gap-6` — identical to ConfigurationView's layout.

**Step 2: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/materials/MaterialConfigView.tsx
git commit -m "feat: add MaterialConfigView container"
```

---

## Wave 5: Integration

### Task 9: Add tab bar to ConfigurationView

**Files:**
- Modify: `frontend/src/pages/ConfigurationView.tsx`

**Step 1: Add tab bar and conditional rendering**

At the top of ConfigurationView's return JSX, add a tab bar:

```tsx
const configView = useConfigStore((state) => state.configView)
const setConfigView = useConfigStore((state) => state.setConfigView)
```

Tab bar HTML (before the `flex min-h-0 flex-1 gap-6` div):

```tsx
<div className="border-border mb-4 flex gap-0 border-b">
  <button
    onClick={() => setConfigView('characteristics')}
    className={cn(
      'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
      configView === 'characteristics'
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    )}
  >
    Characteristics
  </button>
  <button
    onClick={() => setConfigView('materials')}
    className={cn(
      'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
      configView === 'materials'
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground',
    )}
  >
    Materials
  </button>
</div>
```

Conditionally render either the existing characteristics content or the new `<MaterialConfigView>`:

```tsx
{configView === 'materials' ? (
  <MaterialConfigView plantId={selectedPlant.id} />
) : (
  /* existing hierarchy tree + characteristic form JSX */
)}
```

Import `MaterialConfigView` from `@/components/materials/MaterialConfigView`.

**Step 2: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/pages/ConfigurationView.tsx
git commit -m "feat: add Characteristics/Materials tab bar to ConfigurationView"
```

---

### Task 10: Remove materials from Settings

**Files:**
- Modify: `frontend/src/pages/SettingsView.tsx`
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/components/materials/MaterialSettings.tsx`

**Step 1: Remove from SettingsView sidebar**

In `frontend/src/pages/SettingsView.tsx`, remove the materials tab entry from the `SIDEBAR_GROUPS` array:

```typescript
// Remove this line from the 'data' group:
{ to: 'materials', labelKey: 'tabs.materials', icon: Layers, minRole: 'engineer' },
```

Also remove the `Layers` import from lucide-react if it's no longer used.

**Step 2: Remove from App.tsx routes**

In `frontend/src/App.tsx`:
- Remove the import: `import { MaterialSettings } from '@/components/materials/MaterialSettings'`
- Remove the route: the `<Route path="materials" ...>` block (around line 504-507)

**Step 3: Delete MaterialSettings.tsx**

Delete `frontend/src/components/materials/MaterialSettings.tsx` — it's no longer needed.

**Step 4: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git rm frontend/src/components/materials/MaterialSettings.tsx
git add frontend/src/pages/SettingsView.tsx frontend/src/App.tsx
git commit -m "feat: remove materials from Settings page"
```

---

### Task 11: Delete old MaterialTreeManager

**Files:**
- Delete: `frontend/src/components/materials/MaterialTreeManager.tsx`

**Step 1: Verify no imports remain**

Search for any remaining imports of `MaterialTreeManager`:

```bash
cd frontend && grep -r "MaterialTreeManager" src/
```

Should return nothing after Task 10.

**Step 2: Delete the file**

```bash
git rm frontend/src/components/materials/MaterialTreeManager.tsx
```

**Step 3: Type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git commit -m "chore: remove old MaterialTreeManager component"
```

---

## Wave 6: Verification

### Task 12: Run full test suite

**Step 1: Backend tests**

Run: `cd backend && python -m pytest tests/ -x --tb=short -q`
Expected: 720+ passed, 0 failed

**Step 2: Frontend type check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 3: Frontend build**

Run: `cd frontend && npm run build`
Expected: Clean build, no errors

**Step 4: Commit any fixups if needed**

---

### Task 13: Update seed script if needed

**Files:**
- Check: `backend/scripts/seed_e2e.py`

The seed script creates material classes and materials. Verify it still works correctly since no backend model changes were made. Run:

```bash
cd backend && python scripts/seed_e2e.py
```

No changes expected, but verify.

---

### Task 14: Manual smoke test checklist

Do NOT skip this. Start both servers and verify:

```bash
cd backend && uvicorn cassini.main:app --reload
cd frontend && npm run dev
```

**Checklist:**
- [ ] Navigate to Configuration page — tab bar shows "Characteristics" | "Materials"
- [ ] Characteristics tab works exactly as before (no regressions)
- [ ] Switch to Materials tab — shows empty state or existing materials
- [ ] Create a root material class from toolbar "Root Class" button
- [ ] Create a material from toolbar "Material" button (unclassified)
- [ ] Select a class → right panel shows details + empty materials table + empty Used By
- [ ] Click "+" hover icon on class → "Add Subclass" / "Add Material" options appear
- [ ] "Add Subclass" → form opens with parent pre-filled
- [ ] "Add Material" → form opens with class pre-filled
- [ ] Create a material under a class → appears in tree and in class detail's materials table
- [ ] Select a material → right panel shows detail form with Used By section
- [ ] Add a material override on a characteristic (via Characteristics tab > config > Material Overrides tab)
- [ ] Return to Materials tab, select that material → Used By shows the characteristic
- [ ] Click the characteristic link in Used By → navigates to Characteristics tab with that char selected
- [ ] Delete a material → confirmation shows override count if applicable
- [ ] Delete a class with children → confirmation shows child/material counts
- [ ] Search filters the tree correctly
- [ ] Settings page no longer shows Materials tab
- [ ] Direct navigation to `/settings/materials` → 404 or redirect
