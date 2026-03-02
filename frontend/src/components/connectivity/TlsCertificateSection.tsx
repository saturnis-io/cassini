import { ShieldCheck, Replace, Trash2 } from 'lucide-react'
import { HelpTooltip } from '@/components/HelpTooltip'
import { FieldError } from '@/components/FieldError'
import { cn } from '@/lib/utils'

export type CertAction = 'keep' | 'replace' | 'remove'

interface TlsCertificateSectionProps {
  hasCaCert: boolean
  hasClientCert: boolean
  caCertPem: string
  clientCertPem: string
  clientKeyPem: string
  tlsInsecure: boolean
  caCertAction: CertAction
  clientCertAction: CertAction
  onChange: (field: string, value: string | boolean) => void
  onCaCertAction: (action: CertAction) => void
  onClientCertAction: (action: CertAction) => void
  getError: (field: string) => string | undefined
  isEditing: boolean
}

export function TlsCertificateSection({
  hasCaCert,
  hasClientCert,
  caCertPem,
  clientCertPem,
  clientKeyPem,
  tlsInsecure,
  caCertAction,
  clientCertAction,
  onChange,
  onCaCertAction,
  onClientCertAction,
  getError,
  isEditing,
}: TlsCertificateSectionProps) {
  const showCaCertInput = !isEditing || !hasCaCert || caCertAction === 'replace'
  const showClientCertInput =
    !isEditing || !hasClientCert || clientCertAction === 'replace'

  return (
    <div className="border-border border-t pt-5">
      <div className="mb-4">
        <h4 className="text-sm font-semibold">TLS Certificates</h4>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Configure CA and client certificates for secure connections
        </p>
      </div>

      {/* CA Certificate */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center gap-2">
          <label className="text-sm font-medium">
            CA Certificate{' '}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <HelpTooltip helpKey="tls-ca-cert" placement="right" />
        </div>

        {isEditing && hasCaCert && caCertAction === 'keep' ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              CA certificate uploaded
            </span>
            <button
              type="button"
              onClick={() => onCaCertAction('replace')}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
            >
              <Replace className="h-3 w-3" />
              Replace
            </button>
            <button
              type="button"
              onClick={() => onCaCertAction('remove')}
              className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-xs transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </button>
          </div>
        ) : isEditing && hasCaCert && caCertAction === 'remove' ? (
          <div className="flex items-center gap-3">
            <span className="text-destructive text-xs font-medium">
              Certificate will be removed on save
            </span>
            <button
              type="button"
              onClick={() => onCaCertAction('keep')}
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              Undo
            </button>
          </div>
        ) : null}

        {showCaCertInput && (
          <div>
            {isEditing && hasCaCert && (
              <button
                type="button"
                onClick={() => onCaCertAction('keep')}
                className="text-muted-foreground hover:text-foreground mb-1.5 text-xs transition-colors"
              >
                Cancel replacement
              </button>
            )}
            <textarea
              value={caCertPem}
              onChange={(e) => onChange('ca_cert_pem', e.target.value)}
              className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed transition-colors focus:ring-2"
              rows={4}
              placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDxTCCAq2gAwIBAgIQ...&#10;-----END CERTIFICATE-----"
            />
            <FieldError error={getError('ca_cert_pem')} />
          </div>
        )}
      </div>

      {/* Client Certificate & Private Key (Mutual TLS) */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center gap-2">
          <label className="text-sm font-medium">
            Mutual TLS{' '}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <HelpTooltip helpKey="tls-client-cert" placement="right" />
        </div>

        {isEditing && hasClientCert && clientCertAction === 'keep' ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              Client certificate uploaded
            </span>
            <button
              type="button"
              onClick={() => onClientCertAction('replace')}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs transition-colors"
            >
              <Replace className="h-3 w-3" />
              Replace
            </button>
            <button
              type="button"
              onClick={() => onClientCertAction('remove')}
              className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-xs transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </button>
          </div>
        ) : isEditing && hasClientCert && clientCertAction === 'remove' ? (
          <div className="flex items-center gap-3">
            <span className="text-destructive text-xs font-medium">
              Client certificate will be removed on save
            </span>
            <button
              type="button"
              onClick={() => onClientCertAction('keep')}
              className="text-muted-foreground hover:text-foreground text-xs transition-colors"
            >
              Undo
            </button>
          </div>
        ) : null}

        {showClientCertInput && (
          <div>
            {isEditing && hasClientCert && (
              <button
                type="button"
                onClick={() => onClientCertAction('keep')}
                className="text-muted-foreground hover:text-foreground mb-1.5 text-xs transition-colors"
              >
                Cancel replacement
              </button>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-muted-foreground mb-1 block text-xs">
                  Client Certificate
                </label>
                <textarea
                  value={clientCertPem}
                  onChange={(e) => onChange('client_cert_pem', e.target.value)}
                  className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed transition-colors focus:ring-2"
                  rows={4}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDxTCCAq2gAwIBAgIQ...&#10;-----END CERTIFICATE-----"
                />
                <FieldError error={getError('client_cert_pem')} />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5">
                  <label className="text-muted-foreground text-xs">Private Key</label>
                  <HelpTooltip helpKey="tls-client-key" placement="right" />
                </div>
                <textarea
                  value={clientKeyPem}
                  onChange={(e) => onChange('client_key_pem', e.target.value)}
                  className="bg-background border-input focus:ring-primary/20 focus:border-primary w-full rounded-lg border px-3 py-2 font-mono text-xs leading-relaxed transition-colors focus:ring-2"
                  rows={4}
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;MIIEvgIBADANBgkqhkiG...&#10;-----END PRIVATE KEY-----"
                />
                <FieldError error={getError('client_key_pem')} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Skip Certificate Verification */}
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id="tls_insecure"
          checked={tlsInsecure}
          onChange={(e) => onChange('tls_insecure', e.target.checked)}
          className={cn('border-input mt-0.5 rounded', tlsInsecure && 'accent-warning')}
        />
        <div>
          <label htmlFor="tls_insecure" className="text-sm">
            Skip certificate verification
          </label>
          <div className="flex items-center gap-1.5">
            <p className="text-warning text-xs">
              Only for testing with self-signed certificates
            </p>
            <HelpTooltip helpKey="tls-insecure" placement="right" />
          </div>
        </div>
      </div>
    </div>
  )
}
