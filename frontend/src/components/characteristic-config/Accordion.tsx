import { useState, createContext, useContext, useId, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccordionContextValue {
  openItems: Set<string>
  toggle: (id: string) => void
}

const AccordionContext = createContext<AccordionContextValue | null>(null)

interface AccordionProps {
  children: ReactNode
  defaultOpen?: string[]
  className?: string
}

export function Accordion({ children, defaultOpen = [], className }: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(defaultOpen))

  const toggle = (id: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div className={cn('space-y-3', className)}>{children}</div>
    </AccordionContext.Provider>
  )
}

interface AccordionItemProps {
  children: ReactNode
  id?: string
  className?: string
}

export function AccordionItem({ children, id: propId, className }: AccordionItemProps) {
  const generatedId = useId()
  const id = propId ?? generatedId

  return (
    <div className={className} data-accordion-item={id}>
      {children}
    </div>
  )
}

interface AccordionTriggerProps {
  children: ReactNode
  id: string
  className?: string
}

export function AccordionTrigger({ children, id, className }: AccordionTriggerProps) {
  const ctx = useContext(AccordionContext)
  if (!ctx) throw new Error('AccordionTrigger must be used within Accordion')

  const isOpen = ctx.openItems.has(id)

  return (
    <button
      type="button"
      onClick={() => ctx.toggle(id)}
      aria-expanded={isOpen}
      aria-controls={`accordion-content-${id}`}
      data-state={isOpen ? 'open' : 'closed'}
      className={cn(
        'w-full flex items-center justify-between gap-3 px-4 py-3',
        'text-left font-medium text-sm',
        'bg-muted/40 hover:bg-muted/60 transition-colors',
        'border border-border rounded-lg',
        isOpen && 'rounded-b-none border-b-0',
        className
      )}
    >
      <span className="flex-1">{children}</span>
      <ChevronDown
        className={cn(
          'h-4 w-4 text-muted-foreground transition-transform duration-200',
          isOpen && 'rotate-180'
        )}
      />
    </button>
  )
}

interface AccordionContentProps {
  children: ReactNode
  id: string
  className?: string
}

export function AccordionContent({ children, id, className }: AccordionContentProps) {
  const ctx = useContext(AccordionContext)
  if (!ctx) throw new Error('AccordionContent must be used within Accordion')

  const isOpen = ctx.openItems.has(id)

  if (!isOpen) return null

  return (
    <div
      id={`accordion-content-${id}`}
      role="region"
      aria-labelledby={`accordion-trigger-${id}`}
      data-state="open"
      className={cn(
        'px-4 py-4 border border-t-0 border-border rounded-b-lg',
        'bg-background',
        'animate-in slide-in-from-top-1 duration-200',
        className
      )}
    >
      {children}
    </div>
  )
}

// Compound component for simpler usage
interface AccordionSectionProps {
  id: string
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  className?: string
}

export function AccordionSection({
  id,
  title,
  children,
  className,
}: AccordionSectionProps) {
  return (
    <AccordionItem id={id} className={className}>
      <AccordionTrigger id={id}>{title}</AccordionTrigger>
      <AccordionContent id={id}>{children}</AccordionContent>
    </AccordionItem>
  )
}
