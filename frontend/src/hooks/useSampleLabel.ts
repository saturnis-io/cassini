import { useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatSampleRef } from '@/lib/display-key'

/**
 * Returns a function that resolves a sample_id to a formatted display key
 * by reading from the React Query chart data cache.
 *
 * Internally builds a Map<sample_id, display_key> from cached data so
 * individual lookups are O(1) instead of linear scans.
 *
 * Usage:
 *   const getSampleLabel = useSampleLabel(characteristicId)
 *   getSampleLabel(315)       // → "260304-042" (formatted per user prefs)
 *   getSampleLabel(null)      // → null
 *   getSampleLabel(999)       // → "#999" (not in cache, numeric fallback)
 */
export function useSampleLabel(characteristicId: number | null) {
  const queryClient = useQueryClient()

  // Build a lookup map once from all cached chart data variants
  const lookupMap = useMemo(() => {
    const map = new Map<number, string>()
    if (!characteristicId) return map

    const queries = queryClient.getQueriesData<{
      data_points?: Array<{ sample_id: number; display_key: string }>
    }>({ queryKey: ['characteristics', 'chartData', characteristicId] })

    for (const [, data] of queries) {
      if (!data?.data_points) continue
      for (const pt of data.data_points) {
        if (pt.display_key && !map.has(pt.sample_id)) {
          map.set(pt.sample_id, pt.display_key)
        }
      }
    }
    return map
    // queryClient is stable; re-derive when characteristicId changes.
    // Cache data updates trigger re-renders via useQuery consumers, which
    // causes this memo to re-run via the new render cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characteristicId, queryClient])

  return useCallback(
    (sampleId: number | null): string | null => {
      if (sampleId == null || !characteristicId) return null
      const displayKey = lookupMap.get(sampleId)
      return formatSampleRef(sampleId, displayKey)
    },
    [characteristicId, lookupMap],
  )
}
