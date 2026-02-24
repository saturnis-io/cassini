import { z } from 'zod'

// ---------------------------------------------------------------------------
// Shared: finite number helper
// ---------------------------------------------------------------------------

const finiteNumber = z.number().refine((n) => Number.isFinite(n), {
  message: 'Must be a valid number',
})

// ---------------------------------------------------------------------------
// Attribute Entry (p/np/c/u charts)
// ---------------------------------------------------------------------------

/**
 * Schema for AttributeEntryForm.
 *
 * Chart-type determines which fields are required:
 * - p/np: defect_count + sample_size (defect_count <= sample_size)
 * - c:    defect_count only
 * - u:    defect_count + units_inspected
 *
 * batch_number and operator_id are always optional strings.
 */
export const attributeEntrySchema = z
  .object({
    chart_type: z.enum(['p', 'np', 'c', 'u']),
    defect_count: z
      .number({ message: 'Defect count is required' })
      .int('Must be a whole number')
      .min(0, 'Must be 0 or greater'),
    sample_size: z.number().int().positive('Must be greater than 0').optional(),
    units_inspected: z.number().int().positive('Must be greater than 0').optional(),
    batch_number: z.string().optional(),
    operator_id: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    // p/np charts require sample_size
    if ((data.chart_type === 'p' || data.chart_type === 'np') && !data.sample_size) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sample_size'],
        message: 'Sample size is required for p/np charts',
      })
    }

    // u charts require units_inspected
    if (data.chart_type === 'u' && !data.units_inspected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['units_inspected'],
        message: 'Units inspected is required for u charts',
      })
    }

    // For p/np charts, defective count must not exceed sample size
    if (
      (data.chart_type === 'p' || data.chart_type === 'np') &&
      data.sample_size != null &&
      data.defect_count > data.sample_size
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defect_count'],
        message: 'Defective count cannot exceed sample size',
      })
    }
  })

export type AttributeEntryData = z.infer<typeof attributeEntrySchema>

// ---------------------------------------------------------------------------
// Measurements (ManualEntryPanel, InputModal)
// ---------------------------------------------------------------------------

/**
 * Schema for variable data entry — an array of finite numbers.
 *
 * Min-length validation is left to the component because it depends on
 * the runtime characteristic config (subgroup_size, min_measurements).
 */
export const measurementsSchema = z.object({
  measurements: z.array(finiteNumber).min(1, 'At least one measurement is required'),
  batch_number: z.string().optional(),
  operator_id: z.string().optional(),
})

export type MeasurementsData = z.infer<typeof measurementsSchema>

// ---------------------------------------------------------------------------
// Sample Edit (SampleEditModal)
// ---------------------------------------------------------------------------

/**
 * Schema for editing an existing sample.
 * All measurements must be valid numbers and a reason is required.
 */
export const sampleEditSchema = z.object({
  measurements: z.array(finiteNumber).min(1, 'At least one measurement is required'),
  reason: z.string().min(1, 'Reason for change is required'),
})

export type SampleEditData = z.infer<typeof sampleEditSchema>
