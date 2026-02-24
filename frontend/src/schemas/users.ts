import { z } from 'zod'

/**
 * User form validation schema.
 *
 * Covers both create and edit modes:
 * - Create: username (min 3), password (min 8), confirmPassword must match
 * - Edit: password optional, but if provided confirmPassword must match
 *
 * The `mode` field is passed alongside form data so the schema
 * can conditionally enforce required fields.
 */
export const userFormSchema = z
  .object({
    mode: z.enum(['create', 'edit']),
    username: z.string(),
    email: z.string(),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((data, ctx) => {
    // Username required with min length in create mode
    if (data.mode === 'create') {
      if (!data.username || data.username.length < 3) {
        ctx.addIssue({
          code: 'custom',
          path: ['username'],
          message: 'Username must be at least 3 characters',
        })
      }

      if (!data.password || data.password.length < 8) {
        ctx.addIssue({
          code: 'custom',
          path: ['password'],
          message: 'Password must be at least 8 characters',
        })
      }
    }

    // If password is provided (either mode), confirmPassword must match
    if (data.password && data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      })
    }
  })

export type UserFormData = z.infer<typeof userFormSchema>
