import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { systemSettingsApi } from '../system-settings.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'
import type { SystemSettingsUpdate } from '@/types'

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
    onError: handleMutationError('Failed to update system settings'),
  })
}
