import { useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleDot,
  FileText,
  Loader2,
  RefreshCcw,
  Send,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { usePlant } from '@/providers/PlantProvider'
import {
  useDeleteSopDoc,
  useReindexSopDoc,
  useSopDocs,
  useSopRagBudget,
  useSopRagQuery,
  useUploadSopDoc,
} from '@/api/hooks/sopRag'
import type { RagAnswer, RagRefusal, SopDoc } from '@/api/sopRag.api'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'

/**
 * SOP-grounded RAG page (Enterprise tier).
 *
 * Three panes:
 *  - Left: list of plant SOP docs with status + PII badge.
 *  - Top right: upload zone for new docs.
 *  - Bottom right: question box + cited answer with inline citation pills.
 */
export function SopRagPage() {
  const { selectedPlant } = usePlant()
  const plantId = selectedPlant?.id

  const docsQuery = useSopDocs(plantId)
  const budgetQuery = useSopRagBudget(plantId)
  const upload = useUploadSopDoc(plantId)
  const reindex = useReindexSopDoc(plantId)
  const remove = useDeleteSopDoc(plantId)
  const ask = useSopRagQuery(plantId)

  const [question, setQuestion] = useState('')
  const [pendingDelete, setPendingDelete] = useState<SopDoc | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const docs = docsQuery.data?.items ?? []
  const lastResult = ask.data ?? null

  const onUpload = (file: File) => {
    if (!plantId) return
    upload.mutate({ title: file.name.replace(/\.[^.]+$/, ''), file })
  }

  const onAsk = () => {
    if (!question.trim()) return
    ask.mutate({ question: question.trim() })
  }

  const citationsById = useMemo(() => {
    if (!lastResult || lastResult.refused) return new Map<number, RagAnswer['citations'][number]>()
    return new Map(lastResult.citations.map((c) => [c.chunk_id, c]))
  }, [lastResult])

  if (!plantId) {
    return (
      <div className="text-muted-foreground p-6">
        Select a plant to use SOP-grounded RAG.
      </div>
    )
  }

  return (
    <div data-ui="sop-rag-page" className="flex h-full min-h-0 flex-col">
      <header className="border-border bg-card flex items-center justify-between gap-4 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 rounded-lg p-2">
            <BookOpen className="text-primary h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">SOP-Grounded RAG</h1>
            <p className="text-muted-foreground text-sm">
              Ask the plant SOP corpus. Every answer is citation-locked to a
              chunk you uploaded — uncited claims are rejected.
            </p>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row">
      {/* Left pane — doc list + budget */}
      <div className="flex w-full flex-col gap-3 md:w-80">
        <div data-ui="sop-rag-corpus" className="bg-card rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BookOpen className="h-4 w-4" /> SOP corpus
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {docs.length} document{docs.length === 1 ? '' : 's'} for plant{' '}
            <span className="font-mono">{selectedPlant?.code}</span>.
          </div>
          <div className="mt-2 max-h-[60vh] space-y-1 overflow-y-auto">
            {docsQuery.isLoading && (
              <Loader2 className="mx-auto my-4 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {docs.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                onReindex={() => reindex.mutate(d.id)}
                onDelete={() => setPendingDelete(d)}
              />
            ))}
            {docs.length === 0 && !docsQuery.isLoading && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No documents yet. Upload one to start.
              </div>
            )}
          </div>
        </div>
        <BudgetCard
          plantId={plantId}
          monthlyCap={budgetQuery.data?.monthly_cap_usd ?? 0}
          spent={budgetQuery.data?.cost_usd ?? 0}
          queries={budgetQuery.data?.query_count ?? 0}
        />
      </div>

      {/* Right pane — upload + ask */}
      <div className="flex flex-1 flex-col gap-3">
        <div data-ui="sop-rag-upload" className="bg-card rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Upload className="h-4 w-4" /> Upload SOP / work-instruction
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            TXT, MD, PDF, DOCX up to 25 MB. Document is chunked, embedded
            locally, and indexed in the background. PII detection runs on
            the extracted text.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".txt,.md,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onUpload(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="bg-background hover:bg-accent mt-2 inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
            disabled={upload.isPending}
          >
            {upload.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Choose file
          </button>
        </div>

        <div data-ui="sop-rag-ask" className="bg-card flex flex-1 flex-col rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Send className="h-4 w-4" /> Ask the SOP corpus
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Every claim in the answer must cite a chunk from your indexed
            SOPs. Uncited or hallucinated answers are rejected.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  onAsk()
                }
              }}
              placeholder="What is the torque spec for the M6 bolt?"
              aria-label="SOP question"
              className="bg-background focus:ring-ring min-h-[36px] flex-1 rounded-md border px-3 py-1.5 text-sm focus:ring-2 focus:outline-none"
              disabled={ask.isPending}
            />
            <button
              type="button"
              onClick={onAsk}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              disabled={ask.isPending || !question.trim()}
            >
              {ask.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Ask
            </button>
          </div>

          <div className="mt-3 flex-1 overflow-y-auto">
            {!lastResult && !ask.isPending && (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Answers appear here with inline citations.
              </div>
            )}
            {lastResult?.refused && (
              <RefusalView refusal={lastResult as RagRefusal} />
            )}
            {lastResult && !lastResult.refused && (
              <AnswerView
                answer={lastResult as RagAnswer}
                citationsById={citationsById}
              />
            )}
          </div>
        </div>
      </div>

      </div>

      <DeleteConfirmDialog
        isOpen={pendingDelete != null}
        title="Delete SOP document?"
        message={
          pendingDelete
            ? `Permanently delete "${pendingDelete.title}" and its indexed chunks. Cannot be undone.`
            : ''
        }
        isPending={remove.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}

function DocRow({
  doc,
  onReindex,
  onDelete,
}: {
  doc: SopDoc
  onReindex: () => void
  onDelete: () => void
}) {
  return (
    <div data-ui="sop-doc-row" className="bg-background rounded-md border p-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1 truncate font-medium">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{doc.title}</span>
          </div>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-1">
            <StatusBadge status={doc.status} />
            <span>{doc.chunk_count} chunks</span>
          </div>
          {doc.pii_warning && (
            <div className="text-warning mt-0.5 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span title={doc.pii_match_summary ?? undefined}>
                PII detected: {doc.pii_match_summary}
              </span>
            </div>
          )}
          {doc.status === 'failed' && doc.status_message && (
            <div className="text-destructive mt-0.5 truncate" title={doc.status_message}>
              {doc.status_message}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onReindex}
            aria-label={`Re-index ${doc.title}`}
            title="Re-index"
            className="hover:bg-accent flex h-9 w-9 cursor-pointer items-center justify-center rounded-md"
          >
            <RefreshCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${doc.title}`}
            title="Delete"
            className="text-destructive hover:bg-destructive/10 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: SopDoc['status'] }) {
  if (status === 'ready') {
    return (
      <span className="text-success inline-flex items-center gap-0.5">
        <CheckCircle2 className="h-3 w-3" /> ready
      </span>
    )
  }
  if (status === 'indexing' || status === 'pending') {
    return (
      <span className="text-primary inline-flex items-center gap-0.5">
        <CircleDot className="h-3 w-3 animate-pulse" /> {status}
      </span>
    )
  }
  return (
    <span className="text-destructive inline-flex items-center gap-0.5">
      <XCircle className="h-3 w-3" /> failed
    </span>
  )
}

function BudgetCard({
  plantId,
  monthlyCap,
  spent,
  queries,
}: {
  plantId: number
  monthlyCap: number
  spent: number
  queries: number
}) {
  const remaining = Math.max(0, monthlyCap - spent)
  const pct = monthlyCap > 0 ? Math.min(100, (spent / monthlyCap) * 100) : 0
  return (
    <div data-ui="sop-rag-budget" className="bg-card rounded-lg border p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Budget (this month)</span>
        <span className="text-muted-foreground">{queries} queries</span>
      </div>
      <div
        className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.round(monthlyCap * 100)}
        aria-valuenow={Math.round(spent * 100)}
        aria-label="Monthly LLM spend"
      >
        <div
          className={`h-full ${pct >= 100 ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-muted-foreground mt-1 flex justify-between">
        <span>${spent.toFixed(2)} spent</span>
        <span>${remaining.toFixed(2)} left of ${monthlyCap.toFixed(2)}</span>
      </div>
      <div className="text-muted-foreground/70 mt-1 text-[10px]">plant #{plantId}</div>
    </div>
  )
}

function AnswerView({
  answer,
  citationsById,
}: {
  answer: RagAnswer
  citationsById: Map<number, RagAnswer['citations'][number]>
}) {
  return (
    <div className="space-y-3 text-sm">
      <div className="prose prose-sm dark:prose-invert prose-p:text-foreground/90 prose-strong:text-foreground prose-code:text-foreground prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-li:text-foreground/90 max-w-none space-y-1.5">
        {answer.sentences.map((s, i) => (
          <div key={i} className="leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Render sentence body inline so citation pills sit next to it.
                p: ({ children }) => <span>{children}</span>,
              }}
            >
              {stripCitations(s.text)}
            </ReactMarkdown>
            {s.chunk_ids.map((cid) => (
              <CitationPill key={cid} chunkId={cid} citation={citationsById.get(cid)} />
            ))}
          </div>
        ))}
      </div>
      <div className="border-t pt-2 text-xs text-muted-foreground">
        Model: {answer.model} · {answer.input_tokens} in / {answer.output_tokens} out · $
        {answer.cost_usd.toFixed(4)}
      </div>
    </div>
  )
}

function CitationPill({
  chunkId,
  citation,
}: {
  chunkId: number
  citation: RagAnswer['citations'][number] | undefined
}) {
  const tooltip = citation
    ? `${citation.doc_title}${citation.paragraph_label ? ' / ' + citation.paragraph_label : ''} — ${citation.text.slice(0, 200)}…`
    : `chunk ${chunkId}`
  return (
    <span
      data-ui="citation-pill"
      className="bg-primary/10 text-primary ml-1 inline-flex cursor-help rounded-sm px-1.5 py-0 align-middle text-[10px] font-medium"
      title={tooltip}
      aria-label={`Citation chunk ${chunkId}`}
    >
      {chunkId}
    </span>
  )
}

function RefusalView({ refusal }: { refusal: RagRefusal }) {
  return (
    <div className="rounded border border-destructive bg-destructive/5 p-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" /> Citation lock refused
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        Reason: <span className="font-mono">{refusal.reason}</span>
      </div>
      {refusal.failed_sentence && (
        <div className="mt-1 text-xs">
          Bad sentence: <em>"{refusal.failed_sentence}"</em>
        </div>
      )}
      <div className="mt-1 text-xs text-muted-foreground">{refusal.detail}</div>
    </div>
  )
}

function stripCitations(s: string): string {
  return s.replace(/\[citation:\d+\]/g, '').trim()
}
