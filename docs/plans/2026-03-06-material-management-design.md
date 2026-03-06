# Material Management System — Design Document

**Date:** 2026-03-06
**Status:** Approved
**Replaces:** ProductLimit / product_code system

## Overview

Replace the freeform `product_code` string on samples and the `ProductLimit` override table with a structured, hierarchical material management system. Materials belong to nested Material Classes, and both can carry per-characteristic limit overrides that cascade per-field from deepest to shallowest.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Hierarchy depth | Unlimited (`parent_id` self-reference + materialized path) | Supports deep trees (Raw Materials > Metals > Aluminum > 6000 Series) without recursive CTEs |
| Override resolution | Per-field cascade — deepest non-null wins | Matches existing null=inherit pattern; each field resolves independently up the tree |
| Override scope | Per-characteristic | Limits are meaningless without measurement context (bore diameter USL != surface roughness USL) |
| Assignment model | Implicit + soft warning | No upfront assignment step; dropdown prefers materials with configured overrides; warning for unconfigured |
| Override table | Single polymorphic (`material_id` XOR `class_id`) | One table, one query pattern, one API surface |
| Migration | Clean break — drop `product_code` + `ProductLimit` | Pre-release, no production data to preserve |
| Naming | "Material" / "Material Class" | Standard manufacturing terminology |
| UI location | Hybrid — tree in Settings, overrides in characteristic config modal | Admin task (tree) separated from engineering task (limits) |

---

## Data Model

### material_class

Per-plant, self-referencing tree with materialized path for efficient ancestor lookups.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | int | PK | |
| plant_id | int | FK → plant, NOT NULL | Scoped to plant |
| parent_id | int | FK → material_class, nullable | Self-reference; null = root class |
| name | String(200) | NOT NULL | Display name (e.g., "Aluminum") |
| code | String(100) | NOT NULL | Short code (e.g., "AL") |
| path | String(1000) | NOT NULL | Materialized ancestor path (e.g., "/1/5/12/") |
| depth | int | NOT NULL | 0 for root, computed from path |
| description | Text | nullable | |
| created_at | datetime | server default | |
| updated_at | datetime | server default, on update | |

**Constraints:**
- `UniqueConstraint(plant_id, code)`
- `Index(plant_id, parent_id)`

**Path maintenance:**
- On insert: `path = parent.path + str(id) + "/"`; root classes: `"/" + str(id) + "/"`
- On reparent: update self and all descendants' paths (rare operation)

### material

Per-plant leaf entity belonging to an optional class.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | int | PK | |
| plant_id | int | FK → plant, NOT NULL | |
| class_id | int | FK → material_class, nullable | Unclassified materials allowed |
| name | String(200) | NOT NULL | e.g., "Aluminum 6061-T6" |
| code | String(100) | NOT NULL | e.g., "AL-6061-T6" |
| description | Text | nullable | |
| properties | JSON | nullable | Freeform metadata (density, hardness, etc.) |
| created_at | datetime | server default | |
| updated_at | datetime | server default, on update | |

**Constraints:**
- `UniqueConstraint(plant_id, code)`
- `Index(plant_id, class_id)`

### material_limit_override (replaces product_limit)

Per-characteristic limit overrides, keyed to either a material or a class.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | int | PK | |
| characteristic_id | int | FK → characteristic, CASCADE | |
| material_id | int | FK → material, CASCADE, nullable | |
| class_id | int | FK → material_class, CASCADE, nullable | |
| ucl | float | nullable | Null = inherit |
| lcl | float | nullable | |
| stored_sigma | float | nullable | |
| stored_center_line | float | nullable | |
| target_value | float | nullable | |
| usl | float | nullable | |
| lsl | float | nullable | |
| created_at | datetime | server default | |
| updated_at | datetime | server default, on update | |

**Constraints:**
- `CHECK(material_id IS NOT NULL AND class_id IS NULL) OR (material_id IS NULL AND class_id IS NOT NULL))`
- `UniqueConstraint(characteristic_id, material_id)` — partial, where material_id IS NOT NULL
- `UniqueConstraint(characteristic_id, class_id)` — partial, where class_id IS NOT NULL
- `Index(characteristic_id)`

**Note on partial unique constraints:** SQLite and PostgreSQL support partial indexes natively. For MySQL/MSSQL compatibility, use two separate unique constraints — the nullable column naturally excludes nulls from uniqueness in these engines.

### sample (modified)

