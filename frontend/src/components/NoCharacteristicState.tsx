import { ListTree, ChevronsRight } from 'lucide-react'
import { useUIStore } from '@/stores/uiStore'

export function NoCharacteristicState() {
  const sidebarState = useUIStore((s) => s.sidebarState)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <ListTree className="text-muted-foreground/30 mx-auto mb-4 h-12 w-12" />
        <h3 className="text-foreground mb-1 font-semibold">No characteristic selected</h3>
        <p className="text-muted-foreground mb-4 text-sm">
          Select a characteristic from the sidebar to begin.
        </p>
        {sidebarState === 'collapsed' && (
          <button
            onClick={toggleSidebar}
            className="text-primary hover:text-primary/80 inline-flex items-center gap-2 text-sm font-medium"
          >
            <ChevronsRight className="h-4 w-4" />
            Open sidebar
          </button>
        )}
      </div>
    </div>
  )
}
