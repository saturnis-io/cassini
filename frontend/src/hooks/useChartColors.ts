import { useState, useCallback, useEffect } from 'react'
import type { ChartColors } from '@/lib/theme-presets'
import { getStoredChartColors } from '@/lib/theme-presets'
import { useTheme } from '@/providers/ThemeProvider'

/**
 * Subscribe to chart color changes from localStorage and custom events.
 * Returns mode-aware ChartColors, updating reactively when the user
 * changes their chart color preset, individual colors, or light/dark mode.
 */
export function useChartColors(): ChartColors {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState<ChartColors>(() => getStoredChartColors(resolvedTheme))

  const updateColors = useCallback(() => {
    setColors(getStoredChartColors(resolvedTheme))
  }, [resolvedTheme])

  // Re-resolve when mode changes
  useEffect(() => {
    updateColors()
  }, [updateColors])

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'cassini-chart-colors' || e.key === 'cassini-chart-preset') {
        updateColors()
      }
    }
    const handleColorChange = () => updateColors()

    window.addEventListener('storage', handleStorage)
    window.addEventListener('chart-colors-changed', handleColorChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('chart-colors-changed', handleColorChange)
    }
  }, [updateColors])

  return colors
}
