import { useState, useCallback } from 'react'
import { AlertTriangle, Loader2, Lock } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { plantApi } from '@/api/plants.api'
import { queryKeys } from '@/api/hooks/queryKeys'
import type { LicenseCompliance } from '@/api/license.api'
import type { Plant } from '@/types'

interface PlantComplianceDialogProps {
  compliance: LicenseCompliance
  plants: Plant[]
}

export function PlantComplianceDialog({
  compliance,
  plants,
}: PlantComplianceDialogProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryClient = useQueryClient()

  const activePlants = plants.filter((p) => p.is_active)
  const remaining = compliance.excess - selected.size

  const togglePlant = useCallback((plantId: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(plantId)) {
        next.delete(plantId)
      } else {
        next.add(plantId)
      }
      return next
    })
  }, [])

  const handleSubmit = async () => {
    if (selected.size !== compliance.excess) return
    setIsSubmitting(true)

    try {
      await Promise.all(
        Array.from(selected).map((id) =>
          plantApi.deactivate(id),
        ),
      )
      queryClient.invalidateQueries({ queryKey: queryKeys.plants.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.license.compliance() })
      toast.success(`Deactivated ${selected.size} site${selected.size === 1 ? '' : 's'}`)
    } catch {
      toast.error('Failed to deactivate sites. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      data-ui="plant-compliance-dialog"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50"
    >
      <div className="bg-card border-border mx-4 w-full max-w-lg rounded-2xl border p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="text-destructive h-5 w-5" />
          <h3 className="text-lg font-semibold">Site Limit Exceeded</h3>
        </div>

        <p className="text-muted-foreground mb-1 text-sm">
          Your license allows <strong>{compliance.max_plants}</strong> active site
          {compliance.max_plants === 1 ? '' : 's'}, but you have{' '}
          <strong>{compliance.active_plant_count}</strong> active. Please deactivate{' '}
          <strong>{compliance.excess}</strong> site{compliance.excess === 1 ? '' : 's'} to
          continue.
        </p>

        {remaining > 0 && (
          <p className="text-warning mb-4 text-sm font-medium">
            Select {remaining} more to deactivate
          </p>
        )}
        {remaining === 0 && (
          <p className="text-success mb-4 text-sm font-medium">
            Ready to deactivate
          </p>
        )}

        <div className="border-border mb-4 max-h-64 overflow-y-auto rounded-lg border">
          {activePlants.map((plant) => {
            const isDefault = plant.code === 'DEFAULT'
            const isChecked = selected.has(plant.id)
            const disabled =
              isDefault ||
              isSubmitting ||
              (!isChecked && selected.size >= compliance.excess)

            return (
              <label
                key={plant.id}
                className={cn(
                  'border-border flex items-center gap-3 border-b px-4 py-3 last:border-b-0',
                  isDefault
                    ? 'cursor-not-allowed opacity-60'
                    : disabled
                      ? 'cursor-not-allowed opacity-50'
                      : 'cursor-pointer hover:bg-muted/50',
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={disabled}
                  onChange={() => togglePlant(plant.id)}
                  className="accent-destructive h-4 w-4 rounded"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {plant.name}
                    {isDefault && (
                      <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                        <Lock className="h-3 w-3" />
                        Default
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">{plant.code}</div>
                </div>
              </label>
            )
          })}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSubmit}
            disabled={selected.size !== compliance.excess || isSubmitting}
            className={cn(
              'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium',
              'bg-destructive text-destructive-foreground',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSubmitting
              ? 'Deactivating...'
              : `Deactivate ${compliance.excess} Site${compliance.excess === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
