import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Violation } from '@/types'
import type { ChartTypeId } from '@/types/charts'

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

  // Multi-select for reporting
  selectedCharacteristicIds: Set<number>
  isMultiSelectMode: boolean
  toggleCharacteristicSelection: (id: number) => void
  selectAllCharacteristics: (ids: number[]) => void
  deselectAllCharacteristics: (ids: number[]) => void
  clearSelection: () => void
  setMultiSelectMode: (enabled: boolean) => void

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

  // Chart type selection (per characteristic)
  chartTypes: Map<number, ChartTypeId>
  setChartType: (characteristicId: number, chartType: ChartTypeId) => void
  getChartType: (characteristicId: number) => ChartTypeId
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

  // Multi-select for reporting
  selectedCharacteristicIds: new Set<number>(),
  isMultiSelectMode: false,
  toggleCharacteristicSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedCharacteristicIds)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return { selectedCharacteristicIds: next }
    }),
  selectAllCharacteristics: (ids) =>
    set((state) => {
      const next = new Set(state.selectedCharacteristicIds)
      ids.forEach((id) => next.add(id))
      return { selectedCharacteristicIds: next }
    }),
  deselectAllCharacteristics: (ids) =>
    set((state) => {
      const next = new Set(state.selectedCharacteristicIds)
      ids.forEach((id) => next.delete(id))
      return { selectedCharacteristicIds: next }
    }),
  clearSelection: () => set({ selectedCharacteristicIds: new Set() }),
  setMultiSelectMode: (enabled) => set({
    isMultiSelectMode: enabled,
    selectedCharacteristicIds: enabled ? new Set() : new Set()
  }),

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

  // Chart type selection (per characteristic)
  chartTypes: new Map<number, ChartTypeId>(),
  setChartType: (characteristicId, chartType) =>
    set((state) => {
      const newMap = new Map(state.chartTypes)
      newMap.set(characteristicId, chartType)
      return { chartTypes: newMap }
    }),
  getChartType: (_characteristicId) => {
    // This is a selector, not state - will be used via useDashboardStore.getState()
    return 'xbar' as ChartTypeId
  },
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
