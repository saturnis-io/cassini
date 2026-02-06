import type { BrokerConnectionStatus } from '@/types'

interface ConnectionMetricsProps {
  states: BrokerConnectionStatus[]
}

/**
 * Summary metrics bar showing connectivity overview.
 */
export function ConnectionMetrics({ states }: ConnectionMetricsProps) {
  const totalBrokers = states.length
  const connectedBrokers = states.filter((s) => s.is_connected).length
  const totalTopics = states.reduce(
    (acc, s) => acc + (s.subscribed_topics?.length ?? 0),
    0
  )

  const metrics = [
    {
      label: 'Total Brokers',
      value: totalBrokers,
      color: 'text-foreground',
    },
    {
      label: 'Connected',
      value: connectedBrokers,
      color: connectedBrokers > 0 ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground',
    },
    {
      label: 'Subscribed Topics',
      value: totalTopics,
      color: 'text-foreground',
    },
  ]

  return (
    <div className="grid grid-cols-3 gap-4">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="bg-card border border-border rounded-lg px-4 py-3 text-center"
        >
          <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{m.label}</p>
        </div>
      ))}
    </div>
  )
}
