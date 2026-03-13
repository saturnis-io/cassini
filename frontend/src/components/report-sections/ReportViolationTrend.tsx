import { useMemo } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import { useStaticChart } from '@/hooks/useStaticChart'
import type { Violation } from '@/types'

interface ReportViolationTrendSectionProps {
  violations: Violation[]
}

/**
 * Violation trend section: stacked bar chart of daily violation counts by severity.
 */
export function ReportViolationTrendSection({ violations }: ReportViolationTrendSectionProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const option = useMemo(() => {
    if (violations.length === 0) return null

    // Group violations by date and severity
    const byDay = new Map<string, Record<string, number>>()
    for (const v of violations) {
      const day = v.created_at ? v.created_at.split('T')[0] : 'Unknown'
      if (!byDay.has(day)) byDay.set(day, {})
      const bucket = byDay.get(day)!
      bucket[v.severity] = (bucket[v.severity] || 0) + 1
    }

    const sortedDays = [...byDay.keys()].sort()
    const severities = ['CRITICAL', 'WARNING', 'INFO']
    const severityColors: Record<string, string> = {
      CRITICAL: isDark ? 'hsl(357 90% 65%)' : 'hsl(357 80% 52%)',
      WARNING: isDark ? 'hsl(40 90% 60%)' : 'hsl(40 90% 45%)',
      INFO: isDark ? 'hsl(212 80% 65%)' : 'hsl(212 80% 45%)',
    }

    return {
      grid: { top: 10, right: 20, left: 40, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: sortedDays,
        axisLabel: { fontSize: 9, color: isDark ? 'hsl(220, 5%, 70%)' : undefined },
      },
      yAxis: {
        type: 'value' as const,
        minInterval: 1,
        axisLabel: { fontSize: 10, color: isDark ? 'hsl(220, 5%, 70%)' : undefined },
        splitLine: { lineStyle: { type: 'dashed' as const, color: isDark ? 'hsl(220, 10%, 25%)' : 'hsl(240 6% 90%)' } },
      },
      tooltip: {
        trigger: 'axis' as const,
      },
      series: severities.map((sev) => ({
        name: sev.charAt(0) + sev.slice(1).toLowerCase(),
        type: 'bar' as const,
        stack: 'violations',
        data: sortedDays.map((day) => byDay.get(day)?.[sev] ?? 0),
        itemStyle: { color: severityColors[sev] },
      })),
    }
  }, [violations, isDark])

  const { containerRef, dataURL, lightDataURL } = useStaticChart({ option, notMerge: true })

  if (violations.length === 0) return null

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Violation Trend</h2>
      <p className="text-muted-foreground mb-4 text-xs">Daily violation counts by severity</p>
      <div className="relative h-48">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: dataURL ? 'hidden' : 'visible' }}
        />
        {dataURL && (
          <img
            src={dataURL}
            data-light-src={lightDataURL ?? undefined}
            alt="Violation trend chart"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>
      <div className="text-muted-foreground mt-2 flex justify-center gap-6 text-xs">
        <span className="flex items-center gap-1">
          <span className="bg-destructive inline-block h-2 w-3 rounded-sm" /> Critical
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-warning inline-block h-2 w-3 rounded-sm" /> Warning
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-primary inline-block h-2 w-3 rounded-sm" /> Info
        </span>
      </div>
    </div>
  )
}
