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
}

/**
 * Severity badge component for displaying rule severity levels.
 */
function SeverityBadge({ severity }: { severity: HelpContent['severity'] }) {
  if (!severity) return null

  const severityStyles = {
    CRITICAL: 'bg-red-500/20 text-red-600 border-red-500/30',
    WARNING: 'bg-orange-500/20 text-orange-600 border-orange-500/30',
    INFO: 'bg-blue-500/20 text-blue-600 border-blue-500/30',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        severityStyles[severity]
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
}: HelpTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const content = getHelpContent(helpKey)

  // Calculate tooltip position based on trigger element and placement
  const updatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return

    const triggerRect = triggerRef.current.getBoundingClientRect()
    const tooltipRect = tooltipRef.current.getBoundingClientRect()
    const scrollX = window.scrollX
    const scrollY = window.scrollY
    const padding = 8

    let top = 0
    let left = 0

    switch (placement) {
      case 'top':
        top = triggerRect.top + scrollY - tooltipRect.height - padding
        left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipRect.width / 2
        break
      case 'bottom':
        top = triggerRect.bottom + scrollY + padding
        left = triggerRect.left + scrollX + triggerRect.width / 2 - tooltipRect.width / 2
        break
      case 'left':
        top = triggerRect.top + scrollY + triggerRect.height / 2 - tooltipRect.height / 2
        left = triggerRect.left + scrollX - tooltipRect.width - padding
        break
      case 'right':
        top = triggerRect.top + scrollY + triggerRect.height / 2 - tooltipRect.height / 2
        left = triggerRect.right + scrollX + padding
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
    if (top < scrollY + padding) {
      top = scrollY + padding
    } else if (top + tooltipRect.height > scrollY + viewportHeight - padding) {
      top = scrollY + viewportHeight - tooltipRect.height - padding
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'inline-flex items-center justify-center cursor-help',
          'text-muted-foreground hover:text-primary transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-sm',
          className
        )}
        aria-label={`Help: ${content.title}`}
        aria-expanded={isVisible}
        aria-describedby={isVisible ? `help-tooltip-${helpKey}` : undefined}
      >
        {children ?? <HelpCircle className="w-4 h-4" />}
      </button>

      {isVisible && (
        <div
          ref={tooltipRef}
          id={`help-tooltip-${helpKey}`}
          role="tooltip"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={cn(
            'fixed z-50 max-w-[280px] p-3',
            'bg-popover text-popover-foreground',
            'border border-border rounded-lg shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-150'
          )}
          style={{
            top: position.top,
            left: position.left,
          }}
        >
          {/* Title */}
          <div className="font-semibold text-sm mb-1">{content.title}</div>

          {/* Description */}
          <p className="text-sm text-muted-foreground">{content.description}</p>

          {/* Details (if provided) */}
          {content.details && (
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {content.details}
            </p>
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
              className="inline-flex items-center mt-2 text-xs text-primary hover:underline"
            >
              Learn more
              <svg
                className="w-3 h-3 ml-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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
              'absolute w-2 h-2 bg-popover border rotate-45',
              placement === 'top' && 'bottom-[-5px] left-1/2 -translate-x-1/2 border-r border-b',
              placement === 'bottom' && 'top-[-5px] left-1/2 -translate-x-1/2 border-l border-t',
              placement === 'left' && 'right-[-5px] top-1/2 -translate-y-1/2 border-t border-r',
              placement === 'right' && 'left-[-5px] top-1/2 -translate-y-1/2 border-b border-l'
            )}
          />
        </div>
      )}
    </>
  )
}

export default HelpTooltip
