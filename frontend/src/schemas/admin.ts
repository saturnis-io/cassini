import { z } from 'zod'

// ---------------------------------------------------------------------------
// Plant Settings
// ---------------------------------------------------------------------------

/** Schema for the "Add New Site" and "Edit Site" forms in PlantSettings. */
export const plantFormSchema = z.object({
  name: z.string().min(1, 'Site name is required'),
  code: z
    .string()
    .min(2, 'Code must be at least 2 characters')
    .max(10, 'Code must be at most 10 characters'),
  settings: z.string().optional(),
})

export type PlantFormData = z.infer<typeof plantFormSchema>

// ---------------------------------------------------------------------------
// Retention Policy
// ---------------------------------------------------------------------------

function unitToDays(value: number, unit: string): number {
  switch (unit) {
    case 'months':
      return value * 30
    case 'years':
      return value * 365
    default:
      return value
  }
}

/** Schema for the RetentionPolicyForm. Validates count/age ranges based on retention type. */
export const retentionPolicySchema = z
  .object({
    type: z.enum(['forever', 'sample_count', 'time_delta']),
    count: z.coerce.number(),
    ageValue: z.coerce.number(),
    ageUnit: z.enum(['days', 'months', 'years']),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'sample_count') {
      if (data.count < 10 || data.count > 1_000_000) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['count'],
          message: 'Must be between 10 and 1,000,000',
        })
      }
    }

    if (data.type === 'time_delta') {
      const totalDays = unitToDays(data.ageValue, data.ageUnit)
      if (totalDays < 1 || totalDays > 3650) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ageValue'],
          message: 'Must be between 1 day and 10 years',
        })
      }
    }
  })

export type RetentionPolicyData = z.infer<typeof retentionPolicySchema>

// ---------------------------------------------------------------------------
// Database Connection
// ---------------------------------------------------------------------------

/** Schema for DatabaseConnectionForm. Server dialects require host, port, and database name. */
export const databaseConnectionSchema = z
  .object({
    dialect: z.enum(['sqlite', 'postgresql', 'mysql', 'mssql']),
    host: z.string(),
    port: z.coerce.number(),
    database: z.string(),
    username: z.string(),
    password: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.dialect === 'sqlite') {
      // SQLite just needs a database path
      if (!data.database.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['database'],
          message: 'Database file path is required',
        })
      }
      return
    }

    // Server dialects: host, port, database required
    if (!data.host.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['host'],
        message: 'Host is required',
      })
    }

    if (data.port < 1 || data.port > 65535) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['port'],
        message: 'Port must be between 1 and 65535',
      })
    }

    if (!data.database.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['database'],
        message: 'Database name is required',
      })
    }
  })

export type DatabaseConnectionData = z.infer<typeof databaseConnectionSchema>
