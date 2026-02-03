import { create } from 'zustand'
import type { Violation } from '@/types'

interface DashboardState {
  // Selected characteristic for viewing
  selectedCharacteristicId: number | null
  setSelectedCharacteristicId: (id: number | null) => void

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
}

export const useDashboardStore = create<DashboardState>((set) => ({
  // Selected characteristic
  selectedCharacteristicId: null,
  setSelectedCharacteristicId: (id) => set({ selectedCharacteristicId: id }),

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
}))
