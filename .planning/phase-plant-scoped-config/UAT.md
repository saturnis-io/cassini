# Phase plant-scoped-config User Acceptance Testing

## Test Date
2026-02-05

## UAT Checklist

### 1. Plant Management
- [x] Navigate to Settings view
- [x] Verify Plant Management section is visible
- [x] Create a new plant with name, code, and settings
- [x] Edit an existing plant
- [x] Deactivate a plant
- [x] Verify plant list shows active/inactive status

### 2. Plant Selector
- [x] Verify plant selector appears in the sidebar/header
- [x] Select a different plant
- [x] Confirm the selection persists on page refresh
- [x] Verify plants load from API (not mock data)

### 3. Hierarchy Scoping
- [x] Select Plant A
- [x] Navigate to Configuration/Hierarchy view
- [x] Create a hierarchy node in Plant A
- [x] Select Plant B
- [x] Verify the hierarchy from Plant A is NOT visible
- [x] Create a hierarchy node in Plant B
- [x] Switch back to Plant A and verify only Plant A hierarchies are visible

### 4. Dashboard Scoping
- [x] Dashboard shows only selected plant's characteristics
- [x] Switching plants clears selection and shows new plant's data
- [x] Empty plant shows empty hierarchy list

### 5. Data Isolation
- [x] Create a characteristic under Plant A hierarchy
- [x] Switch to Plant B
- [x] Verify the characteristic is not visible
- [x] Configuration view shows empty for new plant

## Requirements Tested

| Requirement | Acceptance Criteria | Result |
|-------------|---------------------|--------|
| FR-1: Characteristic hierarchy isolated per plant | Hierarchies only visible within their plant | **PASSED** |
| FR-2: Screens scoped for the selected plant | All views filter by current plant | **PASSED** |
| FR-3: Per-site data connectivity settings | Broker configs scoped to plant | DEFERRED |
| NFR-1: Data migration to Default Plant | Existing data assigned to Default Plant | **PASSED** |
| NFR-2: No regressions in existing functionality | All existing features work within plant context | **PASSED** |

## User Verification

- **Tested by**: CEO
- **Date**: 2026-02-05
- **Status**: **PASSED**

## Notes

UAT revealed several issues that were fixed during testing:
1. PlantSettings missing edit button and deactivate toggle - Fixed
2. Plant selection not triggering data reload - Fixed (query invalidation)
3. Dashboard not scoped to plant - Fixed (HierarchyTodoList now plant-scoped)
4. Configuration view showing wrong plant's data - Fixed

All issues were resolved and verified by CEO.

---

## Sign-off

**Phase plant-scoped-config UAT: APPROVED**

CEO confirmed: "This works, thank you"
