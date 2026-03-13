import { applyFormat } from '@/lib/date-format'
import { NELSON_RULES } from '@/components/ViolationLegend'

/**
 * Data accepted by the native PDF report builder.
 * Uses minimal inline types to avoid coupling to full API type definitions.
 */
export interface ReportPdfData {
  title: string
  characteristicName: string
  hierarchyPath?: string
  chartImage?: { dataURL: string; aspectRatio: number }
  chartData?: {
    data_points: Array<{
      timestamp: string
      mean: number
      zone: string
      violation_rules: number[]
      excluded: boolean
    }>
    control_limits: {
      ucl: number | null
      lcl: number | null
      center_line: number | null
    }
    decimal_precision?: number
  }
  violations?: Array<{
    id: number
    created_at: string | null
    rule_id: number
    rule_name: string
    severity: string
    acknowledged: boolean
  }>
  annotations?: Array<{
    text: string
    annotation_type: string
    created_by: string | null
    created_at: string
  }>
  capability?: {
    cp: number | null
    cpk: number | null
    pp: number | null
    ppk: number | null
    sigma_within: number | null
    usl: number | null
    lsl: number | null
  }
}

/**
 * Build a native PDF report using jsPDF + autotable.
 * Chart rendered as an image; everything else as proper tables.
 * No html2canvas, no CSS dark-mode issues.
 */
export async function exportReportToPdf(
  data: ReportPdfData,
  filename: string,
  datetimeFormat = 'YYYY-MM-DD HH:mm:ss',
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin
  let y = margin

  // ── Header ──────────────────────────────────────────────────────────
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(data.title, margin, y)
  y += 7

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(`Characteristic: ${data.characteristicName}`, margin, y)
  y += 4.5
  if (data.hierarchyPath) {
    doc.text(`Path: ${data.hierarchyPath}`, margin, y)
    y += 4.5
  }
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y)
  y += 4.5
  doc.setTextColor(0)

  // Divider
  doc.setDrawColor(200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  // ── Chart Image ─────────────────────────────────────────────────────
  if (data.chartImage) {
    const maxHeight = 65 // mm — keep chart compact so tables fit on page 1
    const naturalHeight = contentWidth / data.chartImage.aspectRatio
    const chartHeight = Math.min(naturalHeight, maxHeight)
    const chartWidth = chartHeight * data.chartImage.aspectRatio

    doc.addImage(data.chartImage.dataURL, 'PNG', margin, y, chartWidth, chartHeight)
    y += chartHeight + 5
  }

  // ── Nelson Rules (active violations) ────────────────────────────────
  if (data.chartData) {
    const ruleCounts = new Map<number, number>()
    for (const point of data.chartData.data_points) {
      if (!point.excluded) {
        for (const ruleId of point.violation_rules) {
          ruleCounts.set(ruleId, (ruleCounts.get(ruleId) || 0) + 1)
        }
      }
    }

    if (ruleCounts.size > 0) {
      const ruleRows = [...ruleCounts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([id, count]) => [
          String(id),
          NELSON_RULES[id]?.name || `Rule ${id}`,
          NELSON_RULES[id]?.description || '',
          String(count),
        ])

      autoTable(doc, {
        startY: y,
        head: [['Rule', 'Name', 'Description', 'Count']],
        body: ruleRows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [231, 76, 60] },
        columnStyles: { 0: { cellWidth: 12 }, 3: { cellWidth: 15 } },
        theme: 'striped',
      })
      y = (doc as any).lastAutoTable.finalY + 6
    }
  }

  // ── Process Statistics ──────────────────────────────────────────────
  if (data.chartData) {
    const points = data.chartData.data_points.filter((p) => !p.excluded)
    const values = points.map((p) => p.mean)
    const n = values.length

    if (n > 0) {
      const mean = values.reduce((a, b) => a + b, 0) / n
      const variance = n > 1 ? values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1) : 0
      const stdDev = Math.sqrt(variance)
      const min = Math.min(...values)
      const max = Math.max(...values)

      const dp = data.chartData.decimal_precision ?? 4
      const f = (v: number | null | undefined) => (v != null ? v.toFixed(dp) : '—')

      const statsBody = [
        ['Count', String(n), 'Mean', f(mean)],
        ['Std Dev', f(stdDev), 'Range', f(max - min)],
        ['Min', f(min), 'Max', f(max)],
        [
          'UCL',
          f(data.chartData.control_limits.ucl),
          'LCL',
          f(data.chartData.control_limits.lcl),
        ],
        ['Center Line', f(data.chartData.control_limits.center_line), '', ''],
      ]

      autoTable(doc, {
        startY: y,
        head: [['Statistic', 'Value', 'Statistic', 'Value']],
        body: statsBody,
        margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [41, 128, 185] },
        theme: 'striped',
      })
      y = (doc as any).lastAutoTable.finalY + 6
    }
  }

  // ── Capability Metrics ──────────────────────────────────────────────
  if (data.capability) {
    const cap = data.capability
    const f = (v: number | null | undefined) => (v != null ? v.toFixed(4) : '—')

    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value', 'Metric', 'Value']],
      body: [
        ['Cp', f(cap.cp), 'Cpk', f(cap.cpk)],
        ['Pp', f(cap.pp), 'Ppk', f(cap.ppk)],
        ['LSL', f(cap.lsl), 'USL', f(cap.usl)],
        ['σ within', f(cap.sigma_within), '', ''],
      ],
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [39, 174, 96] },
      theme: 'striped',
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ── Violations ──────────────────────────────────────────────────────
  if (data.violations && data.violations.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['ID', 'Date', 'Rule', 'Severity', 'Status']],
      body: data.violations.map((v) => [
        String(v.id),
        v.created_at ? applyFormat(new Date(v.created_at), datetimeFormat) : '—',
        `Rule ${v.rule_id}: ${v.rule_name}`,
        v.severity,
        v.acknowledged ? 'Acknowledged' : 'Pending',
      ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [192, 57, 43] },
      theme: 'striped',
    })
    y = (doc as any).lastAutoTable.finalY + 6
  }

  // ── Annotations ─────────────────────────────────────────────────────
  if (data.annotations && data.annotations.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Type', 'Note', 'Author']],
      body: data.annotations.map((a) => [
        applyFormat(new Date(a.created_at), datetimeFormat),
        a.annotation_type === 'period' ? 'Period' : 'Point',
        a.text,
        a.created_by || '—',
      ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [142, 68, 173] },
      theme: 'striped',
    })
  }

  doc.save(`${filename}.pdf`)
}

