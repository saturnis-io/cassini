/**
 * ChartHoverContext - Cross-chart hover synchronization using sample IDs
 *
 * Provides a pub/sub mechanism for charts to broadcast and listen to hover events.
 * When a user hovers over a data point in any chart, all other charts showing the
 * same characteristic will highlight the corresponding point(s).
 *
 * Uses sample_id (stable database identifier) instead of array indices to ensure
 * correct alignment across chart types with different data array lengths (e.g.,
 * MR chart has N-1 points, histogram bins contain multiple samples).
 *
 * Usage:
 * 1. Wrap your app/dashboard with <ChartHoverProvider>
 * 2. In charts, use useChartHoverSync(characteristicId) hook to:
 *    - Call onHoverSample([sampleId1, sampleId2, ...]) on mouse enter
 *    - Call onLeaveSample() on mouse leave
 *    - Use hoveredSampleIds.has(sampleId) to check if a point should be highlighted
 */

import { createContext, useContext, useState, useCallback, useMemo, useRef, type ReactNode } from 'react'

export interface HoveredSamples {
  characteristicId: number
  /** Set of sample_id values being hovered (stable database identifiers) */
  sampleIds: Set<number>
}

interface ChartHoverContextValue {
  /** Currently hovered samples info */
  hoveredSamples: HoveredSamples | null
  /**
   * Broadcast a hover event to all listening charts.
   * @param characteristicId - The characteristic being hovered
   * @param sampleIds - Array of sample_id values being hovered, or null to clear
   */
  broadcastHover: (characteristicId: number, sampleIds: number[] | null) => void
  /**
   * Get the set of hovered sample IDs for a characteristic.
   * @param characteristicId - The characteristic to check
   * @returns Set of hovered sample_ids, or null if none
   */
  getHoveredSampleIds: (characteristicId: number) => Set<number> | null
}

const ChartHoverContext = createContext<ChartHoverContextValue | null>(null)

interface ChartHoverProviderProps {
  children: ReactNode
}

export function ChartHoverProvider({ children }: ChartHoverProviderProps) {
  const [hoveredSamples, setHoveredSamples] = useState<HoveredSamples | null>(null)
  const rafRef = useRef<number | null>(null)

  const broadcastHover = useCallback((
    characteristicId: number,
    sampleIds: number[] | null
  ) => {
    // Throttle hover updates to one per animation frame to prevent
    // cascading re-renders at 60fps mouse events
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      if (sampleIds === null || sampleIds.length === 0) {
        setHoveredSamples(null)
      } else {
        setHoveredSamples({ characteristicId, sampleIds: new Set(sampleIds) })
      }
    })
  }, [])

  const getHoveredSampleIds = useCallback((characteristicId: number): Set<number> | null => {
    if (hoveredSamples?.characteristicId === characteristicId) {
      return hoveredSamples.sampleIds
    }
    return null
  }, [hoveredSamples])

  const value = useMemo(() => ({
    hoveredSamples,
    broadcastHover,
    getHoveredSampleIds,
  }), [hoveredSamples, broadcastHover, getHoveredSampleIds])

  return (
    <ChartHoverContext.Provider value={value}>
      {children}
    </ChartHoverContext.Provider>
  )
}

/**
 * Hook to access chart hover context for cross-chart highlighting.
 * Must be used within a ChartHoverProvider.
 */
export function useChartHover(): ChartHoverContextValue {
  const context = useContext(ChartHoverContext)
  if (!context) {
    throw new Error('useChartHover must be used within a ChartHoverProvider')
  }
  return context
}

/**
 * Hook for charts to easily participate in cross-chart highlighting.
 * Provides hover state and broadcast function for a specific characteristic.
 *
 * Uses sample_id (stable database identifier) instead of array indices to ensure
 * correct alignment across chart types.
 *
 * @param characteristicId - The characteristic this chart displays
 * @returns Object with hover state and handlers
 */
export function useChartHoverSync(characteristicId: number) {
  const { broadcastHover, getHoveredSampleIds } = useChartHover()

  const hoveredSampleIds = getHoveredSampleIds(characteristicId)

  const onHoverSample = useCallback((sampleIds: number | number[]) => {
    const ids = Array.isArray(sampleIds) ? sampleIds : [sampleIds]
    broadcastHover(characteristicId, ids)
  }, [broadcastHover, characteristicId])

  const onLeaveSample = useCallback(() => {
    broadcastHover(characteristicId, null)
  }, [broadcastHover, characteristicId])

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
