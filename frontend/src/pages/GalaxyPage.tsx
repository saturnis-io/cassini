import { GalaxyScene } from '@/components/galaxy/GalaxyScene'

export function GalaxyPage() {
  return (
    <div className="fixed inset-0 z-50 bg-[#080C16]">
      <GalaxyScene className="h-full w-full" />
    </div>
  )
}
