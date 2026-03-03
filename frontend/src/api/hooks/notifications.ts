import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useUIStore } from '@/stores/uiStore'
import { notificationApi } from '../notifications.api'
import { signatureApi } from '../signatures.api'
import { queryKeys, PENDING_APPROVALS_REFETCH_MS } from './queryKeys'
import { handleMutationError } from './utils'
import type {
  NotificationPreferenceItem,
  SmtpConfigUpdate,
  WebhookConfigCreate,
  WebhookConfigUpdate,
  SignRequest,
  RejectRequest,
  SignatureHistoryParams,
  WorkflowCreate,
  WorkflowUpdate,
  StepCreate,
  StepUpdate,
  MeaningCreate,
  MeaningUpdate,
} from '../client'

// -----------------------------------------------------------------------
// Notification hooks
// -----------------------------------------------------------------------

export function useSmtpConfig() {
  return useQuery({
    queryKey: queryKeys.notifications.smtp(),
    queryFn: notificationApi.getSmtp,
  })
}

export function useUpdateSmtpConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SmtpConfigUpdate) => notificationApi.updateSmtp(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.smtp() })
      toast.success('SMTP configuration saved')
    },
    onError: handleMutationError('Failed to save SMTP config'),
  })
}

export function useTestSmtp() {
  return useMutation({
    mutationFn: () => notificationApi.testSmtp(),
    onSuccess: (data) => {
      toast.success(data.message)
    },
    onError: handleMutationError('SMTP test failed'),
  })
}

export function useWebhooks() {
  return useQuery({
    queryKey: queryKeys.notifications.webhooks(),
    queryFn: notificationApi.listWebhooks,
  })
}

export function useCreateWebhook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: WebhookConfigCreate) => notificationApi.createWebhook(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.webhooks() })
      toast.success(`Webhook "${data.name}" created`)
    },
    onError: handleMutationError('Failed to create webhook'),
  })
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: WebhookConfigUpdate }) =>
      notificationApi.updateWebhook(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.webhooks() })
      toast.success('Webhook updated')
    },
    onError: handleMutationError('Failed to update webhook'),
  })
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: number) => notificationApi.deleteWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.webhooks() })
      toast.success('Webhook deleted')
    },
    onError: handleMutationError('Failed to delete webhook'),
  })
}

export function useTestWebhook() {
  return useMutation({
    mutationFn: (id: number) => notificationApi.testWebhook(id),
    onSuccess: (data) => {
      toast.success(data.message)
    },
    onError: handleMutationError('Webhook test failed'),
  })
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: queryKeys.notifications.preferences(),
    queryFn: notificationApi.getPreferences,
  })
}

export function useUpdateNotificationPreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (preferences: NotificationPreferenceItem[]) =>
      notificationApi.updatePreferences(preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.preferences() })
      toast.success('Notification preferences saved')
    },
    onError: handleMutationError('Failed to save notification preferences'),
  })
}

// -----------------------------------------------------------------------
// Electronic Signature hooks
// -----------------------------------------------------------------------

/** Get the active plant ID from the UI store (for use inside hooks) */
function useActivePlantId(): number | null {
  return useUIStore((s) => s.selectedPlantId)
}

export function useSignatures(resourceType: string, resourceId: number) {
  const plantId = useActivePlantId()
  return useQuery({
    queryKey: queryKeys.signatures.resource(resourceType, resourceId),
    queryFn: () => signatureApi.getResourceSignatures(plantId!, resourceType, resourceId),
    enabled: !!plantId && resourceId > 0 && resourceType.length > 0,
  })
}

export function useVerifySignature() {
  const plantId = useActivePlantId()
  return useMutation({
    mutationFn: (signatureId: number) => signatureApi.verify(plantId!, signatureId),
    onError: handleMutationError('Signature verification failed'),
  })
}

export function usePendingApprovals(plantId: number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.signatures.pending(plantId),
    queryFn: () => signatureApi.getPending(plantId!),
    enabled: !!plantId,
    refetchInterval: PENDING_APPROVALS_REFETCH_MS,
  })
}

export function useSign() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: (data: SignRequest) => signatureApi.sign(plantId!, data),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.signatures.resource(variables.resource_type, variables.resource_id),
      })
      toast.success(`Signed by ${result.full_name || result.signer_name}`)
    },
    onError: handleMutationError('Signature failed'),
  })
}

