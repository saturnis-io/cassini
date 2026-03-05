import { useState } from 'react'
import { useSubmitAttributeData } from '@/api/hooks'
import { NumberInput } from './NumberInput'
import { FieldError } from '@/components/FieldError'
import { useFormValidation } from '@/hooks/useFormValidation'
import { attributeEntrySchema } from '@/schemas/data-entry'
import { inputErrorClass } from '@/lib/validation'
import { cn } from '@/lib/utils'
import type { Characteristic } from '@/types'

interface AttributeEntryFormProps {
  characteristic: Characteristic
}

const CHART_TYPE_LABELS: Record<string, string> = {
  p: 'p-chart (Proportion Defective)',
  np: 'np-chart (Number Defective)',
  c: 'c-chart (Defects per Unit)',
  u: 'u-chart (Defects per Unit - Variable)',
}

export function AttributeEntryForm({ characteristic }: AttributeEntryFormProps) {
  const chartType = characteristic.attribute_chart_type
  const needsSampleSize = chartType === 'p' || chartType === 'np'
  const needsUnitsInspected = chartType === 'u'

  const [defectCount, setDefectCount] = useState('')
  const [sampleSize, setSampleSize] = useState(characteristic.default_sample_size?.toString() ?? '')
  const [unitsInspected, setUnitsInspected] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [operatorId, setOperatorId] = useState('')

  const submitAttribute = useSubmitAttributeData()
  const { validate, getError, clearErrors } = useFormValidation(attributeEntrySchema)

  const defectCountVal = defectCount !== '' ? parseInt(defectCount, 10) : NaN
  const sampleSizeVal = sampleSize !== '' ? parseInt(sampleSize, 10) : NaN
  const unitsInspectedVal = unitsInspected !== '' ? parseInt(unitsInspected, 10) : NaN

  const isValid =
    !isNaN(defectCountVal) &&
    defectCountVal >= 0 &&
    (!needsSampleSize || (!isNaN(sampleSizeVal) && sampleSizeVal > 0)) &&
    (!needsUnitsInspected || (!isNaN(unitsInspectedVal) && unitsInspectedVal > 0))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const validated = validate({
      chart_type: chartType ?? 'c',
      defect_count: defectCount !== '' ? parseInt(defectCount, 10) : undefined,
      sample_size: needsSampleSize && sampleSize !== '' ? parseInt(sampleSize, 10) : undefined,
      units_inspected: needsUnitsInspected && unitsInspected !== '' ? parseInt(unitsInspected, 10) : undefined,
      batch_number: batchNumber || undefined,
      operator_id: operatorId || undefined,
    })
    if (!validated) return

    submitAttribute.mutate(
      {
        characteristic_id: characteristic.id,
        defect_count: validated.defect_count,
        sample_size: validated.sample_size,
        units_inspected: validated.units_inspected,
        batch_number: validated.batch_number,
        operator_id: validated.operator_id,
      },
      {
        onSuccess: () => {
          setDefectCount('')
          setSampleSize(characteristic.default_sample_size?.toString() ?? '')
          setUnitsInspected('')
          setBatchNumber('')
          setOperatorId('')
          clearErrors()
        },
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Chart type badge */}
      <div className="flex items-center gap-2">
        <span className="bg-primary/10 text-primary rounded px-2 py-1 text-xs font-medium">
          {CHART_TYPE_LABELS[chartType ?? ''] ?? 'Attribute Chart'}
        </span>
      </div>

      {/* Defect/Defective Count */}
      <div>
        <label className="mb-1 block text-sm font-medium">
          {chartType === 'p' || chartType === 'np' ? 'Defective Items' : 'Defects Found'}{' '}
          <span className="text-warning">*</span>
        </label>
        <NumberInput
          value={defectCount}
          onChange={setDefectCount}
          placeholder={
            chartType === 'p' || chartType === 'np'
              ? 'Number of defective items'
              : 'Number of defects found'
          }
          size="md"
          step={1}
          min={0}
          className={cn(inputErrorClass(getError('defect_count')))}
        />
        <FieldError error={getError('defect_count')} />
        <p className="text-muted-foreground mt-1 text-sm">
          {chartType === 'p' || chartType === 'np'
            ? 'Count of items classified as defective (pass/fail)'
            : 'Total number of individual defects observed'}
        </p>
      </div>

      {/* Sample Size (p/np charts) */}
      {needsSampleSize && (
        <div>
          <label className="mb-1 block text-sm font-medium">
            Sample Size <span className="text-warning">*</span>
          </label>
          <NumberInput
            value={sampleSize}
            onChange={setSampleSize}
            placeholder="Total items inspected"
            size="md"
            step={1}
            min={1}
            className={cn(inputErrorClass(getError('sample_size')))}
          />
          <FieldError error={getError('sample_size')} />
          <p className="text-muted-foreground mt-1 text-sm">
            Total number of items inspected in this sample
            {characteristic.default_sample_size != null && (
              <span className="ml-1">(default: {characteristic.default_sample_size})</span>
            )}
          </p>
        </div>
      )}

      {/* Units Inspected (u charts) */}
      {needsUnitsInspected && (
        <div>
          <label className="mb-1 block text-sm font-medium">
            Units Inspected <span className="text-warning">*</span>
          </label>
          <NumberInput
            value={unitsInspected}
            onChange={setUnitsInspected}
            placeholder="Number of units inspected"
            size="md"
            step={1}
            min={1}
            className={cn(inputErrorClass(getError('units_inspected')))}
          />
          <FieldError error={getError('units_inspected')} />
          <p className="text-muted-foreground mt-1 text-sm">
            Number of inspection units (area of opportunity)
          </p>
        </div>
      )}

      {/* Optional Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Batch Number (optional)</label>
          <input
            type="text"
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
            placeholder="e.g., LOT-2024-001"
            className="bg-background border-input w-full rounded-lg border px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Operator ID (optional)</label>
          <input
            type="text"
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            placeholder="e.g., OP-123"
            className="bg-background border-input w-full rounded-lg border px-3 py-2"
          />
        </div>
      </div>

      {/* Submit Result */}
      {submitAttribute.data && (
        <div
          className={`rounded-lg p-3 text-sm ${submitAttribute.data.in_control ? 'bg-success/5 text-success' : 'bg-destructive/5 text-destructive'}`}
        >
          <div className="font-medium">
            {submitAttribute.data.in_control ? 'In Control' : 'Out of Control'}
          </div>
          <div>Plotted Value: {submitAttribute.data.plotted_value.toFixed(4)}</div>
          <div>
            UCL: {submitAttribute.data.ucl.toFixed(4)} | CL:{' '}
            {submitAttribute.data.center_line.toFixed(4)} | LCL:{' '}
            {submitAttribute.data.lcl.toFixed(4)}
          </div>
          {submitAttribute.data.violations.length > 0 && (
            <div className="text-destructive mt-1">
              Violations: {submitAttribute.data.violations.map((v) => v.rule_name).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!isValid || submitAttribute.isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-6 py-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitAttribute.isPending ? 'Submitting...' : 'Submit Attribute Data'}
        </button>
      </div>
    </form>
  )
}
