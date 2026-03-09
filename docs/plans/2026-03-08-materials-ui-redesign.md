# Materials UI Redesign — Move to Configuration Page

**Date**: 2026-03-08
**Status**: Approved
**Supersedes**: UI portions of `2026-03-06-material-management-design.md`

## Problem

The material management UI currently lives as a tab in `/settings/materials`, buried
in the Data section of Settings. It uses a generic CRUD form pattern where creating
items requires dropdown selection — ignoring the user's tree selection. This feels
disconnected from the rest of the app and inconsistent with the Configuration page's
tree-driven interaction model.

## Decision

Move material management into the Configuration page as a peer tab alongside
Characteristics. Remove the Settings route entirely.

## Design

### Navigation & Routing

The `/configuration` page gains a top-level tab bar:

| Tab | URL | Content |
|-----|-----|---------|
| Characteristics | `?view=characteristics` (default) | Existing hierarchy tree + characteristic forms |
| Materials | `?view=materials` | Material class tree + material forms |

No sidebar changes — Configuration stays under System. The `/settings/materials`
route and its sidebar entry are removed.

### Layout (Materials Tab)

Same two-pane split as Characteristics:

```
+------------------+------------------------------+
| Material Tree    | Detail Panel                 |
| (w-80)           | (flex-1)                     |
|                  |                              |
| [Search...]      | +- Class: "6000 Series" ----+|
| + Root Class     | | Name: ___    Code: ___    ||
| + Material       | | Description: ___          ||
|                  | |                            ||
| > Metals         | | -- Materials (4) --------- ||
|   > Aluminum     | | AL-6061  Aluminum 6061     ||
|     * AL-6061    | | AL-6063  Aluminum 6063     ||
|     * AL-6063    | | [+ Add Material]           ||
|   > Steel        | |                            ||
| > Polymers       | | -- Used By (3 chars) ----- ||
|   * HDPE-100     | | Plant > Line1 > Diameter   ||
|                  | | Plant > Line2 > Width      ||
| -- Unclassified -| | Plant > Line3 > Thickness  ||
|   * CUSTOM-001   | +----------------------------+|
+------------------+------------------------------+
```

### Tree Behavior

Matches Configuration page hierarchy tree pattern:

- **Click node** -> select it, right panel shows detail
- **Hover class node** -> `+` icon (add subclass or material) and trash icon
- **Hover material node** -> trash icon only
- **Expand class** -> shows child classes, then materials as leaf nodes
- **Search** -> filters tree in real-time
- **Top toolbar buttons**: "+ Root Class" (new top-level class), "+ Material" (unclassified)

### Context-Aware Creation

When a class node is selected and user clicks `+`:

- **Add Subclass**: right panel shows class form with `parent_id` pre-filled
- **Add Material**: right panel shows material form with `class_id` pre-filled

No dropdown selection for parent/class. The tree selection drives form context.

### Right Panel States

#### Class Selected

Three sections:

1. **Details** (top): Name, code (auto-uppercase), description. Inline editable
   with Save/Cancel buttons.
2. **Materials** (middle): Table of materials in this class with count badge.
   Quick-add row at bottom (name + code fields). Click row to navigate to material.
3. **Used By** (bottom): Characteristics with material overrides referencing this
   class, shown as hierarchy breadcrumb paths (e.g., "Plant > Line > Station >
   Diameter"). Clickable links to characteristic config. Count displayed. Empty
   state: "No characteristics use this class."

#### Material Selected

Full detail form:

- Name, code, description, properties (JSON key-value editor)
- Parent class as read-only breadcrumb path (clickable to navigate to class)
- "Used By" section: characteristics with overrides targeting this material

#### Nothing Selected

Empty state: "Select a material class or material from the tree, or create one
to get started."

### Deletions

Two-step confirmation (matches existing pattern):

- **Classes**: warn if has children or materials ("This will delete 3 subclasses
  and 12 materials"). Cascade delete.
- **Materials**: warn if referenced by overrides ("This material is used in 2
  characteristic overrides"). Cascade delete.
- Hover trash icon -> click -> "Confirm Delete" replaces icon

### What Stays the Same

- `MaterialOverridesTab` in `CharacteristicConfigTabs` — unchanged. That tab is
  where per-characteristic overrides are configured. The Materials tab in
  Configuration manages the material catalog.
- All backend APIs — no changes needed
- Material class/material data model — unchanged
- Materials remains community edition (not commercial-gated)

### Files to Create/Modify

| File | Action |
|------|--------|
| `pages/ConfigurationView.tsx` | Add tab bar, conditional rendering for materials view |
| `components/materials/MaterialTreeManager.tsx` | Rewrite to match hierarchy tree pattern |
| `components/materials/MaterialTree.tsx` | New: recursive tree component (mirrors HierarchyTree) |
| `components/materials/MaterialClassDetail.tsx` | New: class detail panel with materials table + used-by |
| `components/materials/MaterialDetail.tsx` | New: material detail panel with used-by |
| `components/materials/MaterialSettings.tsx` | Delete |
| `pages/SettingsView.tsx` | Remove materials tab/route |
| `App.tsx` | Remove `/settings/materials` route |
| `stores/configStore.ts` | Add material tree state (selectedMaterialId, expandedClassIds) |

### Visual Style

Follow Cassini UI design system:
- Tree nodes use `bg-primary/10` for selection highlight
- Class nodes: `FolderTree` icon (Lucide), material nodes: `Package` icon
- Count badges: `text-xs text-muted-foreground` pill
- Hover actions: icons appear on hover with `text-muted-foreground hover:text-foreground`
- Used-by links: `text-sm text-primary hover:underline` with hierarchy breadcrumb format
- Tab bar: matches `CharacteristicConfigTabs` styling (border-b, active underline)
