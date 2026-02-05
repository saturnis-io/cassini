import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pause, Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCharacteristics, useChartData } from '@/api/hooks'
import { ControlChart } from '@/components/ControlChart'

/**
 * Status indicator based on control status
 */
function StatusIndicator({ status }: { status: 'ok' | 'warning' | 'violation' }) {
  const colors = {
    ok: 'bg-green-500',
    warning: 'bg-yellow-500',
    violation: 'bg-red-500 animate-pulse',
  }

  return (
    <div className={cn('w-4 h-4 rounded-full', colors[status])} />
  )
}

/**
 * Pagination dots for multi-characteristic rotation
 */
function PaginationDots({
  count,
  current,
  onSelect,
}: {
  count: number
  current: number
  onSelect: (index: number) => void
}) {
  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={cn(
            'w-3 h-3 rounded-full transition-all',
            i === current
              ? 'bg-zinc-100 scale-125'
              : 'bg-zinc-600 hover:bg-zinc-500'
          )}
          aria-label={`Go to characteristic ${i + 1}`}
        />
      ))}
    </div>
  )
}

/**
 * Full-screen auto-rotating kiosk display for factory floor monitors
 *
 * URL Parameters:
 * - plant: Plant ID to filter characteristics
 * - chars: Comma-separated characteristic IDs
 * - interval: Rotation interval in seconds (default: 15)
 *
 * Keyboard Controls:
 * - Left/Right arrows: Manual navigation
 * - Space: Pause/resume auto-rotation
 * - Escape: Exit (if in browser)
 */
export function KioskView() {
  const [searchParams] = useSearchParams()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  // Parse URL parameters
  const charIds = useMemo(() => {
    const chars = searchParams.get('chars')
    if (chars) {
      return chars.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id))
    }
    return []
  }, [searchParams])

  const interval = parseInt(searchParams.get('interval') || '15', 10) * 1000

  // Fetch all characteristics if no specific IDs provided
  const { data: allCharacteristics, isLoading } = useCharacteristics()

  // Determine which characteristics to display
  const displayCharacteristics = useMemo(() => {
    const items = allCharacteristics?.items ?? []
    if (charIds.length > 0) {
      // Filter to requested IDs
      return items.filter((c) => charIds.includes(c.id))
    }
    // Show all characteristics (not just active, since kiosk may want to show all)
    // If you want only active, set active=true in the query params
    return items
  }, [allCharacteristics, charIds])

  const currentChar = displayCharacteristics[currentIndex]

  // Fetch chart data for current characteristic
  const { data: chartData } = useChartData(currentChar?.id ?? 0, { limit: 50 })

  // Determine status from chart data
  const status = useMemo((): 'ok' | 'warning' | 'violation' => {
    if (!chartData?.data_points?.length) return 'ok'
    const latestPoint = chartData.data_points[chartData.data_points.length - 1]
    if (latestPoint.violation_rules?.length) return 'violation'
    // Check if close to limits (within 10%)
    const mean = latestPoint.mean
    const ucl = chartData.control_limits?.ucl
    const lcl = chartData.control_limits?.lcl
    if (ucl && lcl) {
      const range = ucl - lcl
      const margin = range * 0.1
      if (mean > ucl - margin || mean < lcl + margin) return 'warning'
    }
    return 'ok'
  }, [chartData])

  // Auto-rotation
  useEffect(() => {
    if (isPaused || displayCharacteristics.length <= 1) return

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % displayCharacteristics.length)
    }, interval)

    return () => clearInterval(timer)
  }, [isPaused, displayCharacteristics.length, interval])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          setCurrentIndex((prev) =>
            (prev - 1 + displayCharacteristics.length) % displayCharacteristics.length
          )
          break
        case 'ArrowRight':
          setCurrentIndex((prev) => (prev + 1) % displayCharacteristics.length)
          break
        case ' ':
          e.preventDefault()
          setIsPaused((prev) => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [displayCharacteristics.length])

  // Navigation handlers
  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) =>
      (prev - 1 + displayCharacteristics.length) % displayCharacteristics.length
    )
  }, [displayCharacteristics.length])

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % displayCharacteristics.length)
  }, [displayCharacteristics.length])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold text-zinc-300">Loading...</div>
          <div className="text-zinc-500 mt-2">Fetching characteristics</div>
        </div>
      </div>
    )
  }

  // No characteristics available
  if (!displayCharacteristics.length) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold text-zinc-300">No Characteristics</div>
          <div className="text-zinc-500 mt-2">
            {charIds.length > 0
              ? 'The specified characteristic IDs were not found'
              : 'No characteristics have been configured yet'}
          </div>
          <div className="text-zinc-600 mt-4 text-sm">
            Configure characteristics in Settings, or specify IDs via ?chars=1,2,3
          </div>
        </div>
      </div>
    )
  }

  const latestValue = chartData?.data_points?.length
    ? chartData.data_points[chartData.data_points.length - 1].mean
    : null

  return (
    <div className="h-screen flex flex-col p-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-4">
          <StatusIndicator status={status} />
          <h1 className="text-2xl font-bold text-zinc-100">
            {currentChar?.name ?? 'Unknown'}
          </h1>
        </div>

        {/* Pause/Play control */}
        <button
          onClick={() => setIsPaused(!isPaused)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
        >
          {isPaused ? (
            <>
              <Play className="h-5 w-5" />
              <span>Resume</span>
            </>
          ) : (
            <>
              <Pause className="h-5 w-5" />
              <span>Pause</span>
            </>
          )}
        </button>
      </div>

      {/* Chart area - use calc for explicit height that ResponsiveContainer needs */}
      <div className="bg-zinc-900 rounded-lg p-4 relative" style={{ height: 'calc(100vh - 220px)' }}>
        {currentChar && (
          <ControlChart
            characteristicId={currentChar.id}
            chartOptions={{ limit: 50 }}
          />
        )}

        {/* Navigation arrows */}
        {displayCharacteristics.length > 1 && (
          <>
            <button
              onClick={goToPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
              aria-label="Previous characteristic"
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-800/80 hover:bg-zinc-700 transition-colors"
              aria-label="Next characteristic"
            >
              <ChevronRight className="h-8 w-8" />
            </button>
          </>
        )}
      </div>

      {/* Stats bar */}
      <div className="mt-4 flex items-center justify-between text-lg flex-shrink-0">
        <div className="flex gap-8">
          <div>
            <span className="text-zinc-500">Current: </span>
            <span className="font-bold text-zinc-100">
              {latestValue?.toFixed(3) ?? '-'}
            </span>
          </div>
          {chartData?.control_limits && (
            <>
              <div>
                <span className="text-zinc-500">UCL: </span>
                <span className="font-medium text-zinc-300">
                  {chartData.control_limits.ucl?.toFixed(3) ?? '-'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">LCL: </span>
                <span className="font-medium text-zinc-300">
                  {chartData.control_limits.lcl?.toFixed(3) ?? '-'}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Unit display */}
        {currentChar?.unit && (
          <div className="text-zinc-500">
            Unit: <span className="text-zinc-300">{currentChar.unit}</span>
          </div>
        )}
      </div>

      {/* Pagination dots */}
      {displayCharacteristics.length > 1 && (
        <div className="mt-4">
          <PaginationDots
            count={displayCharacteristics.length}
            current={currentIndex}
            onSelect={setCurrentIndex}
          />
        </div>
      )}
    </div>
  )
}
