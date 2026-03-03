import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GuidanceState {
  dismissedHints: string[]
  dismissHint: (id: string) => void
  isHintDismissed: (id: string) => boolean
  resetHints: () => void
}

export const useGuidanceStore = create<GuidanceState>()(
  persist(
    (set, get) => ({
      dismissedHints: [],
      dismissHint: (id) =>
        set((s) => ({
          dismissedHints: s.dismissedHints.includes(id)
            ? s.dismissedHints
            : [...s.dismissedHints, id],
        })),
      isHintDismissed: (id) => get().dismissedHints.includes(id),
      resetHints: () => set({ dismissedHints: [] }),
    }),
    {
      name: 'cassini-guidance',
      partialize: (state) => ({ dismissedHints: state.dismissedHints }),
    },
  ),
)
