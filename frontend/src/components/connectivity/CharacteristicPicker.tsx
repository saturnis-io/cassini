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
    queryFn: () => characteristicApi.list({ per_page: 1000, plant_id: selectedPlantId ?? undefined }),
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
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm bg-background border border-border rounded text-left hover:border-primary/50 transition-colors focus:outline-none focus:border-primary/50"
      >
        {selectedChar ? (
          <>
            <Tag className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <span className="flex-1 truncate text-foreground">{selectedChar.name}</span>
            {value && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                }}
                className="p-0.5 text-muted-foreground hover:text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </>
        ) : (
          <span className="flex-1 text-muted-foreground">Select characteristic...</span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-xl overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search characteristics..."
                  autoFocus
                  className="w-full pl-7 pr-2 py-1.5 text-sm bg-background border border-border rounded text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {/* Characteristic list */}
            <div className="max-h-[240px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-muted-foreground">
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
                      className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm transition-colors ${
                        isSelected
                          ? 'bg-indigo-500/10 text-indigo-300'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <Tag className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{c.name}</span>
                          {isMapped && (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-amber-500/10 text-amber-400 shrink-0">
                              MAPPED
                            </span>
                          )}
                        </div>
                        {path && (
                          <p className="text-[11px] text-muted-foreground truncate">{path}</p>
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
