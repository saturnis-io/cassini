import { Shield, Unlink, Loader2 } from 'lucide-react'
import { useOIDCAccountLinks, useDeleteAccountLink } from '@/api/hooks'

export function AccountLinkingPanel() {
  const { data: links, isLoading } = useOIDCAccountLinks()
  const unlinkMutation = useDeleteAccountLink()

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading linked accounts...
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Linked SSO Accounts</h3>
      </div>

      {!links || links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No SSO accounts linked.</p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">{link.provider_name}</div>
                <div className="text-xs text-muted-foreground">
                  Subject: {link.oidc_subject.length > 20 ? `${link.oidc_subject.substring(0, 20)}...` : link.oidc_subject}
                  {' \u00b7 '}
                  Linked {new Date(link.linked_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('Unlink this SSO account?')) {
                    unlinkMutation.mutate(link.id)
                  }
                }}
                disabled={unlinkMutation.isPending}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Unlink className="h-3.5 w-3.5" />
                Unlink
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
