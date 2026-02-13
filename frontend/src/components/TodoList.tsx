import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/stores/dashboardStore'
import type { CharacteristicSummary } from '@/types'
import { AlertCircle, Clock, CheckCircle } from 'lucide-react'

interface TodoListProps {
  characteristics: CharacteristicSummary[]
}

type CardStatus = 'ooc' | 'due' | 'ok'

function getCardStatus(characteristic: CharacteristicSummary): CardStatus {
  // Check for violations if available
  if (characteristic.unacknowledged_violations && characteristic.unacknowledged_violations > 0) {
    return 'ooc'
  }
  if (characteristic.in_control === false) {
    return 'ooc'
  }
  // For demo purposes, mark as "due" if last sample was more than 1 hour ago
  if (characteristic.last_sample_at) {
    const lastSample = new Date(characteristic.last_sample_at)
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    if (lastSample < hourAgo) {
      return 'due'
    }
  }
  // Default to 'due' for characteristics without recent samples
  return 'due'
}

function formatTimeSince(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

export function TodoList({ characteristics }: TodoListProps) {
  const selectedId = useDashboardStore((state) => state.selectedCharacteristicId)
  const setSelectedId = useDashboardStore((state) => state.setSelectedCharacteristicId)
  const openInputModal = useDashboardStore((state) => state.openInputModal)

  // Sort by status: OOC first, then due, then ok
  const sorted = useMemo(() => {
    return [...characteristics].sort((a, b) => {
      const statusOrder = { ooc: 0, due: 1, ok: 2 }
      const statusA = getCardStatus(a)
      const statusB = getCardStatus(b)
      return statusOrder[statusA] - statusOrder[statusB]
    })
  }, [characteristics])

  return (
    <div className="bg-card flex h-full flex-col rounded-lg border">
      <div className="border-b p-4">
        <h2 className="font-semibold">To-Do List</h2>
        <p className="text-muted-foreground text-sm">{characteristics.length} characteristics</p>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-2">
        {sorted.map((char) => (
          <TodoCard
            key={char.id}
            characteristic={char}
            status={getCardStatus(char)}
            isSelected={char.id === selectedId}
            onSelect={() => setSelectedId(char.id)}
            onEnterData={() => openInputModal(char.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface TodoCardProps {
  characteristic: CharacteristicSummary
  status: CardStatus
  isSelected: boolean
  onSelect: () => void
  onEnterData: () => void
}

function TodoCard({ characteristic, status, isSelected, onSelect, onEnterData }: TodoCardProps) {
  const statusConfig = {
    ooc: {
      border: 'border-destructive',
      bg: 'bg-destructive/10',
      icon: <AlertCircle className="text-destructive h-4 w-4" />,
      label: 'OOC',
      text: 'text-foreground',
      subtext: 'text-foreground/70',
    },
    due: {
      border: 'border-warning',
      bg: 'bg-warning/10',
      icon: <Clock className="text-warning h-4 w-4" />,
      label: 'Due',
      text: 'text-foreground',
      subtext: 'text-foreground/70',
    },
    ok: {
      border: 'border-muted',
      bg: 'bg-muted/20',
      icon: <CheckCircle className="text-muted-foreground h-4 w-4" />,
      label: 'OK',
      text: 'text-foreground',
      subtext: 'text-muted-foreground',
    },
  }

  const config = statusConfig[status]

  return (
    <div
      className={cn(
        'cursor-pointer rounded-lg border-2 p-3 transition-all',
        config.border,
        config.bg,
        isSelected && 'ring-primary ring-2 ring-offset-2',
        status === 'ooc' && 'violation-pulse',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {config.icon}
          <span className={cn('font-medium', config.text)}>{characteristic.name}</span>
        </div>
        {status === 'ooc' && characteristic.unacknowledged_violations && (
          <span className="bg-destructive text-destructive-foreground rounded px-1.5 py-0.5 text-xs">
            {characteristic.unacknowledged_violations} alert
            {characteristic.unacknowledged_violations !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className={cn('mt-2 text-sm', config.subtext)}>
        <div>
          {characteristic.hierarchy_path ||
            characteristic.description ||
            `ID: ${characteristic.hierarchy_id}`}
        </div>
        <div className="mt-1 flex justify-between">
          <span>Last: {formatTimeSince(characteristic.last_sample_at ?? null)}</span>
          {!characteristic.data_source && (
            <button
              className="text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation()
                onEnterData()
              }}
            >
              Enter Data
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
