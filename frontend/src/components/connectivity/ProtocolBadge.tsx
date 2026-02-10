import { getProtocol } from '@/lib/protocols'

interface ProtocolBadgeProps {
  protocol: string
  size?: 'sm' | 'md'
}

/**
 * Colored protocol badge with icon and label.
 * MQTT: teal with Wifi icon. OPC-UA: purple with Server icon.
 */
export function ProtocolBadge({ protocol, size = 'sm' }: ProtocolBadgeProps) {
  const def = getProtocol(protocol)
  const Icon = def.icon

  const sizeClasses = size === 'sm'
    ? 'px-1.5 py-0.5 text-[10px] gap-1'
    : 'px-2 py-1 text-xs gap-1.5'
  const iconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'

  return (
    <span className={`inline-flex items-center font-semibold rounded ${sizeClasses} ${def.bgColor} ${def.textColor}`}>
      <Icon className={iconSize} />
      {def.label}
    </span>
  )
}
