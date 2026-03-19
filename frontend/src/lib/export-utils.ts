import { applyFormat } from '@/lib/date-format'
import { NELSON_RULES } from '@/components/ViolationLegend'

/** jsPDF document extended by jspdf-autotable plugin */
interface JsPDFWithAutoTable {
  lastAutoTable: { finalY: number }
}

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
  /** DOE analysis data for doe-summary template */
  doeAnalysis?: {
    studyName: string
    designType: string
    grandMean: number
    rSquared: number
    adjRSquared: number
    anovaTable: Array<{
      source: string
      sumOfSquares: number
      df: number
      meanSquare: number
      fValue: number | null
      pValue: number | null
    }>
    effects: Array<{ factorName: string; effect: number; coefficient: number }>
    factors: Array<{ name: string; lowLevel: number; highLevel: number; unit?: string }>
  }
  /** MSA results data for msa-report template */
  msaResults?: {
    studyName: string
    studyType: string
    verdict: string
    pctStudyGrr?: number
    pctStudyEv?: number
    pctStudyAv?: number
    ndc?: number
    pctToleranceGrr?: number | null
    fleissKappa?: number
  }
  /** Line assessment data for line-assessment template */
  lineAssessment?: {
    linePath: string
    characteristics: Array<{
      name: string
      cpk: number | null
      ppk: number | null
      inControlPct: number
      violations: number
      riskScore: number
    }>
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
  options?: {
    logoDataUrl?: string
    plantName?: string
  },
) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin
  const reportDate = new Date().toLocaleString()
  let y = margin

  // ── Logo ────────────────────────────────────────────────────────────
  const logoX = margin
  let headerTextX = margin
  if (options?.logoDataUrl) {
    try {
      doc.addImage(options.logoDataUrl, 'PNG', logoX, y - 2, 15, 15)
      headerTextX = margin + 18
    } catch {
      // Logo image failed to load — continue without it
    }
  }

  // ── Header ──────────────────────────────────────────────────────────
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(data.title, headerTextX, y)
  y += 7

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  if (options?.plantName) {
    doc.text(`Plant: ${options.plantName}`, headerTextX, y)
    y += 4.5
  }
  doc.text(`Characteristic: ${data.characteristicName}`, headerTextX, y)
  y += 4.5
  if (data.hierarchyPath) {
    doc.text(`Path: ${data.hierarchyPath}`, headerTextX, y)
    y += 4.5
  }
  doc.text(`Generated: ${reportDate}`, headerTextX, y)
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
      y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 6
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
      y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 6
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
    y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 6
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
    y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 6
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

  // ── DOE Analysis ─────────────────────────────────────────────────
  if (data.doeAnalysis) {
    const doe = data.doeAnalysis
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`DOE Study: ${doe.studyName}`, margin, y)
    y += 6
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `Design: ${doe.designType}  |  Grand Mean: ${doe.grandMean.toFixed(4)}  |  R²: ${(doe.rSquared * 100).toFixed(1)}%  |  Adj R²: ${(doe.adjRSquared * 100).toFixed(1)}%`,
      margin,
      y,
    )
    y += 6

    autoTable(doc, {
      startY: y,
      head: [['Source', 'SS', 'df', 'MS', 'F', 'p-value']],
      body: doe.anovaTable.map((r) => [
        r.source,
        r.sumOfSquares.toFixed(4),
        String(r.df),
        r.meanSquare.toFixed(4),
        r.fValue?.toFixed(2) ?? '—',
        r.pValue !== null ? (r.pValue < 0.001 ? '< 0.001' : r.pValue.toFixed(4)) : '—',
      ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [41, 128, 185] },
      theme: 'striped',
    })
    y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 6

    if (doe.effects.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Factor', 'Effect', 'Coefficient']],
        body: doe.effects.map((e) => [e.factorName, e.effect.toFixed(4), e.coefficient.toFixed(4)]),
        margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [52, 152, 219] },
        theme: 'striped',
      })
      y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 6
    }
  }

  // ── MSA Results ───────────────────────────────────────────────────
  if (data.msaResults) {
    const msa = data.msaResults
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`MSA Study: ${msa.studyName}`, margin, y)
    y += 6
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Type: ${msa.studyType}  |  Verdict: ${msa.verdict}`, margin, y)
    y += 5

    if (msa.pctStudyGrr !== undefined) {
      const rows = [
        ['%Study GRR', `${msa.pctStudyGrr.toFixed(1)}%`],
        ['%Study EV', `${(msa.pctStudyEv ?? 0).toFixed(1)}%`],
        ['%Study AV', `${(msa.pctStudyAv ?? 0).toFixed(1)}%`],
        ['NDC', String(msa.ndc ?? '—')],
      ]
      if (msa.pctToleranceGrr != null) {
        rows.push(['%Tolerance GRR', `${msa.pctToleranceGrr.toFixed(1)}%`])
      }
      autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value']],
        body: rows,
        margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [155, 89, 182] },
        theme: 'striped',
      })
      y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 6
    }

    if (msa.fleissKappa !== undefined) {
      doc.text(`Fleiss' Kappa: ${msa.fleissKappa.toFixed(3)}`, margin, y)
      y += 6
    }
  }

  // ── Line Assessment ───────────────────────────────────────────────
  if (data.lineAssessment) {
    const la = data.lineAssessment
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text(`Line Assessment: ${la.linePath}`, margin, y)
    y += 6

    autoTable(doc, {
      startY: y,
      head: [['Characteristic', 'Cpk', 'Ppk', 'In Control %', 'Violations', 'Risk']],
      body: la.characteristics.map((c) => [
        c.name,
        c.cpk?.toFixed(2) ?? '—',
        c.ppk?.toFixed(2) ?? '—',
        `${c.inControlPct.toFixed(0)}%`,
        String(c.violations),
        c.riskScore.toFixed(0),
      ]),
      margin: { left: margin, right: margin },
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [46, 204, 113] },
      theme: 'striped',
    })
    y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 6
  }

  // ── Page numbers + header/footer on every page ─────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)

    // Header: plant name + date (right-aligned, top of each page)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150)
    const headerText = options?.plantName
      ? `${options.plantName}  |  ${reportDate}`
      : reportDate
    doc.text(headerText, pageWidth - margin, 8, { align: 'right' })

    // Footer: "Generated by Cassini SPC" + page number
    doc.text('Generated by Cassini SPC', margin, pageHeight - 6)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 6, {
      align: 'right',
    })
    doc.setTextColor(0)
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
 * Download a chart as PNG from a data URL.
 * Creates a temporary <a> element and triggers a browser download.
 */
