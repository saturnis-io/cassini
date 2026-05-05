import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useReplaySnapshot } from '@/api/hooks/replay'
import { ReplayBanner } from './ReplayBanner'

/** ISO-8601 string at second precision in UTC. */
function toIsoUtc(localDatetime: string): string {
  // <input type="datetime-local"> emits "YYYY-MM-DDTHH:mm" — interpret as
  // local wall clock, then serialize to UTC ISO so the backend receives a
  // tz-aware timestamp. SQLite strips tzinfo, so the backend's
  // `_normalize_utc` helper restores it on read.
  if (!localDatetime) return ''
  const dt = new Date(localDatetime)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toISOString()
}

/** Format a Date as the local-datetime string accepted by `<input type="datetime-local">`. */
function toLocalDatetimeInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

interface ReplayScrubberProps {
  /** Characteristic to replay. */
  characteristicId: number
  /**
   * Earliest timestamp the slider should allow. When omitted, defaults to
   * 90 days ago — most sample retention windows extend at least that far.
   */
  earliestAt?: string
  /**
   * Latest timestamp the slider should allow. Defaults to "now". Setting
   * this to a sample's timestamp enables a "scrub to the latest sample" UX.
   */
  latestAt?: string
  /**
   * Optional override for the active replay timestamp. When provided, the
   * scrubber mirrors that value rather than its own internal state — useful
   * for syncing with a chart-level brush selection.
   */
  value?: string | null
  /**
   * Called whenever the active replay timestamp changes. The page is
   * expected to thread this value through to its chart fetches so the
   * displayed data matches the snapshot.
   */
  onChange?: (isoTimestamp: string | null) => void
  className?: string
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

/**
 * Timeline scrubber + datetime picker for time-travel SPC replay.
 *
 * Renders a slider that lets the user pick any moment between
 * `earliestAt` and `latestAt`, plus a precise datetime input for
 * regulator-grade exact-second selection. While a replay timestamp is
 * active, fetches a snapshot from `/api/v1/replay/...` and surfaces a
 * `<ReplayBanner>` overhead.
 *
 * Tier gate: this component fetches eagerly when given a timestamp.
 * Embedders MUST gate the rendering on `useLicense().isProOrAbove` so
 * non-Pro users never see dead controls.
 */
export function ReplayScrubber({
  characteristicId,
  earliestAt,
  latestAt,
  value,
  onChange,
  className,
}: ReplayScrubberProps) {
  // Bounds of the timeline. Default earliest is 90 days ago, latest is now.
  const { earliestMs, latestMs } = useMemo(() => {
    const now = Date.now()
    const latest = latestAt ? new Date(latestAt).getTime() : now
    const earliest = earliestAt
      ? new Date(earliestAt).getTime()
      : Math.max(0, latest - NINETY_DAYS_MS)
    return {
      earliestMs: Math.min(earliest, latest),
      latestMs: latest,
    }
  }, [earliestAt, latestAt])

  // Internal state — synchronized with the controlled `value` prop when present.
  const [internalIso, setInternalIso] = useState<string | null>(value ?? null)
  const activeIso = value !== undefined ? value : internalIso

  // Reflect external `value` updates back into local state so the slider
  // tracks the controlled value when the parent drives it.
  useEffect(() => {
    if (value !== undefined) {
      setInternalIso(value ?? null)
    }
  }, [value])

  const setIso = useCallback(
    (next: string | null) => {
      if (value === undefined) {
        setInternalIso(next)
      }
      onChange?.(next)
    },
    [onChange, value],
  )

  // Slider position derived from the active ISO timestamp.
  // Range is normalized to [0, 1000] for sub-day precision.
  const sliderValue = useMemo(() => {
    if (!activeIso) return 1000
    const ms = new Date(activeIso).getTime()
    if (Number.isNaN(ms)) return 1000
    if (latestMs === earliestMs) return 1000
    const ratio = (ms - earliestMs) / (latestMs - earliestMs)
    return Math.round(Math.max(0, Math.min(1, ratio)) * 1000)
  }, [activeIso, earliestMs, latestMs])

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const ratio = Number(e.target.value) / 1000
      const ms = earliestMs + ratio * (latestMs - earliestMs)
      const iso = new Date(ms).toISOString()
      setIso(iso)
    },
    [earliestMs, latestMs, setIso],
  )

  const handleDatetimePicker = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const iso = toIsoUtc(e.target.value)
      setIso(iso || null)
    },
    [setIso],
  )

  const handleExit = useCallback(() => {
    setIso(null)
  }, [setIso])

  // Snapshot fetch is gated on a non-null timestamp.
  const snapshotQuery = useReplaySnapshot('characteristic', characteristicId, activeIso)

  const datetimeInputValue = useMemo(() => {
    if (!activeIso) return ''
    const dt = new Date(activeIso)
    if (Number.isNaN(dt.getTime())) return ''
    return toLocalDatetimeInput(dt)
  }, [activeIso])

  const earliestLabel = useMemo(
    () => new Date(earliestMs).toLocaleString(),
    [earliestMs],
  )
  const latestLabel = useMemo(() => new Date(latestMs).toLocaleString(), [latestMs])

  return (
    <div data-ui="replay-scrubber" className={cn('flex flex-col gap-2', className)}>
      {activeIso && (
        <ReplayBanner
          timestamp={activeIso}
          auditEventCount={snapshotQuery.data?.audit_event_count}
          onExit={handleExit}
        />
      )}

      <div
        className={cn(
          'border-border bg-card flex flex-col gap-2 rounded-md border p-3',
          'sm:flex-row sm:items-center',
        )}
      >
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-semibold uppercase tracking-wide">Time Travel</span>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className="text-muted-foreground hidden font-mono text-xs sm:inline"
            aria-hidden="true"
          >
            {earliestLabel}
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={sliderValue}
            onChange={handleSliderChange}
            data-ui="replay-scrubber-slider"
            aria-label="Replay timestamp slider"
            className="bg-muted flex-1 cursor-pointer accent-primary"
          />
          <span
            className="text-muted-foreground hidden font-mono text-xs sm:inline"
            aria-hidden="true"
          >
            {latestLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="datetime-local"
            value={datetimeInputValue}
            onChange={handleDatetimePicker}
            data-ui="replay-scrubber-datetime"
            aria-label="Replay timestamp"
            className="border-input bg-background text-foreground h-8 rounded-md border px-2 text-xs"
          />
          {activeIso && (
            <button
              type="button"
              onClick={handleExit}
              data-ui="replay-scrubber-exit"
              className="border-input text-muted-foreground hover:bg-muted h-8 rounded-md border px-2 text-xs"
            >
              Exit
            </button>
          )}
        </div>
      </div>

      {snapshotQuery.isError && activeIso && (
        <div
          role="alert"
          data-ui="replay-scrubber-error"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs"
        >
          {snapshotQuery.error instanceof Error
            ? snapshotQuery.error.message
            : 'Replay snapshot unavailable.'}
        </div>
      )}
    </div>
  )
}
