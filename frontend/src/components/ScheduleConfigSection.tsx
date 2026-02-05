import { useMemo } from 'react'
import { Clock, Calendar, Repeat, Tag, ChevronRight, CircleOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NumberInput } from './NumberInput'
import { TimePicker } from './TimePicker'
import { HelpTooltip } from './HelpTooltip'

// Schedule Types
export type ScheduleType = 'NONE' | 'INTERVAL' | 'SHIFT' | 'CRON' | 'BATCH_START'

export interface ScheduleConfig {
  type: ScheduleType
  // INTERVAL
  interval_minutes?: number
  align_to_hour?: boolean
  // SHIFT
  shift_count?: number
  shift_times?: string[] // ISO time strings "HH:MM"
  samples_per_shift?: number
  // CRON
  cron_expression?: string
  // BATCH_START
  batch_tag?: string
  delay_minutes?: number
}

interface ScheduleConfigSectionProps {
  value: ScheduleConfig
  onChange: (config: ScheduleConfig) => void
}

// Schedule type options with icons and descriptions
const SCHEDULE_TYPES = [
  {
    value: 'NONE' as ScheduleType,
    label: 'Ad-hoc',
    description: 'On-demand sampling',
    icon: CircleOff,
  },
  {
    value: 'INTERVAL' as ScheduleType,
    label: 'Interval',
    description: 'Every N minutes',
    icon: Repeat,
  },
  {
    value: 'SHIFT' as ScheduleType,
    label: 'Shift',
    description: 'Per shift schedule',
    icon: Clock,
  },
  {
    value: 'CRON' as ScheduleType,
    label: 'Cron',
    description: 'Advanced expression',
    icon: Calendar,
  },
  {
    value: 'BATCH_START' as ScheduleType,
    label: 'Batch',
    description: 'On tag change',
    icon: Tag,
  },
]

// Interval presets
const INTERVAL_PRESETS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hr', value: 60 },
  { label: '2 hr', value: 120 },
  { label: '4 hr', value: 240 },
]

// Default shift times (3-shift system)
const DEFAULT_SHIFT_TIMES = ['06:00', '14:00', '22:00']

// Cron templates
const CRON_TEMPLATES = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every 2 hours', value: '0 */2 * * *' },
  { label: 'Weekdays 8am', value: '0 8 * * 1-5' },
  { label: 'Every 30 min', value: '*/30 * * * *' },
]

