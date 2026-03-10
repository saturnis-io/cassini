import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getLicenseStatus,
  getLicenseCompliance,
  removeLicense,
  activateLicense,
  getActivationFile,
  downloadJsonFile,
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
    onSuccess: (response) => {
      setFromApi(response.status)
      queryClient.invalidateQueries({ queryKey: queryKeys.license.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      if (response.deactivation_file) {
        const id = response.deactivation_file.instanceId.slice(0, 8)
        downloadJsonFile(response.deactivation_file, `cassini-deactivation-${id}.deactivation`)
        toast.success('License removed — upload the deactivation file to your saturnis.io portal')
      } else {
        toast.success('License removed')
      }
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

export function useDownloadActivationFile() {
  return useMutation({
    mutationFn: async () => {
      const data = await getActivationFile()
      downloadJsonFile(data, `cassini-activation-${data.instanceId.slice(0, 8)}.activation`)
      return data
    },
    onSuccess: () => toast.success('Activation file downloaded'),
    onError: handleMutationError('Failed to download activation file'),
  })
}