export function useRejectWorkflow() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: (data: RejectRequest) => signatureApi.reject(plantId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.all })
      toast.success('Workflow rejected')
    },
    onError: handleMutationError('Workflow rejection failed'),
  })
}

export function useSignatureHistory(params?: SignatureHistoryParams) {
  const plantId = useActivePlantId()
  return useQuery({
    queryKey: queryKeys.signatures.history(params),
    queryFn: () => signatureApi.getHistory(plantId!, params),
    enabled: !!plantId,
  })
}

// Workflow configuration hooks

export function useWorkflows() {
  const plantId = useActivePlantId()
  return useQuery({
    queryKey: queryKeys.signatures.workflows(),
    queryFn: () => signatureApi.getWorkflows(plantId!),
    enabled: !!plantId,
  })
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: (data: WorkflowCreate) => signatureApi.createWorkflow(plantId!, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.workflows() })
      toast.success(`Workflow "${data.name}" created`)
    },
    onError: handleMutationError('Failed to create workflow'),
  })
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: WorkflowUpdate }) =>
      signatureApi.updateWorkflow(plantId!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.workflows() })
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.pending() })
      toast.success('Workflow updated')
    },
    onError: handleMutationError('Failed to update workflow'),
  })
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: (id: number) => signatureApi.deleteWorkflow(plantId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.workflows() })
      toast.success('Workflow deleted')
    },
    onError: handleMutationError('Failed to delete workflow'),
  })
}

export function useWorkflowSteps(workflowId: number) {
  const plantId = useActivePlantId()
  return useQuery({
    queryKey: queryKeys.signatures.steps(workflowId),
    queryFn: () => signatureApi.getSteps(plantId!, workflowId),
    enabled: !!plantId && workflowId > 0,
  })
}

export function useCreateStep() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: ({ workflowId, data }: { workflowId: number; data: StepCreate }) =>
      signatureApi.createStep(plantId!, workflowId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.signatures.steps(variables.workflowId),
      })
      toast.success('Step added')
    },
    onError: handleMutationError('Failed to add step'),
  })
}

export function useUpdateStep() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: ({ stepId, data }: { stepId: number; data: StepUpdate }) =>
      signatureApi.updateStep(plantId!, stepId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.all })
      toast.success('Step updated')
    },
    onError: handleMutationError('Failed to update step'),
  })
}

export function useDeleteStep() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: (stepId: number) => signatureApi.deleteStep(plantId!, stepId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.all })
      toast.success('Step deleted')
    },
    onError: handleMutationError('Failed to delete step'),
  })
}

// Meaning hooks

export function useMeanings() {
  const plantId = useActivePlantId()
  return useQuery({
    queryKey: queryKeys.signatures.meanings(),
    queryFn: () => signatureApi.getMeanings(plantId!),
    enabled: !!plantId,
  })
}

export function useCreateMeaning() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: (data: MeaningCreate) => signatureApi.createMeaning(plantId!, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.meanings() })
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.all })
      toast.success(`Meaning "${data.display_name}" created`)
    },
    onError: handleMutationError('Failed to create meaning'),
  })
}

export function useUpdateMeaning() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MeaningUpdate }) =>
      signatureApi.updateMeaning(plantId!, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.meanings() })
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.all })
      toast.success('Meaning updated')
    },
    onError: handleMutationError('Failed to update meaning'),
  })
}

export function useDeleteMeaning() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: (id: number) => signatureApi.deleteMeaning(plantId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.meanings() })
      toast.success('Meaning removed')
    },
    onError: handleMutationError('Failed to remove meaning'),
  })
}

// Password policy hooks

export function usePasswordPolicy() {
  const plantId = useActivePlantId()
  return useQuery({
    queryKey: queryKeys.signatures.passwordPolicy(),
    queryFn: () => signatureApi.getPasswordPolicy(plantId!),
    enabled: !!plantId,
  })
}

export function useUpdatePasswordPolicy() {
  const queryClient = useQueryClient()
  const plantId = useActivePlantId()

  return useMutation({
    mutationFn: (data: Partial<Omit<import('@/types/signature').PasswordPolicy, 'id' | 'plant_id' | 'updated_at'>>) =>
      signatureApi.updatePasswordPolicy(plantId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.signatures.passwordPolicy() })
      toast.success('Password policy updated')
    },
    onError: handleMutationError('Failed to update password policy'),
  })
}
