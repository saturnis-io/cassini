import { useMemo, useCallback } from 'react'
import { useECharts } from '@/hooks/useECharts'
import type { ECOption } from '@/lib/echarts'
import type { EChartsMouseEvent } from '@/hooks/useECharts'
import type { IshikawaResult, IshikawaCategory } from '@/api/hooks/useIshikawa'

interface IshikawaDiagramProps {
  data: IshikawaResult
  height?: number
  onCategoryClick?: (category: string) => void
}

// Category layout: top 3, bottom 3, evenly spaced along the spine
const CATEGORY_ORDER_TOP = ['Personnel', 'Method', 'Measurement']
const CATEGORY_ORDER_BOTTOM = ['Equipment', 'Material', 'Environment']

function getCategoryColor(cat: IshikawaCategory): string {
  if (!cat.sufficient_data) return '#9ca3af' // gray-400
  if (cat.significant) return '#3b82f6' // blue-500
  return '#9ca3af' // gray-400
}

function getBoneWidth(cat: IshikawaCategory): number {
  if (cat.eta_squared == null) return 2
  return 2 + cat.eta_squared * 20
}

function getLineDash(cat: IshikawaCategory): number[] | undefined {
  if (!cat.sufficient_data) return [4, 4]
  return undefined
}

export function IshikawaDiagram({
  data,
  height = 340,
  onCategoryClick,
}: IshikawaDiagramProps) {
  const categoryMap = useMemo(() => {
    const m = new Map<string, IshikawaCategory>()
    for (const cat of data.categories) {
      m.set(cat.name, cat)
    }
    return m
  }, [data.categories])

  const option = useMemo<ECOption>(() => {
    // Coordinate system: x 0..1000, y 0..500
    const W = 1000
    const H = 500
    const spineY = H / 2
    const spineLeft = 80
    const spineRight = W - 40
    const arrowSize = 16

    // Positions for the 6 bones along the spine
    const boneXPositions = [0.2, 0.45, 0.7]

    // Build render data: each item = [categoryIndex, isTop, xFraction]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderData: any[] = []
    // Index 0: spine + arrow (special)
    renderData.push([0, 0, 0, 'spine'])

    // Top categories
    CATEGORY_ORDER_TOP.forEach((name, i) => {
      renderData.push([i + 1, 1, boneXPositions[i], name])
    })
    // Bottom categories
    CATEGORY_ORDER_BOTTOM.forEach((name, i) => {
      renderData.push([i + 4, 0, boneXPositions[i], name])
    })

    return {
      animation: false,
      tooltip: {
        show: true,
        trigger: 'item',
        appendToBody: true,
        formatter: (params: unknown) => {
          const p = params as { data: [number, number, number, string] }
          const name = p.data?.[3]
          if (!name || name === 'spine') return ''
          const cat = categoryMap.get(name)
          if (!cat) return name
          const eta = cat.eta_squared != null ? (cat.eta_squared * 100).toFixed(1) + '%' : 'N/A'
          const pVal = cat.p_value != null ? cat.p_value.toFixed(4) : 'N/A'
          const sig = cat.significant ? 'Yes' : 'No'
          let html = `<strong>${name}</strong><br/>`
          html += `&eta;&sup2;: ${eta}<br/>`
          html += `p-value: ${pVal}<br/>`
          html += `Significant: ${sig}<br/>`
          if (cat.factors.length > 0) {
            html += '<br/><em>Factors:</em><br/>'
            for (const f of cat.factors) {
              html += `&nbsp;&nbsp;${f.name} (n=${f.sample_count})<br/>`
            }
          }
          if (!cat.sufficient_data) {
            html += '<br/><span style="color:#f59e0b">Insufficient data</span>'
          }
          return html
        },
      },
      xAxis: {
        type: 'value' as const,
        min: 0,
        max: W,
        show: false,
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        max: H,
        show: false,
      },
      grid: { left: 0, right: 0, top: 0, bottom: 0, containLabel: false },
      series: [
        {
          type: 'custom' as const,
          coordinateSystem: 'cartesian2d',
          data: renderData,
          encode: { x: 2, y: 1 },
          renderItem: (
            _params: unknown,
            api: {
              value: (idx: number) => number
              coord: (val: [number, number]) => [number, number]
              style: (extra?: Record<string, unknown>) => Record<string, unknown>
              size: (val: [number, number]) => [number, number]
            },
          ) => {
            const catName = api.value(3) as unknown as string

            // Spine + arrow
            if (catName === 'spine') {
              const leftPx = api.coord([spineLeft, spineY])
              const rightPx = api.coord([spineRight, spineY])
              return {
                type: 'group',
                children: [
                  // Main spine line
                  {
                    type: 'line',
                    shape: {
                      x1: leftPx[0],
                      y1: leftPx[1],
                      x2: rightPx[0],
                      y2: rightPx[1],
                    },
                    style: { stroke: '#6b7280', lineWidth: 3 },
                  },
                  // Arrow head
                  {
                    type: 'polygon',
                    shape: {
                      points: [
                        [rightPx[0] + arrowSize, rightPx[1]],
                        [rightPx[0] - arrowSize / 2, rightPx[1] - arrowSize / 2],
                        [rightPx[0] - arrowSize / 2, rightPx[1] + arrowSize / 2],
                      ],
                    },
                    style: { fill: '#6b7280' },
                  },
                  // Effect label
                  {
                    type: 'text',
                    style: {
                      x: rightPx[0] + arrowSize + 4,
                      y: rightPx[1],
                      text: data.effect || 'Effect',
                      textAlign: 'left',
                      textVerticalAlign: 'middle',
                      fontSize: 13,
                      fontWeight: 'bold',
                      fill: '#374151',
                    },
                  },
                ],
              }
            }

            // Category bone
            const cat = categoryMap.get(catName)
            if (!cat) return { type: 'group', children: [] }

            const isTop = api.value(1) as number
            const xFrac = api.value(2) as number
            const boneX = spineLeft + xFrac * (spineRight - spineLeft)
            const boneColor = getCategoryColor(cat)
            const boneWidth = getBoneWidth(cat)
            const lineDash = getLineDash(cat)

            // Bone goes from spine to top/bottom
            const boneLen = 160
            const endY = isTop ? spineY + boneLen : spineY - boneLen
            const bonePx = api.coord([boneX, spineY])
            const boneEndPx = api.coord([boneX, endY])

            // Label position
            const labelY = isTop ? endY + 20 : endY - 20
            const labelPx = api.coord([boneX, labelY])

            const children: Record<string, unknown>[] = [
              // Main bone line
              {
                type: 'line',
                shape: {
                  x1: bonePx[0],
                  y1: bonePx[1],
                  x2: boneEndPx[0],
                  y2: boneEndPx[1],
                },
                style: {
                  stroke: boneColor,
                  lineWidth: boneWidth,
                  lineDash,
                },
              },
              // Category label
              {
                type: 'text',
                style: {
                  x: labelPx[0],
                  y: labelPx[1],
                  text: catName,
                  textAlign: 'center',
                  textVerticalAlign: isTop ? 'top' : 'bottom',
                  fontSize: 11,
                  fontWeight: 600,
                  fill: boneColor,
                },
              },
            ]

            // eta-squared badge
            if (cat.eta_squared != null) {
              const badgeY = isTop ? endY + 8 : endY - 8
              const badgePx = api.coord([boneX, badgeY])
              children.push({
                type: 'text',
                style: {
                  x: badgePx[0],
                  y: badgePx[1],
                  text: `${(cat.eta_squared * 100).toFixed(1)}%`,
                  textAlign: 'center',
                  textVerticalAlign: isTop ? 'top' : 'bottom',
                  fontSize: 9,
                  fill: '#6b7280',
                },
              })
            }

            // Sub-bones for factors
            const factors = cat.factors
            if (factors.length > 0) {
              const subSpacing = boneLen / (factors.length + 1)
              factors.forEach((factor, fi) => {
                const subDist = subSpacing * (fi + 1)
                const subY = isTop ? spineY + subDist : spineY - subDist
                const subPx = api.coord([boneX, subY])
                const subLen = 50
                const subEndX = boneX + subLen
                const subEndY = isTop ? subY + subLen * 0.5 : subY - subLen * 0.5
                const subEndPx = api.coord([subEndX, subEndY])

                children.push(
                  {
                    type: 'line',
                    shape: {
                      x1: subPx[0],
                      y1: subPx[1],
                      x2: subEndPx[0],
                      y2: subEndPx[1],
                    },
                    style: {
                      stroke: boneColor,
                      lineWidth: 1,
                      lineDash: lineDash ?? undefined,
                      opacity: 0.7,
                    },
                  },
                  {
                    type: 'text',
                    style: {
                      x: subEndPx[0] + 2,
                      y: subEndPx[1],
                      text: factor.name,
                      textAlign: 'left',
                      textVerticalAlign: 'middle',
                      fontSize: 9,
                      fill: '#6b7280',
                    },
                  },
                )
              })
            }

            return { type: 'group', children }
          },
        },
      ],
    }
  }, [data, categoryMap])

  const handleClick = useCallback(
    (params: EChartsMouseEvent) => {
      const d = params.data as unknown as [number, number, number, string]
      const name = d?.[3]
      if (name && name !== 'spine' && onCategoryClick) {
        onCategoryClick(name)
      }
    },
    [onCategoryClick],
  )

  const { containerRef } = useECharts({ option, notMerge: true, onClick: handleClick })

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
