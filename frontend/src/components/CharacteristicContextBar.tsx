import { useCharacteristic, useHierarchyPath } from '@/api/hooks'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useUIStore } from '@/stores/uiStore'
import { ChevronRight, ListTree } from 'lucide-react'

export function CharacteristicContextBar() {
  const charId = useDashboardStore((s) => s.selectedCharacteristicId)
  const { data: char } = useCharacteristic(charId ?? 0)
  const hierarchyPath = useHierarchyPath(charId)
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

      {/* Hierarchy breadcrumb → Characteristic name */}
      <div className="flex min-w-0 items-center gap-1 overflow-hidden">
        {hierarchyPath.map((node) => (
          <span key={node.id} className="flex shrink-0 items-center gap-1">
            <span className="text-muted-foreground text-xs">{node.name}</span>
            <ChevronRight className="text-muted-foreground/50 h-3 w-3 shrink-0" />
          </span>
        ))}
        <span className="truncate text-sm font-semibold">{char.name}</span>
      </div>

      {/* Key specs */}
      <div className="text-muted-foreground ml-auto flex shrink-0 items-center gap-3 text-xs">
        <span>n={char.subgroup_size ?? 1}</span>
        {char.target_value != null && <span>Target: {char.target_value}</span>}
        {char.ucl != null && <span>UCL: {char.ucl.toFixed(precision)}</span>}
        {char.lcl != null && <span>LCL: {char.lcl.toFixed(precision)}</span>}

        {/* Expand sidebar hint when collapsed */}
        {sidebarState === 'collapsed' && (
          <button
            onClick={toggleSidebar}
            aria-label="Change characteristic — expand sidebar"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          >
            <ListTree className="h-3.5 w-3.5" />
            Change
          </button>
        )}
      </div>
    </div>
  )
}
