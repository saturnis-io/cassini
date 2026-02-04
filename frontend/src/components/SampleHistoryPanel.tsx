import { useState } from 'react'
import { Pencil, Trash2, EyeOff, Eye } from 'lucide-react'
import { useSamples, useDeleteSample, useExcludeSample } from '@/api/hooks'
import { HierarchyCharacteristicSelector } from './HierarchyCharacteristicSelector'
import { SampleEditModal } from './SampleEditModal'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import type { Sample, Characteristic } from '@/types'

export function SampleHistoryPanel() {
  const [selectedChar, setSelectedChar] = useState<Characteristic | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [includeExcluded, setIncludeExcluded] = useState(false)
  const [page, setPage] = useState(1)
  const perPage = 20

  // Modal state
  const [editingSample, setEditingSample] = useState<Sample | null>(null)
  const [deletingSampleId, setDeletingSampleId] = useState<number | null>(null)

  const { data: samplesData, isLoading: loadingSamples } = useSamples({
    characteristic_id: selectedChar?.id,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
    page,
    per_page: perPage,
  })

  const deleteSample = useDeleteSample()
  const excludeSample = useExcludeSample()

  const samples = samplesData?.items || []
  const totalSamples = samplesData?.total || 0
  const totalPages = Math.ceil(totalSamples / perPage)

  // Filter excluded samples client-side if needed
  // Note: Backend returns is_excluded but some places use excluded
  const displayedSamples = includeExcluded
    ? samples
    : samples.filter(s => !(s.excluded || s.is_excluded))

  const handleDelete = () => {
    if (deletingSampleId !== null) {
      deleteSample.mutate(deletingSampleId, {
        onSuccess: () => setDeletingSampleId(null),
      })
    }
  }

  const handleToggleExclude = (sample: Sample) => {
    const isCurrentlyExcluded = sample.excluded || sample.is_excluded
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
    setPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Select Characteristic</h3>
        <HierarchyCharacteristicSelector
          selectedCharId={selectedChar?.id ?? null}
          onSelect={handleCharacteristicSelect}
        />
        {selectedChar && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
            <div className="font-medium">{selectedChar.name}</div>
            <div className="text-sm text-muted-foreground">
              Provider: {selectedChar.provider_type} | Subgroup size: {selectedChar.subgroup_size}
            </div>
          </div>
        )}
      </div>

      {/* Date filters and options */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold mb-4">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value)
                setPage(1)
              }}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeExcluded}
                onChange={(e) => setIncludeExcluded(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Include excluded</span>
            </label>
          </div>
        </div>
      </div>

      {/* Sample Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">ID</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Timestamp</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Mean</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Measurements</th>
                <th className="px-4 py-3 text-center text-sm font-medium">Status</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!selectedChar ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Select a characteristic to view samples.
                  </td>
                </tr>
              ) : loadingSamples ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Loading samples...
                  </td>
                </tr>
              ) : displayedSamples.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No samples found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                displayedSamples.map((sample: Sample) => {
                  const isExcluded = sample.excluded || sample.is_excluded
                  const measurementValues = getMeasurementValues(sample)
                  return (
                    <tr
                      key={sample.id}
                      className={isExcluded ? 'opacity-50 bg-muted/30' : ''}
                    >
                      <td className="px-4 py-3 text-sm font-mono">{sample.id}</td>
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
                          <button
                            onClick={() => setEditingSample(sample)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
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
                          <button
                            onClick={() => setDeletingSampleId(sample.id)}
                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
