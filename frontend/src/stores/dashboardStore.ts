import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Violation } from '@/types'

export type TimeRangeType = 'points' | 'duration' | 'custom'
export type HistogramPosition = 'below' | 'right' | 'hidden'

export interface TimeRangeOption {
  label: string
  type: TimeRangeType
  value: number | null  // points count or hours
}

export interface TimeRangeState {
  type: TimeRangeType
  pointsLimit: number | null
  hoursBack: number | null
  startDate: string | null
  endDate: string | null
}

interface DashboardState {
  // Selected characteristic for viewing
  selectedCharacteristicId: number | null
  setSelectedCharacteristicId: (id: number | null) => void

  // Time range selection
  timeRange: TimeRangeState
  setTimeRange: (range: TimeRangeState) => void

  // Input modal state
  inputModalOpen: boolean
  inputModalCharacteristicId: number | null
  openInputModal: (characteristicId: number) => void
  closeInputModal: () => void

  // Acknowledgment dialog state
  ackDialogOpen: boolean
  ackDialogViolation: Violation | null
  openAckDialog: (violation: Violation) => void
  closeAckDialog: () => void

  // Toast notifications
  pendingViolations: Violation[]
  addPendingViolation: (violation: Violation) => void
  removePendingViolation: (id: number) => void
  clearPendingViolations: () => void

  // Real-time updates cache
  latestSamples: Map<number, { mean: number; timestamp: string }>
  updateLatestSample: (characteristicId: number, mean: number, timestamp: string) => void

  // Connection status
  wsConnected: boolean
  setWsConnected: (connected: boolean) => void

  // Histogram position (below/right/hidden)
  histogramPosition: HistogramPosition
  setHistogramPosition: (position: HistogramPosition) => void

  // Spec limits visibility on charts
  showSpecLimits: boolean
  setShowSpecLimits: (show: boolean) => void

  // Comparison mode
  comparisonMode: boolean
  secondaryCharacteristicId: number | null
  setComparisonMode: (enabled: boolean) => void
  setSecondaryCharacteristicId: (id: number | null) => void
}

// Default time range: last 50 points
const defaultTimeRange: TimeRangeState = {
  type: 'points',
  pointsLimit: 50,
  hoursBack: null,
  startDate: null,
  endDate: null,
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
  // Selected characteristic
  selectedCharacteristicId: null,
  setSelectedCharacteristicId: (id) => set({ selectedCharacteristicId: id }),

  // Time range
  timeRange: defaultTimeRange,
  setTimeRange: (range) => set({ timeRange: range }),

  // Input modal
  inputModalOpen: false,
  inputModalCharacteristicId: null,
  openInputModal: (characteristicId) =>
    set({ inputModalOpen: true, inputModalCharacteristicId: characteristicId }),
  closeInputModal: () =>
    set({ inputModalOpen: false, inputModalCharacteristicId: null }),

  // Ack dialog
  ackDialogOpen: false,
  ackDialogViolation: null,
  openAckDialog: (violation) =>
    set({ ackDialogOpen: true, ackDialogViolation: violation }),
  closeAckDialog: () =>
    set({ ackDialogOpen: false, ackDialogViolation: null }),

  // Pending violations
  pendingViolations: [],
  addPendingViolation: (violation) =>
    set((state) => ({
      pendingViolations: [...state.pendingViolations, violation],
    })),
  removePendingViolation: (id) =>
    set((state) => ({
      pendingViolations: state.pendingViolations.filter((v) => v.id !== id),
    })),
  clearPendingViolations: () => set({ pendingViolations: [] }),

  // Latest samples cache
  latestSamples: new Map(),
  updateLatestSample: (characteristicId, mean, timestamp) =>
    set((state) => {
      const newMap = new Map(state.latestSamples)
      newMap.set(characteristicId, { mean, timestamp })
      return { latestSamples: newMap }
    }),

  // Connection status
  wsConnected: false,
  setWsConnected: (connected) => set({ wsConnected: connected }),

  // Histogram position
  histogramPosition: 'hidden',
  setHistogramPosition: (position) => set({ histogramPosition: position }),

  // Spec limits visibility
  showSpecLimits: true,
  setShowSpecLimits: (show) => set({ showSpecLimits: show }),

  // Comparison mode
  comparisonMode: false,
  secondaryCharacteristicId: null,
  setComparisonMode: (enabled) => set({
    comparisonMode: enabled,
    secondaryCharacteristicId: enabled ? null : null
  }),
  setSecondaryCharacteristicId: (id) => set({ secondaryCharacteristicId: id }),
    }),
    {
      name: 'openspc-dashboard',
      partialize: (state) => ({
        timeRange: state.timeRange,
        histogramPosition: state.histogramPosition,
        showSpecLimits: state.showSpecLimits,
      }),
    }
  )
)
