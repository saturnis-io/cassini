import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GalaxyScene } from '@/components/galaxy/GalaxyScene'
import type { ZoomLevel } from '@/lib/galaxy/CameraController'

export function GalaxyPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const focusParam = searchParams.get('focus')
  const charId = focusParam?.startsWith('planet:')
    ? parseInt(focusParam.split(':')[1], 10)
    : undefined

  const handleFocusChange = useCallback(
    (newCharId: number | null, zoomLevel: ZoomLevel) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (zoomLevel === 'planet' && newCharId != null) {
          next.set('focus', `planet:${newCharId}`)
        } else {
          next.delete('focus')
        }
        return next
      })
    },
    [setSearchParams],
  )

  return (
    <div className="fixed inset-0 z-50 bg-[#080C16]">
      <GalaxyScene
        className="h-full w-full"
        initialFocusCharId={charId && !isNaN(charId) ? charId : undefined}
        onFocusChange={handleFocusChange}
      />
    </div>
  )
}
