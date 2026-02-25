import { useMemo } from 'react'
import { useECharts } from '@/hooks/useECharts'
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
  const option = useMemo<ECOption | null>(() => {
    if (!forecast || forecast.length === 0) return null

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
        itemStyle: { color: '#ef4444', borderColor: '#fff', borderWidth: 1.5 },
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
        areaStyle: { color: '#3b82f6', opacity: 0.1 },
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
        areaStyle: { color: '#3b82f6', opacity: 0.2 },
        symbol: 'none',
        silent: true,
      })
    }

    // Predicted values line (dashed blue)
    series.push({
      name: 'Predicted',
      type: 'line',
      data: predictedValues.map((v, i) => [steps[i], v]),
      lineStyle: { color: '#3b82f6', type: 'dashed', width: 2 },
      itemStyle: { color: '#3b82f6' },
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
        label: { formatter: 'UCL', position: 'end', fontSize: 10 },
        lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
      })
    }
    if (lcl != null) {
      markLineData.push({
        yAxis: lcl,
        label: { formatter: 'LCL', position: 'end', fontSize: 10 },
        lineStyle: { color: '#ef4444', type: 'dashed', width: 1 },
      })
    }
    if (markLineData.length > 0) {
      series[series.length - 1].markLine = {
        silent: true,
        symbol: 'none',
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
    const yMin = Math.min(...allValues)
    const yMax = Math.max(...allValues)
    const yPadding = (yMax - yMin) * 0.1 || 1

    return {
      tooltip: {
        trigger: 'axis',
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
            html += '<span style="color:#ef4444;font-weight:600">Predicted OOC</span>'
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
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10 },
        min: steps[0],
        max: steps[steps.length - 1],
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { fontSize: 10 },
        min: yMin - yPadding,
        max: yMax + yPadding,
      },
      series,
    }
  }, [forecast, ucl, lcl])

  const { containerRef } = useECharts({ option })

  return <div ref={containerRef} className="h-[200px] w-full" />
}
