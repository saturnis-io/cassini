import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X, Save, FolderOpen, Grid2x2, Orbit } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCharacteristics, useChartData } from '@/api/hooks'
import { usePlantContext } from '@/providers/PlantProvider'
import { useTheme } from '@/providers/ThemeProvider'
import { WallChartCard } from '@/components/WallChartCard'
import { GalaxyScene } from '@/components/galaxy/GalaxyScene'
import { ControlChart } from '@/components/ControlChart'
import { ErrorBoundary } from '@/components/ErrorBoundary'

type GridSize = '2x2' | '3x3' | '4x4' | '2x3' | '3x2'

interface GridConfig {
  cols: number
  rows: number
}

const GRID_CONFIGS: Record<GridSize, GridConfig> = {
  '2x2': { cols: 2, rows: 2 },
  '3x3': { cols: 3, rows: 3 },
  '4x4': { cols: 4, rows: 4 },
  '2x3': { cols: 2, rows: 3 },
  '3x2': { cols: 3, rows: 2 },
}

const STORAGE_KEY = 'cassini-wall-dashboard-presets'

interface DashboardPreset {
  name: string
  gridSize: GridSize
  characteristicIds: number[]
}

/**
 * Grid size selector dropdown
 */
function GridSizeSelector({
  value,
  onChange,
}: {
  value: GridSize
  onChange: (size: GridSize) => void
}) {
  const [isOpen, setIsOpen] = useState(false)

  const sizes: GridSize[] = ['2x2', '3x3', '4x4', '2x3', '3x2']

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-muted hover:bg-muted/80 flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors"
      >
        <Grid2x2 className="h-4 w-4" />
        <span>{value}</span>
      </button>

      {isOpen && (
        <div className="border-border bg-muted absolute top-full right-0 z-10 mt-1 rounded border shadow-lg">
          {sizes.map((size) => (
            <button
              key={size}
              onClick={() => {
                onChange(size)
                setIsOpen(false)
              }}
              className={cn(
                'hover:bg-muted-foreground/20 block w-full px-4 py-2 text-left text-sm transition-colors',
                value === size && 'bg-muted-foreground/20',
              )}
            >
              {size}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Expanded chart modal
 */
function ExpandedChartModal({
  characteristicId,
  characteristicName,
  onClose,
}: {
  characteristicId: number
  characteristicName: string
  onClose: () => void
}) {
  // Close on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const { data: chartData } = useChartData(characteristicId, { limit: 100 })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
      onClick={onClose}
    >
      <div
        className="bg-card flex h-[80vh] w-full max-w-6xl flex-col rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="border-border flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-foreground text-xl font-semibold">{characteristicName}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Chart area */}
        <div className="min-h-0 flex-1 p-6">
          <ErrorBoundary>
            <ControlChart characteristicId={characteristicId} chartOptions={{ limit: 100 }} />
          </ErrorBoundary>
        </div>

        {/* Stats footer */}
        {chartData && (
          <div className="border-border flex items-center gap-8 border-t px-6 py-4 text-sm">
            <div>
              <span className="text-muted-foreground">Points: </span>
              <span className="text-foreground">{chartData.data_points?.length ?? 0}</span>
            </div>
            {chartData.control_limits && (
              <>
                <div>
                  <span className="text-muted-foreground">UCL: </span>
                  <span className="text-foreground">
                    {chartData.control_limits.ucl?.toFixed(4) ?? '-'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">CL: </span>
                  <span className="text-foreground">
                    {chartData.control_limits.center_line?.toFixed(4) ?? '-'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">LCL: </span>
                  <span className="text-foreground">
                    {chartData.control_limits.lcl?.toFixed(4) ?? '-'}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Multi-chart grid display mode for large monitors
 *
 * URL Parameters:
 * - plant: Plant ID to filter characteristics
 * - chars: Comma-separated characteristic IDs
 * - grid: Grid size (2x2, 3x3, 4x4, 2x3, 3x2)
 *
 * Features:
 * - Configurable grid layout
 * - Click-to-expand charts
 * - Save/load presets to localStorage
 * - URL parameter configuration
 */
export function WallDashboard() {
  const { brandConfig } = useTheme()
  const { selectedPlant } = usePlantContext()
  const plantId = selectedPlant?.id ?? 0
  const [searchParams, setSearchParams] = useSearchParams()
  const [gridSize, setGridSize] = useState<GridSize>(() => {
    const param = searchParams.get('grid')
    return param && param in GRID_CONFIGS ? (param as GridSize) : '2x2'
  })
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showGalaxy, setShowGalaxy] = useState(
    () => searchParams.get('galaxy') === 'true',
  )

  // Parse characteristic IDs from URL
  const charIds = useMemo(() => {
    const chars = searchParams.get('chars')
    if (chars) {
      return chars
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id))
    }
    return []
  }, [searchParams])

  // Fetch all characteristics
  const { data: allCharacteristics } = useCharacteristics()

  // Determine which characteristics to display
  const displayCharacteristics = useMemo(() => {
    const items = allCharacteristics?.items ?? []
    if (charIds.length > 0) {
      return items.filter((c) => charIds.includes(c.id))
    }
    // Show all active characteristics up to grid capacity
    const config = GRID_CONFIGS[gridSize]
    const maxSlots = config.cols * config.rows
    return items.filter((c) => c.active).slice(0, maxSlots)
  }, [allCharacteristics, charIds, gridSize])

  // Get expanded characteristic name
  const expandedChar = expandedId ? displayCharacteristics.find((c) => c.id === expandedId) : null

  // Grid configuration
  const gridConfig = GRID_CONFIGS[gridSize]

  // Update URL when grid size changes
  const handleGridSizeChange = useCallback(
    (size: GridSize) => {
      setGridSize(size)
      const newParams = new URLSearchParams(searchParams)
      newParams.set('grid', size)
      setSearchParams(newParams)
    },
    [searchParams, setSearchParams],
  )

  // Save preset
  const handleSavePreset = useCallback(() => {
    const name = prompt('Preset name:')
    if (!name) return

    const preset: DashboardPreset = {
      name,
      gridSize,
      characteristicIds: displayCharacteristics.map((c) => c.id),
    }

    const presets: DashboardPreset[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    presets.push(preset)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    alert('Preset saved!')
  }, [gridSize, displayCharacteristics])

  // Toggle galaxy cell
  const handleToggleGalaxy = useCallback(() => {
    setShowGalaxy((prev) => {
      const next = !prev
      const newParams = new URLSearchParams(searchParams)
      if (next) {
        newParams.set('galaxy', 'true')
      } else {
        newParams.delete('galaxy')
      }
      setSearchParams(newParams)
      return next
    })
  }, [searchParams, setSearchParams])

  // Load preset
  const handleLoadPreset = useCallback(() => {
    const presets: DashboardPreset[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!presets.length) {
      alert('No saved presets')
      return
    }

    const name = prompt(
      `Available presets:\n${presets.map((p) => p.name).join('\n')}\n\nEnter preset name:`,
    )
    const preset = presets.find((p) => p.name === name)
    if (!preset) {
      alert('Preset not found')
      return
    }

    setGridSize(preset.gridSize)
    const newParams = new URLSearchParams()
    newParams.set('grid', preset.gridSize)
    if (preset.characteristicIds.length) {
      newParams.set('chars', preset.characteristicIds.join(','))
    }
    setSearchParams(newParams)
  }, [setSearchParams])

  return (
    <div className="bg-background relative flex h-full flex-col p-4">
      {/* Brand Badge */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 opacity-60">
        <img
          src={brandConfig.logoUrl || '/header-logo.svg'}
          alt=""
          className="h-6 w-6 object-contain"
        />
        <span className="text-muted-foreground text-sm font-medium">{brandConfig.appName}</span>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-foreground text-xl font-semibold">Wall Dashboard</h1>

        <div className="flex items-center gap-3">
          <GridSizeSelector value={gridSize} onChange={handleGridSizeChange} />

          <button
            onClick={handleToggleGalaxy}
            className={cn(
              'flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors',
              showGalaxy
                ? 'bg-primary/20 text-primary hover:bg-primary/30'
                : 'bg-muted hover:bg-muted/80',
            )}
            title={showGalaxy ? 'Remove galaxy cell' : 'Add galaxy cell'}
          >
            <Orbit className="h-4 w-4" />
            <span className="hidden sm:inline">Galaxy</span>
          </button>

          <button
            onClick={handleSavePreset}
            className="bg-muted hover:bg-muted/80 flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors"
            title="Save preset"
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            onClick={handleLoadPreset}
            className="bg-muted hover:bg-muted/80 flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors"
            title="Load preset"
          >
            <FolderOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Load</span>
          </button>
        </div>
      </div>

      {/* Chart grid */}
      <div
        className="grid min-h-0 flex-1 gap-4"
        style={{
          gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
          gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
        }}
      >
        {/* Galaxy cell — simplified scene with no sidebar or click interaction */}
        {showGalaxy && plantId > 0 && (
          <div className="border-border bg-card relative overflow-hidden rounded-lg border">
            <div className="absolute top-2 left-2 z-10 rounded bg-black/60 px-2 py-0.5 font-mono text-xs text-gray-400 backdrop-blur-sm">
              Galaxy
            </div>
            <ErrorBoundary>
              <GalaxyScene
                className="h-full w-full"
                plantId={plantId}
                kioskMode
              />
            </ErrorBoundary>
          </div>
        )}

        {displayCharacteristics.map((char) => (
          <WallChartCard key={char.id} characteristicId={char.id} onExpand={setExpandedId} />
        ))}

        {/* Empty slots */}
        {Array.from({
          length: Math.max(
            0,
            gridConfig.cols * gridConfig.rows -
              displayCharacteristics.length -
              (showGalaxy && plantId > 0 ? 1 : 0),
          ),
        }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="border-border bg-card/50 flex items-center justify-center rounded-lg border border-dashed"
          >
            <span className="text-muted-foreground text-sm">No data</span>
          </div>
        ))}
      </div>

      {/* Expanded chart modal */}
      {expandedId && expandedChar && (
        <ExpandedChartModal
          characteristicId={expandedId}
          characteristicName={expandedChar.name}
          onClose={() => setExpandedId(null)}
        />
      )}
    </div>
  )
}
