import { useState, useEffect, useMemo, useCallback } from 'react'
import { Pencil, Trash2, EyeOff, Eye, History, Filter, X, ChevronDown, ChevronUp, MapPin, Clock, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { useSamples, useDeleteSample, useExcludeSample, useCharacteristic } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { usePlantContext } from '@/providers/PlantProvider'
import { useDashboardStore } from '@/stores/dashboardStore'
import { canPerformAction } from '@/lib/roles'
import { HierarchyCharacteristicSelector } from './HierarchyCharacteristicSelector'
import { SampleEditModal } from './SampleEditModal'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { LocalTimeRangeSelector, type TimeRangeState } from './LocalTimeRangeSelector'
import { EditHistoryTooltip } from './EditHistoryTooltip'
import type { Sample, Characteristic } from '@/types'

/** Samples shown per page in the history table */
const SAMPLES_PER_PAGE = 20

// Default time range: last 100 samples
const defaultTimeRange: TimeRangeState = {
  type: 'points',
  pointsLimit: 100,
  hoursBack: null,
  startDate: null,
  endDate: null,
}

// Filter chip component
function FilterChip({
  icon: Icon,
  label,
  onRemove
}: {
  icon: React.ElementType
  label: string
  onRemove: () => void
}) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-sm text-primary">
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium">{label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="ml-1 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function SampleHistoryPanel() {
  const { role } = useAuth()
  const { selectedPlant } = usePlantContext()
  const globalCharId = useDashboardStore((s) => s.selectedCharacteristicId)
  const setGlobalCharId = useDashboardStore((s) => s.setSelectedCharacteristicId)
  const [selectedChar, setSelectedChar] = useState<Characteristic | null>(null)

  // Restore selection from global store on mount
  const { data: restoredChar } = useCharacteristic(
    globalCharId && !selectedChar ? globalCharId : 0
  )
  useEffect(() => {
    if (restoredChar && !selectedChar && globalCharId) {
      setSelectedChar(restoredChar)
    }
  }, [restoredChar, selectedChar, globalCharId])
  const [timeRange, setTimeRange] = useState<TimeRangeState>(defaultTimeRange)
  const [includeExcluded, setIncludeExcluded] = useState(false)
  const [page, setPage] = useState(1)
  const [filtersExpanded, setFiltersExpanded] = useState(true)
  const perPage = SAMPLES_PER_PAGE

  // Sort state
  type SortField = 'timestamp' | 'mean'
  type SortDir = 'asc' | 'desc'
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      // Cycle: asc → desc → off
      if (sortDir === 'asc') setSortDir('desc')
      else { setSortField(null) }
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }, [sortField, sortDir])

  // Convert time range to query params
  const queryParams = useMemo(() => {
    const params: {
      characteristic_id?: number
      start_date?: string
      end_date?: string
      include_excluded?: boolean
      page: number
      per_page: number
      sort_dir?: 'asc' | 'desc'
    } = {
      characteristic_id: selectedChar?.id,
      include_excluded: includeExcluded,
      page,
      per_page: perPage,
      sort_dir: sortField === 'timestamp' ? sortDir : 'desc',
    }

    if (timeRange.type === 'custom' && timeRange.startDate && timeRange.endDate) {
      params.start_date = timeRange.startDate
      params.end_date = timeRange.endDate
    } else if (timeRange.type === 'duration' && timeRange.hoursBack) {
      const now = new Date()
      const start = new Date(now.getTime() - timeRange.hoursBack * 60 * 60 * 1000)
      params.start_date = start.toISOString()
      params.end_date = now.toISOString()
    }

    return params
  }, [selectedChar?.id, timeRange, includeExcluded, page, perPage, sortField, sortDir])

  // Modal state
  const [editingSample, setEditingSample] = useState<Sample | null>(null)
  const [deletingSampleId, setDeletingSampleId] = useState<number | null>(null)

  const { data: samplesData, isLoading: loadingSamples, error: samplesError } = useSamples(queryParams)

  const deleteSample = useDeleteSample()
  const excludeSample = useExcludeSample()

  const samples = samplesData?.items || []
  const rawTotal = samplesData?.total || 0
  // For "Last X points" mode, cap total to pointsLimit so pagination doesn't exceed it
  const totalSamples = timeRange.type === 'points' && timeRange.pointsLimit
    ? Math.min(rawTotal, timeRange.pointsLimit)
    : rawTotal
  const totalPages = Math.ceil(totalSamples / perPage)

  // Apply optional client-side sort for mean column (timestamp sort is handled server-side)
  const displayedSamples = useMemo(() => {
    if (sortField !== 'mean') return samples
    const sorted = [...samples]
    sorted.sort((a, b) => {
      const av = a.mean
      const bv = b.mean
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return sorted
  }, [samples, sortField, sortDir])

  const handleDelete = () => {
    if (deletingSampleId !== null) {
      deleteSample.mutate(deletingSampleId, {
        onSuccess: () => setDeletingSampleId(null),
      })
    }
  }

  const handleToggleExclude = (sample: Sample) => {
    const isCurrentlyExcluded = sample.is_excluded
    excludeSample.mutate({
      id: sample.id,
      excluded: !isCurrentlyExcluded,
    })
  }

  // Helper to get measurement values - handles both number[] and Measurement[] formats
  const getMeasurementValues = (sample: Sample): number[] => {
    if (!sample.measurements || sample.measurements.length === 0) {
      return []
    }
    // Check if it's an array of numbers or Measurement objects
    const first = sample.measurements[0]
    if (typeof first === 'number') {
      return sample.measurements as unknown as number[]
    }
    // It's Measurement objects
    return sample.measurements.map(m => m.value)
  }

  const handleCharacteristicSelect = (char: Characteristic) => {
    setSelectedChar(char)
    setGlobalCharId(char.id)
    setPage(1)
  }

  // Get time range label for chip
  const getTimeRangeLabel = (): string => {
    if (timeRange.type === 'custom') return 'Custom range'
    if (timeRange.type === 'points' && timeRange.pointsLimit) return `Last ${timeRange.pointsLimit}`
    if (timeRange.type === 'duration' && timeRange.hoursBack) {
      if (timeRange.hoursBack < 24) return `Last ${timeRange.hoursBack}h`
      return `Last ${timeRange.hoursBack / 24}d`
    }
    return 'Last 100'
  }

  // Count active filters
  const activeFilterCount = (selectedChar ? 1 : 0) + (includeExcluded ? 1 : 0)

  // Reset all filters
  const handleResetFilters = () => {
    setSelectedChar(null)
    setGlobalCharId(null)
    setTimeRange(defaultTimeRange)
    setIncludeExcluded(false)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="bg-card border border-border rounded-xl">
        {/* Filter Header */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-xl"
          onClick={() => setFiltersExpanded(!filtersExpanded)}
        >
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">Filters</span>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded-full">
                {activeFilterCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleResetFilters()
                }}
                className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
              >
                Clear all
              </button>
            )}
            {filtersExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Active Filter Chips (shown when collapsed) */}
        {!filtersExpanded && (selectedChar || includeExcluded) && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-3 rounded-b-xl">
            {selectedChar && (
              <FilterChip
                icon={MapPin}
                label={selectedChar.name}
                onRemove={() => {
                  setSelectedChar(null)
                  setGlobalCharId(null)
                  setPage(1)
                }}
              />
            )}
            <FilterChip
              icon={Clock}
              label={getTimeRangeLabel()}
              onRemove={() => {
                setTimeRange(defaultTimeRange)
                setPage(1)
              }}
            />
            {includeExcluded && (
              <FilterChip
                icon={Eye}
                label="Include excluded"
                onRemove={() => setIncludeExcluded(false)}
              />
            )}
          </div>
        )}

        {/* Expanded Filter Panel */}
        {filtersExpanded && (
          <div className="px-4 pb-4 space-y-4 border-t border-border pt-4 bg-muted/20 rounded-b-xl">
            {/* Characteristic Selector */}
            <div>
              <label className="block text-sm font-medium mb-2 text-muted-foreground">
                Characteristic
              </label>
              <HierarchyCharacteristicSelector
                selectedCharId={globalCharId}
                onSelect={handleCharacteristicSelect}
                plantId={selectedPlant?.id}
              />
              {selectedChar && (
                <div className="mt-2 flex items-center justify-between p-2.5 bg-primary/5 border border-primary/20 rounded-lg">
                  <div>
                    <div className="font-medium text-sm">{selectedChar.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {selectedChar.data_source ? selectedChar.data_source.type.toUpperCase() : 'Manual'} · n={selectedChar.subgroup_size}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedChar(null)
                      setGlobalCharId(null)
                      setPage(1)
                    }}
                    className="p-1 rounded hover:bg-muted transition-colors"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>

            {/* Time Range and Options Row */}
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <label className="block text-sm font-medium mb-2 text-muted-foreground">
                  Time Range
                </label>
                <LocalTimeRangeSelector
                  value={timeRange}
                  onChange={(range) => {
                    setTimeRange(range)
                    setPage(1)
                  }}
                />
              </div>

              <div className="flex items-center gap-4 pb-1.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeExcluded}
                    onChange={(e) => setIncludeExcluded(e.target.checked)}
                    className="rounded border-input"
                  />
                  <span className="text-sm">Include excluded samples</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Summary */}
      {selectedChar && !loadingSamples && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {displayedSamples.length > 0 ? (
              <>Showing {displayedSamples.length} of {totalSamples} samples</>
            ) : (
              <>No samples found</>
            )}
          </span>
          {displayedSamples.length > 0 && (
            <span className="text-xs">
              {includeExcluded ? 'Including excluded' : 'Excluding excluded samples'}
            </span>
          )}
        </div>
      )}

      {/* Sample Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">ID</th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium cursor-pointer select-none hover:bg-muted/80 transition-colors"
                  onClick={() => handleSort('timestamp')}
                >
                  <span className="inline-flex items-center gap-1">
                    Timestamp
                    {sortField === 'timestamp'
                      ? (sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)
                      : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />}
                  </span>
                </th>
                <th
                  className="px-4 py-3 text-right text-sm font-medium cursor-pointer select-none hover:bg-muted/80 transition-colors"
                  onClick={() => handleSort('mean')}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    Mean
                    {sortField === 'mean'
                      ? (sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />)
                      : <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />}
                  </span>
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium">Measurements</th>
                <th className="px-4 py-3 text-center text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!selectedChar ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <MapPin className="h-8 w-8 text-muted-foreground/50" />
                      <span className="text-muted-foreground">Select a characteristic to view samples</span>
                      <button
                        onClick={() => setFiltersExpanded(true)}
                        className="text-sm text-primary hover:underline"
                      >
                        Open filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : loadingSamples ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-muted-foreground">Loading samples...</span>
                    </div>
                  </td>
                </tr>
              ) : samplesError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <AlertTriangle className="h-8 w-8 text-destructive/50" />
                      <span className="text-destructive font-medium">Failed to load samples</span>
                      <span className="text-xs text-muted-foreground">
                        {samplesError instanceof Error ? samplesError.message : 'Unknown error'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Try refreshing the page or logging in again.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : displayedSamples.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <History className="h-8 w-8 text-muted-foreground/50" />
                      <span className="text-muted-foreground">No samples found</span>
                      <span className="text-xs text-muted-foreground">Try adjusting your filters or time range</span>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedSamples.map((sample: Sample) => {
                  const isExcluded = sample.is_excluded
                  const isModified = sample.is_modified
                  const measurementValues = getMeasurementValues(sample)
                  return (
                    <tr
                      key={sample.id}
                      className={isExcluded ? 'opacity-50 bg-muted/30' : ''}
                    >
                      <td className="px-4 py-3 text-sm font-mono">
                        <div className="flex items-center gap-1.5">
                          {sample.id}
                          {isModified && (
                            <EditHistoryTooltip
                              sampleId={sample.id}
                              editCount={sample.edit_count || 1}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {new Date(sample.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono">
                        {sample.mean.toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono">
                        [{measurementValues.map(v => v.toFixed(2)).join(', ')}]
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        {isExcluded ? (
                          <span className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded">
                            Excluded
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs bg-green-500/10 text-green-600 rounded">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex justify-end gap-1">
                          {canPerformAction(role, 'samples:edit') && (
                            <button
                              onClick={() => setEditingSample(sample)}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canPerformAction(role, 'samples:exclude') && (
                            <button
                              onClick={() => handleToggleExclude(sample)}
                              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                              title={isExcluded ? 'Include' : 'Exclude'}
                            >
                              {isExcluded ? (
                                <Eye className="h-4 w-4" />
                              ) : (
                                <EyeOff className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          {canPerformAction(role, 'samples:delete') && (
                            <button
                              onClick={() => setDeletingSampleId(sample.id)}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="text-sm text-muted-foreground">
              Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, totalSamples)} of {totalSamples} samples
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <SampleEditModal
        isOpen={editingSample !== null}
        sample={editingSample}
        onClose={() => setEditingSample(null)}
      />

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        isOpen={deletingSampleId !== null}
        title="Delete Sample"
        message="Are you sure you want to delete this sample? This action cannot be undone and will affect control chart calculations."
        onConfirm={handleDelete}
        onCancel={() => setDeletingSampleId(null)}
        isPending={deleteSample.isPending}
      />
    </div>
  )
}
