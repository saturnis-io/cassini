import { useState, useRef, useEffect, type ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getHelpContent, type HelpContent } from '@/lib/help-content'

interface HelpTooltipProps {
  /** Key to look up content in helpContent registry */
  helpKey: string
  /** Tooltip placement relative to trigger */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /** Optional custom trigger element (defaults to "?" icon) */
  children?: ReactNode
  /** Additional classes for the trigger element */
  className?: string
  /**
   * Element type for the trigger. Use 'span' when HelpTooltip is inside a button
   * to avoid nested button hydration errors.
   * @default 'button'
   */
  triggerAs?: 'button' | 'span'
}

/**
 * Severity badge component for displaying rule severity levels.
 */
function SeverityBadge({ severity }: { severity: HelpContent['severity'] }) {
  if (!severity) return null

  const severityStyles = {
    CRITICAL: 'bg-destructive/20 text-destructive border-destructive/30',
    WARNING: 'bg-warning/20 text-warning border-warning/30',
    INFO: 'bg-primary/20 text-primary border-primary/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        severityStyles[severity],
      )}
    >
      {severity}
    </span>
  )
}

/**
 * HelpTooltip - A reusable contextual help component.
 *
 * Displays a "?" icon that shows a tooltip with help content on hover/click.
 * Content is retrieved from the centralized helpContent registry.
 *
 * @example
 * // Basic usage with helpKey
 * <HelpTooltip helpKey="nelson-rule-1" />
 *
 * @example
 * // Custom trigger element
 * <HelpTooltip helpKey="ucl-explanation">
 *   <span className="underline">UCL</span>
 * </HelpTooltip>
 *
 * @example
 * // With placement
 * <HelpTooltip helpKey="zone-a" placement="right" />
 */
export function HelpTooltip({
  helpKey,
  placement = 'top',
  children,
  className,
  triggerAs = 'button',
}: HelpTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const content = getHelpContent(helpKey)

  // Calculate tooltip position based on trigger element and placement
  const updatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    // No scroll offsets — tooltip uses position:fixed, so coords are viewport-relative
    const padding = 8

    let top = 0
    let left = 0

    switch (placement) {
      case 'top':
        top = triggerRect.top - tooltipRect.height - padding
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
        break
      case 'bottom':
        top = triggerRect.bottom + padding
        left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
        break
      case 'left':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        left = triggerRect.left - tooltipRect.width - padding
        break
      case 'right':
        top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2
        left = triggerRect.right + padding
        break
    }

    // Keep tooltip within viewport bounds
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Horizontal bounds check
    if (left < padding) {
      left = padding
    } else if (left + tooltipRect.width > viewportWidth - padding) {
      left = viewportWidth - tooltipRect.width - padding
    }

    // Vertical bounds check
    if (top < padding) {
      top = padding
    } else if (top + tooltipRect.height > viewportHeight - padding) {
      top = viewportHeight - tooltipRect.height - padding
    }

    setPosition({ top, left })
  }

  // Update position when tooltip becomes visible
  useEffect(() => {
    if (isVisible) {
      // Small delay to ensure tooltip is rendered before measuring
      requestAnimationFrame(updatePosition)
    }
  }, [isVisible, placement])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
      if (showTimeoutRef.current) clearTimeout(showTimeoutRef.current)
    }
  }, [])

  const handleMouseEnter = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
    // 200ms delay before showing tooltip (desktop hover)
    showTimeoutRef.current = setTimeout(() => {
      setIsVisible(true)
    }, 200)
  }

  const handleMouseLeave = () => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current)
      showTimeoutRef.current = null
    }
    // Small delay before hiding to allow moving to tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false)
    }, 100)
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Toggle on click for mobile/touch support
    setIsVisible((prev) => !prev)
  }

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!isVisible) return

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(target)
      ) {
        setIsVisible(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isVisible])

  // Close tooltip on Escape key
  useEffect(() => {
    if (!isVisible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsVisible(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isVisible])

  const triggerClassName = cn(
    'inline-flex items-center justify-center cursor-help',
    'text-muted-foreground hover:text-primary transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-sm',
    className,
  )

  const triggerContent = children ?? <HelpCircle className="h-4 w-4" />

  const TriggerElement =
    triggerAs === 'span' ? (
      <span
        ref={triggerRef as React.RefObject<HTMLSpanElement>}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick(e as unknown as React.MouseEvent)
          }
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={triggerClassName}
        aria-label={`Help: ${content.title}`}
        aria-expanded={isVisible}
        aria-describedby={isVisible ? `help-tooltip-${helpKey}` : undefined}
      >
        {triggerContent}
      </span>
    ) : (
      <button
        ref={triggerRef as React.RefObject<HTMLButtonElement>}
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={triggerClassName}
        aria-label={`Help: ${content.title}`}
        aria-expanded={isVisible}
        aria-describedby={isVisible ? `help-tooltip-${helpKey}` : undefined}
      >
        {triggerContent}
      </button>
    )

  return (
    <>
      {TriggerElement}

      {isVisible && (
        <div
          ref={tooltipRef}
          id={`help-tooltip-${helpKey}`}
          role="tooltip"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={cn(
            'fixed z-[60] max-w-[280px] p-3',
            'text-popover-foreground bg-popover',
            'border-border rounded-lg border shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
          style={{
            top: position.top,
            left: position.left,
          }}
        >
          {/* Title */}
          <div className="mb-1 text-sm font-semibold">{content.title}</div>

          {/* Description */}
          <p className="text-muted-foreground text-sm">{content.description}</p>

          {/* Details (if provided) */}
          {content.details && (
            <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{content.details}</p>
          )}

          {/* Severity badge (if provided) */}
          {content.severity && (
            <div className="mt-2">
              <SeverityBadge severity={content.severity} />
            </div>
          )}

          {/* Learn more link (if provided) */}
          {content.learnMoreUrl && (
            <a
              href={content.learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary mt-2 inline-flex items-center text-xs hover:underline"
            >
              Learn more
              <svg className="ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}

          {/* Tooltip arrow indicator */}
          <div
            className={cn(
              'bg-popover absolute h-2 w-2 rotate-45 border',
              placement === 'top' && 'bottom-[-5px] left-1/2 -translate-x-1/2 border-r border-b',
              placement === 'bottom' && 'top-[-5px] left-1/2 -translate-x-1/2 border-t border-l',
              placement === 'left' && 'top-1/2 right-[-5px] -translate-y-1/2 border-t border-r',
              placement === 'right' && 'top-1/2 left-[-5px] -translate-y-1/2 border-b border-l',
            )}
          />
        </div>
      )}
    </>
  )
}

export default HelpTooltip
