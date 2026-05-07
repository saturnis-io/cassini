import { fetchApi, getAccessToken, setAccessToken, API_BASE } from './client'

// ---- Types mirroring backend Pydantic schemas ----

export type SopDocStatusLiteral = 'pending' | 'indexing' | 'ready' | 'failed'

export interface SopDoc {
  id: number
  plant_id: number
  title: string
  filename: string
  content_type: string
  byte_size: number
  char_count: number
  chunk_count: number
  embedding_model: string | null
  status: SopDocStatusLiteral
  status_message: string | null
  pii_warning: boolean
  pii_match_summary: string | null
  uploaded_by: number | null
  created_at: string
  updated_at: string | null
}

export interface SopDocStatus {
  id: number
  status: SopDocStatusLiteral
  pii_warning: boolean
  pii_match_summary: string | null
}

export interface SopDocListResponse {
  items: SopDoc[]
  total: number
}

export interface RagCitation {
  chunk_id: number
  doc_id: number
  doc_title: string
  chunk_index: number
  paragraph_label: string | null
  text: string
  score: number
}

export interface RagAnswer {
  refused: false
  answer: string
  answer_stripped: string
  citations: RagCitation[]
  sentences: { text: string; chunk_ids: number[] }[]
  candidate_chunk_ids: number[]
  cost_usd: number
  input_tokens: number
  output_tokens: number
  model: string
}

export interface RagRefusal {
  refused: true
  reason: 'uncited_sentence' | 'out_of_set' | 'cross_plant' | 'no_relevant_chunks' | 'budget_exceeded'
  failed_sentence: string | null
  failed_chunk_id: number | null
  detail: string
}

export interface RagBudget {
  plant_id: number
  year_month: string
  monthly_cap_usd: number
  cost_usd: number
  query_count: number
  remaining_usd: number
}

// ---- API surface ----

export const sopRagApi = {
  listDocs: (plantId: number) =>
    fetchApi<SopDocListResponse>(`/sop-rag/docs?plant_id=${plantId}`),

  getDoc: (docId: number) =>
    fetchApi<SopDoc>(`/sop-rag/docs/${docId}`),

  uploadDoc: (plantId: number, title: string, file: File) => {
    const fd = new FormData()
    fd.append('plant_id', String(plantId))
    fd.append('title', title)
    fd.append('file', file)
    return fetchApi<SopDocStatus>('/sop-rag/docs', {
      method: 'POST',
      body: fd,
    })
  },

  reindexDoc: (docId: number) =>
    fetchApi<SopDocStatus>(`/sop-rag/docs/${docId}/reindex`, { method: 'POST' }),

  deleteDoc: (docId: number) =>
    fetchApi<void>(`/sop-rag/docs/${docId}`, { method: 'DELETE' }),

  query: async (
    plantId: number,
    question: string,
    topK = 8,
  ): Promise<RagAnswer | RagRefusal> => {
    // Direct fetch so we can handle 402 / 422 refusal payloads as data,
    // not as thrown Errors that strip the structured detail. We still need
    // to honor the same auto-refresh behaviour fetchApi provides — do one
    // 401 retry against /auth/refresh before giving up.
    const url = `${API_BASE}/sop-rag/query?plant_id=${plantId}`
    const buildHeaders = () => {
      const tok = getAccessToken()
      const h: Record<string, string> = { 'Content-Type': 'application/json' }
      if (tok) h.Authorization = `Bearer ${tok}`
      return h
    }
    const send = () =>
      fetch(url, {
        method: 'POST',
        headers: buildHeaders(),
        credentials: 'include',
        body: JSON.stringify({ question, top_k: topK }),
      })

    let r = await send()
    if (r.status === 401) {
      // Token expired mid-flight; refresh once then retry.
      const refresh = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      if (refresh.ok) {
        const data = (await refresh.json()) as { access_token: string }
        setAccessToken(data.access_token)
        r = await send()
      } else {
        setAccessToken(null)
        window.dispatchEvent(new CustomEvent('auth:logout'))
        throw new Error('Session expired')
      }
    }

    const body = await r.json().catch(() => null)
    if (r.ok) return body as RagAnswer
    if ((r.status === 422 || r.status === 402) && body?.detail?.refused) {
      return body.detail as RagRefusal
    }
    throw new Error(body?.detail || `HTTP ${r.status}`)
  },

  getBudget: (plantId: number) =>
    fetchApi<RagBudget>(`/sop-rag/budget?plant_id=${plantId}`),

  setBudget: (plantId: number, monthlyCapUsd: number) =>
    fetchApi<RagBudget>(`/sop-rag/budget?plant_id=${plantId}`, {
      method: 'PUT',
      body: JSON.stringify({ monthly_cap_usd: monthlyCapUsd }),
    }),
}
