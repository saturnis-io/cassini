import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X, ChevronRight, ChevronDown, Tag } from 'lucide-react'
import { characteristicApi, hierarchyApi } from '@/api/client'
import { useUIStore } from '@/stores/uiStore'
import type { HierarchyNode, Characteristic } from '@/types'

interface CharacteristicPickerProps {
  value: number | null
  onChange: (id: number | null) => void
  /** Set of characteristic IDs that already have data sources (shown as disabled/labeled) */
  mappedCharacteristicIds?: Set<number>
}

/**
 * Hierarchy-aware characteristic selector.
 * Shows a searchable dropdown with hierarchy tree structure.
 * Characteristics with existing data sources are labeled "mapped".
 */
export function CharacteristicPicker({
  value,
  onChange,
  mappedCharacteristicIds = new Set(),
}: CharacteristicPickerProps) {
  const selectedPlantId = useUIStore((s) => s.selectedPlantId)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Fetch characteristics
  const { data: charData } = useQuery({
    queryKey: ['characteristics-for-mapping', selectedPlantId],
    queryFn: () =>
      characteristicApi.list({ per_page: 1000, plant_id: selectedPlantId ?? undefined }),
  })
  const characteristics = charData?.items ?? []

  // Fetch hierarchy tree
  const { data: hierarchyTree } = useQuery({
    queryKey: ['hierarchy', 'tree'],
    queryFn: () => hierarchyApi.getTree(),
  })

  // Build hierarchy path lookup
  const charPathMap = useMemo(() => {
    const map = new Map<number, string>()
    if (!hierarchyTree) return map

    function walk(nodes: HierarchyNode[], path: string[]) {
      for (const node of nodes) {
        const currentPath = [...path, node.name]
        // Check if any characteristic belongs to this node
        for (const c of characteristics) {
          if (c.hierarchy_id === node.id) {
            map.set(c.id, currentPath.join(' > '))
          }
        }
        if (node.children) {
          walk(node.children, currentPath)
        }
      }
    }
    walk(hierarchyTree, [])
    return map
  }, [hierarchyTree, characteristics])

  // Filter characteristics by search
  const filtered = useMemo(() => {
    if (!search.trim()) return characteristics
    const q = search.toLowerCase()
    return characteristics.filter((c) => {
      const path = charPathMap.get(c.id) ?? ''
      return c.name.toLowerCase().includes(q) || path.toLowerCase().includes(q)
    })
  }, [characteristics, search, charPathMap])

  // Selected characteristic info
  const selectedChar = characteristics.find((c) => c.id === value)

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="bg-background border-border hover:border-primary/50 focus:border-primary/50 flex w-full items-center gap-2 rounded border px-2.5 py-1.5 text-left text-sm transition-colors focus:outline-none"
      >
        {selectedChar ? (
          <>
            <Tag className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
            <span className="text-foreground flex-1 truncate">{selectedChar.name}</span>
            {value && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                }}
                className="text-muted-foreground hover:text-muted-foreground p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </>
        ) : (
          <span className="text-muted-foreground flex-1">Select characteristic...</span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="bg-card border-border absolute z-50 mt-1 w-full overflow-hidden rounded-lg border shadow-xl">
            {/* Search input */}
            <div className="border-border border-b p-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search characteristics..."
                  autoFocus
                  className="bg-background border-border text-foreground placeholder-muted-foreground focus:border-primary/50 w-full rounded border py-1.5 pr-2 pl-7 text-sm focus:outline-none"
                />
              </div>
            </div>

            {/* Characteristic list */}
            <div className="max-h-[240px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="text-muted-foreground px-3 py-4 text-center text-sm">
                  {search ? 'No characteristics match your search' : 'No characteristics found'}
                </div>
              ) : (
                filtered.map((c) => {
                  const isMapped = mappedCharacteristicIds.has(c.id)
                  const isSelected = c.id === value
                  const path = charPathMap.get(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        onChange(c.id)
                        setIsOpen(false)
                        setSearch('')
                      }}
                      className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-indigo-500/10 text-indigo-300'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <Tag className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{c.name}</span>
                          {isMapped && (
                            <span className="bg-warning/10 text-warning shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold">
                              MAPPED
                            </span>
                          )}
                        </div>
                        {path && (
                          <p className="text-muted-foreground truncate text-[11px]">{path}</p>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
