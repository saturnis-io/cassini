import { useMemo } from 'react'
import { usePlantHealth } from '@/api/hooks/report-analytics'
import { usePlantContext } from '@/providers/PlantProvider'
import { useStaticChart } from '@/hooks/useStaticChart'
import { useTheme } from '@/providers/ThemeProvider'
import { BarChart3 } from 'lucide-react'

interface ReportCharacteristicComparisonProps {
  linePath?: string
}

export function ReportCharacteristicComparison({
  linePath,
}: ReportCharacteristicComparisonProps) {
  const { selectedPlant } = usePlantContext()
  const { data, isLoading, error } = usePlantHealth(selectedPlant?.id ?? 0)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const chars = useMemo(() => {
    if (!data) return []
    const filtered = linePath
      ? data.characteristics.filter((c) => c.hierarchy_path.startsWith(linePath))
      : data.characteristics
    return filtered
      .filter((c) => c.cpk != null)
      .sort((a, b) => a.cpk! - b.cpk!)
  }, [data, linePath])

  const chartHeight = Math.max(200, chars.length * 32 + 60)

  const option = useMemo(() => {
    if (chars.length === 0) return null

    const names = chars.map((c) => c.name)
    const values = chars.map((c) => c.cpk!)
    const colors = values.map((v) =>
      v >= 1.33
        ? 'hsl(var(--success))'
        : v >= 1.0
          ? 'hsl(var(--warning))'
          : 'hsl(var(--destructive))',
    )

    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : undefined
    const splitColor = isDark ? 'hsl(220, 10%, 25%)' : 'hsl(240 6% 90%)'

    return {
      grid: { top: 10, right: 40, left: 160, bottom: 30 },
      xAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 10, color: axisLabelColor },
        splitLine: {
          lineStyle: { type: 'dashed' as const, color: splitColor },
        },
      },
      yAxis: {
        type: 'category' as const,
        data: names,
        axisLabel: {
          fontSize: 10,
          color: axisLabelColor,
          width: 140,
          overflow: 'truncate' as const,
        },
      },
      series: [
        {
          type: 'bar' as const,
          data: values.map((v, i) => ({
            value: v,
            itemStyle: { color: colors[i] },
          })),
          label: {
            show: true,
            position: 'right' as const,
            fontSize: 10,
            formatter: (p: { value: number }) => p.value.toFixed(2),
          },
          markLine: {
            silent: true,
            symbol: 'none',
            precision: 10,
            lineStyle: {
              type: 'dashed' as const,
              width: 1,
            },
            data: [
              {
                xAxis: 1.33,
                label: {
                  formatter: '1.33',
                  fontSize: 9,
                  position: 'end' as const,
                },
                lineStyle: { color: 'hsl(var(--success))' },
              },
              {
                xAxis: 1.0,
                label: {
                  formatter: '1.00',
                  fontSize: 9,
                  position: 'end' as const,
                },
                lineStyle: { color: 'hsl(var(--warning))' },
              },
            ],
          },
        },
      ],
    }
  }, [chars, isDark])

  const { containerRef, dataURL, lightDataURL } = useStaticChart({
    option,
    notMerge: true,
  })

  if (isLoading) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-5 w-5" />
          Characteristic Comparison
        </h2>
        <p className="text-muted-foreground text-sm">Loading comparison data...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-5 w-5" />
          Characteristic Comparison
        </h2>
        <p className="text-muted-foreground text-sm">
          Unable to load comparison data.
        </p>
      </div>
    )
  }

  if (chars.length === 0) {
    return (
      <div className="border-border rounded-lg border p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-5 w-5" />
          Characteristic Comparison
        </h2>
        <p className="text-muted-foreground text-sm">
          No characteristics with Cpk data available.
        </p>
      </div>
    )
  }

  return (
    <div className="border-border rounded-lg border p-4">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <BarChart3 className="h-5 w-5" />
        Characteristic Comparison
      </h2>
      <p className="text-muted-foreground mb-4 text-xs">
        Cpk by characteristic, sorted worst-first
      </p>

      <div className="relative" style={{ height: chartHeight }}>
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ visibility: dataURL ? 'hidden' : 'visible' }}
        />
        {dataURL && (
          <img
            src={dataURL}
            data-light-src={lightDataURL ?? undefined}
            alt="Characteristic Cpk comparison chart"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </div>

      {/* Legend */}
      <div className="text-muted-foreground mt-2 flex justify-center gap-6 text-xs">
        <span className="flex items-center gap-1">
          <span className="bg-success inline-block h-2 w-3 rounded-sm" /> Cpk
          &ge; 1.33
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-warning inline-block h-2 w-3 rounded-sm" /> Cpk
          &ge; 1.00
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-destructive inline-block h-2 w-3 rounded-sm" />{' '}
          Cpk &lt; 1.00
        </span>
      </div>
    </div>
  )
}