| Change | Detail |
|--------|--------|
| ADD | `material_id` (FK → material, nullable, SET NULL on delete) |
| DROP | `product_code` column |

---

## Resolution Logic

### Algorithm: resolve_effective_limits(char_id, material_id)

```
1. Load material → get class_id
2. If class_id is not null:
   a. Load class → parse path → ancestor_ids (deepest first)
   b. e.g., path="/1/5/12/" → ancestor_ids = [12, 5, 1]
3. Single query:
   SELECT * FROM material_limit_override
   WHERE characteristic_id = char_id
   AND (material_id = material_id OR class_id IN ancestor_ids)
4. Sort results by priority:
   - material_id match → priority 0 (highest)
   - class_id match → priority = max_depth - class.depth (deeper = higher priority)
5. For each field (ucl, lcl, usl, lsl, stored_sigma, stored_center_line, target_value):
   - Walk sorted overrides, take first non-null value
   - If all null → field falls back to characteristic default
6. Return EffectiveLimits with provenance map:
   { field_name: { value, source_type, source_id, source_name } }
```

### Example

```
Tree:    Raw Materials (id=1, depth=0) → Metals (id=5, depth=1) → Aluminum (id=12, depth=2)
Material: 6061-T6 (id=42, class_id=12)
Char:     Bore Diameter (id=100, ucl=null, lcl=null, usl=20.0, lsl=0.0)

Overrides:
  (char=100, class=1):  usl=15.0, lsl=1.0
  (char=100, class=5):  ucl=12.0
  (char=100, class=12): usl=10.0
  (char=100, mat=42):   ucl=8.0, target=5.0

Resolved:
  usl    = 10.0  ← Aluminum class (depth 2)
  lsl    =  1.0  ← Raw Materials class (depth 0)
  ucl    =  8.0  ← 6061-T6 material (direct)
  lcl    =  null → characteristic.lcl = null
  target =  5.0  ← 6061-T6 material (direct)
  sigma  =  null → characteristic.stored_sigma
```

### Performance

- Two queries: material+class load (eager-loadable), override fetch with IN clause
- Class trees typically 3-5 levels → IN clause has 3-5 IDs
- SPC engine hot path can cache class ancestry (classes rarely change)

### Show Your Work Integration

ExplanationCollector logs provenance per field:
`"USL = 10.0 (inherited from class 'Aluminum', depth 2)"`

---

## API Design

### Material Class Router: `/api/v1/plants/{plant_id}/material-classes`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | User+ | List all classes (flat with depth/path, supports tree reconstruction) |
| POST | `/` | Engineer+ | Create class (optional parent_id; computes path/depth) |
| GET | `/{class_id}` | User+ | Get class detail + direct children |
| PUT | `/{class_id}` | Engineer+ | Update name/code/description/parent (reparent recalculates subtree paths) |
| DELETE | `/{class_id}` | Engineer+ | Delete class (400 if has children or materials) |
| GET | `/{class_id}/tree` | User+ | Get full subtree rooted at this class |

### Material Router: `/api/v1/plants/{plant_id}/materials`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | User+ | List materials (filterable by class_id, search by name/code) |
| POST | `/` | Engineer+ | Create material (optional class_id) |
| GET | `/{material_id}` | User+ | Get material detail |
| PUT | `/{material_id}` | Engineer+ | Update fields |
| DELETE | `/{material_id}` | Engineer+ | Delete (400 if samples reference it) |

### Material Limit Override Router: `/api/v1/characteristics/{char_id}/material-overrides`

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | User+ | List all overrides for this characteristic |
| POST | `/` | Engineer+ | Create override (material_id XOR class_id + limit fields) |
| GET | `/{override_id}` | User+ | Get specific override |
| PUT | `/{override_id}` | Engineer+ | Update override fields |
| DELETE | `/{override_id}` | Engineer+ | Delete override |
| GET | `/resolve/{material_id}` | User+ | Resolve effective limits with provenance |

### Modified Existing Endpoints

- `POST /api/v1/samples` — `material_id` replaces `product_code` in SampleCreate schema
- `GET /api/v1/characteristics/{id}/chart-data` — `material_id` query param replaces `product_code`
- Manual data entry endpoints — `material_id` in sample creation
- SPC engine — resolves limits via material cascade instead of ProductLimit lookup

---

## Frontend UI

### Material Tree Manager (Settings Page)

New section in plant-scoped Settings:

