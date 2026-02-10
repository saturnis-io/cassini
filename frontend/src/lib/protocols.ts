/**
 * Protocol registry — centralized metadata for all supported connectivity protocols.
 * Used by ProtocolBadge, Connectivity Hub tabs, and DataSourceSummary.
 */

import { Wifi, Server, type LucideIcon } from 'lucide-react'

export interface ProtocolDefinition {
  /** Protocol identifier (matches DataSource.type in backend) */
  id: string
  /** Human-readable label */
  label: string
  /** Lucide icon component */
  icon: LucideIcon
  /** Tailwind color class prefix (e.g., 'teal', 'purple') */
  color: string
  /** Tailwind text color class for badges and indicators */
  textColor: string
  /** Background color class (with opacity) */
  bgColor: string
  /** Border color class */
  borderColor: string
  /** Short description */
  description: string
}

export const PROTOCOLS: Record<string, ProtocolDefinition> = {
  mqtt: {
    id: 'mqtt',
    label: 'MQTT',
    icon: Wifi,
    color: 'teal',
    textColor: 'text-teal-400',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
    description: 'Message Queuing Telemetry Transport — lightweight pub/sub messaging',
  },
  opcua: {
    id: 'opcua',
    label: 'OPC-UA',
    icon: Server,
    color: 'purple',
    textColor: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    description: 'OPC Unified Architecture — industrial communication standard',
  },
}

/**
 * Look up a protocol definition by its type string.
 * Falls back to a generic definition for unknown protocols.
 */
export function getProtocol(type: string): ProtocolDefinition {
  const key = type.toLowerCase()
  return PROTOCOLS[key] ?? {
    id: key,
    label: type.toUpperCase(),
    icon: Server,
    color: 'gray',
    textColor: 'text-muted-foreground',
    bgColor: 'bg-muted',
    borderColor: 'border-border',
    description: type,
  }
}

/** Alias for getProtocol */
export const getProtocolDef = getProtocol

/** Ordered list of all registered protocol definitions */
export const PROTOCOL_LIST = Object.values(PROTOCOLS)
