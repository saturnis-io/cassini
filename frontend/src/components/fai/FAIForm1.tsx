import { useState, useCallback } from 'react'
import { useUpdateFAIReport } from '@/api/hooks'
import type { FAIReportDetail } from '@/api/client'

const REASON_OPTIONS = [
  'New Part',
  'Design Change',
  'Process Change',
  'Tooling Change',
  'Source Change',
  'Other',
]

interface FAIForm1Props {
  report: FAIReportDetail
  readonly: boolean
}

export function FAIForm1({ report, readonly }: FAIForm1Props) {
  const updateReport = useUpdateFAIReport()

  const [fields, setFields] = useState({
    part_number: report.part_number ?? '',
    part_name: report.part_name ?? '',
    revision: report.revision ?? '',
    serial_number: report.serial_number ?? '',
    lot_number: report.lot_number ?? '',
    drawing_number: report.drawing_number ?? '',
    organization_name: report.organization_name ?? '',
    supplier: report.supplier ?? '',
    purchase_order: report.purchase_order ?? '',
    reason_for_inspection: report.reason_for_inspection ?? '',
  })

  const handleBlur = useCallback(
    (field: string, value: string) => {
      const original = (report as Record<string, unknown>)[field]
      if (value === (original ?? '')) return
      updateReport.mutate({
        id: report.id,
        data: { [field]: value || null },
      })
    },
    [report, updateReport],
  )

  const handleChange = (field: string, value: string) => {
    setFields((prev) => ({ ...prev, [field]: value }))
  }

  const inputClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed'

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-base font-semibold">
          AS9102 Form 1 — Part Number Accountability
        </h2>
        <p className="text-muted-foreground text-sm">
          General part identification and inspection details.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Part Number */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">
            Part Number <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={fields.part_number}
            onChange={(e) => handleChange('part_number', e.target.value)}
            onBlur={(e) => handleBlur('part_number', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. PN-12345"
          />
        </div>

        {/* Part Name */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Part Name</label>
          <input
            type="text"
            value={fields.part_name}
            onChange={(e) => handleChange('part_name', e.target.value)}
            onBlur={(e) => handleBlur('part_name', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. Main Bearing Housing"
          />
        </div>

        {/* Revision */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Revision</label>
          <input
            type="text"
            value={fields.revision}
            onChange={(e) => handleChange('revision', e.target.value)}
            onBlur={(e) => handleBlur('revision', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. A"
          />
        </div>

        {/* Serial Number */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Serial Number</label>
          <input
            type="text"
            value={fields.serial_number}
            onChange={(e) => handleChange('serial_number', e.target.value)}
            onBlur={(e) => handleBlur('serial_number', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. SN-001"
          />
        </div>

        {/* Lot Number */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Lot Number</label>
          <input
            type="text"
            value={fields.lot_number}
            onChange={(e) => handleChange('lot_number', e.target.value)}
            onBlur={(e) => handleBlur('lot_number', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. LOT-2026-001"
          />
        </div>

        {/* Drawing Number */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Drawing Number</label>
          <input
            type="text"
            value={fields.drawing_number}
            onChange={(e) => handleChange('drawing_number', e.target.value)}
            onBlur={(e) => handleBlur('drawing_number', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. DWG-12345"
          />
        </div>

        {/* Organization Name */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Organization Name</label>
          <input
            type="text"
            value={fields.organization_name}
            onChange={(e) => handleChange('organization_name', e.target.value)}
            onBlur={(e) => handleBlur('organization_name', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. Acme Aerospace"
          />
        </div>

        {/* Supplier */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Supplier</label>
          <input
            type="text"
            value={fields.supplier}
            onChange={(e) => handleChange('supplier', e.target.value)}
            onBlur={(e) => handleBlur('supplier', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. Precision Machining Co."
          />
        </div>

        {/* Purchase Order */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Purchase Order</label>
          <input
            type="text"
            value={fields.purchase_order}
            onChange={(e) => handleChange('purchase_order', e.target.value)}
            onBlur={(e) => handleBlur('purchase_order', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. PO-2026-4567"
          />
        </div>

        {/* Reason for Inspection */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Reason for Inspection</label>
          <select
            value={fields.reason_for_inspection}
            onChange={(e) => {
              handleChange('reason_for_inspection', e.target.value)
              handleBlur('reason_for_inspection', e.target.value)
            }}
            disabled={readonly}
            className={inputClass}
          >
            <option value="">Select reason...</option>
            {REASON_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </div>

      {updateReport.isPending && (
        <p className="text-muted-foreground text-xs">Saving...</p>
      )}
    </div>
  )
}
