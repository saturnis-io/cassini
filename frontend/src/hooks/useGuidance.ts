import { useGuidanceStore } from '@/stores/guidanceStore'

export function useHintVisible(hintId: string) {
  const dismissed = useGuidanceStore((s) => s.dismissedHints.includes(hintId))
  const dismiss = useGuidanceStore((s) => s.dismissHint)
  return { visible: !dismissed, dismiss: () => dismiss(hintId) }
}
