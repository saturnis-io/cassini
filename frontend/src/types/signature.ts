export interface ElectronicSignature {
  id: number
  user_id: number
  username: string
  full_name: string | null
  timestamp: string
  meaning_code: string
  meaning_display: string
  resource_type: string
  resource_id: number
  resource_hash: string
  signature_hash: string
  ip_address: string | null
  workflow_step_id: number | null
  comment: string | null
  is_valid: boolean
  invalidated_at: string | null
  invalidated_reason: string | null
}

export interface SignatureMeaning {
  id: number
  plant_id: number
  code: string
  display_name: string
  description: string | null
  requires_comment: boolean
  is_active: boolean
  sort_order: number
}

export interface SignatureWorkflow {
  id: number
  plant_id: number
  name: string
  resource_type: string
  is_active: boolean
  is_required: boolean
  description: string | null
  created_at: string
  updated_at: string
}

export interface SignatureWorkflowStep {
  id: number
  workflow_id: number
  step_order: number
  name: string
  min_role: string
  meaning_code: string
  is_required: boolean
  allow_self_sign: boolean
  timeout_hours: number | null
}

export interface SignatureWorkflowInstance {
  id: number
  workflow_id: number
  resource_type: string
  resource_id: number
  status: 'pending' | 'in_progress' | 'completed' | 'rejected' | 'expired'
  current_step: number
  initiated_by: number | null
  initiated_at: string
  completed_at: string | null
  expires_at: string | null
}

export interface PasswordPolicy {
  id: number
  plant_id: number
  password_expiry_days: number
  max_failed_attempts: number
  lockout_duration_minutes: number
  min_password_length: number
  require_uppercase: boolean
  require_lowercase: boolean
  require_digit: boolean
  require_special: boolean
  password_history_count: number
  session_timeout_minutes: number
  signature_timeout_minutes: number
  updated_at: string
}

export interface SignResponse {
  signature_id: number
  signer_name: string
  full_name: string | null
  timestamp: string
  meaning: string
  resource_hash: string
  signature_hash: string
  workflow_status: string | null
  workflow_step: string | null
}

export interface VerifyResponse {
  signature_id: number
  is_valid: boolean
  signer_name: string
  full_name: string | null
  timestamp: string
  meaning: string
  resource_type: string
  resource_id: number
  stored_hash: string
  current_hash: string
  hash_match: boolean
  signature_chain_valid: boolean
}

export interface PendingApproval {
  workflow_instance_id: number
  workflow_name: string
  resource_type: string
  resource_id: number
  resource_summary: string
  current_step: string
  step_number: number
  total_steps: number
  initiated_by: string
  initiated_at: string
  expires_at: string | null
  step_meaning_code: string | null
  previous_signatures: {
    step: string
    signer: string
    timestamp: string
    meaning: string
  }[]
}
