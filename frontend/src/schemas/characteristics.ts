import { z } from 'zod'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse an optional numeric string: empty string → undefined, otherwise coerce to number. */
const optionalNumericString = z
  .string()
  .transform((v) => (v.trim() === '' ? undefined : Number(v)))
  .pipe(z.number().optional())

// ---------------------------------------------------------------------------
// Spec-limit refinement (USL > LSL when both provided)
// ---------------------------------------------------------------------------

function refineSpecLimits(
  data: { usl?: number; lsl?: number },
  ctx: z.RefinementCtx,
) {
  if (data.usl !== undefined && data.lsl !== undefined && data.usl <= data.lsl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['usl'],
      message: 'USL must be greater than LSL',
    })
  }
}

// ---------------------------------------------------------------------------
// CreateCharacteristicWizard — Step 1 (Basics)
// ---------------------------------------------------------------------------

/**
 * Wizard Step 1 schema.
 *
 * Fields vary by data_type:
 * - variable: name + subgroupSize (1-25)
 * - attribute: name + defaultSampleSize (≥1, if needsSampleSize)
 *
 * We validate the superset and use superRefine to conditionally check.
 */
export const wizardStep1Schema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
    dataType: z.enum(['variable', 'attribute']),
    // Variable fields
    subgroupSize: z.string(),
    // Attribute fields
    needsSampleSize: z.boolean(),
    defaultSampleSize: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.dataType === 'variable') {
      const sg = parseInt(data.subgroupSize)
      if (isNaN(sg) || sg < 1 || sg > 25) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['subgroupSize'],
          message: 'Subgroup size must be between 1 and 25',
        })
      }
    }
    if (data.dataType === 'attribute' && data.needsSampleSize) {
      const ss = parseInt(data.defaultSampleSize)
      if (isNaN(ss) || ss < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['defaultSampleSize'],
          message: 'Sample size must be at least 1',
        })
      }
    }
  })

export type WizardStep1Data = z.infer<typeof wizardStep1Schema>

// ---------------------------------------------------------------------------
// CreateCharacteristicWizard — Step 2 (Limits)
// ---------------------------------------------------------------------------

/** Standard variable spec limits — all optional, USL > LSL when both set. */
export const wizardStep2LimitsSchema = z
  .object({
    target: optionalNumericString,
    usl: optionalNumericString,
    lsl: optionalNumericString,
  })
  .superRefine(refineSpecLimits)

export type WizardStep2LimitsData = z.infer<typeof wizardStep2LimitsSchema>

// ---------------------------------------------------------------------------
// CreateCharacteristicWizard — Step 2 CUSUM
// ---------------------------------------------------------------------------

export const wizardStep2CUSUMSchema = z.object({
  cusumTarget: z
    .string()
    .min(1, 'Process target is required')
    .transform((v) => Number(v))
    .pipe(z.number({ message: 'Must be a valid number' })),
  cusumK: optionalNumericString,
  cusumH: optionalNumericString,
})

export type WizardStep2CUSUMData = z.infer<typeof wizardStep2CUSUMSchema>

// ---------------------------------------------------------------------------
// CreateCharacteristicWizard — Step 2 EWMA
// ---------------------------------------------------------------------------

export const wizardStep2EWMASchema = z.object({
  ewmaTarget: z
    .string()
    .min(1, 'Process target is required')
    .transform((v) => Number(v))
    .pipe(z.number({ message: 'Must be a valid number' })),
  ewmaLambda: optionalNumericString,
  ewmaL: optionalNumericString,
})

export type WizardStep2EWMAData = z.infer<typeof wizardStep2EWMASchema>

// ---------------------------------------------------------------------------
// CharacteristicForm (full edit form)
// ---------------------------------------------------------------------------

/**
 * Schema for the characteristic edit form.
 *
 * - name is required
 * - spec limits are optional numbers, USL > LSL when both set
 * - subgroup config fields are optional with conditional logic in superRefine
 * - onChange type is (field, string | boolean) — use_laney_correction is boolean
 */
export const characteristicFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    description: z.string(),
    target_value: optionalNumericString,
    usl: optionalNumericString,
    lsl: optionalNumericString,
    subgroup_mode: z.string(),
    min_measurements: z
      .string()
      .transform((v) => (v.trim() === '' ? 1 : Number(v)))
      .pipe(z.number().int().min(1, 'Minimum measurements must be at least 1')),
    warn_below_count: optionalNumericString,
    decimal_precision: z
      .string()
      .transform((v) => (v.trim() === '' ? 3 : Number(v)))
      .pipe(z.number().int().min(0).max(10)),
    chart_type: z.string(),
    cusum_target: optionalNumericString,
    cusum_k: optionalNumericString,
    cusum_h: optionalNumericString,
    ewma_lambda: optionalNumericString,
    ewma_l: optionalNumericString,
    short_run_mode: z.string(),
    use_laney_correction: z.boolean(),
    sigma_method: z.string().optional(),
    // Passed in for cross-field validation
    subgroup_size: z.number().optional(),
  })
  .superRefine((data, ctx) => {
    // USL > LSL
    refineSpecLimits(data, ctx)

    // min_measurements cannot exceed subgroup_size
    if (
      data.subgroup_size !== undefined &&
      data.min_measurements > data.subgroup_size
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['min_measurements'],
        message: 'Cannot exceed subgroup size',
      })
    }

    // warn_below_count must be >= min_measurements when set
    if (
      data.warn_below_count !== undefined &&
      data.warn_below_count < data.min_measurements
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['warn_below_count'],
        message: 'Must be at least the minimum measurements value',
      })
    }

    // Validate sigma_method vs subgroup_size
    if (data.sigma_method && data.subgroup_size !== undefined) {
      if (data.sigma_method === 'moving_range' && data.subgroup_size > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sigma_method'],
          message: 'Moving range is only valid for subgroup size 1',
        })
      }
      if (
        (data.sigma_method === 'r_bar_d2' ||
          data.sigma_method === 's_bar_c4' ||
          data.sigma_method === 'pooled') &&
        data.subgroup_size === 1
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sigma_method'],
          message: 'This method requires subgroup size > 1',
        })
      }
    }
  })

export type CharacteristicFormData = z.infer<typeof characteristicFormSchema>

// ---------------------------------------------------------------------------
// AnnotationDialog
// ---------------------------------------------------------------------------

/** Point-mode annotation: just text + optional color. */
export const annotationPointSchema = z.object({
  mode: z.literal('point'),
  text: z
    .string()
    .min(1, 'Annotation text is required')
    .max(500, 'Annotation text must be 500 characters or less'),
  color: z.string(),
  sampleId: z.number().optional(),
})

/** Period-mode annotation: text + optional color + start < end. */
export const annotationPeriodSchema = z
  .object({
    mode: z.literal('period'),
    text: z
      .string()
      .min(1, 'Annotation text is required')
      .max(500, 'Annotation text must be 500 characters or less'),
    color: z.string(),
    startTime: z.date(),
    endTime: z.date(),
  })
  .refine((data) => data.startTime < data.endTime, {
    path: ['startTime'],
    message: 'Start time must be before end time',
  })

/** Discriminated union — use the matching schema based on mode. */
export const annotationSchema = z.discriminatedUnion('mode', [
  annotationPointSchema,
  annotationPeriodSchema,
])

export type AnnotationFormData = z.infer<typeof annotationSchema>
