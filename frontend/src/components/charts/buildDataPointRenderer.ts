import type { RenderItemParams, RenderItemAPI } from '@/lib/echarts'
import { getPrimaryViolationRule } from '@/components/ViolationLegend'
import type { ChartPoint } from '@/components/PinnedChartTooltip'

export interface DataPointRendererParams {
  data: ChartPoint[]
  chartColors: Record<string, string>
  highlightedRange: [number, number] | null
  hoveredSampleIds: Set<number> | null
  highlightSampleId: number | undefined | null
  sampleAnomalyMap: Map<number, unknown[]>
}

export function buildDataPointRenderer({
  data,
  chartColors,
  highlightedRange,
  hoveredSampleIds,
  highlightSampleId,
  sampleAnomalyMap: _sampleAnomalyMap,
}: DataPointRendererParams): (params: RenderItemParams, api: RenderItemAPI) => unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (_params: RenderItemParams, api: RenderItemAPI) => {
    const arrIndex = api.value(2) as number
    if (arrIndex < 0 || arrIndex >= data.length) return { type: 'group', children: [] } as unknown
    const point = data[arrIndex]

    // Use dimensions 0,1 (x,y) directly for pixel mapping — guarantees dots align with line
    const coord = api.coord([api.value(0), api.value(1)])
    const cx = coord[0]
    const cy = coord[1]

    const isViolation = point.hasViolation
    const isAcked = point.allAcknowledged
    const isUndersized = point.is_undersized
    const isExcluded = point.excluded
    const violationRules = point.violationRules
    const primaryRule = getPrimaryViolationRule(violationRules)

    const pointValue = point.displayValue ?? point.mean
    const isHighlightedFromHistogram =
      highlightedRange != null &&
      pointValue >= highlightedRange[0] &&
      pointValue < highlightedRange[1]
    const isHighlightedFromCrossChart = hoveredSampleIds?.has(point.sample_id) ?? false
    const isInspected = highlightSampleId != null && point.sample_id === highlightSampleId
    const isHighlighted = isHighlightedFromHistogram || isHighlightedFromCrossChart || isInspected

    // Acknowledged violations use a desaturated color
    const ackedColor = 'hsl(357, 30%, 55%)'

    const fillColor = isInspected
      ? 'hsl(180, 100%, 50%)'
      : isHighlighted
        ? 'hsl(45, 100%, 50%)'
        : isExcluded
          ? chartColors.excludedPoint
          : isViolation && isAcked
            ? ackedColor
            : isViolation
              ? chartColors.violationPoint
              : isUndersized
                ? chartColors.undersizedPoint
                : chartColors.normalPoint

    const baseRadius = isHighlighted ? 7 : isViolation ? 6 : isUndersized ? 5 : 4
    const children: Record<string, unknown>[] = []

    // Highlight glow ring
    if (isHighlighted) {
      const ringColor = isInspected ? 'hsl(180, 100%, 50%)' : 'hsl(45, 100%, 50%)'
      children.push({
        type: 'circle',
        shape: { cx, cy, r: baseRadius + (isInspected ? 6 : 4) },
        style: {
          fill: 'none',
          stroke: ringColor,
          lineWidth: isInspected ? 2.5 : 2,
          opacity: isInspected ? 0.8 : 0.5,
          shadowBlur: isInspected ? 8 : 0,
          shadowColor: isInspected ? ringColor : undefined,
        },
      })
      if (isInspected) {
        children.push({
          type: 'circle',
          shape: { cx, cy, r: baseRadius + 10 },
          style: { fill: 'none', stroke: ringColor, lineWidth: 1, opacity: 0.3 },
        })
      }
    }

    if (isViolation) {
      if (isAcked) {
        // Acknowledged: outline-only diamond, no glow
        children.push({
          type: 'polygon',
          shape: {
            points: [
              [cx, cy - baseRadius],
              [cx + baseRadius, cy],
              [cx, cy + baseRadius],
              [cx - baseRadius, cy],
            ],
          },
          style: { fill: 'none', stroke: fillColor, lineWidth: 2 },
        })
      } else {
        // Unacknowledged: solid filled diamond with glow
        children.push({
          type: 'polygon',
          shape: {
            points: [
              [cx, cy - baseRadius],
              [cx + baseRadius, cy],
              [cx, cy + baseRadius],
              [cx - baseRadius, cy],
            ],
          },
          style: { fill: fillColor, shadowBlur: 4, shadowColor: fillColor },
        })
      }
    } else if (isUndersized) {
      children.push({
        type: 'polygon',
        shape: {
          points: [
            [cx, cy - baseRadius],
            [cx + baseRadius, cy + baseRadius * 0.7],
            [cx - baseRadius, cy + baseRadius * 0.7],
          ],
        },
        style: {
          fill: fillColor,
          stroke: isHighlighted ? 'hsl(35, 100%, 45%)' : chartColors.undersizedPoint,
          lineWidth: 1.5,
        },
      })
    } else {
      children.push({
        type: 'circle',
        shape: { cx, cy, r: baseRadius },
        style: {
          fill: fillColor,
          stroke: isHighlighted ? 'hsl(35, 100%, 45%)' : undefined,
          lineWidth: isHighlighted ? 2 : 0,
        },
      })
    }

    // Violation badge
    if (isViolation && primaryRule) {
      const badgeFill = isAcked ? 'hsl(357, 25%, 48%)' : 'hsl(357, 80%, 52%)'
      const badgeTextFill = isAcked ? 'hsl(0, 0%, 80%)' : '#fff'
      children.push(
        {
          type: 'circle',
          shape: { cx, cy: cy - baseRadius - 8, r: 7 },
          style: { fill: badgeFill, stroke: isAcked ? 'hsl(0, 0%, 50%)' : '#fff', lineWidth: 1 },
        },
        {
          type: 'text',
          style: {
            x: cx,
            y: cy - baseRadius - 8,
            text: String(primaryRule),
            fill: badgeTextFill,
            fontSize: 9,
            fontWeight: 700,
            textAlign: 'center',
            textVerticalAlign: 'middle',
          },
        },
      )
      if (violationRules.length > 1) {
        children.push({
          type: 'text',
          style: {
            x: cx + 7,
            y: cy - baseRadius - 12,
            text: `+${violationRules.length - 1}`,
            fill: isAcked ? 'hsl(357, 20%, 48%)' : 'hsl(357, 80%, 45%)',
            fontSize: 8,
            fontWeight: 600,
          },
        })
      }
    }

    // Undersized ring
    if (isUndersized && !isViolation) {
      children.push({
        type: 'circle',
        shape: { cx, cy, r: baseRadius + 3 },
        style: {
          fill: 'none',
          stroke: chartColors.undersizedPoint,
          lineWidth: 1.5,
          lineDash: [2, 2],
        },
      })
    }

    return { type: 'group', children } as unknown
  }
}
