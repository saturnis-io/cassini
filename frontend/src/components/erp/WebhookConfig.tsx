import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import type { ERPConnector } from '@/api/erp.api'
import { API_BASE } from '@/api/client'

/**
 * WebhookConfig - Display webhook URL and HMAC info for webhook-type connectors.
 * Shows the endpoint URL, a curl example, and copy-to-clipboard buttons.
 */
export function WebhookConfig({ connector }: { connector: ERPConnector }) {
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const webhookUrl = `${window.location.origin}${API_BASE}/erp/connectors/${connector.id}/webhook`

  const curlExample = `curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Webhook-Signature: sha256=<hmac_hex>" \\
  -d '{"event": "inspection_result", "data": {...}}'`

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <button
      onClick={() => copyToClipboard(text, field)}
      className="text-muted-foreground hover:text-foreground shrink-0"
      title="Copy to clipboard"
    >
      {copiedField === field ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <ExternalLink className="text-muted-foreground h-3.5 w-3.5" />
        <h4 className="text-xs font-semibold uppercase tracking-wider">
          Webhook Configuration
        </h4>
      </div>

      {/* Webhook URL */}
      <div>
        <label className="text-muted-foreground text-[10px] font-medium uppercase">
          Endpoint URL
        </label>
        <div className="mt-1 flex items-center gap-2">
          <code className="bg-muted flex-1 truncate rounded px-2 py-1.5 font-mono text-xs">
            {webhookUrl}
          </code>
          <CopyButton text={webhookUrl} field="url" />
        </div>
      </div>

      {/* HMAC info */}
      <div>
        <label className="text-muted-foreground text-[10px] font-medium uppercase">
          HMAC Signature
        </label>
        <p className="text-muted-foreground mt-1 text-xs">
          Requests must include an{' '}
          <code className="bg-muted rounded px-1 py-0.5 text-[10px]">
            X-Webhook-Signature
          </code>{' '}
          header with the HMAC-SHA256 hex digest of the request body. The HMAC
          secret was shown once during connector creation.
        </p>
      </div>

      {/* Method and Content-Type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-muted-foreground text-[10px] font-medium uppercase">
            Method
          </label>
          <div className="bg-muted mt-1 rounded px-2 py-1.5 text-xs font-medium">
            POST
          </div>
        </div>
        <div>
          <label className="text-muted-foreground text-[10px] font-medium uppercase">
            Content-Type
          </label>
          <div className="bg-muted mt-1 rounded px-2 py-1.5 font-mono text-xs">
            application/json
          </div>
        </div>
      </div>

      {/* Example curl */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-muted-foreground text-[10px] font-medium uppercase">
            Example Request
          </label>
          <CopyButton text={curlExample} field="curl" />
        </div>
        <pre className="bg-muted mt-1 max-h-32 overflow-auto rounded p-2 font-mono text-[10px] leading-relaxed">
          {curlExample}
        </pre>
      </div>
    </div>
  )
}
