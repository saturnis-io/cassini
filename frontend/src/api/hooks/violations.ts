import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { violationApi } from '../quality.api'
import { queryKeys, VIOLATION_STATS_REFETCH_MS } from './queryKeys'

/** Invalidate all queries affected by violation status changes */
function invalidateViolationDependents(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.violations.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
  queryClient.invalidateQueries({ queryKey: queryKeys.hierarchy.all })
  // Invalidate chartData so galaxy scene updates moon colors/sparks after ack
  queryClient.invalidateQueries({ queryKey: [...queryKeys.characteristics.all, 'chartData'] })
}

// Violation hooks
export function useViolations(params?: Parameters<typeof violationApi.list>[0]) {
  return useQuery({
    queryKey: queryKeys.violations.list(params),
    queryFn: () => violationApi.list(params),
  })
}

export function useViolationStats(config?: {
  refetchInterval?: number | false
  plant_id?: number
}) {
  const params = config?.plant_id ? { plant_id: config.plant_id } : undefined
  return useQuery({
    queryKey: queryKeys.violations.stats(params),
    queryFn: () => violationApi.getStats(params),
    refetchInterval: config?.refetchInterval ?? VIOLATION_STATS_REFETCH_MS,
  })
}

export function useAcknowledgeViolation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, reason, user }: { id: number; reason: string; user: string }) =>
      violationApi.acknowledge(id, { reason, user }),
    onMutate: async ({ id, reason, user }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.violations.all })
      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.violations.all })
      queryClient.setQueriesData({ queryKey: queryKeys.violations.all }, (old: unknown) => {
        const data = old as { items?: Array<Record<string, unknown>> } | undefined
        if (!data?.items) return old
        return {
          ...data,
          items: data.items.map((v) =>
            v.id === id
              ? {
                  ...v,
                  acknowledged: true,
                  ack_user: user,
                  ack_reason: reason,
                  ack_timestamp: new Date().toISOString(),
                }
              : v,
          ),
        }
      })
      return { previousLists }
    },
    onError: (error: Error, _, context) => {
      if (context?.previousLists) {
        context.previousLists.forEach(([key, data]: [unknown, unknown]) => {
          queryClient.setQueryData(key as readonly unknown[], data)
        })
      }
      toast.error(`Failed to acknowledge: ${error.message}`)
    },
    onSuccess: () => {
      toast.success('Violation acknowledged')
    },
    onSettled: () => {
      invalidateViolationDependents(queryClient)
    },
  })
}

export function useBatchAcknowledgeViolation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      violation_ids: number[]
      reason: string
      user: string
      exclude_sample?: boolean
    }) => violationApi.batchAcknowledge(data),
    onSuccess: (data) => {
      if (data.failed > 0) {
        toast.warning(`${data.successful} acknowledged, ${data.failed} failed`)
      } else {
        toast.success(
          `${data.successful} violation${data.successful !== 1 ? 's' : ''} acknowledged`,
        )
      }
      // Invalidate in onSuccess (before mutate-level onSuccess closes the dialog)
      // so the query cache is refreshed while the component is still mounted
      invalidateViolationDependents(queryClient)
    },
    onError: (error: Error) => {
      toast.error(`Bulk acknowledge failed: ${error.message}`)
    },
  })
}

export function useReasonCodes() {
  return useQuery({
    queryKey: ['violations', 'reason-codes'] as const,
    queryFn: () => violationApi.getReasonCodes(),
    staleTime: Infinity,
  })
}