export function downloadChartAsPng(dataURL: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataURL
  link.download = `${filename}.png`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * Generate a single PDF report as an ArrayBuffer (for bundling into ZIP).
 * Same logic as exportReportToPdf but returns bytes instead of saving.
 */
async function generateReportPdfBytes(
  data: ReportPdfData,
  datetimeFormat = 'YYYY-MM-DD HH:mm:ss',
  options?: {
    logoDataUrl?: string
    plantName?: string
  },
): Promise<ArrayBuffer> {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - 2 * margin
  const reportDate = new Date().toLocaleString()
  let y = margin

  // ── Logo ────────────────────────────────────────────────────────────
  const logoX = margin
  let headerTextX = margin
  if (options?.logoDataUrl) {
    try {
      doc.addImage(options.logoDataUrl, 'PNG', logoX, y - 2, 15, 15)
      headerTextX = margin + 18
    } catch {
      // Logo image failed to load — continue without it
    }
  }

  // ── Header ──────────────────────────────────────────────────────────
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(data.title, headerTextX, y)
  y += 7

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  if (options?.plantName) {
    doc.text(`Plant: ${options.plantName}`, headerTextX, y)
    y += 4.5
  }
  doc.text(`Characteristic: ${data.characteristicName}`, headerTextX, y)
  y += 4.5
  if (data.hierarchyPath) {
    doc.text(`Path: ${data.hierarchyPath}`, headerTextX, y)
    y += 4.5
  }
  doc.text(`Generated: ${reportDate}`, headerTextX, y)
  y += 4.5
  doc.setTextColor(0)

  // Divider
  doc.setDrawColor(200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  // ── Chart Image ─────────────────────────────────────────────────────
  if (data.chartImage) {
    const maxHeight = 65
    const naturalHeight = contentWidth / data.chartImage.aspectRatio
    const chartHeight = Math.min(naturalHeight, maxHeight)
    const chartWidth = chartHeight * data.chartImage.aspectRatio

    doc.addImage(data.chartImage.dataURL, 'PNG', margin, y, chartWidth, chartHeight)
    y += chartHeight + 5
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

      autoTable(doc, {
        startY: y,
        head: [['Statistic', 'Value', 'Statistic', 'Value']],
        body: [
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
        ],
        margin: { left: margin, right: margin },
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [41, 128, 185] },
        theme: 'striped',
      })
      y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 6
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
    y = (doc as unknown as JsPDFWithAutoTable).lastAutoTable.finalY + 6
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
  }

  // ── Page numbers + header/footer on every page ─────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150)
    const headerText = options?.plantName
      ? `${options.plantName}  |  ${reportDate}`
      : reportDate
    doc.text(headerText, pageWidth - margin, 8, { align: 'right' })
    doc.text('Generated by Cassini SPC', margin, pageHeight - 6)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 6, {
      align: 'right',
    })
    doc.setTextColor(0)
  }

  return doc.output('arraybuffer')
}

/**
 * Batch export: generate individual PDF reports for multiple characteristics,
 * bundle them into a single ZIP file, and trigger download.
 * Calls onProgress(current, total) for each completed PDF.
 */
export async function exportBatchReportsToZip(
  items: Array<{
    characteristicName: string
    hierarchyPath?: string
    chartData?: ReportPdfData['chartData']
    violations?: ReportPdfData['violations']
    capability?: ReportPdfData['capability']
    annotations?: ReportPdfData['annotations']
  }>,
  options: {
    templateName: string
    datetimeFormat?: string
    logoDataUrl?: string
    plantName?: string
    onProgress?: (current: number, total: number) => void
  },
): Promise<void> {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const total = items.length
  const timestamp = new Date().toISOString().split('T')[0]

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const safeName = item.characteristicName.replace(/[^a-zA-Z0-9_-]/g, '_')
    const pdfBytes = await generateReportPdfBytes(
      {
        title: options.templateName,
        characteristicName: item.characteristicName,
        hierarchyPath: item.hierarchyPath,
        chartData: item.chartData,
        violations: item.violations,
        capability: item.capability,
        annotations: item.annotations,
      },
      options.datetimeFormat,
      {
        logoDataUrl: options.logoDataUrl,
        plantName: options.plantName,
      },
    )
    zip.file(`${safeName}-${timestamp}.pdf`, pdfBytes)
    options.onProgress?.(i + 1, total)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(zipBlob)
  link.download = `batch-report-${timestamp}.zip`
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
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
