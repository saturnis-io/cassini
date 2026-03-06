import { NavLink } from 'react-router-dom'
import { LayoutDashboard, PenTool, AlertTriangle, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

const MOBILE_TABS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/entry', label: 'Data Entry', icon: PenTool },
  { to: '/violations', label: 'Violations', icon: AlertTriangle },
  { to: '/settings', label: 'More', icon: MoreHorizontal },
]

/**
 * Bottom navigation bar — visible only on mobile (md:hidden).
 */
export function MobileNav() {
  return (
    <nav data-ui="mobile-nav" className="border-border bg-background/95 fixed right-0 bottom-0 left-0 z-50 flex border-t backdrop-blur-sm md:hidden safe-area-bottom">
      {MOBILE_TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground',
            )
          }
        >
          <tab.icon className="h-5 w-5" />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
