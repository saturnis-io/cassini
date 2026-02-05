import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X, Settings, Save, FolderOpen, Grid2x2, Grid3x3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCharacteristics, useChartData } from '@/api/hooks'
import { WallChartCard } from '@/components/WallChartCard'
import { ControlChart } from '@/components/ControlChart'

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

const STORAGE_KEY = 'openspc-wall-dashboard-presets'

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
        className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
      >
        <Grid2x2 className="h-4 w-4" />
        <span>{value}</span>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 bg-zinc-800 rounded shadow-lg border border-zinc-700 z-10">
          {sizes.map((size) => (
            <button
              key={size}
              onClick={() => {
                onChange(size)
                setIsOpen(false)
              }}
              className={cn(
                'block w-full px-4 py-2 text-left text-sm hover:bg-zinc-700 transition-colors',
                value === size && 'bg-zinc-700'
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
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 rounded-lg w-full max-w-6xl h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-xl font-semibold text-zinc-100">
            {characteristicName}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Chart area */}
        <div className="flex-1 p-6 min-h-0">
          <ControlChart
            characteristicId={characteristicId}
            chartOptions={{ limit: 100 }}
          />
        </div>

        {/* Stats footer */}
        {chartData && (
          <div className="px-6 py-4 border-t border-zinc-800 flex items-center gap-8 text-sm">
            <div>
              <span className="text-zinc-500">Points: </span>
              <span className="text-zinc-100">{chartData.data_points?.length ?? 0}</span>
            </div>
            {chartData.control_limits && (
              <>
                <div>
                  <span className="text-zinc-500">UCL: </span>
                  <span className="text-zinc-100">{chartData.control_limits.ucl?.toFixed(4) ?? '-'}</span>
                </div>
                <div>
                  <span className="text-zinc-500">CL: </span>
                  <span className="text-zinc-100">{chartData.control_limits.cl?.toFixed(4) ?? '-'}</span>
                </div>
                <div>
                  <span className="text-zinc-500">LCL: </span>
                  <span className="text-zinc-100">{chartData.control_limits.lcl?.toFixed(4) ?? '-'}</span>
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
  const [searchParams, setSearchParams] = useSearchParams()
  const [gridSize, setGridSize] = useState<GridSize>(() => {
    const param = searchParams.get('grid')
    return (param && param in GRID_CONFIGS) ? param as GridSize : '2x2'
  })
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  // Parse characteristic IDs from URL
  const charIds = useMemo(() => {
    const chars = searchParams.get('chars')
    if (chars) {
      return chars.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id))
    }
    return []
  }, [searchParams])

  // Fetch all characteristics
  const { data: allCharacteristics } = useCharacteristics()

  // Determine which characteristics to display
  const displayCharacteristics = useMemo(() => {
    if (charIds.length > 0) {
      return allCharacteristics?.filter((c) => charIds.includes(c.id)) ?? []
    }
    // Show all active characteristics up to grid capacity
    const config = GRID_CONFIGS[gridSize]
    const maxSlots = config.cols * config.rows
    return (allCharacteristics?.filter((c) => c.active) ?? []).slice(0, maxSlots)
  }, [allCharacteristics, charIds, gridSize])

  // Get expanded characteristic name
  const expandedChar = expandedId
    ? displayCharacteristics.find((c) => c.id === expandedId)
    : null

  // Grid configuration
  const gridConfig = GRID_CONFIGS[gridSize]

  // Update URL when grid size changes
  const handleGridSizeChange = useCallback((size: GridSize) => {
    setGridSize(size)
    const newParams = new URLSearchParams(searchParams)
    newParams.set('grid', size)
    setSearchParams(newParams)
  }, [searchParams, setSearchParams])

  // Save preset
  const handleSavePreset = useCallback(() => {
    const name = prompt('Preset name:')
    if (!name) return

    const preset: DashboardPreset = {
      name,
      gridSize,
      characteristicIds: displayCharacteristics.map((c) => c.id),
    }

    const presets: DashboardPreset[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '[]'
    )
    presets.push(preset)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    alert('Preset saved!')
  }, [gridSize, displayCharacteristics])

  // Load preset
  const handleLoadPreset = useCallback(() => {
    const presets: DashboardPreset[] = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '[]'
    )
    if (!presets.length) {
      alert('No saved presets')
      return
    }

    const name = prompt(`Available presets:\n${presets.map((p) => p.name).join('\n')}\n\nEnter preset name:`)
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
    <div className="h-full flex flex-col p-4 bg-zinc-950">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-zinc-100">Wall Dashboard</h1>

        <div className="flex items-center gap-3">
          <GridSizeSelector value={gridSize} onChange={handleGridSizeChange} />

          <button
            onClick={handleSavePreset}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
            title="Save preset"
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            onClick={handleLoadPreset}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-sm transition-colors"
            title="Load preset"
          >
            <FolderOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Load</span>
          </button>
        </div>
      </div>

      {/* Chart grid */}
      <div
        className="flex-1 grid gap-4 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${gridConfig.cols}, 1fr)`,
          gridTemplateRows: `repeat(${gridConfig.rows}, 1fr)`,
        }}
      >
        {displayCharacteristics.map((char) => (
          <WallChartCard
            key={char.id}
            characteristicId={char.id}
            onExpand={setExpandedId}
          />
        ))}

        {/* Empty slots */}
        {Array.from({ length: Math.max(0, gridConfig.cols * gridConfig.rows - displayCharacteristics.length) }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="bg-zinc-900/50 rounded-lg border border-zinc-800 border-dashed flex items-center justify-center"
          >
            <span className="text-zinc-600 text-sm">No data</span>
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
