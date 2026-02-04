import { useState } from 'react'
import { Clock, ChevronDown, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardStore, type TimeRangeState, type TimeRangeOption } from '@/stores/dashboardStore'

const presets: TimeRangeOption[] = [
  { label: 'Last 50', type: 'points', value: 50 },
  { label: 'Last 100', type: 'points', value: 100 },
  { label: 'Last 200', type: 'points', value: 200 },
  { label: 'Last hour', type: 'duration', value: 1 },
  { label: 'Last 8h', type: 'duration', value: 8 },
  { label: 'Last 24h', type: 'duration', value: 24 },
  { label: 'Last 7 days', type: 'duration', value: 168 },
]

export function TimeRangeSelector() {
  const { timeRange, setTimeRange } = useDashboardStore()
  const [isOpen, setIsOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const getCurrentLabel = (): string => {
    if (timeRange.type === 'custom') {
      return 'Custom range'
    }
    if (timeRange.type === 'points' && timeRange.pointsLimit) {
      const preset = presets.find(p => p.type === 'points' && p.value === timeRange.pointsLimit)
      return preset?.label ?? `Last ${timeRange.pointsLimit}`
    }
    if (timeRange.type === 'duration' && timeRange.hoursBack) {
      const preset = presets.find(p => p.type === 'duration' && p.value === timeRange.hoursBack)
      return preset?.label ?? `Last ${timeRange.hoursBack}h`
    }
    return 'Last 50'
  }

  const handlePresetSelect = (preset: TimeRangeOption) => {
    const newRange: TimeRangeState = {
      type: preset.type,
      pointsLimit: preset.type === 'points' ? preset.value : null,
      hoursBack: preset.type === 'duration' ? preset.value : null,
      startDate: null,
      endDate: null,
    }
    setTimeRange(newRange)
    setIsOpen(false)
    setShowCustom(false)
  }

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      const newRange: TimeRangeState = {
        type: 'custom',
        pointsLimit: null,
        hoursBack: null,
        startDate: new Date(customStart).toISOString(),
        endDate: new Date(customEnd).toISOString(),
      }
      setTimeRange(newRange)
      setIsOpen(false)
      setShowCustom(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg border transition-colors',
          'bg-card border-border hover:border-primary/50',
          isOpen && 'border-primary'
        )}
      >
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span>{getCurrentLabel()}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false)
              setShowCustom(false)
            }}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg min-w-[180px]">
            {!showCustom ? (
              <>
                <div className="p-1">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Points</div>
                  {presets.filter(p => p.type === 'points').map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => handlePresetSelect(preset)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors',
                        timeRange.type === 'points' && timeRange.pointsLimit === preset.value && 'bg-primary/10 text-primary'
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border p-1">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">Time</div>
                  {presets.filter(p => p.type === 'duration').map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => handlePresetSelect(preset)}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors',
                        timeRange.type === 'duration' && timeRange.hoursBack === preset.value && 'bg-primary/10 text-primary'
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border p-1">
                  <button
                    onClick={() => setShowCustom(true)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded hover:bg-muted transition-colors',
                      timeRange.type === 'custom' && 'bg-primary/10 text-primary'
                    )}
                  >
                    <Calendar className="h-4 w-4" />
                    Custom range...
                  </button>
                </div>
              </>
            ) : (
              <div className="p-3 space-y-3">
                <div className="text-sm font-medium">Custom Date Range</div>

                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Start</label>
                    <input
                      type="datetime-local"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">End</label>
                    <input
                      type="datetime-local"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="w-full px-2 py-1 text-sm bg-background border border-border rounded"
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCustom(false)}
                    className="flex-1 px-3 py-1.5 text-sm border border-border rounded hover:bg-muted transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCustomApply}
                    disabled={!customStart || !customEnd}
                    className="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
