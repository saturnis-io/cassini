import { useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'
import { useTheme } from '@/providers/ThemeProvider'
import type { ECOption } from '@/lib/echarts'

export interface ForecastPoint {
  step: number
  predicted_value: number
  lower_80?: number
  upper_80?: number
  lower_95?: number
  upper_95?: number
  predicted_ooc?: boolean
}

interface PredictionOverlayProps {
  forecast: ForecastPoint[]
  ucl?: number
  lcl?: number
}

/**
 * Standalone mini chart showing forecast data with confidence bands.
 *
 * Renders predicted values as a dashed line, 80% and 95% confidence intervals
 * as shaded bands, and optional UCL/LCL marklines.
 */
export function PredictionOverlay({ forecast, ucl, lcl }: PredictionOverlayProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const option = useMemo<ECOption | null>(() => {
    if (!forecast || forecast.length === 0) return null

    // Theme-aware colors
    const predictionColor = isDark ? 'hsl(210, 90%, 65%)' : '#3b82f6'
    const oocColor = isDark ? 'hsl(357, 85%, 60%)' : '#ef4444'
    const oocBorderColor = isDark ? 'hsl(220, 25%, 13%)' : '#fff'
    const axisLabelColor = isDark ? 'hsl(220, 5%, 70%)' : 'hsl(220, 15%, 35%)'
    const axisNameColor = isDark ? 'hsl(220, 5%, 65%)' : undefined
    const splitLineColor = isDark ? 'hsl(220, 10%, 25%)' : undefined
    const tooltipBg = isDark ? 'rgba(30, 37, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)'
    const tooltipTextColor = isDark ? '#e5e5e5' : '#333'
    const tooltipBorder = isDark ? 'hsl(220, 12%, 26%)' : 'hsl(210, 15%, 88%)'

    const steps = forecast.map((p) => p.step)
    const predictedValues = forecast.map((p) => p.predicted_value)

    // Confidence band data: [lower, upper] for area range effect
    const has95 = forecast.some((p) => p.lower_95 != null && p.upper_95 != null)
    const has80 = forecast.some((p) => p.lower_80 != null && p.upper_80 != null)

    // OOC point markers
    const oocPoints = forecast
      .filter((p) => p.predicted_ooc)
      .map((p) => ({
        coord: [p.step, p.predicted_value],
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: oocColor, borderColor: oocBorderColor, borderWidth: 1.5 },
      }))

    // Build series
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const series: any[] = []

    // 95% confidence band (wider, lighter)
    if (has95) {
      series.push({
        name: '95% CI Upper',
        type: 'line',
        data: forecast.map((p) => [p.step, p.upper_95 ?? p.predicted_value]),
        lineStyle: { opacity: 0 },
        symbol: 'none',
        silent: true,
      })
      series.push({
        name: '95% CI Lower',
        type: 'line',
        data: forecast.map((p) => [p.step, p.lower_95 ?? p.predicted_value]),
        lineStyle: { opacity: 0 },
        areaStyle: { color: predictionColor, opacity: 0.1 },
        symbol: 'none',
        silent: true,
      })
    }

    // 80% confidence band (narrower, slightly darker)
    if (has80) {
      series.push({
        name: '80% CI Upper',
        type: 'line',
        data: forecast.map((p) => [p.step, p.upper_80 ?? p.predicted_value]),
        lineStyle: { opacity: 0 },
        symbol: 'none',
        silent: true,
      })
      series.push({
        name: '80% CI Lower',
        type: 'line',
        data: forecast.map((p) => [p.step, p.lower_80 ?? p.predicted_value]),
        lineStyle: { opacity: 0 },
        areaStyle: { color: predictionColor, opacity: 0.2 },
        symbol: 'none',
        silent: true,
      })
    }

    // Predicted values line (dashed)
    series.push({
      name: 'Predicted',
      type: 'line',
      data: predictedValues.map((v, i) => [steps[i], v]),
      lineStyle: { color: predictionColor, type: 'dashed', width: 2 },
      itemStyle: { color: predictionColor },
      symbol: 'circle',
      symbolSize: 4,
      markPoint: oocPoints.length > 0 ? { data: oocPoints } : undefined,
    })

    // Build markLines for UCL/LCL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const markLineData: any[] = []
    if (ucl != null) {
      markLineData.push({
        yAxis: ucl,
        label: { formatter: 'UCL', position: 'end', fontSize: 10, color: oocColor },
        lineStyle: { color: oocColor, type: 'dashed', width: 1 },
      })
    }
    if (lcl != null) {
      markLineData.push({
        yAxis: lcl,
        label: { formatter: 'LCL', position: 'end', fontSize: 10, color: oocColor },
        lineStyle: { color: oocColor, type: 'dashed', width: 1 },
      })
    }
    if (markLineData.length > 0) {
      series[series.length - 1].markLine = {
        silent: true,
        symbol: 'none',
        precision: 10,
        data: markLineData,
      }
    }

    // Calculate Y-axis bounds from all data
    const allValues = forecast.flatMap((p) => [
      p.predicted_value,
      p.lower_95 ?? p.predicted_value,
      p.upper_95 ?? p.predicted_value,
      p.lower_80 ?? p.predicted_value,
      p.upper_80 ?? p.predicted_value,
    ])
    if (ucl != null) allValues.push(ucl)
    if (lcl != null) allValues.push(lcl)
    const rawMin = Math.min(...allValues)
    const rawMax = Math.max(...allValues)
    const yPadding = (rawMax - rawMin) * 0.1 || 1

    // Round min/max to clean numbers using magnitude-based rounding
    const paddedMin = rawMin - yPadding
    const paddedMax = rawMax + yPadding
    const magMax = Math.pow(10, Math.floor(Math.log10(Math.abs(paddedMax) || 1)))
    const stepMax = magMax / 2
    const yMax = Math.ceil(paddedMax / stepMax) * stepMax
    const magMin = Math.pow(10, Math.floor(Math.log10(Math.abs(paddedMin) || 1)))
    const stepMin = magMin / 2
    const yMin = Math.floor(paddedMin / stepMin) * stepMin

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipTextColor },
        formatter: (params: unknown) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const items = params as any[]
          const predicted = items.find((i: { seriesName: string }) => i.seriesName === 'Predicted')
          if (!predicted) return ''
          const step = predicted.data[0]
          const val = predicted.data[1]
          const fp = forecast.find((p) => p.step === step)
          let html = `<div style="font-size:12px"><strong>Step ${step}</strong><br/>`
          html += `Predicted: <strong>${Number(val).toFixed(4)}</strong><br/>`
          if (fp?.lower_95 != null && fp?.upper_95 != null) {
            html += `95% CI: [${fp.lower_95.toFixed(4)}, ${fp.upper_95.toFixed(4)}]<br/>`
          }
          if (fp?.lower_80 != null && fp?.upper_80 != null) {
            html += `80% CI: [${fp.lower_80.toFixed(4)}, ${fp.upper_80.toFixed(4)}]<br/>`
          }
          if (fp?.predicted_ooc) {
            html += `<span style="color:${oocColor};font-weight:600">Predicted OOC</span>`
          }
          html += '</div>'
          return html
        },
      },
      grid: {
        left: 60,
        right: 20,
        top: 10,
        bottom: 30,
      },
      xAxis: {
        type: 'value' as const,
        name: 'Step',
        nameLocation: 'center' as const,
        nameGap: 20,
        nameTextStyle: { fontSize: 10, color: axisNameColor },
        axisLabel: {
          fontSize: 10,
          color: axisLabelColor,
          hideOverlap: true,
          interval:
            steps.length <= 15 ? 0 : steps.length <= 30 ? 2 : Math.floor(steps.length / 10),
        },
        splitLine: { lineStyle: { color: splitLineColor } },
        min: steps[0],
        max: steps[steps.length - 1],
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: {
          fontSize: 10,
          color: axisLabelColor,
          formatter: (v: number) => {
            if (Math.abs(v) >= 1000) return v.toFixed(0)
            if (Math.abs(v) >= 10) return v.toFixed(1)
            if (Math.abs(v) >= 1) return v.toFixed(2)
            return v.toFixed(3)
          },
        },
        splitLine: { lineStyle: { color: splitLineColor } },
        min: yMin,
        max: yMax,
      },
      series,
    }
  }, [forecast, ucl, lcl, isDark])

  const { containerRef } = useECharts({ option })

  return <div ref={containerRef} className="h-[200px] w-full" />
}
