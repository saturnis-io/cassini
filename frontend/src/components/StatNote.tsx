import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatNoteProps {
  children: ReactNode
  className?: string
}

export function StatNote({ children, className }: StatNoteProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const iconRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updatePosition = useCallback(() => {
    if (!iconRef.current) return
    const rect = iconRef.current.getBoundingClientRect()
    const tooltipWidth = 260
    const padding = 8

    let top = rect.bottom + 6
    let left = rect.left + rect.width / 2 - tooltipWidth / 2

    // Keep within viewport
    if (left < padding) left = padding
    if (left + tooltipWidth > window.innerWidth - padding) {
      left = window.innerWidth - tooltipWidth - padding
    }
    if (top + 120 > window.innerHeight) {
      top = rect.top - 6
    }

    setPos({ top, left })
  }, [])

  const show = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    showTimeoutRef.current = setTimeout(() => {
      updatePosition()
      setVisible(true)
    }, 150)
  }, [updatePosition])

  const hide = useCallback(() => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    hideTimeoutRef.current = setTimeout(() => {
      setVisible(false)
    }, 100)
  }, [])

  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        iconRef.current &&
        !iconRef.current.contains(target) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(target)
      ) {
        setVisible(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVisible(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [visible])

  return (
    <>
      <span
        ref={iconRef}
        role="button"
        tabIndex={0}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={(e) => {
          e.stopPropagation()
          setVisible((v) => !v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setVisible((v) => !v)
          }
        }}
        className={cn(
          'inline-flex cursor-help items-center',
          'text-muted-foreground/50 hover:text-muted-foreground transition-colors',
          className,
        )}
        aria-label="Statistical note"
      >
        <Info className="h-3 w-3" />
      </span>
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            onMouseEnter={show}
            onMouseLeave={hide}
            className={cn(
              'fixed z-[60] max-w-[260px] rounded-lg border px-3 py-2 shadow-lg',
              'bg-popover text-popover-foreground border-border',
              'animate-in fade-in-0 zoom-in-95 duration-150',
              'text-xs leading-relaxed',
            )}
            style={{ top: pos.top, left: pos.left }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  )
}
