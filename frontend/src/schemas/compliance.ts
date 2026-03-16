import { z } from 'zod'

// ---------------------------------------------------------------------------
// FAI Report submit/approve guard
// ---------------------------------------------------------------------------
// Lightweight guard schema — validates a FAI report has required fields
// before allowing status transitions (submit or approve).

export const faiReportGuardSchema = z.object({
  part_number: z.string().min(1, 'Part number is required'),
  items: z
    .array(
      z.object({
        characteristic_name: z.string().min(1, 'Characteristic name is required'),
        value_type: z.string().optional().default('numeric'),
        actual_value: z.number().nullable().optional(),
        actual_value_text: z.string().nullable().optional(),
        result: z.string().min(1, 'Result is required'),
      }).refine(
        (item) => {
          // Numeric items require actual_value; text/pass_fail require actual_value_text
          if (item.value_type === 'text' || item.value_type === 'pass_fail') {
            return item.actual_value_text != null && item.actual_value_text !== ''
          }
          return item.actual_value != null
        },
        'Actual value is required',
      ),
    )
    .min(1, 'At least one FAI item is required'),
})

export type FAIReportGuardData = z.infer<typeof faiReportGuardSchema>
