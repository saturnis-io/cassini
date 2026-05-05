import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  cepApi,
  type CepRule,
  type CepRuleCreatePayload,
  type CepRuleUpdatePayload,
} from '../cep.api'
import { handleMutationError } from './utils'

// -----------------------------------------------------------------------
// Query keys
// -----------------------------------------------------------------------

export const cepKeys = {
  all: ['cep_rules'] as const,
  list: (plantId: number) => ['cep_rules', 'list', plantId] as const,
  detail: (plantId: number, ruleId: number) =>
    ['cep_rules', 'detail', plantId, ruleId] as const,
}

// -----------------------------------------------------------------------
// Query hooks
// -----------------------------------------------------------------------

export function useCepRules(plantId: number | undefined) {
  return useQuery({
    queryKey: cepKeys.list(plantId ?? 0),
    queryFn: () => cepApi.list(plantId as number),
    enabled: typeof plantId === 'number' && plantId > 0,
  })
}

export function useCepRule(plantId: number | undefined, ruleId: number | undefined) {
  return useQuery({
    queryKey: cepKeys.detail(plantId ?? 0, ruleId ?? 0),
    queryFn: () => cepApi.get(ruleId as number, plantId as number),
    enabled:
      typeof plantId === 'number' && plantId > 0 && typeof ruleId === 'number' && ruleId > 0,
  })
}

// -----------------------------------------------------------------------
// Mutation hooks
// -----------------------------------------------------------------------

export function useCreateCepRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CepRuleCreatePayload) => cepApi.create(payload),
    onSuccess: (rule: CepRule) => {
      qc.invalidateQueries({ queryKey: cepKeys.list(rule.plant_id) })
      toast.success(`Created CEP rule '${rule.name}'`)
    },
    onError: handleMutationError('Failed to create CEP rule'),
  })
}

export function useUpdateCepRule(plantId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      ruleId,
      payload,
    }: {
      ruleId: number
      payload: CepRuleUpdatePayload
    }) => cepApi.update(ruleId, plantId, payload),
    onSuccess: (rule: CepRule) => {
      qc.invalidateQueries({ queryKey: cepKeys.list(rule.plant_id) })
      qc.invalidateQueries({ queryKey: cepKeys.detail(rule.plant_id, rule.id) })
      toast.success(`Updated CEP rule '${rule.name}'`)
    },
    onError: handleMutationError('Failed to update CEP rule'),
  })
}

export function useDeleteCepRule(plantId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: number) => cepApi.remove(ruleId, plantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cepKeys.list(plantId) })
      toast.success('CEP rule deleted')
    },
    onError: handleMutationError('Failed to delete CEP rule'),
  })
}

export function useValidateCep() {
  return useMutation({
    mutationFn: (yamlText: string) => cepApi.validate(yamlText),
    onError: handleMutationError('Failed to validate CEP rule'),
  })
}
