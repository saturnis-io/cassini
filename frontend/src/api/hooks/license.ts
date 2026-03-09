import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getLicenseStatus, uploadLicense } from '@/api/license.api'
import { queryKeys } from './queryKeys'
import { handleMutationError } from './utils'
import { useLicenseStore } from '@/stores/licenseStore'

export function useLicenseStatus() {
	return useQuery({
		queryKey: queryKeys.license.status(),
		queryFn: getLicenseStatus,
	})
}

export function useUploadLicense() {
	const queryClient = useQueryClient()
	const setFromApi = useLicenseStore((s) => s.setFromApi)

	return useMutation({
		mutationFn: (key: string) => uploadLicense(key),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.license.all })
			setFromApi(data)
			toast.success('License key uploaded successfully')
		},
		onError: handleMutationError('Failed to upload license key'),
	})
}
