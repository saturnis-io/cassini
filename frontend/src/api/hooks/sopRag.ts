import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { sopRagApi, type RagAnswer, type RagRefusal } from '../sopRag.api'
import { handleMutationError } from './utils'

export const sopRagKeys = {
  all: ['sop-rag'] as const,
  docList: (plantId: number) => ['sop-rag', 'docs', plantId] as const,
  docDetail: (docId: number) => ['sop-rag', 'doc', docId] as const,
  budget: (plantId: number) => ['sop-rag', 'budget', plantId] as const,
}

export function useSopDocs(plantId: number | undefined) {
  return useQuery({
    queryKey: sopRagKeys.docList(plantId ?? 0),
    queryFn: () => sopRagApi.listDocs(plantId as number),
    enabled: typeof plantId === 'number' && plantId > 0,
    refetchInterval: (q) => {
      const items = q.state.data?.items ?? []
      const hasInFlight = items.some((d) => d.status === 'pending' || d.status === 'indexing')
      return hasInFlight ? 2000 : false
    },
  })
}

export function useUploadSopDoc(plantId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ title, file }: { title: string; file: File }) => {
      if (!plantId) throw new Error('plantId is required')
      return sopRagApi.uploadDoc(plantId, title, file)
    },
    onSuccess: (data) => {
      if (plantId) qc.invalidateQueries({ queryKey: sopRagKeys.docList(plantId) })
      if (data.pii_warning) {
        toast.warning('PII detected in uploaded document', {
          description: data.pii_match_summary ?? 'Review before sharing.',
        })
      } else {
        toast.success('SOP uploaded — indexing in background')
      }
    },
    onError: handleMutationError,
  })
}

export function useReindexSopDoc(plantId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (docId: number) => sopRagApi.reindexDoc(docId),
    onSuccess: () => {
      if (plantId) qc.invalidateQueries({ queryKey: sopRagKeys.docList(plantId) })
      toast.success('Re-index queued')
    },
    onError: handleMutationError,
  })
}

export function useDeleteSopDoc(plantId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (docId: number) => sopRagApi.deleteDoc(docId),
    onSuccess: () => {
      if (plantId) qc.invalidateQueries({ queryKey: sopRagKeys.docList(plantId) })
      toast.success('SOP deleted')
    },
    onError: handleMutationError,
  })
}

export function useSopRagBudget(plantId: number | undefined) {
  return useQuery({
    queryKey: sopRagKeys.budget(plantId ?? 0),
    queryFn: () => sopRagApi.getBudget(plantId as number),
    enabled: typeof plantId === 'number' && plantId > 0,
  })
}

export function useSopRagQuery(plantId: number | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      question,
      topK = 8,
    }: {
      question: string
      topK?: number
    }): Promise<RagAnswer | RagRefusal> => {
      if (!plantId) throw new Error('plantId is required')
      return sopRagApi.query(plantId, question, topK)
    },
    onSuccess: () => {
      if (plantId) qc.invalidateQueries({ queryKey: sopRagKeys.budget(plantId) })
    },
    onError: handleMutationError,
  })
}
