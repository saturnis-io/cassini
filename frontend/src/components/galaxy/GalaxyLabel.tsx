import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Characteristic, CapabilityResult, ChartData } from '@/types'

/**
 * Cpk color thresholds matching the galaxy data-mapping palette.
 */
function cpkColor(cpk: number | null): string {
  if (cpk == null) return '#6B7280' // gray-500
  if (cpk >= 1.67) return '#22C55E' // bright green
  if (cpk >= 1.33) return '#FACC15' // yellow
  if (cpk >= 1.0) return '#F59E0B' // amber
  return '#EF4444' // bright red
}

function fmt(v: number | null | undefined, decimals = 3): string {
  if (v == null) return '--'
  return v.toFixed(decimals)
}

/**
 * Create a styled HTML element for a label row.
 */
function row(label: string, value: string, color?: string): HTMLDivElement {
  const div = document.createElement('div')
  div.style.display = 'flex'
  div.style.justifyContent = 'space-between'
  div.style.gap = '12px'
  div.style.alignItems = 'center'

  const labelSpan = document.createElement('span')
  labelSpan.style.color = '#9CA3AF'
  labelSpan.style.fontSize = '13px'
  labelSpan.textContent = label

  const valueSpan = document.createElement('span')
  valueSpan.style.color = color ?? '#F59E0B'
  valueSpan.style.fontSize = '13px'
  valueSpan.style.fontWeight = '600'
  valueSpan.textContent = value

  div.appendChild(labelSpan)
  div.appendChild(valueSpan)
  return div
}

/**
 * Compact row helper for tiny cards (galaxy/constellation level).
 */
function tinyRow(label: string, value: string, color?: string): HTMLDivElement {
  const div = document.createElement('div')
  div.style.display = 'flex'
  div.style.justifyContent = 'space-between'
  div.style.gap = '8px'
  div.style.alignItems = 'center'

  const labelSpan = document.createElement('span')
  labelSpan.style.color = '#9CA3AF'
  labelSpan.style.fontSize = '13px'
  labelSpan.textContent = label

  const valueSpan = document.createElement('span')
  valueSpan.style.color = color ?? '#F59E0B'
  valueSpan.style.fontSize = '13px'
  valueSpan.style.fontWeight = '600'
  valueSpan.textContent = value

  div.appendChild(labelSpan)
  div.appendChild(valueSpan)
  return div
}

/**
 * Create an always-visible compact info card at galaxy zoom level.
 * Shows name, Cpk/Cp, USL/LSL, in-control status.
 */
