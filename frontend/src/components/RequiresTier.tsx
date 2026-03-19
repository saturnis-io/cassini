import type { ReactNode } from 'react'
import type { LicenseTier } from '@/api/license.api'
import { useLicense } from '@/hooks/useLicense'

// eslint-disable-next-line react-refresh/only-export-components
export const TIER_RANK: Record<LicenseTier, number> = {
  community: 0,
  pro: 1,
  enterprise: 2,
}

interface RequiresTierProps {
  tier: LicenseTier
  children: ReactNode
  fallback?: ReactNode
}

export function RequiresTier({ tier, children, fallback }: RequiresTierProps) {
  const { tier: currentTier, loaded } = useLicense()

  if (!loaded) return null

  if (TIER_RANK[currentTier] >= TIER_RANK[tier]) {
    return <>{children}</>
  }

  return fallback ? <>{fallback}</> : null
}
