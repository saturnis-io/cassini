import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'

/**
 * Convert a CSS color string to RGB using Canvas 2D pixel readback.
 * Works with any color format the browser supports (oklab, oklch, lab, lch, color-mix, etc.)
 * because it renders to a pixel and reads back the RGBA values.
 */
function cssColorToRgb(cssColor: string): string | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000000' // reset
    ctx.fillStyle = cssColor   // set target color — ignored if invalid
    ctx.fillRect(0, 0, 1, 1)

    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    if (a === 0) return 'transparent'
    if (a >= 254) return `rgb(${r}, ${g}, ${b})`
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
  } catch {
    return null
  }
}

/** Pattern matching modern CSS color functions that html2canvas cannot parse */
const UNSUPPORTED_COLOR_RE = /oklch|oklab|lab\(|lch\(|color-mix\(|color\(/

/** Names of CSS color functions that need conversion */
const COLOR_FN_NAMES = ['oklch', 'oklab', 'lab', 'lch', 'color-mix', 'color']
const COLOR_FN_RE = new RegExp(`(${COLOR_FN_NAMES.join('|')})\\(`, 'g')

/**
 * Replace all modern CSS color functions within a value string with RGB
 * equivalents.  Handles compound values like box-shadow that mix colors
 * with lengths, and nested parens like color-mix(in srgb, oklch(...) 50%, …).
 */
function replaceModernColors(value: string): string {
  let result = ''
  let lastIndex = 0
  let match

  COLOR_FN_RE.lastIndex = 0
  while ((match = COLOR_FN_RE.exec(value)) !== null) {
    result += value.slice(lastIndex, match.index)

    // Walk forward to find the balanced closing paren
    let depth = 1
    let i = match.index + match[0].length
    while (i < value.length && depth > 0) {
      if (value[i] === '(') depth++
      else if (value[i] === ')') depth--
      i++
    }

    const colorExpr = value.substring(match.index, i)
    const rgb = cssColorToRgb(colorExpr)
    // If canvas conversion fails (e.g. contains var()), fall back to
    // transparent so html2canvas doesn't throw on the unsupported function.
    result += rgb ?? 'transparent'
    lastIndex = i
  }

  result += value.slice(lastIndex)
  return result
}

/**
 * Walk every element in `root` and force any modern-CSS color values
 * to RGB inline styles so html2canvas can parse them.
 *
 * Iterates ALL computed style properties (not a fixed list) so that
 * compound properties like box-shadow, background shorthand, etc. are
 * also covered.
 */
function forceRgbColors(root: HTMLElement) {
  const walk = (el: HTMLElement) => {
    const view = el.ownerDocument.defaultView
    if (!view) return
    const computed = view.getComputedStyle(el)

    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i]
      const value = computed.getPropertyValue(prop)
      if (UNSUPPORTED_COLOR_RE.test(value)) {
        const fixed = replaceModernColors(value)
        if (fixed !== value) {
          el.style.setProperty(prop, fixed, 'important')
        }
      }
    }

    for (const child of el.children) {
      if (child instanceof HTMLElement) walk(child)
    }
  }
  walk(root)
}

/**
 * Sanitize all stylesheets in the cloned document by replacing unsupported
 * CSS color functions (oklab, oklch, etc.) with RGB equivalents in the raw
 * CSS text.  This is necessary because html2canvas parses stylesheets
 * directly (for pseudo-elements, cascade, etc.) — inline style overrides
 * alone are not sufficient.
 */
function sanitizeStylesheets(doc: Document) {
  doc.querySelectorAll('style').forEach((styleEl) => {
    const text = styleEl.textContent
    if (text && UNSUPPORTED_COLOR_RE.test(text)) {
      styleEl.textContent = replaceModernColors(text)
    }
  })
}

/**
 * Export an HTML element to PDF
 */
export async function exportToPdf(
  element: HTMLElement,
  filename: string,
  options?: { orientation?: 'portrait' | 'landscape' }
) {
  const canvas = await html2canvas(element, {
    scale: 2,
    logging: false,
    useCORS: true,
    backgroundColor: '#ffffff',
    onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
      // 1. Sanitize raw CSS in <style> tags — covers pseudo-elements,
      //    cascade rules, and anything html2canvas parses from stylesheets.
      sanitizeStylesheets(clonedDoc)
      // 2. Override computed styles on elements as a belt-and-suspenders
      //    measure for any resolved values that still contain modern colors.
      forceRgbColors(clonedElement)
    },
  })

  const imgData = canvas.toDataURL('image/png')

  const pdf = new jsPDF({
    orientation: options?.orientation ?? 'portrait',
    unit: 'mm',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pageWidth - 20 // 10mm margins
  const imgHeight = (canvas.height * imgWidth) / canvas.width

  // Handle multi-page if content is too tall
  let heightLeft = imgHeight
  let position = 10 // Top margin

  pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight)
  heightLeft -= pageHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight + 10
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight)
    heightLeft -= pageHeight
  }

  pdf.save(`${filename}.pdf`)
}

/**
 * Export data to Excel (.xlsx)
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = 'Data'
) {
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

/**
 * Export data to CSV
 */
export function exportToCsv(
  data: Record<string, unknown>[],
  filename: string
) {
  const ws = XLSX.utils.json_to_sheet(data)
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename}.csv`)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Prepare chart data for export
 */
export function prepareChartDataForExport(chartData: {
  data_points: Array<{
    timestamp: string
    mean: number
    zone: string
    violation_rules: number[]
  }>
}) {
  return chartData.data_points.map((point) => ({
    Timestamp: new Date(point.timestamp).toLocaleString(),
    Mean: point.mean,
    Zone: point.zone.replace(/_/g, ' '),
    Violations: point.violation_rules.length > 0
      ? point.violation_rules.map((r) => `Rule ${r}`).join(', ')
      : 'None',
  }))
}

/**
 * Prepare violation data for export
 */
export function prepareViolationsForExport(violations: Array<{
  id: number
  created_at: string | null
  characteristic_name: string | null
  rule_id: number
  rule_name: string
  severity: string
  acknowledged: boolean
  ack_user: string | null
  ack_reason: string | null
}>) {
  return violations.map((v) => ({
    ID: v.id,
    Date: v.created_at ? new Date(v.created_at).toLocaleString() : '-',
    Characteristic: v.characteristic_name || '-',
    Rule: `Rule ${v.rule_id}: ${v.rule_name}`,
    Severity: v.severity,
    Status: v.acknowledged ? 'Acknowledged' : 'Pending',
    'Ack By': v.ack_user || '-',
    'Ack Reason': v.ack_reason || '-',
  }))
}
