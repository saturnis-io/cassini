import type { ReactNode } from 'react'
import { useLicense } from '@/hooks/useLicense'

interface FeatureGateProps {
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureGate({ children, fallback = null }: FeatureGateProps) {
  const { isCommercial } = useLicense()

  if (!isCommercial) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
