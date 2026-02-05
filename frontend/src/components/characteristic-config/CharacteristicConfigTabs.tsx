import { useState, useCallback, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Info, Gauge, BarChart3, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TabId = 'general' | 'limits' | 'sampling' | 'rules'

interface Tab {
  id: TabId
  label: string
  icon: ReactNode
}

const TABS: Tab[] = [
  { id: 'general', label: 'General', icon: <Info className="h-4 w-4" /> },
  { id: 'limits', label: 'Limits', icon: <Gauge className="h-4 w-4" /> },
  { id: 'sampling', label: 'Sampling', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'rules', label: 'Rules', icon: <Shield className="h-4 w-4" /> },
]

interface CharacteristicConfigTabsProps {
  children: (activeTab: TabId) => ReactNode
  isDirty?: boolean
  onTabChange?: (tab: TabId) => boolean | void
  className?: string
}

export function CharacteristicConfigTabs({
  children,
  isDirty = false,
  onTabChange,
  className,
}: CharacteristicConfigTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as TabId | null
  const [activeTab, setActiveTab] = useState<TabId>(
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'general'
  )

  const handleTabChange = useCallback(
    (newTab: TabId) => {
      if (newTab === activeTab) return

      // Check if there are unsaved changes
      if (isDirty) {
        const confirmed = window.confirm(
          'You have unsaved changes. Are you sure you want to switch tabs?'
        )
        if (!confirmed) return
      }

      // Allow parent to intercept
      if (onTabChange) {
        const result = onTabChange(newTab)
        if (result === false) return
      }

      setActiveTab(newTab)
      setSearchParams((prev) => {
        prev.set('tab', newTab)
        return prev
      })
    },
    [activeTab, isDirty, onTabChange, setSearchParams]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const currentIndex = TABS.findIndex((t) => t.id === activeTab)
      let newIndex = currentIndex

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        newIndex = (currentIndex + 1) % TABS.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        newIndex = (currentIndex - 1 + TABS.length) % TABS.length
      } else if (e.key === 'Home') {
        e.preventDefault()
        newIndex = 0
      } else if (e.key === 'End') {
        e.preventDefault()
        newIndex = TABS.length - 1
      }

      if (newIndex !== currentIndex) {
        handleTabChange(TABS[newIndex].id)
      }
    },
    [activeTab, handleTabChange]
  )

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Tab Bar */}
      <div
        role="tablist"
        aria-label="Characteristic configuration sections"
        className="flex border-b border-border bg-muted/30"
        onKeyDown={handleKeyDown}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium',
                'border-b-2 transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-inset',
                isActive
                  ? 'border-primary text-primary bg-background'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Panel */}
      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
        className="flex-1 overflow-auto p-5"
      >
        {children(activeTab)}
      </div>
    </div>
  )
}

// Export tab type for consumers
export { TABS }
