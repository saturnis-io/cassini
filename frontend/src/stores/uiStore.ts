import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Sidebar display state
 * - expanded: Full width with labels (240px)
 * - collapsed: Icons only (60px)
 * - hidden: Not visible (mobile overlay mode)
 */
export type SidebarState = 'expanded' | 'collapsed' | 'hidden'

interface UIState {
  // Sidebar state
  sidebarState: SidebarState
  setSidebarState: (state: SidebarState) => void
  toggleSidebar: () => void

  // Plant context (ID only, provider manages full plant object)
  selectedPlantId: number | null
  setSelectedPlantId: (id: number | null) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Sidebar - default to expanded
      sidebarState: 'expanded',
      setSidebarState: (state) => set({ sidebarState: state }),
      toggleSidebar: () =>
        set((prev) => ({
          sidebarState: prev.sidebarState === 'expanded' ? 'collapsed' : 'expanded',
        })),

      // Plant context - handle legacy string values during migration
      selectedPlantId: null,
      setSelectedPlantId: (id) => {
        // Handle legacy string values that might be in localStorage
        const numericId = typeof id === 'string' ? parseInt(id, 10) : id
        set({ selectedPlantId: isNaN(numericId as number) ? null : numericId })
      },
    }),
    {
      name: 'openspc-ui',
      partialize: (state) => ({
        sidebarState: state.sidebarState,
        selectedPlantId: state.selectedPlantId,
      }),
    }
  )
)
