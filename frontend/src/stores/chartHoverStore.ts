import { create } from 'zustand'

export interface HoveredSamples {
  characteristicId: number
  /** Set of sample_id values being hovered (stable database identifiers) */
  sampleIds: Set<number>
}

interface ChartHoverState {
  /** Currently hovered samples info */
  hoveredSamples: HoveredSamples | null
  /** Pending rAF handle for throttling */
  _rafHandle: number | null
  /**
   * Broadcast a hover event to all listening charts.
   * Throttled to one update per animation frame.
   */
  broadcastHover: (characteristicId: number, sampleIds: number[] | null) => void
  /**
   * Get the set of hovered sample IDs for a characteristic.
   */
  getHoveredSampleIds: (characteristicId: number) => Set<number> | null
}

export const useChartHoverStore = create<ChartHoverState>((set, get) => ({
  hoveredSamples: null,
  _rafHandle: null,

  broadcastHover: (characteristicId, sampleIds) => {
    const current = get()._rafHandle
    if (current != null) {
      cancelAnimationFrame(current)
    }
    const handle = requestAnimationFrame(() => {
      if (sampleIds === null || sampleIds.length === 0) {
        set({ hoveredSamples: null, _rafHandle: null })
      } else {
        set({
          hoveredSamples: { characteristicId, sampleIds: new Set(sampleIds) },
          _rafHandle: null,
        })
      }
    })
    set({ _rafHandle: handle })
  },

  getHoveredSampleIds: (characteristicId) => {
    const { hoveredSamples } = get()
    if (hoveredSamples?.characteristicId === characteristicId) {
      return hoveredSamples.sampleIds
    }
    return null
  },
}))

/**
 * Hook for charts to easily participate in cross-chart highlighting.
 * Drop-in replacement for the old useChartHoverSync from ChartHoverContext.
 *
 * Uses Zustand selectors so only the subscribing component re-renders
 * when its own characteristic's hover state changes.
 */
export function useChartHoverSync(characteristicId: number) {
  const hoveredSampleIds = useChartHoverStore((s) =>
    s.hoveredSamples?.characteristicId === characteristicId
      ? s.hoveredSamples.sampleIds
      : null,
  )
  const broadcastHover = useChartHoverStore((s) => s.broadcastHover)

  const onHoverSample = (sampleIds: number | number[]) => {
    const ids = Array.isArray(sampleIds) ? sampleIds : [sampleIds]
    broadcastHover(characteristicId, ids)
  }

  const onLeaveSample = () => {
    broadcastHover(characteristicId, null)
  }

  return {
    /** Set of currently hovered sample IDs for this characteristic */
    hoveredSampleIds,
    /** Call when hovering sample(s): onHoverSample(sampleId) or onHoverSample([id1, id2]) */
    onHoverSample,
    /** Call when mouse leaves: onLeaveSample() */
    onLeaveSample,
    /** Check if a specific sample_id is highlighted */
    isHighlighted: (sampleId: number) => hoveredSampleIds?.has(sampleId) ?? false,
  }
}
