import { useState, useMemo } from 'react'
import { Building2, X, Plus, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/AuthProvider'
import { usePlants } from '@/api/hooks'
import { usePlantHealth } from '@/api/hooks/report-analytics'
import { RequiresTier } from '@/components/RequiresTier'
import { UpgradePage } from '@/pages/UpgradePage'
import type { CharacteristicHealth } from '@/api/types'

const STATUS_CONFIG = {
  good: { icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10', label: 'Capable' },
  warning: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10', label: 'Marginal' },
  critical: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Not Capable' },
} as const

/**
 * Summary tile for a plant's capability status counts.
 */
function SummaryTile({
  status,
  count,
  total,
}: {
  status: 'good' | 'warning' | 'critical'
  count: number
  total: number
}) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0'

  return (
    <div className={cn('rounded-lg p-2 text-center', config.bg)}>
      <Icon className={cn('mx-auto mb-0.5 h-4 w-4', config.color)} />
      <div className={cn('text-lg font-bold', config.color)}>{count}</div>
      <div className="text-muted-foreground text-[10px]">
        {config.label} ({pct}%)
      </div>
    </div>
  )
}

/**
 * A single plant scorecard showing capability summary and top-level metrics.
 */
function PlantScorecard({ plantId, plantName, onRemove }: { plantId: number; plantName: string; onRemove: () => void }) {
  const { data, isLoading, error } = usePlantHealth(plantId)

  if (isLoading) {
    return (
      <div className="bg-card border-border flex min-w-[280px] flex-1 flex-col rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{plantName}</h3>
          <button onClick={onRemove} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">Loading...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-card border-border flex min-w-[280px] flex-1 flex-col rounded-lg border p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{plantName}</h3>
          <button onClick={onRemove} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          Unable to load data
        </div>
      </div>
    )
  }

  const { summary, characteristics } = data

  return (
    <div className="bg-card border-border flex min-w-[280px] flex-1 flex-col rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{plantName}</h3>
        <button onClick={onRemove} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Summary tiles */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <SummaryTile status="good" count={summary.good_count} total={data.total_characteristics} />
        <SummaryTile status="warning" count={summary.warning_count} total={data.total_characteristics} />
        <SummaryTile status="critical" count={summary.critical_count} total={data.total_characteristics} />
      </div>

      {/* Avg Cpk */}
      <div className="text-muted-foreground mb-3 flex gap-4 text-xs">
        <span>
          Avg Cpk: <strong className="text-foreground">{summary.avg_cpk?.toFixed(2) ?? '-'}</strong>
        </span>
        <span>
          Total: <strong className="text-foreground">{data.total_characteristics}</strong>
        </span>
      </div>

      {/* Worst characteristics list */}
      {characteristics.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-border border-b text-left">
                <th className="text-muted-foreground pb-1 pr-2 font-medium">Characteristic</th>
                <th className="text-muted-foreground pb-1 pr-2 text-right font-medium">Cpk</th>
                <th className="text-muted-foreground pb-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {characteristics.slice(0, 10).map((char) => (
                <ScorecardRow key={char.characteristic_id} char={char} />
              ))}
            </tbody>
          </table>
          {characteristics.length > 10 && (
            <p className="text-muted-foreground mt-1 text-[10px]">
              + {characteristics.length - 10} more
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ScorecardRow({ char }: { char: CharacteristicHealth }) {
  const config = STATUS_CONFIG[char.health_status]
  const Icon = config.icon

  return (
    <tr className="border-border border-b last:border-0">
      <td className="py-1 pr-2">
        <div className="font-medium">{char.name}</div>
      </td>
      <td className={cn('py-1 pr-2 text-right tabular-nums', cpkColor(char.cpk))}>
        {char.cpk?.toFixed(2) ?? '-'}
      </td>
      <td className="py-1">
        <span className={cn('inline-flex items-center gap-0.5', config.color)}>
          <Icon className="h-3 w-3" />
        </span>
      </td>
    </tr>
  )
}

function cpkColor(value: number | null): string {
  if (value == null) return 'text-muted-foreground'
  if (value >= 1.33) return 'text-success'
  if (value >= 1.0) return 'text-warning'
  return 'text-destructive'
}

/**
 * Multi-select plant picker dropdown.
 * Only shows plants the user has access to (via plant_roles).
 */
function PlantPicker({
  selectedPlantIds,
  onAdd,
}: {
  selectedPlantIds: number[]
  onAdd: (id: number, name: string) => void
}) {
  const { user } = useAuth()
  const { data: plants = [] } = usePlants(true)
  const [open, setOpen] = useState(false)

  // Filter to plants the user has a role in
  const accessiblePlantIds = useMemo(() => {
    if (!user?.plant_roles) return new Set<number>()
    return new Set(user.plant_roles.map((pr) => pr.plant_id))
  }, [user])

  const availablePlants = useMemo(
    () =>
      plants.filter(
        (p) => accessiblePlantIds.has(p.id) && !selectedPlantIds.includes(p.id),
      ),
    [plants, accessiblePlantIds, selectedPlantIds],
  )

  if (availablePlants.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="border-border text-muted-foreground hover:text-foreground hover:bg-muted flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Plant
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="bg-card border-border absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border shadow-lg">
            {availablePlants.map((plant) => (
              <button
                key={plant.id}
                onClick={() => {
                  onAdd(plant.id, plant.name)
                  setOpen(false)
                }}
                className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <Building2 className="text-muted-foreground h-4 w-4" />
                <span>{plant.name}</span>
                <span className="text-muted-foreground ml-auto text-xs">{plant.code}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * PlantComparisonView — Side-by-side capability scorecards for multiple plants.
 * Enterprise only (multi-plant requires Pro+ license).
 */
export function PlantComparisonView() {
  const [selectedPlants, setSelectedPlants] = useState<{ id: number; name: string }[]>([])

  const handleAddPlant = (id: number, name: string) => {
    setSelectedPlants((prev) => [...prev, { id, name }])
  }

  const handleRemovePlant = (id: number) => {
    setSelectedPlants((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <RequiresTier tier="pro" fallback={<UpgradePage />}>
      <div className="flex h-full flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Plant Comparison</h1>
            <p className="text-muted-foreground text-sm">
              Compare capability scorecards across plants side by side.
            </p>
          </div>
          <PlantPicker
            selectedPlantIds={selectedPlants.map((p) => p.id)}
            onAdd={handleAddPlant}
          />
        </div>

        {/* Scorecards */}
        {selectedPlants.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 text-sm">
            <Building2 className="h-10 w-10 opacity-40" />
            <div className="text-center">
              <p className="font-medium">No plants selected</p>
              <p className="mt-1 text-xs">
                Click "Add Plant" to select plants for comparison.
                Only plants you have access to are shown.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 gap-4 overflow-x-auto">
            {selectedPlants.map((plant) => (
              <PlantScorecard
                key={plant.id}
                plantId={plant.id}
                plantName={plant.name}
                onRemove={() => handleRemovePlant(plant.id)}
              />
            ))}
          </div>
        )}
      </div>
    </RequiresTier>
  )
}
