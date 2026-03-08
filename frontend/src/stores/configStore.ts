import { create } from 'zustand'

interface ConfigState {
  // Tree selection
  selectedNodeId: number | null
  expandedNodeIds: Set<number>
  setSelectedNodeId: (id: number | null) => void
  toggleNodeExpanded: (id: number) => void
  setExpandedNodeIds: (ids: number[]) => void

  // Form state
  isDirty: boolean
  setIsDirty: (dirty: boolean) => void

  // Edit mode
  editingCharacteristicId: number | null
  setEditingCharacteristicId: (id: number | null) => void
  isCreatingNew: boolean
  setIsCreatingNew: (creating: boolean) => void

  // UI preferences
  showAdvancedOptions: boolean
  setShowAdvancedOptions: (show: boolean) => void

  // Config view tab (Characteristics vs Materials)
  configView: 'characteristics' | 'materials'
  setConfigView: (view: 'characteristics' | 'materials') => void

  // Material tree state
  selectedMaterialClassId: number | null
  selectedMaterialId: number | null
  expandedClassIds: Set<number>
  materialFormMode: 'view' | 'add-class' | 'add-material'
  materialFormParentId: number | null

  setSelectedMaterialClassId: (id: number | null) => void
  setSelectedMaterialId: (id: number | null) => void
  toggleClassExpanded: (id: number) => void
  setMaterialFormMode: (
    mode: 'view' | 'add-class' | 'add-material',
    parentId?: number | null,
  ) => void
  resetMaterialSelection: () => void

  // Reset for plant change
  resetForPlantChange: () => void
}

export const useConfigStore = create<ConfigState>((set) => ({
  // Tree selection
  selectedNodeId: null,
  expandedNodeIds: new Set(),
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
  toggleNodeExpanded: (id) =>
    set((state) => {
      const newSet = new Set(state.expandedNodeIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return { expandedNodeIds: newSet }
    }),
  setExpandedNodeIds: (ids) => set({ expandedNodeIds: new Set(ids) }),

  // Form state
  isDirty: false,
  setIsDirty: (dirty) => set({ isDirty: dirty }),

  // Edit mode
  editingCharacteristicId: null,
  setEditingCharacteristicId: (id) => set({ editingCharacteristicId: id }),
  isCreatingNew: false,
  setIsCreatingNew: (creating) => set({ isCreatingNew: creating }),

  // UI preferences
  showAdvancedOptions: false,
  setShowAdvancedOptions: (show) => set({ showAdvancedOptions: show }),

  // Config view tab
  configView: 'characteristics',
  setConfigView: (view) => set({ configView: view }),

  // Material tree state
  selectedMaterialClassId: null,
  selectedMaterialId: null,
  expandedClassIds: new Set(),
  materialFormMode: 'view',
  materialFormParentId: null,

  setSelectedMaterialClassId: (id) =>
    set({ selectedMaterialClassId: id, selectedMaterialId: null, materialFormMode: 'view' }),
  setSelectedMaterialId: (id) =>
    set({ selectedMaterialId: id, selectedMaterialClassId: null, materialFormMode: 'view' }),
  toggleClassExpanded: (id) =>
    set((state) => {
      const newSet = new Set(state.expandedClassIds)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return { expandedClassIds: newSet }
    }),
  setMaterialFormMode: (mode, parentId = null) =>
    set({ materialFormMode: mode, materialFormParentId: parentId }),
  resetMaterialSelection: () =>
    set({
      selectedMaterialClassId: null,
      selectedMaterialId: null,
      expandedClassIds: new Set(),
      materialFormMode: 'view',
      materialFormParentId: null,
    }),

  // Reset for plant change
  resetForPlantChange: () =>
    set({
      selectedNodeId: null,
      expandedNodeIds: new Set(),
      editingCharacteristicId: null,
      isCreatingNew: false,
      isDirty: false,
      configView: 'characteristics',
      selectedMaterialClassId: null,
      selectedMaterialId: null,
      expandedClassIds: new Set(),
      materialFormMode: 'view',
      materialFormParentId: null,
    }),
}))
