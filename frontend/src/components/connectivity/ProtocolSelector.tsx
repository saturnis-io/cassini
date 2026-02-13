import { cn } from '@/lib/utils'
import { Wifi, Server } from 'lucide-react'

export type ProtocolId = 'mqtt' | 'opcua'

interface ProtocolOption {
  id: ProtocolId
  label: string
  description: string
  icon: typeof Wifi
  color: string
  bgColor: string
  borderColor: string
}

const protocols: ProtocolOption[] = [
  {
    id: 'mqtt',
    label: 'MQTT Broker',
    description: 'Connect to MQTT brokers for pub/sub messaging. Supports SparkplugB.',
    icon: Wifi,
    color: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
  },
  {
    id: 'opcua',
    label: 'OPC-UA Server',
    description: 'Connect to OPC-UA servers for industrial data acquisition.',
    icon: Server,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
]

interface ProtocolSelectorProps {
  selected: ProtocolId | null
  onSelect: (protocol: ProtocolId) => void
}

/**
 * Card-based protocol picker for the "Add Server" flow.
 * Renders each protocol as a clickable card with icon, label, and description.
 */
export function ProtocolSelector({ selected, onSelect }: ProtocolSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {protocols.map((proto) => {
        const Icon = proto.icon
        const isSelected = selected === proto.id
        return (
          <button
            key={proto.id}
            type="button"
            onClick={() => onSelect(proto.id)}
            className={cn(
              'flex items-start gap-4 rounded-xl border-2 p-5 text-left transition-all duration-200',
              'hover:shadow-md',
              isSelected
                ? `${proto.borderColor} ${proto.bgColor} shadow-sm`
                : 'border-border bg-card hover:border-muted-foreground/30',
            )}
          >
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg',
                isSelected ? proto.bgColor : 'bg-muted',
              )}
            >
              <Icon className={cn('h-6 w-6', isSelected ? proto.color : 'text-muted-foreground')} />
            </div>
            <div className="min-w-0">
              <h3
                className={cn(
                  'text-sm font-semibold',
                  isSelected ? 'text-foreground' : 'text-foreground',
                )}
              >
                {proto.label}
              </h3>
              <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                {proto.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
