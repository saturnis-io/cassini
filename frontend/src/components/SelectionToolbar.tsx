import { FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import { useNavigate } from 'react-router-dom'

/**
 * Floating toolbar that appears when characteristics are selected.
 * Provides quick actions for the selection like generating reports.
 */
export function SelectionToolbar() {
  const selectedIds = useDashboardStore((state) => state.selectedCharacteristicIds)
  const clearSelection = useDashboardStore((state) => state.clearSelection)
  const setMultiSelectMode = useDashboardStore((state) => state.setMultiSelectMode)
  const navigate = useNavigate()

  const count = selectedIds.size

  if (count === 0) return null

  const handleGenerateReport = () => {
    // Navigate to reports page with selected IDs as query param
    const idsParam = Array.from(selectedIds).join(',')
    navigate(`/reports?characteristics=${idsParam}`)
  }

  const handleClear = () => {
    clearSelection()
    setMultiSelectMode(false)
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div
        className={cn(
          'flex items-center gap-4 px-4 py-2.5',
          'bg-card border border-border rounded-xl shadow-lg',
          'animate-in slide-in-from-bottom-4 duration-200'
        )}
      >
        <span className="text-sm font-medium">
          {count} characteristic{count !== 1 ? 's' : ''} selected
        </span>

        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerateReport}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg',
              'bg-primary text-primary-foreground',
              'hover:bg-primary/90 transition-colors'
            )}
          >
            <FileText className="h-4 w-4" />
            Generate Report
          </button>

          <button
            onClick={handleClear}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg',
              'border border-border',
              'hover:bg-muted transition-colors'
            )}
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        </div>
      </div>
    </div>
  )
}

export default SelectionToolbar
