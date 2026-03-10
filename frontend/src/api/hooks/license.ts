import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getLicenseStatus,
  getLicenseCompliance,
  removeLicense,
  activateLicense,
} from '@/api/license.api'
import { useLicenseStore } from '@/stores/licenseStore'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'

export function useLicenseCompliance() {
  return useQuery({
    queryKey: queryKeys.license.compliance(),
    queryFn: getLicenseCompliance,
    refetchInterval: 30_000,
  })
}

export function useRemoveLicense() {
  const queryClient = useQueryClient()
  const setFromApi = useLicenseStore((s) => s.setFromApi)

  return useMutation({
    mutationFn: removeLicense,
    onSuccess: (status) => {
      setFromApi(status)
      queryClient.invalidateQueries({ queryKey: queryKeys.license.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      toast.success('License removed')
    },
    onError: handleMutationError('Failed to remove license'),
  })
}

export function useActivateLicense() {
  const queryClient = useQueryClient()
  const setFromApi = useLicenseStore((s) => s.setFromApi)

  return useMutation({
    mutationFn: (key: string) => activateLicense(key),
    onSuccess: (status) => {
      setFromApi(status)
      queryClient.invalidateQueries({ queryKey: queryKeys.license.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      toast.success('License activated')
    },
    onError: handleMutationError('Failed to activate license'),
  })
}

export function useLicenseStatus() {
  const setFromApi = useLicenseStore((s) => s.setFromApi)

  return useQuery({
    queryKey: queryKeys.license.status(),
    queryFn: getLicenseStatus,
    select: (data) => {
      setFromApi(data)
      return data
    },
  })
}
