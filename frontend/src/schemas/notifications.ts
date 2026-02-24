import { z } from 'zod'

// ---------------------------------------------------------------------------
// 1. SmtpSection — SMTP server configuration
// ---------------------------------------------------------------------------
export const smtpConfigSchema = z.object({
  server: z.string().min(1, 'SMTP server is required'),
  port: z.coerce
    .number()
    .int()
    .min(1, 'Port must be 1-65535')
    .max(65535, 'Port must be 1-65535'),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  use_tls: z.boolean(),
  from_address: z.string().min(1, 'From address is required').email('Must be a valid email address'),
  is_active: z.boolean(),
})

export type SmtpConfigFormData = z.infer<typeof smtpConfigSchema>

// ---------------------------------------------------------------------------
// 2. WebhookSection — Webhook create form
// ---------------------------------------------------------------------------
export const webhookCreateSchema = z.object({
  name: z.string().min(1, 'Webhook name is required'),
  url: z.string().min(1, 'URL is required').url('Must be a valid URL'),
  secret: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  retry_count: z.coerce
    .number()
    .int()
    .min(0, 'Retry count must be 0-10')
    .max(10, 'Retry count must be 0-10')
    .optional(),
  events_filter: z.array(z.string()).nullable().optional(),
})

export type WebhookCreateFormData = z.infer<typeof webhookCreateSchema>