export function createGalaxyInfoCard(
  char: Characteristic,
  capability?: CapabilityResult | null,
): CSS2DObject {
  const container = document.createElement('div')
  container.style.pointerEvents = 'none'
  container.style.background = 'rgba(8, 12, 22, 0.8)'
  container.style.backdropFilter = 'blur(4px)'
  container.style.border = '1px solid rgba(255, 255, 255, 0.08)'
  container.style.borderRadius = '4px'
  container.style.padding = '6px 10px'
  container.style.fontFamily = 'ui-monospace, SFMono-Regular, monospace'
  container.style.minWidth = '160px'
  container.style.maxWidth = '220px'
  container.style.userSelect = 'none'

  // Header: in-control dot + truncated name
  const header = document.createElement('div')
  header.style.display = 'flex'
  header.style.alignItems = 'center'
  header.style.gap = '4px'
  header.style.marginBottom = '2px'

  const dot = document.createElement('div')
  const inControl = char.in_control !== false
  dot.style.width = '7px'
  dot.style.height = '7px'
  dot.style.borderRadius = '50%'
  dot.style.flexShrink = '0'
  dot.style.backgroundColor = inControl ? '#22C55E' : '#EF4444'

  const nameSpan = document.createElement('span')
  nameSpan.style.color = '#D1D5DB'
  nameSpan.style.fontSize = '13px'
  nameSpan.style.fontWeight = '600'
  nameSpan.style.overflow = 'hidden'
  nameSpan.style.textOverflow = 'ellipsis'
  nameSpan.style.whiteSpace = 'nowrap'
  nameSpan.textContent = char.name.length > 18 ? char.name.slice(0, 18) + '\u2026' : char.name

  header.appendChild(dot)
  header.appendChild(nameSpan)
  container.appendChild(header)

  // No-data indicator or metrics
  if (!char.sample_count) {
    const noData = document.createElement('div')
    noData.style.fontSize = '11px'
    noData.style.color = '#6B7280'
    noData.style.fontStyle = 'italic'
    noData.style.marginTop = '1px'
    noData.textContent = 'No data'
    container.appendChild(noData)
  } else {
    // Cpk / Cp — prefer live capability over stale snapshot
    const cpkVal = capability?.cpk ?? char.latest_cpk ?? null
    container.appendChild(tinyRow('Cpk', fmt(cpkVal, 2), cpkColor(cpkVal)))
    const cpVal = capability?.cp ?? char.latest_cp ?? null
    if (cpVal != null) {
      container.appendChild(tinyRow('Cp', fmt(cpVal, 2), cpkColor(cpVal)))
    }

    // USL/LSL (very small text)
    if (char.usl != null || char.lsl != null) {
      const specLine = document.createElement('div')
      specLine.style.fontSize = '11px'
      specLine.style.color = '#6B7280'
      specLine.style.marginTop = '1px'
      const parts: string[] = []
      if (char.lsl != null) parts.push(`L:${fmt(char.lsl, 2)}`)
      if (char.usl != null) parts.push(`U:${fmt(char.usl, 2)}`)
      specLine.textContent = parts.join(' ')
      container.appendChild(specLine)
    }
  }

  const label = new CSS2DObject(container)
  label.position.set(0, 14, 0)
  return label
}

/**
 * Create a compact 2-column metric row with two label/value pairs side by side.
 */
function tinyRowPair(
  label1: string,
  value1: string,
  color1: string,
  label2: string,
  value2: string,
  color2: string,
): HTMLDivElement {
  const div = document.createElement('div')
  div.style.display = 'flex'
  div.style.justifyContent = 'space-between'
  div.style.gap = '12px'
  div.style.alignItems = 'center'

  const makeHalf = (label: string, value: string, color: string) => {
    const span = document.createElement('span')
    span.style.fontSize = '13px'

    const labelPart = document.createElement('span')
    labelPart.style.color = '#9CA3AF'
    labelPart.textContent = label + ' '

    const valuePart = document.createElement('span')
    valuePart.style.color = color
    valuePart.style.fontWeight = '600'
    valuePart.textContent = value

    span.appendChild(labelPart)
    span.appendChild(valuePart)
    return span
  }

  div.appendChild(makeHalf(label1, value1, color1))
  div.appendChild(makeHalf(label2, value2, color2))
  return div
}

/**
 * Create a richer info card for constellation zoom level.
 * Shows breadcrumb path, full name, Cpk/Cp, UCL/CL/LCL, USL/LSL, sample count, trend.
 */
