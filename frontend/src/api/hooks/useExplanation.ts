import { useQuery } from '@tanstack/react-query'
import { explainApi } from '../explain.api'
import type { ExplainChartOptions } from '../explain.api'
import { queryKeys } from './queryKeys'

export function useExplanation(
  metricType: string | null,
  resourceId: string | null,
  resourceType: 'capability' | 'msa' | 'control-limits' | 'attribute' = 'capability',
  chartOptions?: ExplainChartOptions,
) {
  return useQuery({
    queryKey:
      resourceType === 'msa'
        ? queryKeys.explain.msa(metricType ?? '', resourceId ?? '')
        : resourceType === 'control-limits'
          ? queryKeys.explain.controlLimits(metricType ?? '', resourceId ?? '')
          : resourceType === 'attribute'
            ? queryKeys.explain.attribute(metricType ?? '', resourceId ?? '')
            : queryKeys.explain.capability(metricType ?? '', resourceId ?? '', chartOptions),
    queryFn: () => {
      switch (resourceType) {
        case 'msa':
          return explainApi.getMSAExplanation(metricType!, resourceId!)
        case 'control-limits':
          return explainApi.getControlLimitsExplanation(metricType!, resourceId!)
        case 'attribute':
          return explainApi.getAttributeExplanation(metricType!, resourceId!)
        default:
          return explainApi.getCapabilityExplanation(metricType!, resourceId!, chartOptions)
      }
    },
    enabled: !!metricType && !!resourceId,
    staleTime: Infinity,
  })
}
