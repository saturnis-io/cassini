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

/** CSS properties that hold color values */
const COLOR_PROPS = [
  'color', 'background-color',
  'border-color', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-decoration-color',
]

/**
 * Walk every element in `root` and force any modern-CSS color values
 * to RGB inline styles so html2canvas can parse them.
 */
function forceRgbColors(root: HTMLElement) {
  const walk = (el: HTMLElement) => {
    const view = el.ownerDocument.defaultView
    if (!view) return
    const computed = view.getComputedStyle(el)

    for (const prop of COLOR_PROPS) {
      const value = computed.getPropertyValue(prop)
      if (UNSUPPORTED_COLOR_RE.test(value)) {
        const rgb = cssColorToRgb(value)
        if (rgb) el.style.setProperty(prop, rgb, 'important')
      }
    }

    for (const child of el.children) {
      if (child instanceof HTMLElement) walk(child)
    }
  }
  walk(root)
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
    onclone: (_clonedDoc: Document, clonedElement: HTMLElement) => {
      // Convert modern CSS colors (oklab, oklch, etc.) to RGB on the
      // cloned DOM *before* html2canvas parses the tree.
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