export function createConstellationCard(
  char: Characteristic,
  hierarchyPath?: string,
  capability?: CapabilityResult | null,
): CSS2DObject {
  const container = document.createElement('div')
  container.style.pointerEvents = 'none'
  container.style.background = 'rgba(8, 12, 22, 0.85)'
  container.style.backdropFilter = 'blur(6px)'
  container.style.border = '1px solid rgba(255, 255, 255, 0.1)'
  container.style.borderRadius = '5px'
  container.style.padding = '10px 14px'
  container.style.fontFamily = 'ui-monospace, SFMono-Regular, monospace'
  container.style.minWidth = '280px'
  container.style.maxWidth = '400px'
  container.style.userSelect = 'none'

  // Breadcrumb path (small gray text, can wrap to 2 lines)
  if (hierarchyPath) {
    const breadcrumb = document.createElement('div')
    breadcrumb.style.color = '#6B7280'
    breadcrumb.style.fontSize = '11px'
    breadcrumb.style.lineHeight = '1.3'
    breadcrumb.style.marginBottom = '2px'
    breadcrumb.style.overflow = 'hidden'
    breadcrumb.style.display = '-webkit-box'
    breadcrumb.style.setProperty('-webkit-line-clamp', '2')
    breadcrumb.style.setProperty('-webkit-box-orient', 'vertical')
    breadcrumb.textContent = hierarchyPath
    container.appendChild(breadcrumb)
  }

  // Header: in-control dot + full name (wraps, not truncated)
  const header = document.createElement('div')
  header.style.display = 'flex'
  header.style.alignItems = 'flex-start'
  header.style.gap = '5px'
  header.style.marginBottom = '4px'

  const dot = document.createElement('div')
  const inControl = char.in_control !== false
  dot.style.width = '9px'
  dot.style.height = '9px'
  dot.style.borderRadius = '50%'
  dot.style.flexShrink = '0'
  dot.style.marginTop = '3px'
  dot.style.backgroundColor = inControl ? '#22C55E' : '#EF4444'
  dot.style.boxShadow = inControl
    ? '0 0 4px rgba(34, 197, 94, 0.5)'
    : '0 0 4px rgba(239, 68, 68, 0.5)'

  const nameSpan = document.createElement('span')
  nameSpan.style.color = '#E5E7EB'
  nameSpan.style.fontSize = '14px'
  nameSpan.style.fontWeight = '600'
  nameSpan.style.lineHeight = '1.3'
  nameSpan.textContent = char.name

  header.appendChild(dot)
  header.appendChild(nameSpan)
  container.appendChild(header)

  // Divider
  const divider = document.createElement('div')
  divider.style.borderTop = '1px solid rgba(255, 255, 255, 0.06)'
  divider.style.marginBottom = '3px'
  container.appendChild(divider)

  // No-data state: show "Awaiting data" instead of metrics
  if (!char.sample_count) {
    const noData = document.createElement('div')
    noData.style.fontSize = '13px'
    noData.style.color = '#6B7280'
    noData.style.fontStyle = 'italic'
    noData.style.textAlign = 'center'
    noData.style.padding = '6px 0'
    noData.textContent = 'Awaiting data\u2026'
    container.appendChild(noData)

    const label = new CSS2DObject(container)
    label.position.set(0, 22, 0)
    return label
  }

  // Cpk / Cp in one row — prefer live capability over stale snapshot
  const cpkVal = capability?.cpk ?? char.latest_cpk ?? null
  const cpVal = capability?.cp ?? char.latest_cp ?? null
  if (cpVal != null) {
    container.appendChild(
      tinyRowPair(
        'Cpk',
        fmt(cpkVal, 2),
        cpkColor(cpkVal),
        'Cp',
        fmt(cpVal, 2),
        cpkColor(cpVal),
      ),
    )
  } else {
    container.appendChild(tinyRow('Cpk', fmt(cpkVal, 2), cpkColor(cpkVal)))
  }

  // UCL / CL / LCL
  if (char.ucl != null || char.stored_center_line != null || char.lcl != null) {
    const limitsDiv = document.createElement('div')
    limitsDiv.style.borderTop = '1px solid rgba(255, 255, 255, 0.04)'
    limitsDiv.style.marginTop = '2px'
    limitsDiv.style.paddingTop = '2px'
    container.appendChild(limitsDiv)

    // UCL + CL side by side if both exist
    if (char.ucl != null && char.stored_center_line != null) {
      container.appendChild(
        tinyRowPair(
          'UCL',
          fmt(char.ucl, 2),
          '#EF4444',
          'CL',
          fmt(char.stored_center_line, 2),
          '#9CA3AF',
        ),
      )
    } else {
      if (char.ucl != null)
        container.appendChild(tinyRow('UCL', fmt(char.ucl, 2), '#EF4444'))
      if (char.stored_center_line != null)
        container.appendChild(tinyRow('CL', fmt(char.stored_center_line, 2), '#9CA3AF'))
    }
    if (char.lcl != null) container.appendChild(tinyRow('LCL', fmt(char.lcl, 2), '#60A5FA'))
  }

  // USL / LSL
  if (char.usl != null || char.lsl != null) {
    if (char.usl != null && char.lsl != null) {
      container.appendChild(
        tinyRowPair(
          'USL',
          fmt(char.usl, 2),
          '#D1D5DB',
          'LSL',
          fmt(char.lsl, 2),
          '#D1D5DB',
        ),
      )
    } else {
      if (char.usl != null)
        container.appendChild(tinyRow('USL', fmt(char.usl, 2), '#D1D5DB'))
      if (char.lsl != null)
        container.appendChild(tinyRow('LSL', fmt(char.lsl, 2), '#D1D5DB'))
    }
  }

  // Bottom row: sample count + trend indicator
  const bottomRow = document.createElement('div')
  bottomRow.style.display = 'flex'
  bottomRow.style.justifyContent = 'space-between'
  bottomRow.style.alignItems = 'center'
  bottomRow.style.marginTop = '2px'

  const sampleSpan = document.createElement('span')
  sampleSpan.style.fontSize = '13px'
  sampleSpan.style.color = '#9CA3AF'
  sampleSpan.textContent = char.sample_count != null ? `n=${char.sample_count}` : ''
  bottomRow.appendChild(sampleSpan)

  const trendSpan = document.createElement('span')
  trendSpan.style.fontSize = '14px'
  const cpk = cpkVal ?? 0
  if (cpk >= 1.33 && inControl) {
    trendSpan.style.color = '#22C55E'
    trendSpan.textContent = '\u25B2' // up arrow
  } else if (cpk >= 1.0) {
    trendSpan.style.color = '#F59E0B'
    trendSpan.textContent = '\u2014' // dash
  } else {
    trendSpan.style.color = '#EF4444'
    trendSpan.textContent = '\u25BC' // down arrow
  }
  bottomRow.appendChild(trendSpan)
  container.appendChild(bottomRow)

  const label = new CSS2DObject(container)
  label.position.set(0, 22, 0)
  return label
}

