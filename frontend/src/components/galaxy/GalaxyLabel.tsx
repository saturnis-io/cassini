import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Characteristic, CapabilityResult, ChartData } from '@/types'

/**
 * Cpk color thresholds matching the galaxy data-mapping palette.
 */
function cpkColor(cpk: number | null): string {
  if (cpk == null) return '#9CA3AF' // gray-400
  if (cpk >= 1.33) return '#34D399' // emerald-400
  if (cpk >= 1.0) return '#FBBF24' // amber-400
  return '#F87171' // red-400
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
  labelSpan.style.fontSize = '11px'
  labelSpan.textContent = label

  const valueSpan = document.createElement('span')
  valueSpan.style.color = color ?? '#F59E0B'
  valueSpan.style.fontSize = '11px'
  valueSpan.style.fontWeight = '600'
  valueSpan.textContent = value

  div.appendChild(labelSpan)
  div.appendChild(valueSpan)
  return div
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
  dot.style.backgroundColor = inControl ? '#34D399' : '#F87171'
  dot.style.boxShadow = inControl
    ? '0 0 4px rgba(52, 211, 153, 0.6)'
    : '0 0 4px rgba(248, 113, 113, 0.6)'

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
    div.style.fontSize = '10px'
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
    labels.push(makeTag(`UCL ${fmt(cl.ucl, 2)}`, '#F87171', 2.5))
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
