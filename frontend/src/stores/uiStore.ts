import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Role } from '@/lib/roles'

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
  selectedPlantId: string | null
  setSelectedPlantId: (id: string | null) => void

  // Role state (mock for development)
  currentRole: Role
  setCurrentRole: (role: Role) => void
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

      // Plant context
      selectedPlantId: null,
      setSelectedPlantId: (id) => set({ selectedPlantId: id }),

      // Role - default to operator
      currentRole: 'operator',
      setCurrentRole: (role) => set({ currentRole: role }),
    }),
    {
      name: 'openspc-ui',
      partialize: (state) => ({
        sidebarState: state.sidebarState,
        selectedPlantId: state.selectedPlantId,
        currentRole: state.currentRole,
      }),
    }
  )
)