/**
 * Create a CSS2DObject label attached to a planet in the galaxy scene.
 * This is NOT a React component -- it creates raw DOM elements for
 * Three.js CSS2DRenderer.
 */
export function createPlanetLabel(
  char: Characteristic,
  capability?: CapabilityResult | null,
): CSS2DObject {
  const container = document.createElement('div')
  container.style.pointerEvents = 'auto'
  container.style.background = 'rgba(0, 0, 0, 0.85)'
  container.style.backdropFilter = 'blur(8px)'
  container.style.border = '1px solid rgba(255, 255, 255, 0.12)'
  container.style.borderRadius = '6px'
  container.style.padding = '8px 12px'
  container.style.fontFamily = 'ui-monospace, SFMono-Regular, monospace'
  container.style.minWidth = '140px'
  container.style.maxWidth = '200px'
  container.style.cursor = 'default'
  container.style.userSelect = 'none'

  // Header: name + in-control dot
  const header = document.createElement('div')
  header.style.display = 'flex'
  header.style.alignItems = 'center'
  header.style.gap = '6px'
  header.style.marginBottom = '6px'

  const dot = document.createElement('div')
  const inControl = char.in_control !== false
  dot.style.width = '6px'
  dot.style.height = '6px'
  dot.style.borderRadius = '50%'
  dot.style.flexShrink = '0'
  dot.style.backgroundColor = inControl ? '#22C55E' : '#EF4444'
  dot.style.boxShadow = inControl
    ? '0 0 4px rgba(34, 197, 94, 0.6)'
    : '0 0 4px rgba(239, 68, 68, 0.6)'

  const nameSpan = document.createElement('span')
  nameSpan.style.color = '#E5E7EB'
  nameSpan.style.fontSize = '12px'
  nameSpan.style.fontWeight = '600'
  nameSpan.style.overflow = 'hidden'
  nameSpan.style.textOverflow = 'ellipsis'
  nameSpan.style.whiteSpace = 'nowrap'
  nameSpan.textContent = char.name

  header.appendChild(dot)
  header.appendChild(nameSpan)
  container.appendChild(header)

  // Divider
  const divider = document.createElement('div')
  divider.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)'
  divider.style.marginBottom = '4px'
  container.appendChild(divider)

  // Cpk
  const cpkVal = capability?.cpk ?? null
  container.appendChild(row('Cpk', fmt(cpkVal), cpkColor(cpkVal)))

  // Cp (if available)
  if (capability?.cp != null) {
    container.appendChild(row('Cp', fmt(capability.cp), cpkColor(capability.cp)))
  }

  // Spec limits
  if (char.usl != null || char.lsl != null) {
    const specDiv = document.createElement('div')
    specDiv.style.borderTop = '1px solid rgba(255, 255, 255, 0.05)'
    specDiv.style.marginTop = '4px'
    specDiv.style.paddingTop = '4px'
    container.appendChild(specDiv)

    if (char.usl != null) {
      container.appendChild(row('USL', fmt(char.usl, 4), '#D1D5DB'))
    }
    if (char.lsl != null) {
      container.appendChild(row('LSL', fmt(char.lsl, 4), '#D1D5DB'))
    }
  }

  const label = new CSS2DObject(container)
  // Offset the label slightly above the planet
  label.position.set(0, 3, 0)

  return label
}

