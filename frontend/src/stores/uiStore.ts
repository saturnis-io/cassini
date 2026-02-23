import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Sidebar display state
 * - expanded: Full width with labels (default 260px, resizable 200–450px)
 * - collapsed: Icons only (56px)
 * - hidden: Not visible (mobile overlay mode)
 */
export type SidebarState = 'expanded' | 'collapsed' | 'hidden'

interface UIState {
  // Sidebar state (desktop)
  sidebarState: SidebarState
  setSidebarState: (state: SidebarState) => void
  toggleSidebar: () => void

  // Mobile sidebar overlay state
  mobileSidebarOpen: boolean
  setMobileSidebarOpen: (open: boolean) => void
  toggleMobileSidebar: () => void

  // Sidebar section collapse states
  navSectionCollapsed: boolean
  setNavSectionCollapsed: (collapsed: boolean) => void
  characteristicsPanelOpen: boolean
  setCharacteristicsPanelOpen: (open: boolean) => void

  // Sidebar resizable width (px)
  sidebarWidth: number
  setSidebarWidth: (width: number) => void

  // Offline awareness
  isOffline: boolean
  setIsOffline: (offline: boolean) => void

  // Plant context (ID only, provider manages full plant object)
  selectedPlantId: number | null
  setSelectedPlantId: (id: number | null) => void

  // Language / i18n
  language: string
  setLanguage: (lang: string) => void
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

      // Mobile sidebar - default to closed
      mobileSidebarOpen: false,
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      toggleMobileSidebar: () => set((prev) => ({ mobileSidebarOpen: !prev.mobileSidebarOpen })),

      // Nav section collapse — default expanded
      navSectionCollapsed: false,
      setNavSectionCollapsed: (collapsed) => set({ navSectionCollapsed: collapsed }),

      // Characteristics panel — default expanded
      characteristicsPanelOpen: true,
      setCharacteristicsPanelOpen: (open) => set({ characteristicsPanelOpen: open }),

      // Sidebar width — clamped to [200, 450]
      sidebarWidth: 260,
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(450, width)) }),

      // Offline awareness
      isOffline: !navigator.onLine,
      setIsOffline: (offline) => set({ isOffline: offline }),

      // Plant context - handle legacy string values during migration
      selectedPlantId: null,
      setSelectedPlantId: (id) => {
        // Handle legacy string values that might be in localStorage
        const numericId = typeof id === 'string' ? parseInt(id, 10) : id
        set({ selectedPlantId: isNaN(numericId as number) ? null : numericId })
      },

      // Language / i18n
      language: 'en',
      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: 'openspc-ui',
      partialize: (state) => ({
        sidebarState: state.sidebarState,
        navSectionCollapsed: state.navSectionCollapsed,
        characteristicsPanelOpen: state.characteristicsPanelOpen,
        sidebarWidth: state.sidebarWidth,
        selectedPlantId: state.selectedPlantId,
        language: state.language,
      }),
    },
  ),
)
