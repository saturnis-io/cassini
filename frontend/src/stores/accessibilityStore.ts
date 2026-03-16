import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AccessibilityState {
  /** Whether touch-optimized mode is active (larger targets, spacing) */
  touchMode: boolean
  setTouchMode: (enabled: boolean) => void
  toggleTouchMode: () => void
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      touchMode: false,
      setTouchMode: (enabled) => set({ touchMode: enabled }),
      toggleTouchMode: () => set((prev) => ({ touchMode: !prev.touchMode })),
    }),
    {
      name: 'cassini-touch-mode',
    },
  ),
)