/**
 * Create small UCL / CL / LCL labels for planet-zoom view.
 * These attach at the ring edges of the planet system.
 */
export function createControlLimitLabels(
  chartData: ChartData,
): CSS2DObject[] {
  const labels: CSS2DObject[] = []
  const cl = chartData.control_limits

  const makeTag = (text: string, color: string, yOffset: number): CSS2DObject => {
    const div = document.createElement('div')
    div.style.pointerEvents = 'auto'
    div.style.background = 'rgba(0, 0, 0, 0.7)'
    div.style.backdropFilter = 'blur(4px)'
    div.style.border = '1px solid rgba(255, 255, 255, 0.08)'
    div.style.borderRadius = '4px'
    div.style.padding = '2px 6px'
    div.style.fontFamily = 'ui-monospace, SFMono-Regular, monospace'
    div.style.fontSize = '12px'
    div.style.color = color
    div.style.whiteSpace = 'nowrap'
    div.style.cursor = 'default'
    div.style.userSelect = 'none'
    div.textContent = text

    const obj = new CSS2DObject(div)
    obj.position.set(4, yOffset, 0)
    return obj
  }

  if (cl.ucl != null) {
    labels.push(makeTag(`UCL ${fmt(cl.ucl, 2)}`, '#EF4444', 2.5))
  }
  if (cl.center_line != null) {
    labels.push(makeTag(`CL ${fmt(cl.center_line, 2)}`, '#9CA3AF', 0))
  }
  if (cl.lcl != null) {
    labels.push(makeTag(`LCL ${fmt(cl.lcl, 2)}`, '#60A5FA', -2.5))
  }

  return labels
}

/**
 * Remove a CSS2DObject label from its parent and clean up its DOM element.
 */
export function disposeLabel(label: CSS2DObject): void {
  if (label.parent) {
    label.parent.remove(label)
  }
  // CSS2DObject.element is the backing DOM node
  if (label.element?.parentNode) {
    label.element.parentNode.removeChild(label.element)
  }
}
