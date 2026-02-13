import { useState } from 'react'
import { useSubmitAttributeData } from '@/api/hooks'
import { NumberInput } from './NumberInput'
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
  const [sampleSize, setSampleSize] = useState(
    characteristic.default_sample_size?.toString() ?? ''
  )
  const [unitsInspected, setUnitsInspected] = useState('')
  const [batchNumber, setBatchNumber] = useState('')
  const [operatorId, setOperatorId] = useState('')

  const submitAttribute = useSubmitAttributeData()

  const defectCountVal = defectCount !== '' ? parseInt(defectCount, 10) : NaN
  const sampleSizeVal = sampleSize !== '' ? parseInt(sampleSize, 10) : NaN
  const unitsInspectedVal = unitsInspected !== '' ? parseInt(unitsInspected, 10) : NaN

  const isValid =
    !isNaN(defectCountVal) && defectCountVal >= 0 &&
    (!needsSampleSize || (!isNaN(sampleSizeVal) && sampleSizeVal > 0)) &&
    (!needsUnitsInspected || (!isNaN(unitsInspectedVal) && unitsInspectedVal > 0))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    submitAttribute.mutate(
      {
        characteristic_id: characteristic.id,
        defect_count: defectCountVal,
        sample_size: needsSampleSize ? sampleSizeVal : undefined,
        units_inspected: needsUnitsInspected ? unitsInspectedVal : undefined,
        batch_number: batchNumber || undefined,
        operator_id: operatorId || undefined,
      },
      {
        onSuccess: () => {
          setDefectCount('')
          setSampleSize(characteristic.default_sample_size?.toString() ?? '')
          setUnitsInspected('')
          setBatchNumber('')
          setOperatorId('')
        },
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Chart type badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium px-2 py-1 bg-primary/10 text-primary rounded">
          {CHART_TYPE_LABELS[chartType ?? ''] ?? 'Attribute Chart'}
        </span>
      </div>

      {/* Defect Count */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Defect Count <span className="text-orange-500">*</span>
        </label>
        <NumberInput
          value={defectCount}
          onChange={setDefectCount}
          placeholder="Number of defects"
          size="md"
          step={1}
          min={0}
        />
        <p className="text-sm text-muted-foreground mt-1">
          {chartType === 'p' || chartType === 'np'
            ? 'Number of defective items in the sample'
            : 'Number of defects observed'}
        </p>
      </div>

      {/* Sample Size (p/np charts) */}
      {needsSampleSize && (
        <div>
          <label className="block text-sm font-medium mb-1">
            Sample Size <span className="text-orange-500">*</span>
          </label>
          <NumberInput
            value={sampleSize}
            onChange={setSampleSize}
            placeholder="Total items inspected"
            size="md"
            step={1}
            min={1}
          />
          <p className="text-sm text-muted-foreground mt-1">
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
          <label className="block text-sm font-medium mb-1">
            Units Inspected <span className="text-orange-500">*</span>
          </label>
          <NumberInput
            value={unitsInspected}
            onChange={setUnitsInspected}
            placeholder="Number of units inspected"
            size="md"
            step={1}
            min={1}
          />
          <p className="text-sm text-muted-foreground mt-1">
            Number of inspection units (area of opportunity)
          </p>
        </div>
      )}

      {/* Optional Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Batch Number (optional)
          </label>
          <input
            type="text"
            value={batchNumber}
            onChange={(e) => setBatchNumber(e.target.value)}
            placeholder="e.g., LOT-2024-001"
            className="w-full px-3 py-2 bg-background border border-input rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Operator ID (optional)
          </label>
          <input
            type="text"
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            placeholder="e.g., OP-123"
            className="w-full px-3 py-2 bg-background border border-input rounded-lg"
          />
        </div>
      </div>

      {/* Submit Result */}
      {submitAttribute.data && (
        <div className={`p-3 rounded-lg text-sm ${submitAttribute.data.in_control ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400'}`}>
          <div className="font-medium">
            {submitAttribute.data.in_control ? 'In Control' : 'Out of Control'}
          </div>
          <div>Plotted Value: {submitAttribute.data.plotted_value.toFixed(4)}</div>
          <div>UCL: {submitAttribute.data.ucl.toFixed(4)} | CL: {submitAttribute.data.center_line.toFixed(4)} | LCL: {submitAttribute.data.lcl.toFixed(4)}</div>
          {submitAttribute.data.violations.length > 0 && (
            <div className="mt-1 text-red-600 dark:text-red-400">
              Violations: {submitAttribute.data.violations.map(v => v.rule_name).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!isValid || submitAttribute.isPending}
          className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitAttribute.isPending ? 'Submitting...' : 'Submit Attribute Data'}
        </button>
      </div>
    </form>
  )
}
