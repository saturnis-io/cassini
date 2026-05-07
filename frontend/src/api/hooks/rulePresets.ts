import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { rulePresetApi } from '../quality.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'

// -----------------------------------------------------------------------
// Rule Preset hooks
// -----------------------------------------------------------------------

export function useRulePresets(plantId?: number) {
 return useQuery({
 queryKey: ['rule-presets', plantId],
 queryFn: () => rulePresetApi.list(plantId),
 })
}

export function useApplyPreset() {
 const qc = useQueryClient()
 return useMutation({
 mutationFn: ({ charId, presetId }: { charId: number; presetId: number }) =>
 rulePresetApi.applyToCharacteristic(charId, presetId),
 onSuccess: (_, { charId }) => {
 qc.invalidateQueries({ queryKey: queryKeys.characteristics.detail(charId) })
 qc.invalidateQueries({ queryKey: queryKeys.characteristics.rules(charId) })
 qc.invalidateQueries({ queryKey: [...queryKeys.characteristics.all, 'chartData', charId] })
 qc.invalidateQueries({ queryKey: queryKeys.capability.current(charId) })
 qc.invalidateQueries({ queryKey: queryKeys.explain.all })
 toast.success('Rule preset applied')
 },
 onError: handleMutationError('Failed to apply rule preset'),
 })
}
