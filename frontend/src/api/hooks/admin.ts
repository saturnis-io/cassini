import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { databaseApi, auditApi, retentionApi, importApi, devtoolsApi } from '../admin.api'
import { queryKeys, DATABASE_REFETCH_MS, retentionKeys } from './queryKeys'
import { handleMutationError } from './utils'
import type { DatabaseDialect, RetentionPolicySet } from '@/types'
import type { AuditLogParams } from '../client'

// Database Admin hooks
export function useDatabaseConfig() {
  return useQuery({
    queryKey: queryKeys.database.config(),
    queryFn: databaseApi.getConfig,
    refetchInterval: DATABASE_REFETCH_MS,
  })
}

export function useDatabaseStatus() {
  return useQuery({
    queryKey: queryKeys.database.status(),
    queryFn: databaseApi.getStatus,
    refetchInterval: DATABASE_REFETCH_MS,
  })
}

export function useMigrationStatus() {
  return useQuery({
    queryKey: queryKeys.database.migrations(),
    queryFn: databaseApi.getMigrationStatus,
    refetchInterval: DATABASE_REFETCH_MS,
  })
}

export function useUpdateDatabaseConfig() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      dialect: DatabaseDialect
      host?: string
      port?: number
      database?: string
      username?: string
      password?: string
      options?: Record<string, string | number | boolean>
    }) => databaseApi.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.database.all })
      toast.success('Database configuration saved. Restart required to apply changes.')
    },
    onError: handleMutationError('Failed to save database config'),
  })
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (data: {
      dialect: DatabaseDialect
      host?: string
      port?: number
      database?: string
      username?: string
      password?: string
      options?: Record<string, string | number | boolean>
    }) => databaseApi.testConnection(data),
    onError: handleMutationError('Connection test failed'),
  })
}

export function useDatabaseBackup() {
  return useMutation({
    mutationFn: (params?: { backup_dir?: string }) => databaseApi.backup(params?.backup_dir),
    onError: handleMutationError('Backup failed'),
  })
}

export function useDatabaseVacuum() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => databaseApi.vacuum(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.database.status() })
      toast.success(data.message)
    },
    onError: handleMutationError('Maintenance failed'),
  })
}

// -----------------------------------------------------------------------
// Audit log hooks
// -----------------------------------------------------------------------

export function useAuditLogs(params?: AuditLogParams) {
  return useQuery({
    queryKey: queryKeys.audit.logs(params),
    queryFn: () => auditApi.getLogs(params),
  })
}

export function useAuditStats() {
  return useQuery({
    queryKey: queryKeys.audit.stats(),
    queryFn: auditApi.getStats,
  })
}

export function useExportAuditLogs() {
  return useMutation({
    mutationFn: (params?: AuditLogParams) => auditApi.exportLogs(params),
    onSuccess: () => {
      toast.success('Audit log exported')
    },
    onError: handleMutationError('Failed to export audit log'),
  })
}

// Retention hooks
export function useRetentionDefault(plantId: number) {
  return useQuery({
    queryKey: retentionKeys.default(plantId),
    queryFn: () => retentionApi.getDefault(plantId),
    enabled: plantId > 0,
  })
}

export function useRetentionOverrides(plantId: number) {
  return useQuery({
    queryKey: retentionKeys.overrides(plantId),
    queryFn: () => retentionApi.listOverrides(plantId),
    enabled: plantId > 0,
  })
}

export function useSetRetentionDefault() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ plantId, policy }: { plantId: number; policy: RetentionPolicySet }) =>
      retentionApi.setDefault(plantId, policy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: retentionKeys.all })
      toast.success('Default retention policy updated')
    },
    onError: handleMutationError('Failed to update default retention policy'),
  })
}

export function useSetHierarchyRetention() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ hierarchyId, policy }: { hierarchyId: number; policy: RetentionPolicySet }) =>
      retentionApi.setHierarchyPolicy(hierarchyId, policy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: retentionKeys.all })
      toast.success('Hierarchy retention override saved')
    },
    onError: handleMutationError('Failed to save hierarchy retention override'),
  })
}

export function useDeleteHierarchyRetention() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (hierarchyId: number) => retentionApi.deleteHierarchyPolicy(hierarchyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: retentionKeys.all })
      toast.success('Hierarchy retention override removed')
    },
    onError: handleMutationError('Failed to remove hierarchy retention override'),
  })
}

export function useSetCharacteristicRetention() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ charId, policy }: { charId: number; policy: RetentionPolicySet }) =>
      retentionApi.setCharacteristicPolicy(charId, policy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: retentionKeys.all })
      toast.success('Characteristic retention override saved')
    },
    onError: handleMutationError('Failed to save characteristic retention override'),
  })
}

export function useDeleteCharacteristicRetention() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (charId: number) => retentionApi.deleteCharacteristicPolicy(charId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: retentionKeys.all })
      toast.success('Characteristic retention override removed')
    },
    onError: handleMutationError('Failed to remove characteristic retention override'),
  })
}

export function useRetentionActivity(plantId: number) {
  return useQuery({
    queryKey: retentionKeys.activity(plantId),
    queryFn: () => retentionApi.getActivity(plantId),
    enabled: plantId > 0,
  })
}

export function useNextPurge(plantId: number) {
  return useQuery({
    queryKey: retentionKeys.nextPurge(plantId),
    queryFn: () => retentionApi.getNextPurge(plantId),
    enabled: plantId > 0,
  })
}

export function useTriggerPurge() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (plantId: number) => retentionApi.triggerPurge(plantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: retentionKeys.all })
      toast.success('Purge completed successfully')
    },
    onError: handleMutationError('Purge failed'),
  })
}

// Dev Tools hooks (sandbox mode)
export function useDevToolsStatus() {
  return useQuery({
    queryKey: ['devtools', 'status'] as const,
    queryFn: () => devtoolsApi.getStatus(),
    retry: false,
    // Silent failure — returns undefined when not in sandbox mode (404)
  })
}

export function useRunSeed() {
  return useMutation({
    mutationFn: (data: { script: string }) => devtoolsApi.runSeed(data),
    onError: handleMutationError('Seed failed'),
  })
}

// Import hooks
export function useUploadFile() {
  return useMutation({
    mutationFn: (file: File) => importApi.upload(file),
    onError: handleMutationError('Upload failed'),
  })
}

export function useValidateMapping() {
  return useMutation({
    mutationFn: ({
      file,
      characteristicId,
      columnMapping,
    }: {
      file: File
      characteristicId: number
      columnMapping: Record<string, number | null>
    }) => importApi.validate(file, characteristicId, columnMapping),
  })
}

export function useConfirmImport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      file,
      characteristicId,
      columnMapping,
    }: {
      file: File
      characteristicId: number
      columnMapping: Record<string, number | null>
    }) => importApi.confirm(file, characteristicId, columnMapping),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.samples.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.characteristics.all })
      toast.success(`Imported ${data.imported} samples`)
    },
    onError: handleMutationError('Import failed'),
  })
}
