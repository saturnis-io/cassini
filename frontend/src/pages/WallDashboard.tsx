import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, Save, FolderOpen, Grid2x2, Orbit, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCharacteristics, useChartData } from '@/api/hooks'
import { CHART_DATA_REFETCH_MS } from '@/api/hooks/queryKeys'
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
 * Inline dialog for entering a new preset name.
 *
 * Replaces the previous `prompt(...)` call which blocked the main thread,
 * was unthemed, and seized focus from kiosk/wall fullscreen mode.
 */
function SavePresetDialog({
  isOpen,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')

  // Reset on each open
  useEffect(() => {
    if (isOpen) setName('')
  }, [isOpen])

  if (!isOpen) return null

  const trimmed = name.trim()
  const handleConfirm = () => {
    if (trimmed) onConfirm(trimmed)
  }

  return (
    <div
      data-ui="wall-dashboard-save-preset-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="bg-card border-border relative w-full max-w-md rounded-xl border p-6 shadow-lg">
        <h3 className="mb-2 text-lg font-semibold">Save preset</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          Enter a name for the current grid layout.
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm()
            if (e.key === 'Escape') onCancel()
          }}
          placeholder="My layout"
          className="bg-background border-border focus:ring-primary/50 mb-6 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!trimmed}
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Inline dialog for picking a preset to load.
 *
 * Replaces a `prompt(...)` that asked the user to type the preset name
 * exactly — a footgun on kiosk hardware without a physical keyboard.
 */
function LoadPresetDialog({
  isOpen,
  presets,
  onSelect,
  onDelete,
  onCancel,
}: {
  isOpen: boolean
  presets: DashboardPreset[]
  onSelect: (preset: DashboardPreset) => void
  onDelete: (name: string) => void
  onCancel: () => void
}) {
  if (!isOpen) return null

  return (
    <div
      data-ui="wall-dashboard-load-preset-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="bg-card border-border relative w-full max-w-md rounded-xl border p-6 shadow-lg">
        <h3 className="mb-4 text-lg font-semibold">Load preset</h3>
        {presets.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No saved presets yet.
          </p>
        ) : (
          <ul className="border-border mb-6 max-h-72 divide-y overflow-auto rounded-md border">
            {presets.map((p) => (
              <li
                key={p.name}
                className="hover:bg-muted flex items-center gap-2 px-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className="flex flex-1 flex-col items-start text-left"
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {p.gridSize} - {p.characteristicIds.length} chart(s)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(p.name)}
                  aria-label={`Delete preset ${p.name}`}
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1.5"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-lg px-4 py-2 text-sm"
          >
            Close
          </button>
        </div>
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
  // Dialog state — replaces blocking prompt()/alert() calls so that
  // wall/kiosk fullscreen mode never loses focus to a browser modal.
  const [savePresetOpen, setSavePresetOpen] = useState(false)
  const [loadPresetOpen, setLoadPresetOpen] = useState(false)
  const [savedPresets, setSavedPresets] = useState<DashboardPreset[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    } catch {
      return []
    }
  })

  // Batch-invalidate all chart data queries on a single interval instead of
  // each WallChartCard polling independently (N staggered requests → 1 burst)
  const queryClient = useQueryClient()
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['characteristics', 'chartData'] })
    }, CHART_DATA_REFETCH_MS)
    return () => clearInterval(interval)
  }, [queryClient])

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

  // Open the inline save-preset dialog (no blocking prompt())
  const handleOpenSavePreset = useCallback(() => {
    setSavePresetOpen(true)
  }, [])

  // Persist a new preset.  Replaces the previous prompt()/alert() pair.
  const handleConfirmSavePreset = useCallback(
    (name: string) => {
      const preset: DashboardPreset = {
        name,
        gridSize,
        characteristicIds: displayCharacteristics.map((c) => c.id),
      }
      const updated = (() => {
        // Replace existing preset with the same name to avoid silent dupes
        const existing = savedPresets.filter((p) => p.name !== name)
        return [...existing, preset]
      })()
      setSavedPresets(updated)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        toast.success(`Preset "${name}" saved`)
      } catch {
        toast.error('Failed to save preset to local storage')
      }
      setSavePresetOpen(false)
    },
    [gridSize, displayCharacteristics, savedPresets],
  )

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

  // Open the inline load-preset dialog
  const handleOpenLoadPreset = useCallback(() => {
    // Refresh from storage in case another tab has saved presets
    try {
      setSavedPresets(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
    } catch {
      setSavedPresets([])
    }
    setLoadPresetOpen(true)
  }, [])

  // Apply a chosen preset
  const handleApplyPreset = useCallback(
    (preset: DashboardPreset) => {
      setGridSize(preset.gridSize)
      const newParams = new URLSearchParams()
      newParams.set('grid', preset.gridSize)
      if (preset.characteristicIds.length) {
        newParams.set('chars', preset.characteristicIds.join(','))
      }
      setSearchParams(newParams)
      setLoadPresetOpen(false)
      toast.success(`Loaded preset "${preset.name}"`)
    },
    [setSearchParams],
  )

  // Delete a preset from local storage
  const handleDeletePreset = useCallback(
    (name: string) => {
      const updated = savedPresets.filter((p) => p.name !== name)
      setSavedPresets(updated)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        toast.success(`Deleted preset "${name}"`)
      } catch {
        toast.error('Failed to update local storage')
      }
    },
    [savedPresets],
  )

  return (
    <div data-ui="wall-dashboard-page" className="bg-background relative flex h-full flex-col p-4">
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
      <div data-ui="wall-dashboard-toolbar" className="mb-4 flex items-center justify-between">
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
            onClick={handleOpenSavePreset}
            className="bg-muted hover:bg-muted/80 flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors"
            title="Save preset"
          >
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            onClick={handleOpenLoadPreset}
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
        data-ui="wall-dashboard-content"
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
          <WallChartCard key={char.id} characteristicId={char.id} onExpand={setExpandedId} disablePolling />
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

      {/* Inline preset dialogs — replace blocking prompt()/alert() so the
          kiosk fullscreen surface never loses focus to a browser modal. */}
      <SavePresetDialog
        isOpen={savePresetOpen}
        onConfirm={handleConfirmSavePreset}
        onCancel={() => setSavePresetOpen(false)}
      />
      <LoadPresetDialog
        isOpen={loadPresetOpen}
        presets={savedPresets}
        onSelect={handleApplyPreset}
        onDelete={handleDeletePreset}
        onCancel={() => setLoadPresetOpen(false)}
      />
    </div>
  )
}
