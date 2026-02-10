import { Wifi, Server, ArrowRight, Cpu, BarChart3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BrokerConnectionStatus, OPCUAServerConnectionStatus } from '@/types'

interface DataFlowPipelineProps {
  mqttStates: BrokerConnectionStatus[]
  opcuaStates: OPCUAServerConnectionStatus[]
}

type HealthLevel = 'healthy' | 'degraded' | 'down' | 'idle'

function getHealthLevel(connected: number, total: number, errors: number): HealthLevel {
  if (total === 0) return 'idle'
  if (errors > 0 && connected === 0) return 'down'
  if (errors > 0) return 'degraded'
  if (connected > 0) return 'healthy'
  return 'idle'
}

const healthColors: Record<HealthLevel, { border: string; bg: string; glow: string; text: string; dot: string }> = {
  healthy: {
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    glow: 'shadow-[0_0_15px_rgba(16,185,129,0.08)]',
    text: 'text-emerald-400',
    dot: 'bg-emerald-500',
  },
  degraded: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    glow: 'shadow-[0_0_15px_rgba(245,158,11,0.08)]',
    text: 'text-amber-400',
    dot: 'bg-amber-500',
  },
  down: {
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    glow: 'shadow-[0_0_15px_rgba(239,68,68,0.08)]',
    text: 'text-red-400',
    dot: 'bg-red-500',
  },
  idle: {
    border: 'border-border',
    bg: 'bg-card',
    glow: '',
    text: 'text-muted-foreground',
    dot: 'bg-gray-500',
  },
}

/**
 * 3-stage visual data flow pipeline: Sources --> Ingestion --> SPC Engine.
 * Color-coded by health. Designed to be the visual centerpiece of the Monitor tab.
 */
export function DataFlowPipeline({ mqttStates, opcuaStates }: DataFlowPipelineProps) {
  const mqttConnected = mqttStates.filter((s) => s.is_connected).length
  const opcuaConnected = opcuaStates.filter((s) => s.is_connected).length
  const totalConnected = mqttConnected + opcuaConnected
  const totalServers = mqttStates.length + opcuaStates.length

  const mqttErrors = mqttStates.filter((s) => !s.is_connected && s.error_message && s.error_message !== 'Not connected' && s.error_message !== 'Disconnected').length
  const opcuaErrors = opcuaStates.filter((s) => !s.is_connected && s.error_message && s.error_message !== 'Not connected' && s.error_message !== 'Server is not connected' && s.error_message !== 'Disconnected').length
  const totalErrors = mqttErrors + opcuaErrors

  const totalTopics = mqttStates.reduce((acc, s) => acc + (s.subscribed_topics?.length ?? 0), 0)
  // OPCUAServerConnectionStatus doesn't expose monitored_nodes count — infer from connected state
  const totalNodes = opcuaStates.filter((s) => s.is_connected).length
  const totalMappings = totalTopics + totalNodes

  // Health levels for each stage
  const sourceHealth = getHealthLevel(totalConnected, totalServers, totalErrors)
  const ingestionHealth = totalMappings > 0 && totalConnected > 0
    ? (totalErrors > 0 ? 'degraded' : 'healthy')
    : totalErrors > 0 ? 'down' : 'idle'
  const spcHealth = totalMappings > 0 && totalConnected > 0 ? 'healthy' : 'idle'

  const sourceColors = healthColors[sourceHealth]
  const ingestionColors = healthColors[ingestionHealth as HealthLevel]
  const spcColors = healthColors[spcHealth]

  // Connector health (based on whether data can flow between stages)
  const connector1Active = totalConnected > 0
  const connector2Active = totalMappings > 0 && totalConnected > 0

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-muted-foreground mb-4">Data Flow Pipeline</h3>

      <div className="flex items-stretch gap-0">
        {/* Stage 1: Sources */}
        <div className={cn(
          'flex-1 rounded-xl border p-4 transition-all duration-300',
          sourceColors.border, sourceColors.bg, sourceColors.glow
        )}>
          <div className="flex items-center gap-2 mb-3">
            <div className={cn('w-2 h-2 rounded-full', sourceColors.dot)} />
            <h4 className="text-sm font-semibold">Sources</h4>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Wifi className="h-3.5 w-3.5 text-teal-400" />
              <span className="text-muted-foreground">MQTT</span>
              <span className="ml-auto font-mono font-medium">
                {mqttConnected}/{mqttStates.length}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Server className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-muted-foreground">OPC-UA</span>
              <span className="ml-auto font-mono font-medium">
                {opcuaConnected}/{opcuaStates.length}
              </span>
            </div>
            {totalErrors > 0 && (
              <div className="text-xs text-red-400 mt-1">
                {totalErrors} error{totalErrors !== 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>

        {/* Connector 1 */}
        <div className="flex items-center px-2 shrink-0">
          <div className={cn(
            'flex items-center gap-1 transition-colors duration-300',
            connector1Active ? 'text-emerald-500' : 'text-border'
          )}>
            <div className={cn(
              'w-8 h-0.5 rounded-full transition-colors duration-300',
              connector1Active ? 'bg-emerald-500/50' : 'bg-border'
            )} />
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>

        {/* Stage 2: Ingestion */}
        <div className={cn(
          'flex-1 rounded-xl border p-4 transition-all duration-300',
          ingestionColors.border, ingestionColors.bg, ingestionColors.glow
        )}>
          <div className="flex items-center gap-2 mb-3">
            <div className={cn('w-2 h-2 rounded-full', ingestionColors.dot)} />
            <h4 className="text-sm font-semibold">Ingestion</h4>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Active mappings</span>
              <span className="ml-auto font-mono font-medium">{totalMappings}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground ml-5">Topics subscribed</span>
              <span className="ml-auto font-mono font-medium">{totalTopics}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground ml-5">Nodes monitored</span>
              <span className="ml-auto font-mono font-medium">{totalNodes}</span>
            </div>
          </div>
        </div>

        {/* Connector 2 */}
        <div className="flex items-center px-2 shrink-0">
          <div className={cn(
            'flex items-center gap-1 transition-colors duration-300',
            connector2Active ? 'text-emerald-500' : 'text-border'
          )}>
            <div className={cn(
              'w-8 h-0.5 rounded-full transition-colors duration-300',
              connector2Active ? 'bg-emerald-500/50' : 'bg-border'
            )} />
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>

        {/* Stage 3: SPC Engine */}
        <div className={cn(
          'flex-1 rounded-xl border p-4 transition-all duration-300',
          spcColors.border, spcColors.bg, spcColors.glow
        )}>
          <div className="flex items-center gap-2 mb-3">
            <div className={cn('w-2 h-2 rounded-full', spcColors.dot)} />
            <h4 className="text-sm font-semibold">SPC Engine</h4>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Status</span>
              <span className={cn('ml-auto font-medium', spcColors.text)}>
                {totalConnected > 0 && totalMappings > 0 ? 'Processing' : 'Waiting'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground ml-5">Data sources</span>
              <span className="ml-auto font-mono font-medium">{totalMappings}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
