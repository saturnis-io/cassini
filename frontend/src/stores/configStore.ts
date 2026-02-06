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

  // Reset for plant change
  resetForPlantChange: () => set({
    selectedNodeId: null,
    expandedNodeIds: new Set(),
    editingCharacteristicId: null,
    isCreatingNew: false,
    isDirty: false,
  }),
}))
