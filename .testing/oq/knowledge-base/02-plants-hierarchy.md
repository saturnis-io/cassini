# Feature: Plants & Equipment Hierarchy

## What It Does

Plants represent discrete manufacturing facilities (sites, factories, campuses). Every piece of data in Cassini is plant-scoped: hierarchy nodes, characteristics, samples, violations, capability snapshots, and audit records all belong to exactly one plant. This ensures complete data isolation between sites -- a regulatory requirement in multi-facility quality management.

The equipment hierarchy organizes the measurement system within a plant using the ISA-95 model:

```
Plant (facility)
  Department (functional area / value stream)
    Line (production line / work cell group)
      Station (work cell / machine / test fixture)
        Characteristic (measurable quality attribute)
```

Each level maps to how a Six Sigma Black Belt organizes their shop floor. The hierarchy is the backbone of the measurement system: without it, you cannot create characteristics, and without characteristics, you cannot collect data or generate control charts.

## Where To Find It

| Function | Location | Role Required |
|---|---|---|
| Plant switcher | Header bar, top-right dropdown | Any authenticated user |
| Plant CRUD | Settings > Sites (`/settings/sites`) | Admin |
| Hierarchy tree | Configuration page (`/configuration`) | Engineer+ to modify, Operator+ to view |
| Plant-scoped hierarchy API | `GET /plants/{id}/hierarchies/` | Any authenticated user |

## Key Concepts (Six Sigma Context)

- **Plant = Facility**: In DMAIC terms, this is the broadest scope of your project. A plant defines the boundary for all quality data. When switching plants, you are switching context entirely -- control charts, capability indices, and violation history all change.
- **Department = Functional Area**: Maps to a value stream or department within the facility (e.g., Machining, Assembly, Painting, Inspection). Useful for organizing by process owner.
- **Line = Production Line**: A specific line producing parts or subassemblies. Typical granularity for PFMEA scope.
- **Station = Work Cell / Fixture**: The specific machine, fixture, or test station where measurements are taken. This is where your gage is physically located.
- **Characteristic = CTQ or CTP**: The measurable quality attribute -- the thing you are actually charting. Diameter, surface finish, torque, weight, defect rate. This is the leaf node of the hierarchy and the anchor for all SPC data.
- **Data Isolation**: ISO 9001:2015 Section 7.5 (Documented Information) requires organizations to control the distribution, access, and use of quality records. Plant-scoped isolation enforces this at the system level.
- **RBAC per Plant**: Users can have different roles at different plants (e.g., engineer at Plant A, operator at Plant B). This supports multi-site organizations where a quality engineer may have full authority at their home site but read-only access elsewhere.

## How To Configure (Step-by-Step)

### Creating a Plant (Admin)
1. Log in as an admin user.
2. Navigate to **Settings > Sites** (`/settings/sites`).
3. Click **Add Plant** (or equivalent create button).
4. Fill in:
   - **Name**: Human-readable name (e.g., "Detroit Assembly Plant"), max 100 characters.
   - **Code**: Short uppercase identifier (e.g., "DET01"), max 10 characters, pattern `[A-Z0-9_-]+`. Auto-uppercased.
   - **Active**: Toggle on/off. Inactive plants are hidden from normal use.
5. Click **Save**. The plant appears in the list.
6. All existing admin users are automatically assigned admin role on the new plant.

### Building the Hierarchy (Engineer+)
1. Switch to the target plant using the header dropdown.
2. Navigate to **Configuration** (`/configuration`).
3. The hierarchy tree occupies the left panel.
4. To create a root node (department): right-click empty area or use the toolbar "Add" button. Enter name and select type (e.g., "Area", "Site", "Folder").
5. To create a child node: right-click an existing node and select "Add Child", or select the node and use the toolbar. Enter name and type.
6. Repeat to build out the full hierarchy: Department > Line > Station.
7. To rename a node: right-click > Rename, or double-click the node name.
8. To delete a node: right-click > Delete. **Nodes with children cannot be deleted** -- you must delete children first (bottom-up).

### Assigning Users to Plants (Admin)
1. Go to **Settings > Users** (admin-only).
2. Select a user and assign plant roles: choose a plant and a role (operator/supervisor/engineer/admin).
3. Users will only see plants they have been assigned to in the plant switcher.

## How To Use (Typical Workflow)

1. **Switch context**: Click the plant switcher in the header. Select the target plant. All dashboard data, hierarchy, charts, and violations update to show only that plant's data.
2. **Navigate the hierarchy**: On the Configuration page, expand the tree to find your target station/characteristic. Click a characteristic to view its configuration panel.
3. **Create a characteristic**: Select a station node, then create a characteristic as a child. This is where you define chart type, subgroup size, spec limits, and Nelson rules.
4. **Daily use**: Operators and supervisors use the dashboard (`/`) which automatically filters by the active plant. They see only the characteristics and charts for that plant.

