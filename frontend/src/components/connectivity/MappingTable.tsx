import { useState, useMemo } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { MappingRow, UnmappedRow } from './MappingRow'
import type { MappingRowData } from './MappingRow'

type SortField = 'characteristic' | 'status'
type SortDir = 'asc' | 'desc'

interface MappingTableProps {
  mappings: MappingRowData[]
  unmappedCharacteristics: { id: number; name: string }[]
  filter: 'all' | 'mqtt' | 'opcua' | 'unmapped'
  searchQuery: string
  onEdit: (mapping: MappingRowData) => void
  onDelete: (mapping: MappingRowData) => void
  onToggleActive?: (mapping: MappingRowData) => void
  onMapUnmapped: (characteristicId: number) => void
}

/**
 * Sortable, filterable table of all DataSource mappings.
 * Shows mapped data sources and optionally unmapped characteristics.
 */
export function MappingTable({
  mappings,
  unmappedCharacteristics,
  filter,
  searchQuery,
  onEdit,
  onDelete,
  onToggleActive,
  onMapUnmapped,
}: MappingTableProps) {
  const [sortField, setSortField] = useState<SortField>('characteristic')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Filter and search
  const filteredMappings = useMemo(() => {
    let result = mappings

    // Protocol filter
    if (filter === 'mqtt') {
      result = result.filter((m) => m.protocol === 'mqtt')
    } else if (filter === 'opcua') {
      result = result.filter((m) => m.protocol === 'opcua')
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (m) =>
          m.characteristicName.toLowerCase().includes(q) ||
          m.source.toLowerCase().includes(q) ||
          (m.serverName ?? '').toLowerCase().includes(q)
      )
    }

    // Sort
    result = [...result].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortField === 'characteristic') {
        return a.characteristicName.localeCompare(b.characteristicName) * dir
      }
      // status: active first, then inactive, then error
      const statusOrder = (m: MappingRowData) =>
        m.hasError ? 2 : m.isActive ? 0 : 1
      return (statusOrder(a) - statusOrder(b)) * dir
    })

    return result
  }, [mappings, filter, searchQuery, sortField, sortDir])

  // Filtered unmapped
  const filteredUnmapped = useMemo(() => {
    if (filter !== 'unmapped' && filter !== 'all') return []
    let result = unmappedCharacteristics
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((c) => c.name.toLowerCase().includes(q))
    }
    return result
  }, [unmappedCharacteristics, filter, searchQuery])

  const showUnmapped = filter === 'unmapped' || filter === 'all'
  const showMapped = filter !== 'unmapped'
  const isEmpty = filteredMappings.length === 0 && filteredUnmapped.length === 0

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background/50">
              <th className="text-left px-3 py-2.5">
                <SortButton
                  label="Characteristic"
                  active={sortField === 'characteristic'}
                  dir={sortField === 'characteristic' ? sortDir : undefined}
                  onClick={() => toggleSort('characteristic')}
                />
              </th>
              <th className="text-left px-3 py-2.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Source</span>
              </th>
              <th className="text-left px-3 py-2.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Server</span>
              </th>
              <th className="text-left px-3 py-2.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Strategy</span>
              </th>
              <th className="text-left px-3 py-2.5">
                <SortButton
                  label="Status"
                  active={sortField === 'status'}
                  dir={sortField === 'status' ? sortDir : undefined}
                  onClick={() => toggleSort('status')}
                />
              </th>
              <th className="text-left px-3 py-2.5 w-[120px]">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Mapped data sources */}
            {showMapped &&
              filteredMappings.map((mapping) => (
                <MappingRow
                  key={`${mapping.protocol}-${mapping.id}`}
                  mapping={mapping}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onToggleActive={onToggleActive}
                />
              ))}

            {/* Unmapped characteristics */}
            {showUnmapped &&
              filteredUnmapped.map((c) => (
                <UnmappedRow
                  key={`unmapped-${c.id}`}
                  characteristicName={c.name}
                  onMap={() => onMapUnmapped(c.id)}
                />
              ))}

            {/* Empty state */}
            {isEmpty && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-sm">
                  {searchQuery
                    ? 'No mappings match your search.'
                    : filter === 'unmapped'
                      ? 'All characteristics have data sources configured.'
                      : 'No data source mappings found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------
 * Sort Button
 * ----------------------------------------------------------------------- */

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir?: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
        active ? 'text-indigo-400' : 'text-muted-foreground hover:text-muted-foreground'
      }`}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${active ? 'text-indigo-400' : 'text-muted-foreground'}`} />
    </button>
  )
}
