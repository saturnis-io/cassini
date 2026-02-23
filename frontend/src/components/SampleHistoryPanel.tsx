import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Pencil,
  Trash2,
  EyeOff,
  Eye,
  History,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react'
import { useSamples, useDeleteSample, useExcludeSample, useCharacteristic } from '@/api/hooks'
import { useAuth } from '@/providers/AuthProvider'
import { useDashboardStore } from '@/stores/dashboardStore'
import { canPerformAction } from '@/lib/roles'
import { CharacteristicContextBar } from './CharacteristicContextBar'
import { NoCharacteristicState } from './NoCharacteristicState'
import { SampleEditModal } from './SampleEditModal'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { LocalTimeRangeSelector, type TimeRangeState } from './LocalTimeRangeSelector'
import { EditHistoryTooltip } from './EditHistoryTooltip'
import type { Sample } from '@/types'
import { formatDisplayKey } from '@/lib/display-key'

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
  onRemove,
}: {
  icon: React.ElementType
  label: string
  onRemove: () => void
}) {
  return (
    <div className="bg-primary/10 border-primary/20 text-primary inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm">
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium">{label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="hover:bg-destructive/20 hover:text-destructive ml-1 rounded p-0.5 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function SampleHistoryPanel() {
  const { role } = useAuth()
  const globalCharId = useDashboardStore((s) => s.selectedCharacteristicId)
  const { data: selectedChar } = useCharacteristic(globalCharId ?? 0)

  // Reset page when characteristic changes to avoid stale pagination
  useEffect(() => { setPage(1) }, [globalCharId])

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

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        // Cycle: asc -> desc -> off
        if (sortDir === 'asc') setSortDir('desc')
        else {
          setSortField(null)
        }
      } else {
        setSortField(field)
        setSortDir('asc')
      }
    },
    [sortField, sortDir],
  )

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

  const {
    data: samplesData,
    isLoading: loadingSamples,
    error: samplesError,
  } = useSamples(queryParams)

  const deleteSample = useDeleteSample()
  const excludeSample = useExcludeSample()

  const samples = useMemo(() => samplesData?.items || [], [samplesData?.items])
  const rawTotal = samplesData?.total || 0
  // For "Last X points" mode, cap total to pointsLimit so pagination doesn't exceed it
  const totalSamples =
    timeRange.type === 'points' && timeRange.pointsLimit
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
    return sample.measurements.map((m) => m.value)
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
  const activeFilterCount = (includeExcluded ? 1 : 0)

  // Reset all filters
  const handleResetFilters = () => {
    setTimeRange(defaultTimeRange)
    setIncludeExcluded(false)
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <CharacteristicContextBar />

      {selectedChar ? (
        <>
          {/* Filter Bar */}
          <div className="bg-muted rounded-xl">
            {/* Filter Header */}
            <div
              className="hover:bg-muted/30 flex cursor-pointer items-center justify-between rounded-t-xl px-4 py-3 transition-colors"
              onClick={() => setFiltersExpanded(!filtersExpanded)}
            >
              <div className="flex items-center gap-3">
                <Filter className="text-muted-foreground h-4 w-4" />
                <span className="font-medium">Filters</span>
                {activeFilterCount > 0 && (
                  <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium">
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
                    className="text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-1 text-xs transition-colors"
                  >
                    Clear all
                  </button>
                )}
                {filtersExpanded ? (
                  <ChevronUp className="text-muted-foreground h-4 w-4" />
                ) : (
                  <ChevronDown className="text-muted-foreground h-4 w-4" />
                )}
              </div>
            </div>

            {/* Active Filter Chips (shown when collapsed) */}
            {!filtersExpanded && includeExcluded && (
              <div className="flex flex-wrap items-center gap-2 rounded-b-xl px-4 pb-3">
                <FilterChip
                  icon={Clock}
                  label={getTimeRangeLabel()}
                  onRemove={() => {
                    setTimeRange(defaultTimeRange)
                    setPage(1)
                  }}
                />
                <FilterChip
                  icon={Eye}
                  label="Include excluded"
                  onRemove={() => setIncludeExcluded(false)}
                />
              </div>
            )}

            {/* Expanded Filter Panel */}
            {filtersExpanded && (
              <div className="border-border bg-muted/20 space-y-4 rounded-b-xl border-t px-4 pt-4 pb-4">
                {/* Time Range and Options Row */}
                <div className="flex flex-wrap items-end gap-6">
                  <div>
                    <label className="text-muted-foreground mb-2 block text-sm font-medium">
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
                    <label className="flex cursor-pointer items-center gap-2 select-none">
                      <input
                        type="checkbox"
                        checked={includeExcluded}
                        onChange={(e) => setIncludeExcluded(e.target.checked)}
                        className="border-input rounded"
                      />
                      <span className="text-sm">Include excluded samples</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Results Summary */}
          {!loadingSamples && (
            <div className="text-muted-foreground flex items-center justify-between text-sm">
              <span>
                {displayedSamples.length > 0 ? (
                  <>
                    Showing {displayedSamples.length} of {totalSamples} samples
                  </>
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
          <div className="bg-muted overflow-hidden rounded-xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Sample</th>
                    <th
                      className="hover:bg-muted/80 cursor-pointer px-4 py-3 text-left text-sm font-medium transition-colors select-none"
                      onClick={() => handleSort('timestamp')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Timestamp
                        {sortField === 'timestamp' ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="text-muted-foreground/50 h-3.5 w-3.5" />
                        )}
                      </span>
                    </th>
                    <th
                      className="hover:bg-muted/80 cursor-pointer px-4 py-3 text-right text-sm font-medium transition-colors select-none"
                      onClick={() => handleSort('mean')}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        Mean
                        {sortField === 'mean' ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="text-muted-foreground/50 h-3.5 w-3.5" />
                        )}
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Measurements</th>
                    <th className="px-4 py-3 text-center text-sm font-medium">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {loadingSamples ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
                          <span className="text-muted-foreground">Loading samples...</span>
                        </div>
                      </td>
                    </tr>
                  ) : samplesError ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <AlertTriangle className="text-destructive/50 h-8 w-8" />
                          <span className="text-destructive font-medium">Failed to load samples</span>
                          <span className="text-muted-foreground text-xs">
                            {samplesError instanceof Error ? samplesError.message : 'Unknown error'}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Try refreshing the page or logging in again.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : displayedSamples.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <History className="text-muted-foreground/50 h-8 w-8" />
                          <span className="text-muted-foreground">No samples found</span>
                          <span className="text-muted-foreground text-xs">
                            Try adjusting your filters or time range
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    displayedSamples.map((sample: Sample) => {
                      const isExcluded = sample.is_excluded
                      const isModified = sample.is_modified
                      const measurementValues = getMeasurementValues(sample)
                      return (
                        <tr key={sample.id} className={isExcluded ? 'bg-muted/30 opacity-50' : ''}>
                          <td className="px-4 py-3 font-mono text-sm">
                            <div className="flex items-center gap-1.5">
                              {sample.display_key ? formatDisplayKey(sample.display_key) : sample.id}
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
                          <td className="px-4 py-3 text-right font-mono text-sm">
                            {sample.mean.toFixed(4)}
                          </td>
                          <td className="px-4 py-3 font-mono text-sm">
                            [{measurementValues.map((v) => v.toFixed(2)).join(', ')}]
                          </td>
                          <td className="px-4 py-3 text-center text-sm">
                            {isExcluded ? (
                              <span className="bg-muted text-muted-foreground rounded px-2 py-1 text-xs">
                                Excluded
                              </span>
                            ) : (
                              <span className="bg-success/10 text-success rounded px-2 py-1 text-xs">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="flex justify-end gap-1">
                              {canPerformAction(role, 'samples:edit') && (
                                <button
                                  onClick={() => setEditingSample(sample)}
                                  className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1.5"
                                  title="Edit"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}
                              {canPerformAction(role, 'samples:exclude') && (
                                <button
                                  onClick={() => handleToggleExclude(sample)}
                                  className="text-muted-foreground hover:text-foreground hover:bg-muted rounded p-1.5"
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
                                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded p-1.5"
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
              <div className="border-border flex items-center justify-between border-t px-4 py-3">
                <div className="text-muted-foreground text-sm">
                  Showing {(page - 1) * perPage + 1} to {Math.min(page * perPage, totalSamples)} of{' '}
                  {totalSamples} samples
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded px-3 py-1 text-sm disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded px-3 py-1 text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <NoCharacteristicState />
      )}

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
