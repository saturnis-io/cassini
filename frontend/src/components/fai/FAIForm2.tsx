import { useState, useCallback } from 'react'
import { useUpdateFAIReport } from '@/api/hooks'
import type { FAIReportDetail } from '@/api/client'

interface FAIForm2Props {
  report: FAIReportDetail
  readonly: boolean
}

export function FAIForm2({ report, readonly }: FAIForm2Props) {
  const updateReport = useUpdateFAIReport()

  const [fields, setFields] = useState({
    material_supplier: report.material_supplier ?? '',
    material_spec: report.material_spec ?? '',
    special_processes: report.special_processes ?? '',
    functional_test_results: report.functional_test_results ?? '',
  })

  const handleBlur = useCallback(
    (field: string, value: string) => {
      const original = (report as unknown as Record<string, unknown>)[field]
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
          AS9102 Form 2 — Product Accountability
        </h2>
        <p className="text-muted-foreground text-sm">
          Material, special processes, and functional test information.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Material Supplier */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Material Supplier</label>
          <input
            type="text"
            value={fields.material_supplier}
            onChange={(e) => handleChange('material_supplier', e.target.value)}
            onBlur={(e) => handleBlur('material_supplier', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. Steel Corp International"
          />
        </div>

        {/* Material Spec */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Material Specification</label>
          <input
            type="text"
            value={fields.material_spec}
            onChange={(e) => handleChange('material_spec', e.target.value)}
            onBlur={(e) => handleBlur('material_spec', e.target.value)}
            disabled={readonly}
            className={inputClass}
            placeholder="e.g. AMS 5643, Inconel 718"
          />
        </div>
      </div>

      {/* Special Processes */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Special Processes</label>
        <textarea
          value={fields.special_processes}
          onChange={(e) => handleChange('special_processes', e.target.value)}
          onBlur={(e) => handleBlur('special_processes', e.target.value)}
          disabled={readonly}
          className={inputClass}
          rows={4}
          placeholder="List any special processes (heat treatment, plating, NDT, etc.)..."
        />
      </div>

      {/* Functional Test Results */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Functional Test Results</label>
        <textarea
          value={fields.functional_test_results}
          onChange={(e) => handleChange('functional_test_results', e.target.value)}
          onBlur={(e) => handleBlur('functional_test_results', e.target.value)}
          disabled={readonly}
          className={inputClass}
          rows={4}
          placeholder="Describe functional test results, if applicable..."
        />
      </div>

      {updateReport.isPending && (
        <p className="text-muted-foreground text-xs">Saving...</p>
      )}
    </div>
  )
}
