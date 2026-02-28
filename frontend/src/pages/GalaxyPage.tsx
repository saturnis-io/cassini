import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GalaxyScene } from '@/components/galaxy/GalaxyScene'
import { GalaxySidebar } from '@/components/galaxy/GalaxySidebar'
import { usePlantContext } from '@/providers/PlantProvider'
import type { ZoomLevel } from '@/lib/galaxy/CameraController'

export function GalaxyPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const focusParam = searchParams.get('focus')
  const initialCharId = focusParam?.startsWith('planet:')
    ? parseInt(focusParam.split(':')[1], 10)
    : undefined

  const { plants, selectedPlant, setSelectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  // Bidirectional sync state: scene -> sidebar
  const [activeConstellationId, setActiveConstellationId] = useState<number | null>(null)
  const [activeCharacteristicId, setActiveCharacteristicId] = useState<number | null>(null)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('galaxy')

  // Sidebar -> scene navigation: these values trigger camera fly-to when changed
  const [navConstellationId, setNavConstellationId] = useState<number | null>(null)
  const [navCharId, setNavCharId] = useState<number | null>(null)

  // Plant selector state
  const [plantMenuOpen, setPlantMenuOpen] = useState(false)

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

  if (!plantId) return null

  return (
    <div className="fixed inset-0 z-50 bg-[#080C16]">
      <GalaxyScene
        className="h-full w-full"
        plantId={plantId}
        initialFocusCharId={initialCharId && !isNaN(initialCharId) ? initialCharId : undefined}
        onFocusChange={handleFocusChange}
        navigateToConstellationId={navConstellationId}
        navigateToCharId={navCharId}
      />
      <GalaxySidebar
        plantId={plantId}
        activeConstellationId={activeConstellationId}
        activeCharacteristicId={activeCharacteristicId}
        zoomLevel={zoomLevel}
        onNodeClick={handleNodeClick}
        onCharacteristicClick={handleCharacteristicClick}
      />

      {/* Plant selector — top-right, only when user has 2+ plants */}
      {plants.length >= 2 && (
        <div className="absolute top-3 right-3 z-20">
          <div className="relative">
            <button
              onClick={() => setPlantMenuOpen(!plantMenuOpen)}
              className={cn(
                'flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-3 py-1.5',
                'font-mono text-xs text-gray-300 backdrop-blur-md',
                'cursor-pointer transition-colors hover:bg-black/80 hover:text-white',
              )}
            >
              <Building2 className="h-3.5 w-3.5 text-amber-400" />
              <span>{selectedPlant?.name}</span>
              <ChevronDown
                className={cn(
                  'h-3 w-3 text-gray-500 transition-transform',
                  plantMenuOpen && 'rotate-180',
                )}
              />
            </button>
            {plantMenuOpen && (
              <div className="absolute top-full right-0 mt-1 min-w-full overflow-hidden rounded-lg border border-white/10 bg-black/80 shadow-xl backdrop-blur-md">
                {plants.map((plant) => (
                  <button
                    key={plant.id}
                    onClick={() => {
                      setSelectedPlant(plant)
                      setPlantMenuOpen(false)
                      // Reset navigation state when switching plants
                      setActiveConstellationId(null)
                      setActiveCharacteristicId(null)
                      setNavConstellationId(null)
                      setNavCharId(null)
                      setZoomLevel('galaxy')
                    }}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between gap-4 px-3 py-2 text-left',
                      'font-mono text-xs transition-colors hover:bg-white/10',
                      plant.id === plantId ? 'text-amber-300' : 'text-gray-400',
                    )}
                  >
                    <span>{plant.name}</span>
                    {plant.id === plantId && <Check className="h-3 w-3 text-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
