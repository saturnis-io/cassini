/**
 * Builds ECharts series configuration for forecast overlay on control charts.
 * Includes predicted values line, confidence interval bands, bridge line,
 * OOC markers, and extended control limit lines.
 */

interface ForecastPoint {
  step: number
  predicted_value: number
  predicted_ooc?: boolean
  upper_95?: number | null
  lower_95?: number | null
  upper_80?: number | null
  lower_80?: number | null
}

interface ForecastCoord {
  x: number
  label: string
}

interface ForecastOverlayData {
  points: ForecastPoint[]
  coords: ForecastCoord[]
  lastPoint: { timestampMs: number; mean: number }
}

interface BuildForecastSeriesParams {
  forecastOverlay: ForecastOverlayData
  dataLength: number
  useTimeCoords: boolean
  isDark: boolean
  isModeA: boolean
  controlLimits: { ucl: number | null; lcl: number | null }
  chartColors: { uclLine: string; lclLine: string }
}

export function buildForecastSeries({
  forecastOverlay,
  dataLength,
  useTimeCoords,
  isDark,
  isModeA,
  controlLimits,
  chartColors,
}: BuildForecastSeriesParams): Record<string, unknown>[] {
  const series: Record<string, unknown>[] = []
  const predColor = isDark ? 'hsl(210, 90%, 65%)' : '#3b82f6'
  const oocColor = isDark ? 'hsl(357, 85%, 60%)' : '#ef4444'
  const { points: fPoints, coords: fCoords, lastPoint: fLastPoint } = forecastOverlay
  const pad = dataLength

  // Helper: build series data for category or time axis
  const makeForecastData = (
    values: (number | null)[],
    includeLastReal?: { value: number },
  ): unknown[] => {
    if (useTimeCoords) {
      const result: [number, number][] = []
      if (includeLastReal) result.push([fLastPoint.timestampMs, includeLastReal.value])
      values.forEach((v, i) => {
        if (v != null) result.push([fCoords[i].x, v])
      })
      return result
    } else {
      const arr: (number | null)[] = Array(pad).fill(null)
      if (includeLastReal) arr[pad - 1] = includeLastReal.value
      arr.push(...values)
      return arr
    }
  }

  // Bridge line: last observed → first forecast
  series.push({
    type: 'line',
    data: makeForecastData([fPoints[0].predicted_value], { value: fLastPoint.mean }),
    lineStyle: { color: predColor, type: 'dashed', width: 2, opacity: 0.6 },
    symbol: 'none',
    showSymbol: false,
    silent: true,
    tooltip: { show: false },
    z: 6,
  })

  // Predicted values line
  series.push({
    type: 'line',
    data: makeForecastData(fPoints.map((p) => p.predicted_value)),
    lineStyle: { color: predColor, type: 'dashed', width: 2 },
    symbol: 'circle',
    symbolSize: 4,
    itemStyle: { color: predColor },
    showSymbol: true,
    silent: true,
    endLabel: {
      show: true,
      formatter: 'Forecast',
      color: predColor,
      fontSize: 10,
      fontWeight: 500,
    },
    markPoint: fPoints.some((p) => p.predicted_ooc)
      ? {
          silent: true,
          animation: false,
          data: fPoints.flatMap((p, i) =>
            p.predicted_ooc
              ? [
                  {
                    coord: useTimeCoords
                      ? [fCoords[i].x, p.predicted_value]
                      : [pad + i, p.predicted_value],
                    symbol: 'circle',
                    symbolSize: 8,
                    itemStyle: { color: oocColor },
                    label: { show: false },
                  },
                ]
              : [],
          ) as never[],
        }
      : undefined,
    z: 6,
  })

  // 95% CI band (stacked: lower bound + band width)
  if (fPoints[0].upper_95 != null && fPoints[0].lower_95 != null) {
    series.push(
      {
        type: 'line',
        data: makeForecastData(fPoints.map((p) => p.lower_95 ?? null)),
        lineStyle: { opacity: 0 },
        symbol: 'none',
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        stack: 'ci95',
        areaStyle: { opacity: 0 },
        z: 3,
      },
      {
        type: 'line',
        data: makeForecastData(
          fPoints.map((p) =>
            p.upper_95 != null && p.lower_95 != null ? p.upper_95 - p.lower_95 : null,
          ),
        ),
        lineStyle: { opacity: 0 },
        symbol: 'none',
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        stack: 'ci95',
        areaStyle: { color: predColor, opacity: 0.1 },
        z: 3,
      },
    )
  }

  // 80% CI band (stacked: lower bound + band width)
  if (fPoints[0].upper_80 != null && fPoints[0].lower_80 != null) {
    series.push(
      {
        type: 'line',
        data: makeForecastData(fPoints.map((p) => p.lower_80 ?? null)),
        lineStyle: { opacity: 0 },
        symbol: 'none',
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        stack: 'ci80',
        areaStyle: { opacity: 0 },
        z: 3,
      },
      {
        type: 'line',
        data: makeForecastData(
          fPoints.map((p) =>
            p.upper_80 != null && p.lower_80 != null ? p.upper_80 - p.lower_80 : null,
          ),
        ),
        lineStyle: { opacity: 0 },
        symbol: 'none',
        showSymbol: false,
        silent: true,
        tooltip: { show: false },
        stack: 'ci80',
        areaStyle: { color: predColor, opacity: 0.2 },
        z: 3,
      },
    )
  }

  // Extended UCL/LCL into forecast zone (faded dashed lines)
  if (!isModeA && controlLimits.ucl != null) {
    series.push({
      type: 'line',
      data: makeForecastData(
        fPoints.map(() => controlLimits.ucl!),
        { value: controlLimits.ucl! },
      ),
      lineStyle: { color: chartColors.uclLine, type: 'dashed', width: 1, opacity: 0.4 },
      symbol: 'none',
      showSymbol: false,
      silent: true,
      tooltip: { show: false },
      z: 3,
    })
  }
  if (!isModeA && controlLimits.lcl != null) {
    series.push({
      type: 'line',
      data: makeForecastData(
        fPoints.map(() => controlLimits.lcl!),
        { value: controlLimits.lcl! },
      ),
      lineStyle: { color: chartColors.lclLine, type: 'dashed', width: 1, opacity: 0.4 },
      symbol: 'none',
      showSymbol: false,
      silent: true,
      tooltip: { show: false },
      z: 3,
    })
  }

  return series
}
