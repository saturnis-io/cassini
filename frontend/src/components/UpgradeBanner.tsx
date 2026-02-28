import { Lock } from 'lucide-react'

interface UpgradeBannerProps {
  feature: string
  description?: string
}

export function UpgradeBanner({ feature, description }: UpgradeBannerProps) {
  return (
    <div className="flex items-center gap-3 rounded border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <Lock className="h-5 w-5 shrink-0 text-zinc-400" />
      <div>
        <p className="font-medium text-zinc-700 dark:text-zinc-300">
          {feature} — Commercial Edition
        </p>
        {description && (
          <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
        )}
      </div>
    </div>
  )
}
