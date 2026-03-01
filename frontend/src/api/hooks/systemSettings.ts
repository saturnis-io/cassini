import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { systemSettingsApi } from '../system-settings.api'
import { queryKeys } from './queryKeys'
import type { BrandConfigDTO, SystemSettingsUpdate } from '@/types'

export function useSystemSettings() {
  return useQuery({
    queryKey: queryKeys.systemSettings.current(),
    queryFn: () => systemSettingsApi.get(),
    staleTime: 5 * 60 * 1000, // 5 minutes — rarely changes
  })
}

export function useUpdateSystemSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SystemSettingsUpdate) => systemSettingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.all })
      toast.success('System settings updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update system settings: ${error.message}`)
    },
  })
}

export function useResolvedBrandConfig(plantId?: number) {
  return useQuery({
    queryKey: [...queryKeys.systemSettings.current(), 'resolved', plantId],
    queryFn: () => systemSettingsApi.getResolved(plantId),
    staleTime: 5 * 60 * 1000,
  })
}

export function useUpdateBrandOverride() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ plantId, data }: { plantId: number; data: BrandConfigDTO }) =>
      systemSettingsApi.updateBrandOverride(plantId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.systemSettings.all })
      toast.success('Plant brand override updated')
    },
    onError: (error: Error) => {
      toast.error(`Failed to update brand override: ${error.message}`)
    },
  })
}
