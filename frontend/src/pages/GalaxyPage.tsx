import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GalaxyScene } from '@/components/galaxy/GalaxyScene'
import { GalaxySidebar } from '@/components/galaxy/GalaxySidebar'
import type { ZoomLevel } from '@/lib/galaxy/CameraController'

export function GalaxyPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const focusParam = searchParams.get('focus')
  const initialCharId = focusParam?.startsWith('planet:')
    ? parseInt(focusParam.split(':')[1], 10)
    : undefined

  // Bidirectional sync state: scene -> sidebar
  const [activeConstellationId, setActiveConstellationId] = useState<number | null>(null)
  const [activeCharacteristicId, setActiveCharacteristicId] = useState<number | null>(null)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('galaxy')

  // Sidebar -> scene navigation: these values trigger camera fly-to when changed
  const [navConstellationId, setNavConstellationId] = useState<number | null>(null)
  const [navCharId, setNavCharId] = useState<number | null>(null)

  // Scene reports focus changes (camera transitions) -> update sidebar highlights
  const handleFocusChange = useCallback(
    (newCharId: number | null, newZoomLevel: ZoomLevel, constellationId?: number | null) => {
      setZoomLevel(newZoomLevel)
      setActiveConstellationId(constellationId ?? null)

      if (newZoomLevel === 'planet' && newCharId != null) {
        setActiveCharacteristicId(newCharId)
      } else {
        setActiveCharacteristicId(null)
      }

      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (newZoomLevel === 'planet' && newCharId != null) {
          next.set('focus', `planet:${newCharId}`)
        } else {
          next.delete('focus')
        }
        return next
      })
    },
    [setSearchParams],
  )

  // Sidebar clicks -> trigger scene navigation
  const handleNodeClick = useCallback((constellationId: number) => {
    setNavConstellationId(constellationId)
    setNavCharId(null)
    setActiveConstellationId(constellationId)
    setActiveCharacteristicId(null)
  }, [])

  const handleCharacteristicClick = useCallback((charId: number) => {
    setNavCharId(charId)
    setNavConstellationId(null)
    setActiveCharacteristicId(charId)
  }, [])

  return (
    <div className="fixed inset-0 z-50 bg-[#080C16]">
      <GalaxyScene
        className="h-full w-full"
        initialFocusCharId={initialCharId && !isNaN(initialCharId) ? initialCharId : undefined}
        onFocusChange={handleFocusChange}
        navigateToConstellationId={navConstellationId}
        navigateToCharId={navCharId}
      />
      <GalaxySidebar
        activeConstellationId={activeConstellationId}
        activeCharacteristicId={activeCharacteristicId}
        zoomLevel={zoomLevel}
        onNodeClick={handleNodeClick}
        onCharacteristicClick={handleCharacteristicClick}
      />
    </div>
  )
}
