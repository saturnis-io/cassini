interface DataPointWithId {
  value: number
  sample_id: number
}

export interface HistogramBin {
  binStart: number
  binEnd: number
  binCenter: number
  count: number
  normalY: number
  sampleIds: number[]
}

export function calculateHistogramBins(
  dataPoints: DataPointWithId[],
  binCount: number = 20,
): HistogramBin[] {
  if (dataPoints.length === 0) return []

  const values = dataPoints.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  let range = max - min

  if (range === 0) {
    range = Math.abs(min) * 0.01 || 1
  }

  const extendedMin = min - range * 0.1
  const extendedMax = max + range * 0.1
  const extendedBinWidth = (extendedMax - extendedMin) / binCount

  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    binStart: extendedMin + i * extendedBinWidth,
    binEnd: extendedMin + (i + 1) * extendedBinWidth,
    binCenter: extendedMin + (i + 0.5) * extendedBinWidth,
    count: 0,
    normalY: 0,
    sampleIds: [],
  }))

  dataPoints.forEach((point) => {
    const binIndex = Math.min(
      Math.max(0, Math.floor((point.value - extendedMin) / extendedBinWidth)),
      binCount - 1,
    )
    bins[binIndex].count++
    bins[binIndex].sampleIds.push(point.sample_id)
  })

  return bins
}

export function calculateStatistics(values: number[]) {
  if (values.length === 0) return { mean: 0, stdDev: 0, n: 0 }

  const n = values.length
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1)
  const stdDev = Math.sqrt(variance)

  return { mean, stdDev, n }
}

function normalPDF(x: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0
  const coefficient = 1 / (stdDev * Math.sqrt(2 * Math.PI))
  const exponent = -0.5 * Math.pow((x - mean) / stdDev, 2)
  return coefficient * Math.exp(exponent)
}

export function addNormalCurve(
  bins: HistogramBin[],
  mean: number,
  stdDev: number,
  totalCount: number,
  binWidth: number,
): HistogramBin[] {
  if (stdDev === 0 || bins.length === 0) return bins

  const scaleFactor = totalCount * binWidth

  return bins.map((bin) => ({
    ...bin,
    normalY: normalPDF(bin.binCenter, mean, stdDev) * scaleFactor,
  }))
}
