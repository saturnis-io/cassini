import { useQuery } from '@tanstack/react-query'
import { explainApi } from '../explain.api'
import { queryKeys } from './queryKeys'

export function useExplanation(
  metricType: string | null,
  resourceId: string | null,
  resourceType: 'capability' | 'msa' = 'capability',
) {
  return useQuery({
    queryKey: queryKeys.explain.capability(metricType ?? '', resourceId ?? ''),
    queryFn: () => {
      if (resourceType === 'capability') {
        return explainApi.getCapabilityExplanation(metricType!, resourceId!)
      }
      // MSA support added in Phase 2
      return explainApi.getCapabilityExplanation(metricType!, resourceId!)
    },
    enabled: !!metricType && !!resourceId,
    staleTime: Infinity,
  })
}
