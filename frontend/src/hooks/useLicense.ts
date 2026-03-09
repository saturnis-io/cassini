import { useEffect } from 'react'
import { useLicenseStore } from '@/stores/licenseStore'
import { getLicenseStatus } from '@/api/license.api'

export function useLicense() {
	const store = useLicenseStore()

	useEffect(() => {
		if (!store.loaded) {
			getLicenseStatus()
				.then((status) => store.setFromApi(status))
				.catch(() => {
					// On error, finalize as community so the app doesn't hang in limbo
					store.setFromApi({
						edition: 'community',
						tier: 'community',
						max_plants: 1,
						expires_at: null,
						days_until_expiry: null,
						is_expired: null,
						license_name: null,
					})
				})
		}
	}, [store.loaded])

	return {
		isCommercial: store.edition === 'commercial',
		edition: store.edition,
		tier: store.tier,
		maxPlants: store.maxPlants,
		expiresAt: store.expiresAt,
		daysUntilExpiry: store.daysUntilExpiry,
		isExpired: store.isExpired ?? false,
		licenseName: store.licenseName,
		loaded: store.loaded,
	}
}
