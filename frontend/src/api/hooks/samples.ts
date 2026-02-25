import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sampleApi } from '../characteristics.api'
import { queryKeys } from './queryKeys'

// Sample hooks
export function useSubmitSample() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sampleApi.submit,
    onSuccess: (data, variables) => {
      // Invalidate ALL chart data queries for this characteristic (regardless of limit/date params)
      // Use raw prefix key so it matches any chartData query for this ID, regardless of params
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.characteristics.all, 'chartData', variables.characteristic_id],
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.violations.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.characteristics.detail(variables.characteristic_id),
      })
      toast.success(`Sample recorded (ID: ${data.sample_id})`)
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit sample: ${error.message}`)
    },
  })
}

export function useSample(id: number) {
  return useQuery({
    queryKey: queryKeys.samples.detail(id),
    queryFn: () => sampleApi.get(id),
    enabled: id > 0,
  })
}

export function useSamples(params?: Parameters<typeof sampleApi.list>[0]) {
  return useQuery({
    queryKey: queryKeys.samples.list(params),
    queryFn: () => sampleApi.list(params),
    // Only fetch when a characteristic is selected
    enabled: params?.characteristic_id !== undefined,
  })
}

export function useExcludeSample() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, excluded }: { id: number; excluded: boolean }) =>
      sampleApi.exclude(id, excluded),
    onMutate: async ({ id, excluded }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.samples.all })
      const previousLists = queryClient.getQueriesData({ queryKey: queryKeys.samples.all })
      queryClient.setQueriesData({ queryKey: queryKeys.samples.all }, (old: unknown) => {
        const data = old as { items?: Array<Record<string, unknown>> } | undefined
        if (!data?.items) return old
        return {
          ...data,
          items: data.items.map((s) => (s.id === id ? { ...s, is_excluded: excluded } : s)),
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
      toast.error(`Failed to update sample: ${error.message}`)
    },
    onSuccess: (data) => {
      toast.success(data.is_excluded ? 'Sample excluded' : 'Sample included')
    },
    onSettled: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      if (data?.characteristic_id) {
        queryClient.invalidateQueries({
          queryKey: ['characteristics', 'chartData', data.characteristic_id],
        })
      }
    },
  })
}

export function useDeleteSample() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => sampleApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
      toast.success('Sample deleted')
    },
    onError: (error: Error) => {
      toast.error(`Delete failed: ${error.message}`)
    },
  })
}

export function useUpdateSample() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      measurements,
      reason,
      edited_by,
    }: {
      id: number
      measurements: number[]
      reason: string
      edited_by?: string
    }) => sampleApi.update(id, { measurements, reason, edited_by }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.editHistory(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
      toast.success('Sample updated')
    },
    onError: (error: Error) => {
      toast.error(`Update failed: ${error.message}`)
    },
  })
}

export function useSampleEditHistory(sampleId: number | null) {
  return useQuery({
    queryKey: queryKeys.samples.editHistory(sampleId ?? 0),
    queryFn: () => sampleApi.getEditHistory(sampleId!),
    enabled: sampleId !== null,
  })
}
