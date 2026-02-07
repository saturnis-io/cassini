/**
 * AnnotationLayer - Renders annotation markers on Recharts charts.
 *
 * Returns an array of ReferenceLine (point) and ReferenceArea (period) elements
 * that can be spread inside a ComposedChart.
 */

import React from 'react'
import { ReferenceLine, ReferenceArea, Label } from 'recharts'
import type { Annotation } from '@/types'

interface AnnotationLayerProps {
  annotations: Annotation[]
  data: Array<{ index: number; sample_id: number; timestampMs: number }>
  xAxisMode: 'index' | 'timestamp'
}

/**
 * Builds Recharts elements for rendering annotations on a chart.
 * Must be called inside a ComposedChart - returns direct JSX elements.
 */
export function renderAnnotations({ annotations, data, xAxisMode }: AnnotationLayerProps): React.ReactNode[] {
  const elements: React.ReactNode[] = []

  // Build a lookup from sample_id to data point for quick resolution
  const sampleMap = new Map<number, { index: number; timestampMs: number }>()
  for (const point of data) {
    sampleMap.set(point.sample_id, { index: point.index, timestampMs: point.timestampMs })
  }

  for (const annotation of annotations) {
    const color = annotation.color || 'hsl(var(--primary))'
    const truncatedText = annotation.text.length > 20
      ? annotation.text.substring(0, 20) + '...'
      : annotation.text

    if (annotation.annotation_type === 'point' && annotation.sample_id != null) {
      const point = sampleMap.get(annotation.sample_id)
      if (!point) continue

      const xValue = xAxisMode === 'timestamp' ? point.timestampMs : point.index

      elements.push(
        <ReferenceLine
          key={`ann-point-${annotation.id}`}
          x={xValue}
          stroke={color}
          strokeDasharray="4 2"
          strokeWidth={1.5}
          strokeOpacity={0.7}
        >
          <Label
            value={truncatedText}
            position="top"
            fill={color}
            fontSize={10}
            fontWeight={500}
            offset={8}
          />
        </ReferenceLine>
      )
    } else if (annotation.annotation_type === 'period' && annotation.start_sample_id != null && annotation.end_sample_id != null) {
      const startPoint = sampleMap.get(annotation.start_sample_id)
      const endPoint = sampleMap.get(annotation.end_sample_id)
      if (!startPoint || !endPoint) continue

      const x1 = xAxisMode === 'timestamp' ? startPoint.timestampMs : startPoint.index
      const x2 = xAxisMode === 'timestamp' ? endPoint.timestampMs : endPoint.index

      elements.push(
        <ReferenceArea
          key={`ann-period-${annotation.id}`}
          x1={x1}
          x2={x2}
          fill={color}
          fillOpacity={0.1}
          stroke={color}
          strokeOpacity={0.3}
          strokeDasharray="3 3"
        >
          <Label
            value={truncatedText}
            position="insideTop"
            fill={color}
            fontSize={10}
            fontWeight={500}
            offset={4}
          />
        </ReferenceArea>
      )
    }
  }

  return elements
}