## Acceptance Criteria (OQ-Style)

| # | Criterion | Verification Method |
|---|---|---|
| 1 | Admin can create a plant with name and code | UI: /settings/sites, create, verify in list |
| 2 | Admin can edit plant name and description | UI: edit existing plant, save, refresh, verify |
| 3 | Admin can delete a non-default plant | UI: delete plant, confirm, verify removed |
| 4 | Default plant cannot be deleted | UI: attempt delete, verify error / button disabled |
| 5 | Plant code must be unique and uppercase | API: attempt duplicate code, verify 409 Conflict |
| 6 | Hierarchy tree renders with correct nesting | UI: /configuration, verify tree structure |
| 7 | Department/Line/Station/Characteristic can be created | UI: create nodes at each level, verify tree |
| 8 | Nodes can be renamed | UI: rename node, verify new name persists |
| 9 | Leaf nodes can be deleted | UI: delete node with no children, verify removed |
| 10 | Nodes with children cannot be deleted | API: attempt delete, verify 409 Conflict |
| 11 | Plant switching filters all data | UI: switch plants, verify dashboard/charts change |
| 12 | Users see only assigned plants | UI: login as non-admin, verify plant list matches assignments |
| 13 | Admin auto-assigned to new plants | API: create plant, verify admin has role |
| 14 | Cascading delete removes all child data | API: delete plant, verify hierarchy/characteristics gone |

## Edge Cases & Constraints

- **Default plant**: A plant with code "DEFAULT" is created at system initialization. It cannot be deleted (HTTP 400).
- **Cascade behavior**: Deleting a plant cascades to all hierarchy nodes, characteristics, samples, violations, capability history, and audit records for that plant. This is a destructive operation.
- **Hierarchy delete constraint**: The API returns HTTP 409 if you attempt to delete a hierarchy node that has children. You must delete bottom-up.
- **Plant code uniqueness**: The code field has a unique constraint. Attempting to create or update with a duplicate code returns HTTP 409.
- **Admin auto-assignment**: When a new plant is created, all users who hold admin role at any plant are automatically assigned admin role at the new plant.
- **Node type flexibility**: The hierarchy `type` field is a free-form string (max 50 chars), not an enum. Common values: "Site", "Area", "Line", "Equipment", "Folder", "Tag". The UI may present a dropdown, but the API accepts any string.
- **Plant-scoped hierarchy endpoints**: The API supports both global (`/hierarchy/`) and plant-scoped (`/plants/{id}/hierarchies/`) hierarchy access. The plant-scoped endpoint filters nodes to a single plant.
- **Empty hierarchy**: A plant can exist with no hierarchy nodes. You must create at least one hierarchy node before creating characteristics.

## API Reference (for seeding)

### Plants

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/plants` | User | List all plants. Query: `active_only=true` |
| `POST` | `/plants` | Admin | Create plant. Body: `{name, code, is_active?, settings?}` |
| `GET` | `/plants/{id}` | User | Get plant by ID |
| `PUT` | `/plants/{id}` | Admin | Update plant. Body: `{name?, code?, is_active?, settings?}` |
| `DELETE` | `/plants/{id}` | Admin | Delete plant (not DEFAULT). Returns 204 |

### Hierarchy

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/hierarchy` | User | Get full hierarchy tree (nested JSON) |
| `POST` | `/hierarchy` | Engineer+ | Create node. Body: `{parent_id?, name, type}` |
| `GET` | `/hierarchy/{id}` | User | Get single node |
| `PATCH` | `/hierarchy/{id}` | Engineer+ | Update node. Body: `{name?, type?}` |
| `DELETE` | `/hierarchy/{id}` | Engineer+ | Delete node (no children). Returns 204 or 409 |
| `GET` | `/hierarchy/{id}/characteristics` | User | List characteristics under node. Query: `include_descendants=true` |

### Plant-Scoped Hierarchy

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/plants/{plant_id}/hierarchies` | User | Get hierarchy tree for specific plant |
| `POST` | `/plants/{plant_id}/hierarchies` | Engineer+ | Create node in specific plant |

### Seeding Example (curl)

```bash
# Create a plant
curl -X POST $API/plants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "OQ Test Plant", "code": "OQ01"}'

# Create hierarchy: Department > Line > Station
curl -X POST $API/hierarchy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Machining Dept", "type": "Area"}'
# Returns {"id": 1, ...}

curl -X POST $API/hierarchy \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"parent_id": 1, "name": "CNC Line 1", "type": "Line"}'
# Returns {"id": 2, ...}

curl -X POST $API/hierarchy \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"parent_id": 2, "name": "Lathe Station A", "type": "Equipment"}'
# Returns {"id": 3, ...}
```
