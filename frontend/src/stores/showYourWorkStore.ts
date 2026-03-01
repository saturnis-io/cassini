import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ExplainChartOptions } from '@/api/explain.api'

interface ShowYourWorkState {
  /** Whether Show Your Work mode is enabled */
  enabled: boolean
  /** Currently selected metric for the explanation panel */
  activeMetric: {
    type: string
    resourceId: string
    resourceType: 'capability' | 'msa' | 'control-limits' | 'attribute'
    chartOptions?: ExplainChartOptions
  } | null
  /** Toggle the mode on/off */
  toggle: () => void
  /** Open the explanation panel for a specific metric */
  openExplanation: (
    type: string,
    resourceId: string,
    resourceType?: 'capability' | 'msa' | 'control-limits' | 'attribute',
    chartOptions?: ExplainChartOptions,
  ) => void
  /** Close the explanation panel */
  close: () => void
}

export const useShowYourWorkStore = create<ShowYourWorkState>()(
  persist(
    (set) => ({
      enabled: false,
      activeMetric: null,

      toggle: () => set((s) => ({ enabled: !s.enabled, activeMetric: null })),

      openExplanation: (type, resourceId, resourceType = 'capability', chartOptions) =>
        set({ activeMetric: { type, resourceId, resourceType, chartOptions } }),

      close: () => set({ activeMetric: null }),
    }),
    {
      name: 'cassini-show-your-work',
      partialize: (state) => ({ enabled: state.enabled }),
    },
  ),
)
