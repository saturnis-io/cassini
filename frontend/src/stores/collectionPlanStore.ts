import { create } from 'zustand'

export interface CollectionPlanItemState {
  id: number
  characteristic_id: number
  characteristic_name: string | null
  hierarchy_path: string | null
  sequence_order: number
  instructions: string | null
  required: boolean
  usl: number | null
  lsl: number | null
  target_value: number | null
  subgroup_size: number
}

export type ItemResult = 'pending' | 'completed' | 'skipped'

interface CollectionPlanExecutionState {
  /** Whether the executor UI is currently open */
  isExecuting: boolean

  /** The plan being executed */
  planId: number | null
  planName: string | null

  /** Server-side execution ID (from POST /execute) */
  executionId: number | null

  /** Items in the plan with their specs */
  items: CollectionPlanItemState[]

  /** Current item index in the sequence */
  currentItemIndex: number

  /** Result status per item (indexed by item id) */
  itemResults: Record<number, ItemResult>

  /** Number of completed measurements */
  completedCount: number

  /** Number of skipped measurements */
  skippedCount: number

  /** Start the execution workflow */
  startExecution: (
    planId: number,
    planName: string,
    executionId: number,
    items: CollectionPlanItemState[],
  ) => void

  /** Mark current item as completed and advance */
  completeCurrentItem: () => void

  /** Skip current item and advance */
  skipCurrentItem: () => void

  /** Go to a specific item index (for review/navigation) */
  goToItem: (index: number) => void

  /** End the execution (completed or abandoned) */
  finishExecution: () => void

  /** Reset state completely */
  reset: () => void
}

export const useCollectionPlanStore = create<CollectionPlanExecutionState>((set, get) => ({
  isExecuting: false,
  planId: null,
  planName: null,
  executionId: null,
  items: [],
  currentItemIndex: 0,
  itemResults: {},
  completedCount: 0,
  skippedCount: 0,

  startExecution: (planId, planName, executionId, items) => {
    const initialResults: Record<number, ItemResult> = {}
    for (const item of items) {
      initialResults[item.id] = 'pending'
    }
    set({
      isExecuting: true,
      planId,
      planName,
      executionId,
      items,
      currentItemIndex: 0,
      itemResults: initialResults,
      completedCount: 0,
      skippedCount: 0,
    })
  },

  completeCurrentItem: () => {
    const { items, currentItemIndex, itemResults, completedCount } = get()
    if (currentItemIndex >= items.length) return

    const currentItem = items[currentItemIndex]
    const newResults = {
      ...itemResults,
      [currentItem.id]: 'completed' as ItemResult,
    }
    const nextIndex = currentItemIndex + 1

    set({
      itemResults: newResults,
      completedCount: completedCount + 1,
      currentItemIndex: nextIndex,
    })
  },

  skipCurrentItem: () => {
    const { items, currentItemIndex, itemResults, skippedCount } = get()
    if (currentItemIndex >= items.length) return

    const currentItem = items[currentItemIndex]
    const newResults = {
      ...itemResults,
      [currentItem.id]: 'skipped' as ItemResult,
    }
    const nextIndex = currentItemIndex + 1

    set({
      itemResults: newResults,
      skippedCount: skippedCount + 1,
      currentItemIndex: nextIndex,
    })
  },

  goToItem: (index) => {
    const { items } = get()
    if (index >= 0 && index < items.length) {
      set({ currentItemIndex: index })
    }
  },

  finishExecution: () => {
    set({ isExecuting: false })
  },

  reset: () => {
    set({
      isExecuting: false,
      planId: null,
      planName: null,
      executionId: null,
      items: [],
      currentItemIndex: 0,
      itemResults: {},
      completedCount: 0,
      skippedCount: 0,
    })
  },
}))
