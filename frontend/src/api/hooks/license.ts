import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getLicenseStatus,
  getLicenseCompliance,
  removeLicense,
  activateLicense,
  getActivationFile,
  downloadJsonFile,
  registerOnPortal,
  deregisterFromPortal,
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
    onSuccess: async (response) => {
      setFromApi(response.status)
      queryClient.invalidateQueries({ queryKey: queryKeys.license.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })

      // Try online deactivation first (non-blocking — license is already removed locally)
      if (response.license_key && response.deactivation_file) {
        const { instanceId } = response.deactivation_file
        const result = await deregisterFromPortal(response.license_key, instanceId)
        if (result.ok) {
          toast.success('License removed and deregistered from saturnis.io')
          return
        }
        // Online deactivation failed — fall back to offline file download
        downloadJsonFile(
          response.deactivation_file,
          `cassini-deactivation-${instanceId}.deactivation`,
        )
        toast.success('License removed — upload the deactivation file to your saturnis.io portal')
        return
      }

      if (response.deactivation_file) {
        const { instanceId } = response.deactivation_file
        downloadJsonFile(
          response.deactivation_file,
          `cassini-deactivation-${instanceId}.deactivation`,
        )
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
    onSuccess: async (status, key) => {
      setFromApi(status)
      queryClient.invalidateQueries({ queryKey: queryKeys.license.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })

      // Auto-register with the portal (online activation)
      if (status.edition === 'commercial' && status.instance_id) {
        const result = await registerOnPortal(key, status.instance_id)
        if (result.ok) {
          toast.success('License activated and registered with saturnis.io')
          return
        }
        // Online registration failed — offer offline file download
        toast.success('License activated — download the activation file to register offline', {
          action: {
            label: 'Download',
            onClick: async () => {
              try {
                const data = await getActivationFile()
                downloadJsonFile(data, `cassini-activation-${data.instanceId}.activation`)
              } catch {
                toast.error('Failed to generate activation file')
              }
            },
          },
          duration: 10000,
        })
        return
      }

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
      downloadJsonFile(data, `cassini-activation-${data.instanceId}.activation`)
      return data
    },
    onSuccess: () => toast.success('Activation file downloaded'),
    onError: handleMutationError('Failed to download activation file'),
  })
}