export function ScheduleConfigSection({ value, onChange }: ScheduleConfigSectionProps) {
  const handleTypeChange = (type: ScheduleType) => {
    // Set defaults for each type
    const defaults: Record<ScheduleType, Partial<ScheduleConfig>> = {
      NONE: {},
      INTERVAL: { interval_minutes: 120, align_to_hour: true },
      SHIFT: { shift_count: 3, shift_times: DEFAULT_SHIFT_TIMES, samples_per_shift: 1 },
      CRON: { cron_expression: '0 */2 * * *' },
      BATCH_START: { batch_tag: '', delay_minutes: 5 },
    }
    onChange({ type, ...defaults[type] })
  }

  const handleFieldChange = <K extends keyof ScheduleConfig>(
    field: K,
    fieldValue: ScheduleConfig[K]
  ) => {
    onChange({ ...value, [field]: fieldValue })
  }

  // Schedule preview - calculate next due times
  const nextDueTimes = useMemo(() => {
    const now = new Date()
    const times: Date[] = []

    if (value.type === 'INTERVAL' && value.interval_minutes) {
      let next = new Date(now)
      if (value.align_to_hour) {
        // Align to next interval boundary
        const intervalMs = value.interval_minutes * 60 * 1000
        next = new Date(Math.ceil(now.getTime() / intervalMs) * intervalMs)
      } else {
        next = new Date(now.getTime() + value.interval_minutes * 60 * 1000)
      }
      for (let i = 0; i < 5; i++) {
        times.push(new Date(next.getTime() + i * value.interval_minutes * 60 * 1000))
      }
    } else if (value.type === 'SHIFT' && value.shift_times) {
      const todayStr = now.toISOString().split('T')[0]
      value.shift_times.forEach((timeStr) => {
        const shiftTime = new Date(`${todayStr}T${timeStr}:00`)
        if (shiftTime > now) {
          times.push(shiftTime)
        } else {
          // Tomorrow
          const tomorrow = new Date(shiftTime)
          tomorrow.setDate(tomorrow.getDate() + 1)
          times.push(tomorrow)
        }
      })
      times.sort((a, b) => a.getTime() - b.getTime())
    }

    return times.slice(0, 5)
  }, [value])

  return (
    <div className="space-y-4">
      {/* Schedule Type Selector */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm font-medium">Schedule Type</label>
          <HelpTooltip helpKey="schedule-type" />
        </div>
        <div className="grid grid-cols-5 gap-2">
          {SCHEDULE_TYPES.map((type) => {
            const Icon = type.icon
            const isSelected = value.type === type.value
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => handleTypeChange(type.value)}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/30 hover:border-primary/50 text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{type.label}</span>
                <span className="text-xs opacity-70">{type.description}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Type-specific configuration */}
      {value.type !== 'NONE' && (
        <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-4">
          {value.type === 'INTERVAL' && (
            <IntervalForm value={value} onChange={handleFieldChange} />
          )}
          {value.type === 'SHIFT' && (
            <ShiftForm value={value} onChange={handleFieldChange} />
          )}
          {value.type === 'CRON' && (
            <CronForm value={value} onChange={handleFieldChange} />
          )}
          {value.type === 'BATCH_START' && (
            <BatchStartForm value={value} onChange={handleFieldChange} />
          )}
        </div>
      )}

      {/* Ad-hoc info panel */}
      {value.type === 'NONE' && (
        <div className="p-4 bg-muted/20 rounded-lg border border-border">
          <p className="text-sm text-muted-foreground">
            <strong>Ad-hoc sampling:</strong> Measurements can be entered at any time without a fixed schedule.
            Use this for event-driven sampling, operator-discretion measurements, or new processes without established frequencies.
          </p>
        </div>
      )}

      {/* Schedule Preview */}
      {nextDueTimes.length > 0 && (
        <div className="p-4 bg-muted/20 rounded-lg border border-border">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Schedule Preview</span>
          </div>
          <div className="space-y-2">
            {nextDueTimes.map((time, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex items-center gap-2 text-sm',
                  idx === 0 ? 'text-primary font-medium' : 'text-muted-foreground'
                )}
              >
                <ChevronRight className={cn('h-3 w-3', idx === 0 && 'text-primary')} />
                <span>
                  {time.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {' at '}
                  {time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
                {idx === 0 && <span className="text-xs bg-primary/10 px-2 py-0.5 rounded">Next due</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// INTERVAL Form
function IntervalForm({
  value,
  onChange,
}: {
  value: ScheduleConfig
  onChange: <K extends keyof ScheduleConfig>(field: K, value: ScheduleConfig[K]) => void
}) {
  const intervalHuman = useMemo(() => {
    const mins = value.interval_minutes ?? 0
    if (mins < 60) return `Every ${mins} minutes`
    if (mins % 60 === 0) return `Every ${mins / 60} hour${mins / 60 > 1 ? 's' : ''}`
    return `Every ${Math.floor(mins / 60)}h ${mins % 60}m`
  }, [value.interval_minutes])

  return (
    <>
      <div>
        <label className="text-sm font-medium mb-2 block">Interval (minutes)</label>
        <NumberInput
          min={1}
          max={1440}
          value={String(value.interval_minutes ?? 120)}
          onChange={(v) => onChange('interval_minutes', parseInt(v) || 120)}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground mt-1">{intervalHuman}</p>
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Quick Presets</label>
        <div className="flex flex-wrap gap-2">
          {INTERVAL_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange('interval_minutes', preset.value)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg border transition-colors',
                value.interval_minutes === preset.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.align_to_hour ?? false}
          onChange={(e) => onChange('align_to_hour', e.target.checked)}
          className="rounded border-input"
        />
        <span className="text-sm">Align to clock hours</span>
        <span className="text-xs text-muted-foreground">(e.g., 2:00, 4:00, 6:00)</span>
      </label>
    </>
  )
}

// SHIFT Form
function ShiftForm({
  value,
  onChange,
}: {
  value: ScheduleConfig
  onChange: <K extends keyof ScheduleConfig>(field: K, value: ScheduleConfig[K]) => void
}) {
  const shiftCount = value.shift_count ?? 3
  const shiftTimes = value.shift_times ?? DEFAULT_SHIFT_TIMES

  const handleShiftCountChange = (count: number) => {
    onChange('shift_count', count)
    // Adjust shift_times array
    const defaultTimes = count === 1 ? ['06:00'] : count === 2 ? ['06:00', '18:00'] : DEFAULT_SHIFT_TIMES
    onChange('shift_times', defaultTimes.slice(0, count))
  }

  const handleShiftTimeChange = (index: number, hour: number, minute: number) => {
    const newTimes = [...shiftTimes]
    newTimes[index] = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    onChange('shift_times', newTimes)
  }

  const shiftLabels = ['Day', 'Swing', 'Night', 'Fourth']

  return (
    <>
      <div>
        <label className="text-sm font-medium mb-2 block">Number of Shifts</label>
        <div className="flex gap-2">
          {[1, 2, 3].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => handleShiftCountChange(count)}
              className={cn(
                'flex-1 py-2 text-sm rounded-lg border transition-colors',
                shiftCount === count
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {count} Shift{count > 1 ? 's' : ''}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Shift Start Times</label>
        <div className="space-y-3">
          {shiftTimes.slice(0, shiftCount).map((timeStr, idx) => {
            const [hours, minutes] = timeStr.split(':').map(Number)
            return (
              <div key={idx} className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground w-16">{shiftLabels[idx]}:</span>
                <TimePicker
                  hour={hours}
                  minute={minutes}
                  onTimeChange={(h, m) => handleShiftTimeChange(idx, h, m)}
                  use12Hour={true}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Samples per Shift</label>
        <NumberInput
          min={1}
          max={10}
          value={String(value.samples_per_shift ?? 1)}
          onChange={(v) => onChange('samples_per_shift', parseInt(v) || 1)}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {shiftCount * (value.samples_per_shift ?? 1)} samples per day total
        </p>
      </div>
    </>
  )
}

// CRON Form
function CronForm({
  value,
  onChange,
}: {
  value: ScheduleConfig
  onChange: <K extends keyof ScheduleConfig>(field: K, value: ScheduleConfig[K]) => void
}) {
  const cronExpression = value.cron_expression ?? ''

  // Simple cron validation and human-readable conversion
  const cronInfo = useMemo(() => {
    const parts = cronExpression.trim().split(/\s+/)
    if (parts.length !== 5) {
      return { valid: false, readable: 'Invalid: Expected 5 fields (min hour day month weekday)' }
    }
    // Very basic interpretation
    try {
      const [min, hour, , , weekday] = parts
      let readable = 'At '
      if (min === '*') readable += 'every minute'
      else if (min.startsWith('*/')) readable += `every ${min.slice(2)} minutes`
      else readable += `minute ${min}`

      if (hour !== '*') {
        if (hour.startsWith('*/')) readable += `, every ${hour.slice(2)} hours`
        else if (hour.includes('-')) readable += `, between hours ${hour}`
        else readable += `, at hour ${hour}`
      }

      if (weekday !== '*') {
        if (weekday === '1-5') readable += ', weekdays only'
        else if (weekday === '0,6' || weekday === '6,0') readable += ', weekends only'
        else readable += `, on ${weekday}`
      }

      return { valid: true, readable }
    } catch {
      return { valid: false, readable: 'Unable to parse expression' }
    }
  }, [cronExpression])

  return (
    <>
      <div>
        <label className="text-sm font-medium mb-2 block">Cron Expression</label>
        <input
          type="text"
          value={cronExpression}
          onChange={(e) => onChange('cron_expression', e.target.value)}
          placeholder="*/30 * * * *"
          className={cn(
            'w-full px-3 py-2 font-mono text-sm border rounded-lg bg-background',
            !cronInfo.valid && cronExpression ? 'border-destructive' : 'border-input'
          )}
        />
        <p className={cn(
          'text-xs mt-1',
          cronInfo.valid ? 'text-muted-foreground' : 'text-destructive'
        )}>
          {cronInfo.readable}
        </p>
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Expression Format</label>
        <div className="flex gap-2 text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded">
          <span className="px-2 py-1 bg-background rounded">MIN</span>
          <span className="px-2 py-1 bg-background rounded">HOUR</span>
          <span className="px-2 py-1 bg-background rounded">DAY</span>
          <span className="px-2 py-1 bg-background rounded">MONTH</span>
          <span className="px-2 py-1 bg-background rounded">WEEKDAY</span>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Templates</label>
        <div className="flex flex-wrap gap-2">
          {CRON_TEMPLATES.map((template) => (
            <button
              key={template.value}
              type="button"
              onClick={() => onChange('cron_expression', template.value)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg border transition-colors',
                cronExpression === template.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {template.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// BATCH_START Form
function BatchStartForm({
  value,
  onChange,
}: {
  value: ScheduleConfig
  onChange: <K extends keyof ScheduleConfig>(field: K, value: ScheduleConfig[K]) => void
}) {
  return (
    <>
      <div>
        <label className="text-sm font-medium mb-2 block">Batch ID Tag Path</label>
        <input
          type="text"
          value={value.batch_tag ?? ''}
          onChange={(e) => onChange('batch_tag', e.target.value)}
          placeholder="spBv1.0/Plant1/Line1/BatchID"
          className="w-full px-3 py-2 text-sm border rounded-lg bg-background border-input"
        />
        <p className="text-xs text-muted-foreground mt-1">
          MQTT topic that publishes batch number changes
        </p>
      </div>

      <div>
        <label className="text-sm font-medium mb-2 block">Delay After Batch Start</label>
        <div className="flex items-center gap-2">
          <NumberInput
            min={0}
            max={60}
            value={String(value.delay_minutes ?? 5)}
            onChange={(v) => onChange('delay_minutes', parseInt(v) || 0)}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">minutes</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Wait before marking sample as due (allows process to stabilize)
        </p>
      </div>

      <div className="p-3 bg-muted/50 rounded-lg">
        <p className="text-xs text-muted-foreground">
          <strong>How it works:</strong> When the batch tag value changes, a measurement task
          will become due after the configured delay. This is ideal for capturing start-of-batch
          quality data.
        </p>
      </div>
    </>
  )
}
