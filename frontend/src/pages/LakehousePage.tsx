import { useEffect, useMemo, useState } from 'react'
import { Database, Download, Copy, AlertCircle, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { usePlant } from '@/providers/PlantProvider'
import { useLicense } from '@/hooks/useLicense'
import {
  buildLakehouseExportUrl,
  curlSnippet,
  downloadLakehouseExport,
  getLakehouseCatalog,
  pythonSnippet,
  type LakehouseExportParams,
  type LakehouseFormat,
  type LakehouseTableInfo,
} from '@/api/lakehouse.api'

const FORMATS: { value: LakehouseFormat; label: string; helper: string }[] = [
  { value: 'arrow', label: 'Arrow IPC', helper: 'Streaming, columnar, native to pyarrow.' },
  { value: 'parquet', label: 'Parquet', helper: 'Compressed file. pandas + pyarrow read it directly.' },
  { value: 'csv', label: 'CSV', helper: 'Plain text, widest compatibility.' },
  { value: 'json', label: 'JSON', helper: 'Inline metadata + rows for ad-hoc inspection.' },
]

export function LakehousePage() {
  // The /lakehouse route is wrapped in <RequiresTier tier="pro"> in App.tsx,
  // so non-Pro users never reach this component. We still call useLicense()
  // for the initial-load gate so we don't fire the catalog query before the
  // license has been resolved.
  const { isProOrAbove, loaded } = useLicense()
  const { selectedPlant } = usePlant()

  const [format, setFormat] = useState<LakehouseFormat>('parquet')
  const [tableName, setTableName] = useState<string>('samples')
  const [scopeToPlant, setScopeToPlant] = useState<boolean>(true)
  const [downloading, setDownloading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'curl' | 'python' | null>(null)

  const catalogQuery = useQuery({
    queryKey: ['lakehouse', 'catalog'],
    queryFn: getLakehouseCatalog,
    enabled: loaded && isProOrAbove,
  })

  // Default to the first available table once the catalog loads.
  useEffect(() => {
    if (catalogQuery.data && !catalogQuery.data.tables.find((t) => t.name === tableName)) {
      const first = catalogQuery.data.tables[0]
      if (first) setTableName(first.name)
    }
  }, [catalogQuery.data, tableName])

  const selectedTable: LakehouseTableInfo | undefined = useMemo(() => {
    return catalogQuery.data?.tables.find((t) => t.name === tableName)
  }, [catalogQuery.data, tableName])

  const exportParams: LakehouseExportParams = useMemo(
    () => ({
      table: tableName,
      format,
      plantId: scopeToPlant ? selectedPlant?.id ?? null : null,
    }),
    [tableName, format, scopeToPlant, selectedPlant?.id],
  )

  const baseUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://factory:8000'

  const curlText = curlSnippet(exportParams, baseUrl)
  const pythonText = pythonSnippet(exportParams, baseUrl)

  if (!loaded || !isProOrAbove) {
    // The route-level <RequiresTier> guards the page, so this branch only
    // covers the brief window before useLicense() resolves.
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    )
  }

  const handleDownload = async () => {
    setError(null)
    setDownloading(true)
    try {
      await downloadLakehouseExport(exportParams)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setDownloading(false)
    }
  }

  const handleCopy = async (which: 'curl' | 'python', text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      // Clipboard API can be blocked in iframes / insecure contexts.
      setError('Clipboard access blocked. Select the snippet manually to copy.')
    }
  }

  const exportUrl = buildLakehouseExportUrl(exportParams)

  return (
    <div data-ui="lakehouse-page" className="flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 rounded-lg p-2">
          <Database className="text-primary h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Cassini Lakehouse</h1>
          <p className="text-muted-foreground text-sm">
            Read-only data product API. Plant-scoped exports for downstream analytics.
          </p>
        </div>
      </div>

      <div className="border-border bg-card grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-foreground text-sm font-medium">Table</label>
          <select
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            className="border-input bg-background text-foreground rounded-md border px-3 py-2 text-sm"
            disabled={catalogQuery.isLoading || !catalogQuery.data}
          >
            {catalogQuery.data?.tables.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          {selectedTable && (
            <p className="text-muted-foreground text-xs">{selectedTable.description}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-foreground text-sm font-medium" id="lakehouse-format-label">
            Format
          </label>
          <div
            role="radiogroup"
            aria-labelledby="lakehouse-format-label"
            className="grid grid-cols-2 gap-2"
          >
            {FORMATS.map((f) => {
              const selected = format === f.value
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${f.label} format`}
                  onClick={() => setFormat(f.value)}
                  className={
                    selected
                      ? 'border-primary bg-primary/10 text-primary rounded-md border px-3 py-2 text-sm font-medium'
                      : 'border-input bg-background text-foreground hover:bg-accent rounded-md border px-3 py-2 text-sm'
                  }
                >
                  {f.label}
                </button>
              )
            })}
          </div>
          <p className="text-muted-foreground text-xs">
            {FORMATS.find((f) => f.value === format)?.helper}
          </p>
        </div>

        {selectedTable?.plant_scoped && selectedPlant && (
          <label className="text-foreground flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={scopeToPlant}
              onChange={(e) => setScopeToPlant(e.target.checked)}
              className="border-input h-4 w-4"
            />
            Scope to {selectedPlant.name}
          </label>
        )}

        {selectedTable && (
          <div className="md:col-span-2">
            <label className="text-foreground text-sm font-medium">Columns</label>
            <p className="text-muted-foreground text-xs">
              {selectedTable.columns.join(', ')}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download {format.toUpperCase()}
        </button>
        {catalogQuery.data && (
          <span className="text-muted-foreground text-xs">
            Rate limit: {catalogQuery.data.rate_limit}
          </span>
        )}
      </div>

      {error && (
        <div className="border-destructive/50 bg-destructive/10 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-4">
        <p className="text-foreground text-sm font-medium">Export URL</p>
        <code className="text-muted-foreground bg-muted block break-all rounded px-2 py-1.5 text-xs">
          {exportUrl}
        </code>
      </div>

      <SnippetBlock
        label="curl"
        body={curlText}
        copied={copied === 'curl'}
        onCopy={() => handleCopy('curl', curlText)}
      />
      <SnippetBlock
        label="python"
        body={pythonText}
        copied={copied === 'python'}
        onCopy={() => handleCopy('python', pythonText)}
      />
    </div>
  )
}

interface SnippetBlockProps {
  label: string
  body: string
  copied: boolean
  onCopy: () => void
}

function SnippetBlock({ label, body, copied, onCopy }: SnippetBlockProps) {
  return (
    <div className="border-border bg-card flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <p className="text-foreground text-sm font-medium">{label}</p>
        <button
          type="button"
          onClick={onCopy}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-muted text-foreground overflow-x-auto rounded p-3 text-xs">
        {body}
      </pre>
    </div>
  )
}
