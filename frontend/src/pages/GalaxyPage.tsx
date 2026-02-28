import { useSearchParams } from 'react-router-dom'
import { GalaxyScene } from '@/components/galaxy/GalaxyScene'

export function GalaxyPage() {
  const [searchParams] = useSearchParams()
  const focusParam = searchParams.get('focus')
  const charId = focusParam?.startsWith('planet:')
    ? parseInt(focusParam.split(':')[1], 10)
    : undefined

  return (
    <div className="fixed inset-0 z-50 bg-[#080C16]">
      <GalaxyScene
        className="h-full w-full"
        focusedCharId={charId && !isNaN(charId) ? charId : undefined}
      />
    </div>
  )
}
