import { useCharacteristic } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useUIStore } from '@/stores/uiStore'
import { ListTree } from 'lucide-react'

export function CharacteristicContextBar() {
  const charId = useDashboardStore((s) => s.selectedCharacteristicId)
  const { data: char } = useCharacteristic(charId ?? 0)
  const sidebarState = useUIStore((s) => s.sidebarState)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  if (!charId || !char) return null

  const precision = char.decimal_precision ?? 4

  return (
    <div className="bg-muted/50 border-border flex items-center gap-3 rounded-lg border px-4 py-2">
      {/* Type badge */}
      <div className="bg-primary/10 text-primary shrink-0 rounded px-2 py-0.5 text-xs font-bold uppercase">
        {char.data_type === 'attribute'
          ? char.attribute_chart_type ?? 'ATTR'
          : 'VAR'}
      </div>

      {/* Name */}
      <span className="text-sm font-semibold">{char.name}</span>

      {/* Key specs, dot-separated */}
      <span className="text-muted-foreground text-xs">n={char.subgroup_size ?? 1}</span>
      {char.target_value != null && (
        <span className="text-muted-foreground text-xs">Target: {char.target_value}</span>
      )}
      {char.ucl != null && (
        <span className="text-muted-foreground text-xs">UCL: {char.ucl.toFixed(precision)}</span>
      )}
      {char.lcl != null && (
        <span className="text-muted-foreground text-xs">LCL: {char.lcl.toFixed(precision)}</span>
      )}

      {/* Expand sidebar hint when collapsed */}
      {sidebarState === 'collapsed' && (
        <button
          onClick={toggleSidebar}
          className="text-muted-foreground hover:text-foreground ml-auto flex items-center gap-1.5 text-xs"
        >
          <ListTree className="h-3.5 w-3.5" />
          Change
        </button>
      )}
    </div>
  )
}
