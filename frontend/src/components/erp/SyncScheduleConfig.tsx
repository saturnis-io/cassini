import { useState } from 'react'
import { Loader2, Clock } from 'lucide-react'
import { useUpdateERPSchedule } from '@/api/hooks'

const DIRECTION_OPTIONS = [
  { value: 'inbound', label: 'Inbound (ERP to SPC)' },
  { value: 'outbound', label: 'Outbound (SPC to ERP)' },
]

const INTERVAL_PRESETS = [
  { label: 'Every 5 minutes', cron: '*/5 * * * *' },
  { label: 'Every 15 minutes', cron: '*/15 * * * *' },
  { label: 'Every 30 minutes', cron: '*/30 * * * *' },
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Every 6 hours', cron: '0 */6 * * *' },
  { label: 'Daily at midnight', cron: '0 0 * * *' },
  { label: 'Daily at 6 AM', cron: '0 6 * * *' },
  { label: 'Custom', cron: '' },
]

/**
 * SyncScheduleConfig - Configure cron-based sync schedules for a connector.
 * Offers preset intervals and a custom cron expression option.
 */
export function SyncScheduleConfig({ connectorId }: { connectorId: number }) {
  const updateSchedule = useUpdateERPSchedule()
  const [direction, setDirection] = useState('inbound')
  const [selectedPreset, setSelectedPreset] = useState(INTERVAL_PRESETS[2].cron)
  const [customCron, setCustomCron] = useState('')
  const [isActive, setIsActive] = useState(true)

  const cronExpression = selectedPreset || customCron

  const handleSave = () => {
    if (!cronExpression) return
    updateSchedule.mutate({
      connectorId,
      data: {
        direction,
        cron_expression: cronExpression,
        is_active: isActive,
      },
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="text-muted-foreground h-3.5 w-3.5" />
        <h4 className="text-xs font-semibold uppercase tracking-wider">
          Sync Schedule
        </h4>
      </div>

      <div className="space-y-2">
        {/* Direction */}
        <div>
          <label className="text-muted-foreground text-[10px] font-medium uppercase">
            Direction
          </label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="border-input bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-xs"
          >
            {DIRECTION_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {/* Interval */}
        <div>
          <label className="text-muted-foreground text-[10px] font-medium uppercase">
            Interval
          </label>
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            className="border-input bg-background mt-1 w-full rounded-md border px-2 py-1.5 text-xs"
          >
            {INTERVAL_PRESETS.map((p) => (
              <option key={p.label} value={p.cron}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Custom cron */}
        {selectedPreset === '' && (
          <div>
            <label className="text-muted-foreground text-[10px] font-medium uppercase">
              Cron Expression
            </label>
            <input
              value={customCron}
              onChange={(e) => setCustomCron(e.target.value)}
              placeholder="*/10 * * * *"
              className="border-input bg-background mt-1 w-full rounded-md border px-2 py-1.5 font-mono text-xs"
            />
            <p className="text-muted-foreground mt-1 text-[10px]">
              Format: minute hour day month weekday
            </p>
          </div>
        )}

        {/* Active toggle */}
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded"
          />
          Schedule active
        </label>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={updateSchedule.isPending || !cronExpression}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 rounded px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {updateSchedule.isPending && (
            <Loader2 className="h-3 w-3 animate-spin" />
          )}
          Save Schedule
        </button>
      </div>
    </div>
  )
}
