# Phase 3.1: Bug Fixes & UX Foundation

## Overview
Fix critical bugs and establish UX foundation before major feature work.

## Tasks

### 3.1.1 Toast Notification Enhancement
- Ensure all CRUD operations show success/error toasts
- Add loading states with spinners
- Consistent messaging patterns

### 3.1.2 Mode Change Bug Fix
- Allow mode switching without recalculation when sample_count = 0
- Only require recalculation when samples exist and limits would change

### 3.1.3 Configuration Page Selection Sync
- Sync tree selection when characteristic is selected
- Visual highlight in tree for current characteristic

### 3.1.4 Delete Operations
- Add delete endpoints with cascade rules
- Add confirmation dialogs
- Handle nodes with children

### 3.1.5 Enhanced Mode Tooltips
- Add help content for subgroup modes
- Z-score explanation
- UCL/LCL interpretation per mode

## Files to Modify

### Frontend
- `frontend/src/api/client.ts` - Add toast wrappers
- `frontend/src/components/CharacteristicForm.tsx` - Mode change logic
- `frontend/src/stores/configStore.ts` - Selection sync
- `frontend/src/components/HierarchyTree.tsx` - Highlight logic
- `frontend/src/lib/help-content.ts` - New tooltips

### Backend
- `backend/src/openspc/api/v1/characteristics.py` - Delete endpoint, mode change fix
- `backend/src/openspc/api/v1/hierarchy.py` - Delete endpoint

## Acceptance Criteria
- [ ] All save operations show success toast
- [ ] All errors show error toast with message
- [ ] Can change mode with 0 samples without recalculation prompt
- [ ] Selecting characteristic highlights tree node
- [ ] Can delete characteristics (with confirmation)
- [ ] Can delete empty hierarchy nodes (with confirmation)
- [ ] Mode tooltips explain Z-score and limit interpretation
