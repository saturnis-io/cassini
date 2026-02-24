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
        actual_value: z.number({ error: 'Actual value is required' }).nullable().refine(
          (v) => v !== null,
          'Actual value is required',
        ),
        result: z.string().min(1, 'Result is required'),
      }),
    )
    .min(1, 'At least one FAI item is required'),
})

export type FAIReportGuardData = z.infer<typeof faiReportGuardSchema>
