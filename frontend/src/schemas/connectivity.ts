import { z } from 'zod'

// ---------------------------------------------------------------------------
// 1. MQTTServerForm — MQTT broker create/edit
// ---------------------------------------------------------------------------
export const mqttBrokerSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    host: z.string().min(1, 'Host is required'),
    port: z.coerce
      .number()
      .int()
      .min(1, 'Port must be 1-65535')
      .max(65535, 'Port must be 1-65535'),
    username: z.string(),
    password: z.string(),
    client_id: z.string(),
    keepalive: z.coerce
      .number()
      .int()
      .min(5, 'Keepalive must be 5-3600 seconds')
      .max(3600, 'Keepalive must be 5-3600 seconds'),
    use_tls: z.boolean(),
    tls_insecure: z.boolean().optional(),
    ca_cert_pem: z.string().nullable().optional(),
    client_cert_pem: z.string().nullable().optional(),
    client_key_pem: z.string().nullable().optional(),
    outbound_enabled: z.boolean(),
    outbound_topic_prefix: z.string(),
    outbound_format: z.enum(['json', 'sparkplug']),
    outbound_rate_limit: z.coerce
      .number()
      .min(0.1, 'Rate limit must be 0.1-60 seconds')
      .max(60, 'Rate limit must be 0.1-60 seconds'),
  })
  .refine(
    (data) => {
      const hasCert = !!data.client_cert_pem
      const hasKey = !!data.client_key_pem
      return hasCert === hasKey
    },
    {
      message: 'Client certificate and private key must both be provided or both be empty',
      path: ['client_key_pem'],
    },
  )

export type MQTTBrokerFormData = z.infer<typeof mqttBrokerSchema>

// ---------------------------------------------------------------------------
// 2. OPCUAServerForm — OPC-UA server create/edit
// ---------------------------------------------------------------------------
export const opcuaServerSchema = z
  .object({
    name: z.string().min(1, 'Name is required'),
    endpoint_url: z
      .string()
      .min(1, 'Endpoint URL is required')
      .regex(/^opc\.tcp:\/\//, 'Must start with opc.tcp://'),
    auth_mode: z.enum(['anonymous', 'username_password']),
    username: z.string(),
    password: z.string(),
    security_policy: z.string(),
    security_mode: z.string(),
    session_timeout: z.coerce
      .number()
      .int()
      .min(1000, 'Session timeout must be 1000-300000 ms')
      .max(300000, 'Session timeout must be 1000-300000 ms'),
    publishing_interval: z.coerce
      .number()
      .int()
      .min(50, 'Publishing interval must be 50-60000 ms')
      .max(60000, 'Publishing interval must be 50-60000 ms'),
    sampling_interval: z.coerce
      .number()
      .int()
      .min(10, 'Sampling interval must be 10-60000 ms')
      .max(60000, 'Sampling interval must be 10-60000 ms'),
    tls_insecure: z.boolean().optional(),
    ca_cert_pem: z.string().nullable().optional(),
    client_cert_pem: z.string().nullable().optional(),
    client_key_pem: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      const hasCert = !!data.client_cert_pem
      const hasKey = !!data.client_key_pem
      return hasCert === hasKey
    },
    {
      message: 'Client certificate and private key must both be provided or both be empty',
      path: ['client_key_pem'],
    },
  )

export type OPCUAServerFormData = z.infer<typeof opcuaServerSchema>

// ---------------------------------------------------------------------------
// 3. MappingDialog — DataSource mapping (MQTT or OPC-UA)
// ---------------------------------------------------------------------------
export const mappingDialogSchema = z.object({
  characteristicId: z.number({ error: 'Characteristic is required' }).int().positive('Characteristic is required'),
  protocol: z.enum(['mqtt', 'opcua']),
  triggerStrategy: z.string().min(1),
})

export type MappingDialogFormData = z.infer<typeof mappingDialogSchema>

// ---------------------------------------------------------------------------
// 4. QuickMapForm — lightweight mapping from Browse tab
// ---------------------------------------------------------------------------
export const quickMapSchema = z.object({
  characteristicId: z.number({ error: 'Characteristic is required' }).int().positive('Characteristic is required'),
  triggerStrategy: z.string().min(1),
})

export type QuickMapFormData = z.infer<typeof quickMapSchema>

// ---------------------------------------------------------------------------
// 5. GageBridgeRegisterDialog — register a new gage bridge
// ---------------------------------------------------------------------------
export const gageBridgeRegisterSchema = z.object({
  name: z.string().min(1, 'Bridge name is required').transform((v) => v.trim()),
})

export type GageBridgeRegisterFormData = z.infer<typeof gageBridgeRegisterSchema>

// ---------------------------------------------------------------------------
// 6. GagePortConfig — serial port configuration
// ---------------------------------------------------------------------------
export const gagePortSchema = z.object({
  port_name: z.string().min(1, 'Port name is required'),
  baud_rate: z.coerce.number().int().positive(),
  data_bits: z.coerce.number().int().min(5).max(8),
  parity: z.enum(['none', 'even', 'odd']),
  stop_bits: z.coerce.number(),
  protocol_profile: z.string(),
  parse_pattern: z.string().nullable(),
  characteristic_id: z.number().int().positive().nullable(),
  is_active: z.boolean(),
})

export type GagePortFormData = z.infer<typeof gagePortSchema>
