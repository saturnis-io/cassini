import { useEffect, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'

export interface DrawerTab {
  id: string
  label: string
  badge?: React.ReactNode
  content: React.ReactNode
}

/** Dashboard-specific: tab IDs must match dashboardStore.drawerTab union */
interface BottomDrawerProps {
  tabs: DrawerTab[]
  className?: string
}

const DRAWER_HEIGHT = 240

export function BottomDrawer({ tabs, className }: BottomDrawerProps) {
  const drawerOpen = useDashboardStore((s) => s.drawerOpen)
  const setDrawerOpen = useDashboardStore((s) => s.setDrawerOpen)
  const drawerTab = useDashboardStore((s) => s.drawerTab)
  const setDrawerTab = useDashboardStore((s) => s.setDrawerTab)

  const activeTab = tabs.find((t) => t.id === drawerTab) ?? tabs[0]

  const handleTabClick = useCallback(
    (tabId: string) => {
      if (drawerOpen && drawerTab === tabId) {
        setDrawerOpen(false)
      } else {
        setDrawerTab(tabId as 'capability' | 'annotations' | 'diagnose')
        setDrawerOpen(true)
      }
    },
    [drawerOpen, drawerTab, setDrawerOpen, setDrawerTab],
  )

  const toggleOpen = useCallback(() => {
    setDrawerOpen(!drawerOpen)
  }, [drawerOpen, setDrawerOpen])

  // Escape key closes drawer
  useEffect(() => {
    if (!drawerOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [drawerOpen, setDrawerOpen])

  return (
    <div
      className={cn('border-border bg-card flex-shrink-0 overflow-hidden rounded-lg border transition-all duration-200', className)}
      style={drawerOpen ? { maxHeight: DRAWER_HEIGHT } : { height: 36 }}
    >
      {/* Tab bar */}
      <div className="flex h-9 flex-shrink-0 items-center gap-0 px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            className={cn(
              'flex h-full items-center gap-1.5 border-b-2 px-3 text-xs font-medium transition-colors',
              drawerTab === tab.id && drawerOpen
                ? 'border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground border-transparent',
            )}
          >
            {tab.label}
            {tab.badge != null && (
              <span className="text-[10px] opacity-75">{tab.badge}</span>
            )}
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={toggleOpen}
          className="text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded p-1 transition-colors"
          title={drawerOpen ? 'Collapse panel' : 'Expand panel'}
        >
          {drawerOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Tab content */}
      {drawerOpen && (
        <div className="overflow-y-auto" style={{ maxHeight: DRAWER_HEIGHT - 36 }}>
          {activeTab?.content}
        </div>
      )}
    </div>
  )
}
