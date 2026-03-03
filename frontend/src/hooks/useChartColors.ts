import { useState, useCallback, useEffect } from 'react'
import { getStoredChartColors, type ChartColors } from '@/lib/theme-presets'

/**
 * Subscribe to chart color changes from localStorage and custom events.
 * Returns the current ChartColors, updating reactively when the user
 * changes their chart color preset or individual colors.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(getStoredChartColors)

  const updateColors = useCallback(() => {
    setColors(getStoredChartColors())
  }, [])

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
