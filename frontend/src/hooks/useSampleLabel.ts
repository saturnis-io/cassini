import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { formatSampleRef } from '@/lib/display-key'

/**
 * Returns a function that resolves a sample_id to a formatted display key
 * by reading from the React Query chart data cache.
 *
 * Usage:
 *   const getSampleLabel = useSampleLabel(characteristicId)
 *   getSampleLabel(315)       // → "260304-042" (formatted per user prefs)
 *   getSampleLabel(null)      // → null
 *   getSampleLabel(999)       // → "#999" (not in cache, numeric fallback)
 */
export function useSampleLabel(characteristicId: number | null) {
  const queryClient = useQueryClient()

  return useCallback(
    (sampleId: number | null): string | null => {
      if (sampleId == null || !characteristicId) return null

      // Search cached chart data for this characteristic (any filter variant)
      const queries = queryClient.getQueriesData<{
        data_points?: Array<{ sample_id: number; display_key: string }>
      }>({ queryKey: ['characteristics', 'chartData', characteristicId] })

      for (const [, data] of queries) {
        if (!data?.data_points) continue
        const pt = data.data_points.find((p) => p.sample_id === sampleId)
        if (pt?.display_key) return formatSampleRef(sampleId, pt.display_key)
      }

      return formatSampleRef(sampleId)
    },
    [characteristicId, queryClient],
  )
}
