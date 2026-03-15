import { useState, useEffect, useCallback } from 'react'
import { useTheme } from '@/providers/ThemeProvider'
import { useECharts } from '@/hooks/useECharts'
import { downloadChartAsPng } from '@/lib/export-utils'

/**
 * Hook that wraps useECharts and captures a static PNG data URL from the chart
 * once it renders. For print/report contexts, canvas-based ECharts don't
 * reliably print, so we render a static <img> fallback alongside the
 * hidden canvas container (which drives the capture).
 */
export function useStaticChart(opts: Parameters<typeof useECharts>[0]) {
  const { containerRef, chartRef } = useECharts(opts)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [dataURL, setDataURL] = useState<string | null>(null)
  const [lightDataURL, setLightDataURL] = useState<string | null>(null)

  // Capture a static image after the chart has rendered
  useEffect(() => {
    // Small delay so ECharts finishes its animation/render cycle
    const timer = setTimeout(() => {
      const chart = chartRef.current
      if (!chart) return
      try {
        const bgColor = isDark ? 'hsl(220, 25%, 13%)' : '#fff'
        const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bgColor })
        setDataURL(url)
        // Always capture a light-mode version for PDF export
        const lightUrl = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
        setLightDataURL(lightUrl)
      } catch {
        // Chart may not be ready yet
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [chartRef, opts.option, isDark])

  /**
   * Download the current chart as a PNG file.
   * Uses the current theme's rendering (dark or light).
   */
  const downloadAsPng = useCallback(
    (filename: string) => {
      const chart = chartRef.current
      if (!chart) return
      try {
        const bgColor = isDark ? 'hsl(220, 25%, 13%)' : '#fff'
        const url = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: bgColor })
        const timestamp = new Date().toISOString().split('T')[0]
        const safeName = filename.replace(/[^a-zA-Z0-9_-]/g, '_')
        downloadChartAsPng(url, `${safeName}-${timestamp}`)
      } catch {
        // Chart not ready
      }
    },
    [chartRef, isDark],
  )

  return { containerRef, dataURL, lightDataURL, downloadAsPng }
}
