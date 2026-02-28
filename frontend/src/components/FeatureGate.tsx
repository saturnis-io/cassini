import type { ReactNode } from 'react'
import { useLicense } from '@/hooks/useLicense'

interface FeatureGateProps {
  children: ReactNode
  fallback?: ReactNode
}

export function FeatureGate({ children, fallback = null }: FeatureGateProps) {
  const { isCommercial, loaded } = useLicense()

  if (!loaded) return null
  if (!isCommercial) return <>{fallback}</>

  return <>{children}</>
}
