import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Search, Link2, Loader2 } from 'lucide-react'
import { tagApi, characteristicApi } from '@/api/client'
import { useUIStore } from '@/stores/uiStore'
import { MappingTable } from './MappingTable'
import { MappingDialog } from './MappingDialog'
import type { MappingRowData } from './MappingRow'
import type { TagMappingResponse } from '@/types'

type FilterOption = 'all' | 'mqtt' | 'opcua' | 'unmapped'

/**
 * Mapping tab -- full DataSource management.
 * Shows all active mappings with filter, search, and CRUD operations.
 * Includes create/edit dialog.
 */
export function MappingTab() {
  const queryClient = useQueryClient()
  const selectedPlantId = useUIStore((s) => s.selectedPlantId)
  const [filter, setFilter] = useState<FilterOption>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMapping, setEditMapping] = useState<MappingRowData | null>(null)

  // Fetch MQTT tag mappings
  const { data: mqttMappings, isLoading: mqttLoading } = useQuery({
    queryKey: ['tag-mappings', null, selectedPlantId],
    queryFn: () => tagApi.getMappings(selectedPlantId ?? undefined),
  })

  // Fetch all characteristics (to determine unmapped ones)
  const { data: charData, isLoading: charLoading } = useQuery({
    queryKey: ['characteristics-for-mapping', selectedPlantId],
    queryFn: () => characteristicApi.list({ per_page: 1000, plant_id: selectedPlantId ?? undefined }),
  })

  const characteristics = charData?.items ?? []

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (charId: number) => tagApi.deleteMapping(charId),
    onSuccess: () => {
      toast.success('Mapping removed')
      queryClient.invalidateQueries({ queryKey: ['tag-mappings'] })
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  })

  // Transform MQTT mappings into unified MappingRowData
  const mappingRows: MappingRowData[] = useMemo(() => {
    const mqttRows: MappingRowData[] = (mqttMappings ?? []).map((m: TagMappingResponse) => ({
      id: m.data_source_id,
      characteristicId: m.characteristic_id,
      characteristicName: m.characteristic_name,
      protocol: 'mqtt' as const,
      source: m.mqtt_topic,
      sourceDetail: m.metric_name ? `metric: ${m.metric_name}` : undefined,
      serverName: m.broker_name,
      triggerStrategy: m.trigger_strategy,
      isActive: m.is_active,
      hasError: false,
    }))

    // TODO: Add OPC-UA mappings when the unified data-source API is available
    return mqttRows
  }, [mqttMappings])

  // Determine unmapped characteristics
  const mappedCharIds = useMemo(() => {
    const ids = new Set<number>()
    for (const m of mqttMappings ?? []) {
      ids.add(m.characteristic_id)
    }
    for (const c of characteristics) {
      if (c.data_source) {
        ids.add(c.id)
      }
    }
    return ids
  }, [mqttMappings, characteristics])

  const unmappedCharacteristics = useMemo(
    () => characteristics
      .filter((c) => !mappedCharIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name })),
    [characteristics, mappedCharIds]
  )

  const isLoading = mqttLoading || charLoading

  const handleEdit = (mapping: MappingRowData) => {
    setEditMapping(mapping)
    setDialogOpen(true)
  }

  const handleDelete = (mapping: MappingRowData) => {
    deleteMutation.mutate(mapping.characteristicId)
  }

  const handleNewMapping = () => {
    setEditMapping(null)
    setDialogOpen(true)
  }

  const handleMapUnmapped = (_characteristicId: number) => {
    setEditMapping(null)
    setDialogOpen(true)
  }

  // Counts
  const totalMappings = mappingRows.length
  const unmappedCount = unmappedCharacteristics.length

  const filterOptions: { value: FilterOption; label: string; count?: number }[] = [
    { value: 'all', label: 'All', count: totalMappings },
    { value: 'mqtt', label: 'MQTT', count: mappingRows.filter((m) => m.protocol === 'mqtt').length },
    { value: 'opcua', label: 'OPC-UA', count: mappingRows.filter((m) => m.protocol === 'opcua').length },
    { value: 'unmapped', label: 'Unmapped', count: unmappedCount },
  ]

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#e2e8f0]">Data Source Mappings</h3>
          <p className="text-xs text-[#475569] mt-0.5">
            Link industrial data points to SPC characteristics
          </p>
        </div>
        <button
          onClick={handleNewMapping}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          New Mapping
        </button>
      </div>

      {/* Filter chips + search */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Filter chips */}
        <div className="flex items-center gap-1">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                filter === opt.value
                  ? 'bg-indigo-500/15 text-indigo-300 font-medium'
                  : 'text-[#64748b] hover:text-[#94a3b8] hover:bg-[#1e293b]'
              }`}
            >
              {opt.label}
              {opt.count !== undefined && opt.count > 0 && (
                <span className="ml-1 text-[10px] opacity-70">{opt.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#475569]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search characteristics..."
            className="w-full pl-8 pr-3 py-1.5 text-sm bg-[#0a0f1a] border border-[#1e293b] rounded-md text-[#e2e8f0] placeholder-[#475569] focus:outline-none focus:border-indigo-500/50"
          />
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-[#64748b]">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-sm">Loading mappings...</span>
        </div>
      ) : totalMappings === 0 && unmappedCount === 0 ? (
        /* Empty state -- no characteristics at all */
        <div className="bg-[#111827] border border-[#1e293b] rounded-xl p-12 text-center">
          <Link2 className="h-10 w-10 mx-auto mb-3 text-[#1e293b]" />
          <h3 className="text-sm font-medium text-[#94a3b8] mb-1">No Data Source Mappings</h3>
          <p className="text-xs text-[#475569] max-w-sm mx-auto mb-4">
            Link your industrial data points to SPC characteristics.
            Create characteristics in Configuration first, then map them to MQTT topics or OPC-UA nodes.
          </p>
          <button
            onClick={handleNewMapping}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Mapping
          </button>
        </div>
      ) : (
        <>
          {/* Table */}
          <MappingTable
            mappings={mappingRows}
            unmappedCharacteristics={unmappedCharacteristics}
            filter={filter}
            searchQuery={searchQuery}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onMapUnmapped={handleMapUnmapped}
          />

          {/* Summary */}
          <div className="text-xs text-[#475569]">
            Showing {totalMappings} mapping{totalMappings !== 1 ? 's' : ''}
            {unmappedCount > 0 && (
              <span> ({unmappedCount} unmapped characteristic{unmappedCount !== 1 ? 's' : ''})</span>
            )}
          </div>
        </>
      )}

      {/* Mapping dialog */}
      <MappingDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setEditMapping(null)
        }}
        editData={editMapping ? {
          dataSourceId: editMapping.id,
          characteristicId: editMapping.characteristicId,
          protocol: editMapping.protocol,
          triggerStrategy: editMapping.triggerStrategy,
          topic: editMapping.protocol === 'mqtt' ? editMapping.source : undefined,
          brokerId: undefined,
          metricName: editMapping.sourceDetail?.replace('metric: ', '') ?? undefined,
        } : null}
        mappedCharacteristicIds={mappedCharIds}
      />
    </div>
  )
}
