import type {
  ElectronicSignature,
  SignatureMeaning,
  SignatureWorkflow,
  SignatureWorkflowStep,
  PasswordPolicy,
  SignResponse,
  VerifyResponse,
  PendingApproval,
} from '@/types/signature'
import type {
  SignRequest,
  RejectRequest,
  SignatureHistoryParams,
  WorkflowCreate,
  WorkflowUpdate,
  StepCreate,
  StepUpdate,
  MeaningCreate,
  MeaningUpdate,
} from './client'
import { fetchApi } from './client'

/** Append plant_id query param to a path */
function _pq(path: string, plantId: number): string {
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}plant_id=${plantId}`
}

export const signatureApi = {
  // Core signing
  sign: (plantId: number, data: SignRequest) =>
    fetchApi<SignResponse>(_pq('/signatures/sign', plantId), {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  reject: (plantId: number, data: RejectRequest) =>
    fetchApi<{ message: string }>(_pq('/signatures/reject', plantId), {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getResourceSignatures: (plantId: number, resourceType: string, resourceId: number) =>
    fetchApi<ElectronicSignature[]>(_pq(`/signatures/resource/${resourceType}/${resourceId}`, plantId)),

  verify: (plantId: number, signatureId: number) =>
    fetchApi<VerifyResponse>(_pq(`/signatures/verify/${signatureId}`, plantId)),

  getPending: (plantId: number) =>
    fetchApi<{ items: PendingApproval[]; total: number }>(`/signatures/pending?plant_id=${plantId}`),

  getHistory: (plantId: number, params?: SignatureHistoryParams) => {
    const searchParams = new URLSearchParams()
    searchParams.set('plant_id', String(plantId))
    if (params?.resource_type) searchParams.set('resource_type', params.resource_type)
    if (params?.user_id) searchParams.set('user_id', String(params.user_id))
    if (params?.start_date) searchParams.set('start_date', params.start_date)
    if (params?.end_date) searchParams.set('end_date', params.end_date)
    searchParams.set('limit', String(params?.limit ?? 50))
    searchParams.set('offset', String(params?.offset ?? 0))
    const query = searchParams.toString()
    return fetchApi<{ items: ElectronicSignature[]; total: number }>(`/signatures/history?${query}`)
  },

  // Workflow configuration
  getWorkflows: (plantId: number) =>
    fetchApi<SignatureWorkflow[]>(_pq('/signatures/workflows', plantId)),

  createWorkflow: (plantId: number, data: WorkflowCreate) =>
    fetchApi<SignatureWorkflow>(_pq('/signatures/workflows', plantId), {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateWorkflow: (plantId: number, id: number, data: WorkflowUpdate) =>
    fetchApi<SignatureWorkflow>(_pq(`/signatures/workflows/${id}`, plantId), {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteWorkflow: (plantId: number, id: number) =>
    fetchApi<void>(_pq(`/signatures/workflows/${id}`, plantId), { method: 'DELETE' }),

  getSteps: (plantId: number, workflowId: number) =>
    fetchApi<SignatureWorkflowStep[]>(_pq(`/signatures/workflows/${workflowId}/steps`, plantId)),

  createStep: (plantId: number, workflowId: number, data: StepCreate) =>
    fetchApi<SignatureWorkflowStep>(_pq(`/signatures/workflows/${workflowId}/steps`, plantId), {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStep: (plantId: number, stepId: number, data: StepUpdate) =>
    fetchApi<SignatureWorkflowStep>(_pq(`/signatures/workflows/steps/${stepId}`, plantId), {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteStep: (plantId: number, stepId: number) =>
    fetchApi<void>(_pq(`/signatures/workflows/steps/${stepId}`, plantId), { method: 'DELETE' }),

  // Meanings
  getMeanings: (plantId: number) =>
    fetchApi<SignatureMeaning[]>(_pq('/signatures/meanings', plantId)),

  createMeaning: (plantId: number, data: MeaningCreate) =>
    fetchApi<SignatureMeaning>(_pq('/signatures/meanings', plantId), {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateMeaning: (plantId: number, id: number, data: MeaningUpdate) =>
    fetchApi<SignatureMeaning>(_pq(`/signatures/meanings/${id}`, plantId), {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteMeaning: (plantId: number, id: number) =>
    fetchApi<void>(_pq(`/signatures/meanings/${id}`, plantId), { method: 'DELETE' }),

  // Password policy
  getPasswordPolicy: (plantId: number) =>
    fetchApi<PasswordPolicy | null>(_pq('/signatures/password-policy', plantId)),

  updatePasswordPolicy: (plantId: number, data: Partial<Omit<PasswordPolicy, 'id' | 'plant_id' | 'updated_at'>>) =>
    fetchApi<PasswordPolicy>(_pq('/signatures/password-policy', plantId), {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
}
