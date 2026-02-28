import { Lock, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function UpgradePage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          <Lock className="h-8 w-8 text-zinc-400" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          Commercial Feature
        </h1>
        <p className="mb-6 text-zinc-500">
          This feature is available in Cassini Commercial Edition. Upgrade to unlock enterprise
          features including electronic signatures, audit trail, advanced analytics, and more.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
          >
            Go Back
          </button>
          <a
            href="https://saturnis.io/cassini/pricing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            View Pricing
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )
}
