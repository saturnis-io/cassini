/**
 * React Query hooks for time-travel replay.
 *
 * Snapshots are immutable for a given (resource, timestamp) pair, so we
 * cache aggressively (10 minute stale time). Disable the query until both
 * a resource id and a timestamp are present so the scrubber can mount
 * without firing requests.
 */
import { useQuery } from '@tanstack/react-query'
import { replayApi } from '../replay.api'
import type { ReplayResourceType, ReplaySnapshot } from '../replay.api'

/** 10 minutes — replay snapshots for a fixed timestamp never change. */
const REPLAY_STALE_TIME_MS = 10 * 60 * 1000

interface UseReplaySnapshotOptions {
  enabled?: boolean
}

export function useReplaySnapshot(
  resourceType: ReplayResourceType,
  resourceId: number | null | undefined,
  at: string | null | undefined,
  options: UseReplaySnapshotOptions = {},
) {
  const queryEnabled = Boolean(
    resourceId && at && (options.enabled === undefined || options.enabled),
  )

  return useQuery<ReplaySnapshot>({
    queryKey: ['replay', resourceType, resourceId, at],
    queryFn: () => replayApi.getSnapshot(resourceType, resourceId as number, at as string),
    enabled: queryEnabled,
    staleTime: REPLAY_STALE_TIME_MS,
    retry: false,
  })
}
