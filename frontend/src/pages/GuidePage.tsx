import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react'

export function GuidePage() {
  const { seedKey } = useParams<{ seedKey: string }>()
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!seedKey) return
    setLoading(true)
    setError(null)
    fetch(`/guides/${seedKey}.md`)
      .then((res) => {
        if (!res.ok) throw new Error(`Guide not found (${res.status})`)
        return res.text()
      })
      .then((text) => {
        setContent(text)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load guide')
        setLoading(false)
      })
  }, [seedKey])

  if (loading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          <p className="text-muted-foreground text-sm">Loading guide...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <div className="bg-destructive/10 rounded-full p-3">
            <AlertCircle className="text-destructive h-8 w-8" />
          </div>
          <h1 className="text-foreground text-xl font-semibold">Guide Not Found</h1>
          <p className="text-muted-foreground text-sm">{error}</p>
          <Link
            to="/dev-tools"
            className="text-primary hover:text-primary/80 flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dev Tools
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Link
          to="/dev-tools"
          className="text-muted-foreground hover:text-foreground mb-6 inline-flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dev Tools
        </Link>

        <article className="prose prose-sm dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-a:text-primary prose-code:text-foreground prose-code:bg-muted prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-blockquote:border-primary/30 prose-blockquote:text-muted-foreground prose-li:text-foreground/90 prose-th:text-foreground prose-td:text-foreground/90 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content ?? ''}</ReactMarkdown>
        </article>
      </div>
    </div>
  )
}
