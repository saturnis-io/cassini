import { useState, useRef, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Box,
  Factory,
  Cog,
  Cpu,
  Settings,
  Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { characteristicApi } from '@/api/client'
import { useCharacteristic, useHierarchyTreeByPlant, useHierarchyCharacteristics } from '@/api/hooks'
import { usePlantContext } from '@/providers/PlantProvider'
import type { HierarchyNode, Characteristic } from '@/types'

interface CharacteristicPickerProps {
  value: number | null
  onChange: (id: number | null) => void
  /** Set of characteristic IDs that already have data sources (shown as labeled) */
  mappedCharacteristicIds?: Set<number>
}

const nodeTypeIcons: Record<string, React.ReactNode> = {
  Folder: <Box className="h-3.5 w-3.5" />,
  Enterprise: <Factory className="h-3.5 w-3.5" />,
  Site: <Factory className="h-3.5 w-3.5" />,
  Area: <Box className="h-3.5 w-3.5" />,
  Line: <Cog className="h-3.5 w-3.5" />,
  Cell: <Cpu className="h-3.5 w-3.5" />,
  Equipment: <Settings className="h-3.5 w-3.5" />,
  Tag: <Settings className="h-3.5 w-3.5" />,
}

/**
 * Hierarchy-aware characteristic selector for connectivity mapping.
 * Shows an expandable hierarchy tree with lazy-loaded characteristics per node.
 * Search falls back to a flat list with hierarchy paths.
 * Characteristics with existing data sources are labeled "MAPPED".
 */
export function CharacteristicPicker({
  value,
  onChange,
  mappedCharacteristicIds = new Set(),
}: CharacteristicPickerProps) {
  const selectedPlantId = usePlantContext().selectedPlant?.id ?? null
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch hierarchy tree for the selected plant
  const { data: tree } = useHierarchyTreeByPlant(selectedPlantId ?? 0)

  // Fetch all characteristics for search fallback and selected display
  const { data: charData } = useQuery({
    queryKey: ['characteristics-for-mapping', selectedPlantId],
    queryFn: () =>
      characteristicApi.list({ per_page: 1000, plant_id: selectedPlantId ?? undefined }),
  })
  const allCharacteristics = useMemo(() => charData?.items ?? [], [charData?.items])

  // Build hierarchy path lookup for search results
  const charPathMap = useMemo(() => {
    const map = new Map<number, string>()
    if (!tree) return map

    function walk(nodes: HierarchyNode[], path: string[]) {
      for (const node of nodes) {
        const currentPath = [...path, node.name]
        for (const c of allCharacteristics) {
          if (c.hierarchy_id === node.id) {
            map.set(c.id, currentPath.join(' > '))
          }
        }
        if (node.children) {
          walk(node.children, currentPath)
        }
      }
    }
    walk(tree, [])
    return map
  }, [tree, allCharacteristics])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Find selected characteristic name for trigger display.
  // Use the full list first; fall back to a single-item query so the trigger
  // shows the correct name even when the list hasn't finished loading yet
  // (e.g. when the dialog opens in edit mode).
  const selectedCharFromList = allCharacteristics.find((c) => c.id === value)
  const { data: selectedCharFallback } = useCharacteristic(
    value && !selectedCharFromList ? value : 0,
  )
  const selectedChar = selectedCharFromList ?? (selectedCharFallback
    ? { id: selectedCharFallback.id, name: selectedCharFallback.name }
    : null)

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelect = (charId: number) => {
    onChange(charId)
    setOpen(false)
    setSearch('')
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(null)
  }

  // Filter characteristics by search (flat list with paths)
  const filteredChars = useMemo(() => {
    if (!search.trim()) return null
    const q = search.toLowerCase()
    return allCharacteristics.filter((c) => {
      const path = charPathMap.get(c.id) ?? ''
      return c.name.toLowerCase().includes(q) || path.toLowerCase().includes(q)
    })
  }, [search, allCharacteristics, charPathMap])

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'bg-background border-border focus:ring-primary/50 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm focus:ring-2 focus:outline-none',
          !selectedChar && 'text-muted-foreground',
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selectedChar ? (
            <>
              <Tag className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="text-foreground truncate">{selectedChar.name}</span>
            </>
          ) : (
            'Select characteristic...'
          )}
        </span>
        <div className="flex items-center gap-1">
          {selectedChar && (
            <span
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground rounded p-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="bg-popover border-border absolute z-50 mt-1 w-full overflow-hidden rounded-lg border shadow-lg">
          {/* Search */}
          <div className="border-border border-b p-2">
            <div className="bg-background border-border flex items-center gap-2 rounded border px-2 py-1.5">
              <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search characteristics..."
                className="bg-transparent w-full text-xs outline-none placeholder:text-muted-foreground"
                autoFocus
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="max-h-64 overflow-y-auto p-1">
            {/* Search results (flat list with paths) */}
            {filteredChars ? (
              filteredChars.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-center text-xs">
                  No characteristics match your search
                </p>
              ) : (
                filteredChars.map((c) => {
                  const isMapped = mappedCharacteristicIds.has(c.id)
                  const isSelected = c.id === value
                  const path = charPathMap.get(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelect(c.id)}
                      className={cn(
                        'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs',
                        isSelected
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-muted',
                      )}
                    >
                      <Tag className="text-muted-foreground mt-0.5 h-3 w-3 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{c.name}</span>
                          {isMapped && (
                            <span className="bg-warning/10 text-warning shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold">
                              MAPPED
                            </span>
                          )}
                        </div>
                        {path && (
                          <p className="text-muted-foreground truncate text-[10px]">{path}</p>
                        )}
                      </div>
                    </button>
                  )
                })
              )
            ) : (
              /* Tree view */
              tree && tree.length > 0 ? (
                tree.map((node) => (
                  <PickerNode
                    key={node.id}
                    node={node}
                    level={0}
                    expandedIds={expandedIds}
                    onToggle={toggleExpand}
                    onSelect={handleSelect}
                    selectedId={value}
                    mappedCharacteristicIds={mappedCharacteristicIds}
                  />
                ))
              ) : (
                /* Flat fallback if no tree */
                allCharacteristics.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-3 text-center text-xs">
                    No characteristics found
                  </p>
                ) : (
                  allCharacteristics.map((c) => {
                    const isMapped = mappedCharacteristicIds.has(c.id)
                    const isSelected = c.id === value
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleSelect(c.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs',
                          isSelected
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-muted',
                        )}
                      >
                        <Tag className="text-muted-foreground h-3 w-3 shrink-0" />
                        <span className="truncate">{c.name}</span>
                        {isMapped && (
                          <span className="bg-warning/10 text-warning shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold">
                            MAPPED
                          </span>
                        )}
                      </button>
                    )
                  })
                )
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** A single node in the picker tree */
function PickerNode({
  node,
  level,
  expandedIds,
  onToggle,
  onSelect,
  selectedId,
  mappedCharacteristicIds,
}: {
  node: HierarchyNode
  level: number
  expandedIds: Set<number>
  onToggle: (id: number) => void
  onSelect: (charId: number) => void
  selectedId: number | null
  mappedCharacteristicIds: Set<number>
}) {
  const isExpanded = expandedIds.has(node.id)
  const hasChildren =
    (node.children && node.children.length > 0) ||
    (node.characteristic_count != null && node.characteristic_count > 0)

  // Only fetch characteristics when this node is expanded
  const { data: chars } = useHierarchyCharacteristics(isExpanded ? node.id : 0)

  return (
    <div>
      {/* Node row */}
      <div
        className="flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-xs hover:bg-muted"
        style={{ paddingLeft: `${level * 14 + 4}px` }}
        onClick={() => hasChildren && onToggle(node.id)}
      >
        {hasChildren ? (
          isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="text-muted-foreground shrink-0">
          {nodeTypeIcons[node.type] || <Box className="h-3.5 w-3.5" />}
        </span>
        <span className="truncate">{node.name}</span>
        {node.characteristic_count != null && node.characteristic_count > 0 && (
          <span className="bg-muted text-muted-foreground ml-auto rounded px-1 py-0.5 text-[10px]">
            {node.characteristic_count}
          </span>
        )}
      </div>

      {/* Expanded children + characteristics */}
      {isExpanded && (
        <>
          {node.children?.map((child) => (
            <PickerNode
              key={child.id}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedId={selectedId}
              mappedCharacteristicIds={mappedCharacteristicIds}
            />
          ))}
          {chars?.map((char: Characteristic) => {
            const isMapped = mappedCharacteristicIds.has(char.id)
            const isSelected = selectedId === char.id
            return (
              <button
                key={char.id}
                type="button"
                onClick={() => onSelect(char.id)}
                className={cn(
                  'flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-xs',
                  isSelected
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted',
                )}
                style={{ paddingLeft: `${(level + 1) * 14 + 4}px` }}
              >
                <span className="w-3 shrink-0" />
                <div
                  className={cn(
                    'h-1.5 w-1.5 rounded-full shrink-0',
                    (char as Characteristic & { in_control?: boolean }).in_control !== false
                      ? 'bg-green-500'
                      : 'bg-red-500',
                  )}
                />
                <span className="truncate">{char.name}</span>
                {isMapped && (
                  <span className="bg-warning/10 text-warning ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold">
                    MAPPED
                  </span>
                )}
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}
