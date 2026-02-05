import jsPDF from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import html2canvas from 'html2canvas'

/**
 * Convert oklch colors to RGB in an element's computed styles
 * html2canvas doesn't support oklch() color function
 */
function convertOklchToRgb(element: HTMLElement): () => void {
  const elementsWithOklch: Array<{ el: HTMLElement; prop: string; original: string }> = []

  const processElement = (el: HTMLElement) => {
    const computed = window.getComputedStyle(el)
    const propsToCheck = ['color', 'backgroundColor', 'borderColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor']

    for (const prop of propsToCheck) {
      const value = computed.getPropertyValue(prop)
      if (value.includes('oklch')) {
        // Store original inline style
        const inlineStyle = el.style.getPropertyValue(prop)
        elementsWithOklch.push({ el, prop, original: inlineStyle })

        // Create a temp element to compute the RGB value
        const temp = document.createElement('div')
        temp.style.color = value
        document.body.appendChild(temp)
        const rgbValue = window.getComputedStyle(temp).color
        document.body.removeChild(temp)

        // Apply RGB value
        el.style.setProperty(prop, rgbValue, 'important')
      }
    }

    // Process children
    for (const child of el.children) {
      if (child instanceof HTMLElement) {
        processElement(child)
      }
    }
  }

  processElement(element)

  // Return cleanup function to restore original styles
  return () => {
    for (const { el, prop, original } of elementsWithOklch) {
      if (original) {
        el.style.setProperty(prop, original)
      } else {
        el.style.removeProperty(prop)
      }
    }
  }
}

/**
 * Export an HTML element to PDF
 */
export async function exportToPdf(
  element: HTMLElement,
  filename: string,
  options?: { orientation?: 'portrait' | 'landscape' }
) {
  // Convert oklch colors to RGB before capture
  const restoreColors = convertOklchToRgb(element)

  try {
    const canvas = await html2canvas(element, {
      scale: 2,
      logging: false,
      useCORS: true,
      backgroundColor: '#ffffff',
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
  } finally {
    // Restore original colors
    restoreColors()
  }
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