- **Left panel:** Collapsible tree showing class hierarchy with material counts per node
- **Right panel:** Detail/edit form for selected class or material
- **Actions:** Add class, add sub-class, add material to class, edit, delete
- **Quick search:** Filter tree by name/code
- **Pattern:** Follows existing hierarchy manager (Plant > Department > Line > Station)

### Material Overrides Tab (Characteristic Config Modal)

Replaces `ProductLimitsTab`:

- **Table view:** All overrides for this characteristic, grouped by type (material vs class)
- **Each row:** Material/Class name, breadcrumb path, 7 override fields with "Inherited" badges for nulls
- **Add override:** Dropdown to pick material or class from plant tree, then set fields
- **Quick add material:** Mini-form to create a new material inline (name, code, class picker)
- **Resolve preview:** Shows fully resolved limits with provenance when a material is selected

### Manual Entry — Material Picker

Replaces product_code text input:

- **Combobox dropdown:** Preferred section (materials with configured overrides), separator, all plant materials
- **Type-to-filter:** Filters both sections by name/code
- **Warning badge:** Yellow warning for materials with no configured overrides: "No limit overrides configured — characteristic defaults will be used"
- **Strict selection:** Only valid Material entities selectable (no freeform text)

### Chart Filtering

- Material dropdown replaces product code dropdown
- Selecting a material filters samples and swaps limit lines to resolved overrides
- Provenance tooltips on limit lines in chart legend

---

## Migration

### Database Migration (single file)

1. CREATE `material_class` table
2. CREATE `material` table
3. CREATE `material_limit_override` table
4. ADD `material_id` FK column to `sample` (nullable)
5. DROP `product_limit` table
6. DROP `product_code` column from `sample`

### Code Removal

**Backend delete:**
- `db/models/product_limit.py`
- `db/repositories/product_limit.py`
- `api/v1/product_limits.py`

**Backend modify:**
- `db/models/sample.py` — remove product_code, add material_id
- `db/models/__init__.py` — remove ProductLimit, add Material/MaterialClass/MaterialLimitOverride
- `api/schemas/sample.py` — remove product_code, add material_id
- `db/repositories/sample.py` — remove product_code filters, add material_id filters
- `core/engine/spc_engine.py` — replace ProductLimit lookup with material cascade resolution
- `api/v1/characteristics.py` — chart-data endpoint: material_id replaces product_code
- `api/v1/samples.py` — sample creation with material_id
- `main.py` — remove product_limits router, add material routers

**Frontend delete:**
- `api/product-limits.api.ts`
- `api/hooks/product-limits.ts` (if exists)
- `components/characteristic-config/ProductLimitsTab.tsx`

**Frontend modify:**
- `ManualEntryPanel.tsx` — material picker replaces product_code input
- `ControlChart.tsx` — material filter replaces product filter
- Characteristic config modal — MaterialOverridesTab replaces ProductLimitsTab

### Seed Scripts

Update all scripts in `backend/scripts/` to use material system:
- `seed_e2e.py` — material class tree + materials + overrides + samples with material_id
- `seed_showcase.py` — industry-relevant material classes (Metals, Plastics, Composites)
- `seed_pharma.py` — pharma materials (Active Ingredients, Excipients, Packaging)
- Other industry seeds — domain-appropriate materials

### E2E Tests

- Rewrite `e2e/product-limits.spec.ts` → `e2e/materials.spec.ts`
- Test: create class tree → create materials → assign overrides → enter sample with material → verify chart uses resolved limits → verify warning for unconfigured material

---

## Cross-Cutting Requirements

### Audit Trail
- Add `_RESOURCE_PATTERNS` entries for `/material-classes`, `/materials`, `/material-overrides`
- Add action keywords: "create", "update", "delete", "resolve"
- Add `RESOURCE_LABELS` and `ACTION_LABELS` in `AuditLogViewer.tsx`

### API Contracts
- `fetchApi` paths never include `/api/v1/` prefix
- TypeScript types match Pydantic schemas field-for-field
- Error responses never pass `str(e)` to clients

### Electronic Signatures
- Material limit overrides are engineering configuration — no signature required (same as current ProductLimit behavior)
- If regulatory workflow is needed later, `sign_standalone()` can be added

---

## Out of Scope

- Drag-and-drop reparenting in tree UI (can add later)
- Material versioning / revision history
- Configurable display labels ("Product" vs "Material" vs "SKU")
- Material-to-material relationships (substitutes, alternates)
- Bulk import of materials from CSV/ERP
