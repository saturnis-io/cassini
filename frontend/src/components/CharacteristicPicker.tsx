import { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, Search, X, Box, Factory, Cog, Cpu, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useHierarchyTreeByPlant, useHierarchyCharacteristics } from '@/api/hooks'
import type { HierarchyNode, Characteristic } from '@/types'

interface CharacteristicPickerProps {
  plantId: number
  value: number | null
  onChange: (charId: number | null) => void
  characteristics: { id: number; name: string }[]
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

export function CharacteristicPicker({ plantId, value, onChange, characteristics }: CharacteristicPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { data: tree } = useHierarchyTreeByPlant(plantId)

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

  const selectedChar = characteristics.find((c) => c.id === value)

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

  // Filter characteristics by search
  const filteredChars = search.trim()
    ? characteristics.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : null

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
        <span className="truncate">
          {selectedChar ? selectedChar.name : '-- None --'}
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
            </div>
          </div>

          {/* Content */}
          <div className="max-h-64 overflow-y-auto p-1">
            {/* None option */}
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); setSearch('') }}
              className={cn(
                'w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted',
                value === null && 'bg-primary/10 text-primary',
              )}
            >
              -- None --
            </button>

            {/* Search results (flat list) */}
            {filteredChars ? (
              filteredChars.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-center text-xs">No matches</p>
              ) : (
                filteredChars.map((c) => {
                  // Characteristic names are NOT unique across hierarchies —
                  // always show the breadcrumb path so the operator can
                  // disambiguate (per CLAUDE.md rule).
                  const hierarchyPath = (c as { hierarchy_path?: string }).hierarchy_path
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelect(c.id)}
                      className={cn(
                        'flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-xs hover:bg-muted',
                        value === c.id && 'bg-primary/10 text-primary font-medium',
                      )}
                    >
                      <span className="truncate">{c.name}</span>
                      {hierarchyPath && (
                        <span className="text-muted-foreground truncate text-xs">
                          {hierarchyPath}
                        </span>
                      )}
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
                  />
                ))
              ) : (
                /* Flat fallback if no tree — show hierarchy_path when
                   available so non-unique names remain disambiguated */
                characteristics.map((c) => {
                  const hierarchyPath = (c as { hierarchy_path?: string }).hierarchy_path
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelect(c.id)}
                      className={cn(
                        'flex w-full flex-col items-start rounded px-2 py-1.5 text-left text-xs hover:bg-muted',
                        value === c.id && 'bg-primary/10 text-primary font-medium',
                      )}
                    >
                      <span className="truncate">{c.name}</span>
                      {hierarchyPath && (
                        <span className="text-muted-foreground truncate text-xs">
                          {hierarchyPath}
                        </span>
                      )}
                    </button>
                  )
                })
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
}: {
  node: HierarchyNode
  level: number
  expandedIds: Set<number>
  onToggle: (id: number) => void
  onSelect: (charId: number) => void
  selectedId: number | null
}) {
  const isExpanded = expandedIds.has(node.id)
  const hasChildren = (node.children && node.children.length > 0) || (node.characteristic_count && node.characteristic_count > 0)

  // Only fetch characteristics when expanded
  const { data: chars } = useHierarchyCharacteristics(isExpanded ? node.id : 0)

  return (
    <div>
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
            />
          ))}
          {chars?.map((char: Characteristic) => (
            <button
              key={char.id}
              type="button"
              onClick={() => onSelect(char.id)}
              className={cn(
                'flex w-full items-start gap-1.5 rounded px-1 py-1 text-left text-xs hover:bg-muted',
                selectedId === char.id && 'bg-primary/10 text-primary font-medium',
              )}
              style={{ paddingLeft: `${(level + 1) * 14 + 4}px` }}
            >
              <span className="w-3 shrink-0" />
              <div
                className={cn(
                  'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                  char.in_control ? 'bg-success' : 'bg-destructive',
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{char.name}</span>
                {char.hierarchy_path && (
                  <span className="text-muted-foreground truncate text-xs">
                    {char.hierarchy_path}
                  </span>
                )}
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  )
}