/**
 * Export data to Excel (.xlsx)
 */
export async function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName = 'Data',
) {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

/**
 * Export data to Excel (.xlsx) with multiple sheets.
 * Each sheet gets its own tab with independent column schemas,
 * avoiding the blank-column problem from concatenating mixed-schema rows.
 */
export async function exportToExcelMultiSheet(
  sheets: Array<{ name: string; data: Record<string, unknown>[] }>,
  filename: string,
) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    if (sheet.data.length === 0) continue
    const ws = XLSX.utils.json_to_sheet(sheet.data)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

/**
 * Export data to CSV
 */
export async function exportToCsv(data: Record<string, unknown>[], filename: string) {
  const XLSX = await import('xlsx')
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
export function prepareChartDataForExport(
  chartData: {
    data_points: Array<{
      timestamp: string
      mean: number
      zone: string
      violation_rules: number[]
    }>
  },
  datetimeFormat = 'YYYY-MM-DD HH:mm:ss',
) {
  return chartData.data_points.map((point) => ({
    Timestamp: applyFormat(new Date(point.timestamp), datetimeFormat),
    Mean: point.mean,
    Zone: point.zone.replace(/_/g, ' '),
    Violations:
      point.violation_rules.length > 0
        ? point.violation_rules.map((r) => `Rule ${r}`).join(', ')
        : 'None',
  }))
}

/**
 * Prepare violation data for export
 */
export function prepareViolationsForExport(
  violations: Array<{
    id: number
    created_at: string | null
    characteristic_name: string | null
    rule_id: number
    rule_name: string
    severity: string
    acknowledged: boolean
    ack_user: string | null
    ack_reason: string | null
  }>,
  datetimeFormat = 'YYYY-MM-DD HH:mm:ss',
) {
  return violations.map((v) => ({
    ID: v.id,
    Date: v.created_at ? applyFormat(new Date(v.created_at), datetimeFormat) : '-',
    Characteristic: v.characteristic_name || '-',
    Rule: `Rule ${v.rule_id}: ${v.rule_name}`,
    Severity: v.severity,
    Status: v.acknowledged ? 'Acknowledged' : 'Pending',
    'Ack By': v.ack_user || '-',
    'Ack Reason': v.ack_reason || '-',
  }))
}
