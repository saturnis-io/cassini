import { useEffect } from 'react'
import { useLicenseStore } from '@/stores/licenseStore'
import { useLicenseStatus } from '@/api/hooks/license'
import type { LicenseStatus } from '@/api/license.api'

const COMMUNITY_DEFAULTS: LicenseStatus = {
	edition: 'community',
	tier: 'community',
	max_plants: 1,
	expires_at: null,
	days_until_expiry: null,
	is_expired: null,
	license_name: null,
}

export function useLicense() {
	const { data, isLoading, isError } = useLicenseStatus()
	const setFromApi = useLicenseStore((s) => s.setFromApi)

	// Sync query result to Zustand store so useUploadLicense's
	// optimistic store write remains consistent
	const status = isError ? COMMUNITY_DEFAULTS : data
	useEffect(() => {
		if (status) {
			setFromApi(status)
		}
	}, [status, setFromApi])

	const loaded = !isLoading
	const resolved = status ?? COMMUNITY_DEFAULTS

	return {
		isCommercial: resolved.edition === 'commercial',
		edition: resolved.edition,
		tier: resolved.tier,
		maxPlants: resolved.max_plants,
		expiresAt: resolved.expires_at,
		daysUntilExpiry: resolved.days_until_expiry,
		isExpired: resolved.is_expired ?? false,
		licenseName: resolved.license_name,
		loaded,
	}
}
