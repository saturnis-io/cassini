import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { distributionApi, capabilityApi } from '../quality.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'

// -----------------------------------------------------------------------
// Distribution Analysis hooks (Sprint 5 - A1)
// -----------------------------------------------------------------------

export function useNonNormalCapability(charId: number | undefined, method = 'auto') {
  return useQuery({
    queryKey: ['nonnormal-capability', charId, method],
    queryFn: () => distributionApi.calculateNonNormal(charId!, method),
    enabled: !!charId,
    staleTime: 10_000,
  })
}

export function useFitDistribution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (charId: number) => distributionApi.fitDistribution(charId),
    onSuccess: (_, charId) => {
      qc.invalidateQueries({ queryKey: ['nonnormal-capability', charId] })
      qc.invalidateQueries({ queryKey: queryKeys.explain.all })
    },
  })
}

export function useUpdateDistributionConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      charId,
      config,
    }: {
      charId: number
      config: {
        distribution_method?: string
        box_cox_lambda?: number
        distribution_params?: Record<string, unknown>
      }
    }) => distributionApi.updateConfig(charId, config),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['nonnormal-capability', variables.charId] })
      qc.invalidateQueries({ queryKey: queryKeys.characteristics.detail(variables.charId) })
      qc.invalidateQueries({ queryKey: queryKeys.capability.current(variables.charId) })
      qc.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success('Distribution configuration saved')
    },
    onError: handleMutationError('Failed to save distribution config'),
  })
}

// ---- Capability Hooks ----

export function useCapability(charId: number, opts?: { includeCi?: boolean }) {
  return useQuery({
    queryKey: [...queryKeys.capability.current(charId), opts?.includeCi ?? false],
    queryFn: () => capabilityApi.getCapability(charId, { includeCi: opts?.includeCi }),
    enabled: charId > 0,
    staleTime: 10_000,
  })
}

export function useCapabilityHistory(charId: number) {
  return useQuery({
    queryKey: queryKeys.capability.history(charId),
    queryFn: () => capabilityApi.getHistory(charId),
    enabled: charId > 0,
  })
}

export function useSaveCapabilitySnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (charId: number) => capabilityApi.saveSnapshot(charId),
    onSuccess: (_data, charId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.capability.current(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.capability.history(charId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.explain.all })
      toast.success('Capability snapshot saved')
    },
    onError: handleMutationError('Failed to save capability snapshot'),
  })
}
