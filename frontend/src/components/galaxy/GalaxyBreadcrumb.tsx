import { ChevronRight, LayoutDashboard } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { ZoomLevel } from '@/lib/galaxy/CameraController'

interface GalaxyBreadcrumbProps {
  zoomLevel: ZoomLevel
  constellationPath: { id: number; name: string }[]
  planetName?: string
  onNavigateGalaxy: () => void
  onNavigateConstellation: (id: number) => void
}

export function GalaxyBreadcrumb({
  zoomLevel,
  constellationPath,
  planetName,
  onNavigateGalaxy,
  onNavigateConstellation,
}: GalaxyBreadcrumbProps) {
  const navigate = useNavigate()

  // Hidden at galaxy zoom
  if (zoomLevel === 'galaxy') return null

  return (
    <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-border bg-card/90 px-3 py-1.5 shadow-md backdrop-blur-md">
      {/* Dashboard button */}
      <button
        onClick={() => navigate('/')}
        className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        title="Back to Dashboard"
      >
        <LayoutDashboard className="h-3.5 w-3.5" />
      </button>

      <ChevronRight className="h-3 w-3 text-border" />

      {/* Galaxy root */}
      <button
        onClick={onNavigateGalaxy}
        className="cursor-pointer text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
      >
        Galaxy
      </button>

      {/* Constellation path segments */}
      {constellationPath.map((segment, i) => {
        const isLast =
          i === constellationPath.length - 1 && zoomLevel === 'constellation'
        return (
          <span key={segment.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-border" />
            {isLast ? (
              <span className="text-xs font-semibold text-foreground">
                {segment.name}
              </span>
            ) : (
              <button
                onClick={() => onNavigateConstellation(segment.id)}
                className={cn(
                  'cursor-pointer text-xs font-medium transition-colors',
                  'text-muted-foreground hover:text-primary',
                )}
              >
                {segment.name}
              </button>
            )}
          </span>
        )
      })}

      {/* Planet name at planet zoom */}
      {zoomLevel === 'planet' && planetName && (
        <span className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-border" />
          <span className="max-w-[200px] truncate text-xs font-semibold text-foreground">
            {planetName}
          </span>
        </span>
      )}
    </div>
  )
}
