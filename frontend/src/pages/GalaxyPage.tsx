import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GalaxyScene } from '@/components/galaxy/GalaxyScene'
import { GalaxySidebar } from '@/components/galaxy/GalaxySidebar'
import { GalaxyBreadcrumb } from '@/components/galaxy/GalaxyBreadcrumb'
import { GalaxyControls } from '@/components/galaxy/GalaxyControls'
import { PlanetOverlay } from '@/components/galaxy/PlanetOverlay'
import { SampleInspectorModal } from '@/components/SampleInspectorModal'
import { usePlantContext } from '@/providers/PlantProvider'
import { useCharacteristics, useCapability, useHierarchyTreeByPlant } from '@/api/hooks'
import { buildBreadcrumb } from '@/components/galaxy/GalaxySidebar'
import { useChartData } from '@/api/hooks/characteristics'
import { useWebSocketContext } from '@/providers/WebSocketProvider'
import { buildHierarchyPathMap } from '@/lib/galaxy/constellation-layout'
import type { ZoomLevel } from '@/lib/galaxy/CameraController'

export function GalaxyPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const focusParam = searchParams.get('focus')
  const initialCharId = focusParam?.startsWith('planet:')
    ? parseInt(focusParam.split(':')[1], 10)
    : undefined
  const kioskMode = searchParams.get('kiosk') === 'true'

  const { plants, selectedPlant, setSelectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0

  // Bidirectional sync state: scene -> sidebar
  const [activeConstellationId, setActiveConstellationId] = useState<number | null>(null)
  const [activeCharacteristicId, setActiveCharacteristicId] = useState<number | null>(null)
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('galaxy')

  // Sidebar -> scene navigation: these values trigger camera fly-to when changed
  const [navConstellationId, setNavConstellationId] = useState<number | null>(null)
  const [navCharId, setNavCharId] = useState<number | null>(null)

  // Sample detail panel state
  const [selectedMoonIndex, setSelectedMoonIndex] = useState<number | null>(null)

  // Galaxy navigation counter — incremented to trigger fly-to-galaxy
  const [navigateToGalaxyCounter, setNavigateToGalaxyCounter] = useState(0)

  // Moon line toggle state
  const [showTrace, setShowTrace] = useState(true)
  const [showSpokes, setShowSpokes] = useState(false)

  // Fetch characteristics and hierarchy for the plant (for PlanetOverlay)
  const { data: charsData } = useCharacteristics({ plant_id: plantId, per_page: 5000 })
  const { data: hierarchyTree } = useHierarchyTreeByPlant(plantId)
  const hierarchyPathMap = useMemo(
    () => (hierarchyTree ? buildHierarchyPathMap(hierarchyTree) : null),
    [hierarchyTree],
  )
  const activeChar = activeCharacteristicId != null
    ? charsData?.items?.find((c) => c.id === activeCharacteristicId) ?? null
    : null
  const activeCharPath = activeChar
    ? hierarchyPathMap?.get(activeChar.hierarchy_id) ?? null
    : null

  // Breadcrumb path for the active constellation
  const constellationPath = useMemo(() => {
    if (!hierarchyTree || activeConstellationId == null) return []
    return buildBreadcrumb(activeConstellationId, hierarchyTree)
  }, [hierarchyTree, activeConstellationId])

  // Fetch capability for the focused characteristic (for PlanetOverlay)
  const { data: overlayCapability, isLoading: capLoading } = useCapability(activeCharacteristicId ?? 0)

  // Fetch chart data for the focused characteristic (needed for moon -> sample mapping)
  const { isConnected } = useWebSocketContext()
  const { data: chartData, isLoading: chartLoading } = useChartData(
    activeCharacteristicId ?? 0,
    { limit: 100 },
    { refetchInterval: isConnected ? false : 5000 },
  )

  // Derive the selected sample data point from chart data + moon index
  const selectedSample =
    selectedMoonIndex != null && chartData
      ? chartData.data_points[selectedMoonIndex] ?? null
      : null

  // Plant selector state
  const [plantMenuOpen, setPlantMenuOpen] = useState(false)

  // Scene reports focus changes (camera transitions) -> update sidebar highlights
  const handleFocusChange = useCallback(
    (newCharId: number | null, newZoomLevel: ZoomLevel, constellationId?: number | null) => {
      setZoomLevel(newZoomLevel)
      setActiveConstellationId(constellationId ?? null)

      // Reset navigation targets so sidebar can re-trigger the same destination
      setNavConstellationId(null)
      setNavCharId(null)

      if (newZoomLevel === 'planet' && newCharId != null) {
        setActiveCharacteristicId(newCharId)
      } else {
        setActiveCharacteristicId(null)
        setSelectedMoonIndex(null)
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

  const handleNavigateGalaxy = useCallback(() => {
    setNavigateToGalaxyCounter((c) => c + 1)
    setActiveConstellationId(null)
    setActiveCharacteristicId(null)
    setNavConstellationId(null)
    setNavCharId(null)
    setZoomLevel('galaxy')
  }, [])

  const handleMoonClick = useCallback((moonIndex: number) => {
    setSelectedMoonIndex(moonIndex)
  }, [])

  const handleSamplePanelClose = useCallback(() => {
    setSelectedMoonIndex(null)
  }, [])

  if (!plantId) return null

  return (
    <div className="fixed inset-0 z-50 flex bg-[#080C16]">
      {/* Sidebar — push layout, flex-none */}
      {!kioskMode && (
        <GalaxySidebar
          plantId={plantId}
          activeConstellationId={activeConstellationId}
          activeCharacteristicId={activeCharacteristicId}
          zoomLevel={zoomLevel}
          onNodeClick={handleNodeClick}
          onCharacteristicClick={handleCharacteristicClick}
        />
      )}

      {/* Scene wrapper — fills remaining space */}
      <div className="relative flex-1">
        <GalaxyScene
          className="h-full w-full"
          plantId={plantId}
          initialFocusCharId={initialCharId && !isNaN(initialCharId) ? initialCharId : undefined}
          onFocusChange={handleFocusChange}
          navigateToConstellationId={navConstellationId}
          navigateToCharId={navCharId}
          navigateToGalaxy={navigateToGalaxyCounter}
          kioskMode={kioskMode}
          onMoonClick={handleMoonClick}
          showTrace={showTrace}
          showSpokes={showSpokes}
        />

        {/* Breadcrumb navigation — visible at constellation/planet zoom */}
        {!kioskMode && (
          <GalaxyBreadcrumb
            zoomLevel={zoomLevel}
            constellationPath={constellationPath}
            planetName={activeChar?.name}
            onNavigateGalaxy={handleNavigateGalaxy}
            onNavigateConstellation={handleNodeClick}
          />
        )}

        {/* Moon line controls — visible at planet zoom level */}
        {!kioskMode && (
          <GalaxyControls
            visible={zoomLevel === 'planet'}
            showTrace={showTrace}
            showSpokes={showSpokes}
            onToggleTrace={() => setShowTrace((v) => !v)}
            onToggleSpokes={() => setShowSpokes((v) => !v)}
          />
        )}

        {/* Plant selector — top-right, only when user has 2+ plants and not in kiosk mode */}
        {!kioskMode && plants.length >= 2 && (
          <div className="absolute top-3 right-3 z-20">
            <div className="relative">
              <button
                onClick={() => setPlantMenuOpen(!plantMenuOpen)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2',
                  'text-sm font-medium text-foreground shadow-sm backdrop-blur-md',
                  'cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <Building2 className="h-4 w-4 text-primary" />
                <span>{selectedPlant?.name}</span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 text-muted-foreground transition-transform',
                    plantMenuOpen && 'rotate-180',
                  )}
                />
              </button>
              {plantMenuOpen && (
                <div className="absolute top-full right-0 mt-1 min-w-full overflow-hidden rounded-lg border border-border bg-popover shadow-xl backdrop-blur-md">
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
                        'text-sm font-medium transition-colors hover:bg-accent',
                        plant.id === plantId ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      <span>{plant.name}</span>
                      {plant.id === plantId && <Check className="h-3.5 w-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Planet loading indicator */}
        {zoomLevel === 'planet' && activeCharacteristicId != null && (chartLoading || capLoading) && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              <span className="text-xs font-medium text-muted-foreground">Loading data...</span>
            </div>
          </div>
        )}

        {/* Planet metrics overlay — below breadcrumb at planet zoom */}
        {zoomLevel === 'planet' && activeChar && (
          <div className="absolute top-12 left-1/2 z-20 -translate-x-1/2">
            <PlanetOverlay
              char={activeChar}
              capability={overlayCapability ?? null}
              hierarchyPath={activeCharPath}
            />
          </div>
        )}

        {/* Sample inspector modal — reuses the dashboard's full-featured modal */}
        {selectedSample && activeCharacteristicId != null && (
          <SampleInspectorModal
            sampleId={selectedSample.sample_id}
            characteristicId={activeCharacteristicId}
            onClose={handleSamplePanelClose}
          />
        )}
      </div>
    </div>
  )
}
