# Dependency Index (Reverse Lookup)

Quick-reference: given a model, hook, endpoint, or store — find the feature it belongs to.

## Models → Feature

| Model | File | Feature |
|-------|------|---------|
| Characteristic | db/models/characteristic.py | [spc-engine](features/spc-engine.md) |
| ControlLimit | db/models/control_limit.py | [spc-engine](features/spc-engine.md) |
| Sample | db/models/sample.py | [spc-engine](features/spc-engine.md), [data-entry](features/data-entry.md) |
| Measurement | db/models/sample.py | [spc-engine](features/spc-engine.md), [data-entry](features/data-entry.md) |
| Violation | db/models/violation.py | [spc-engine](features/spc-engine.md) |
| Annotation | db/models/annotation.py | [spc-engine](features/spc-engine.md) |
| CharacteristicRules | db/models/characteristic.py | [spc-engine](features/spc-engine.md) |
| RulePreset | db/models/rule_preset.py | [spc-engine](features/spc-engine.md) |
| SampleEditHistory | db/models/sample.py | [data-entry](features/data-entry.md) |
| Hierarchy | db/models/hierarchy.py | [spc-engine](features/spc-engine.md) |
| Plant | db/models/plant.py | [spc-engine](features/spc-engine.md) |
| CapabilityHistory | db/models/capability.py | [capability](features/capability.md) |
| DataSource | db/models/data_source.py | [connectivity](features/connectivity.md) |
| MQTTDataSource | db/models/data_source.py | [connectivity](features/connectivity.md) |
| OPCUADataSource | db/models/data_source.py | [connectivity](features/connectivity.md) |
| MQTTBroker | db/models/mqtt_broker.py | [connectivity](features/connectivity.md) |
| OPCUAServer | db/models/opcua_server.py | [connectivity](features/connectivity.md) |
| TagMapping | db/models/tag_mapping.py | [connectivity](features/connectivity.md) |
| GageBridge | db/models/gage.py | [connectivity](features/connectivity.md) |
| GagePort | db/models/gage.py | [connectivity](features/connectivity.md) |
| MSAStudy | db/models/msa.py | [msa](features/msa.md) |
| MSAOperator | db/models/msa.py | [msa](features/msa.md) |
| MSAPart | db/models/msa.py | [msa](features/msa.md) |
| MSAMeasurement | db/models/msa.py | [msa](features/msa.md) |
| FAIReport | db/models/fai.py | [fai](features/fai.md) |
| FAIItem | db/models/fai.py | [fai](features/fai.md) |
| SmtpConfig | db/models/notification.py | [notifications](features/notifications.md) |
| WebhookConfig | db/models/notification.py | [notifications](features/notifications.md) |
| NotificationPreference | db/models/notification.py | [notifications](features/notifications.md) |
| ElectronicSignature | db/models/signature.py | [signatures](features/signatures.md) |
| SignatureMeaning | db/models/signature.py | [signatures](features/signatures.md) |
| SignatureWorkflow | db/models/signature.py | [signatures](features/signatures.md) |
| SignatureWorkflowStep | db/models/signature.py | [signatures](features/signatures.md) |
| SignatureWorkflowInstance | db/models/signature.py | [signatures](features/signatures.md) |
| PasswordPolicy | db/models/signature.py | [signatures](features/signatures.md) |
| AnomalyDetectorConfig | db/models/anomaly.py | [anomaly](features/anomaly.md) |
| AnomalyEvent | db/models/anomaly.py | [anomaly](features/anomaly.md) |
| AnomalyModelState | db/models/anomaly.py | [anomaly](features/anomaly.md) |
| RetentionPolicy | db/models/retention_policy.py | [retention](features/retention.md) |
| PurgeHistory | db/models/purge_history.py | [retention](features/retention.md) |
| User | db/models/user.py | [auth](features/auth.md) |
| UserPlantRole | db/models/user.py | [auth](features/auth.md) |
| AuditLog | db/models/audit_log.py | [admin](features/admin.md) |
| ReportSchedule | db/models/report_schedule.py | [reporting](features/reporting.md) |
| ReportRun | db/models/report_schedule.py | [reporting](features/reporting.md) |

## API Prefixes → Feature

| Router Prefix | Router File | Feature |
|---------------|-------------|---------|
| /api/v1/characteristics | api/v1/characteristics.py | [spc-engine](features/spc-engine.md) |
| /api/v1/samples | api/v1/samples.py | [spc-engine](features/spc-engine.md), [data-entry](features/data-entry.md) |
| /api/v1/data-entry | api/v1/data_entry.py | [data-entry](features/data-entry.md) |
| /api/v1/import | api/v1/import_router.py | [data-entry](features/data-entry.md) |
| /api/v1/violations | api/v1/violations.py | [spc-engine](features/spc-engine.md) |
| /api/v1/hierarchy | api/v1/hierarchy.py | [spc-engine](features/spc-engine.md) |
| /api/v1/plants | api/v1/plants.py | [spc-engine](features/spc-engine.md) |
| /api/v1/annotations | api/v1/annotations.py | [spc-engine](features/spc-engine.md) |
| /api/v1/capability | api/v1/capability.py | [capability](features/capability.md) |
| /api/v1/brokers | api/v1/brokers.py | [connectivity](features/connectivity.md) |
| /api/v1/opcua-servers | api/v1/opcua_servers.py | [connectivity](features/connectivity.md) |
| /api/v1/tags | api/v1/tags.py | [connectivity](features/connectivity.md) |
| /api/v1/gage-bridges | api/v1/gage_bridges.py | [connectivity](features/connectivity.md) |
| /api/v1/msa | api/v1/msa.py | [msa](features/msa.md) |
| /api/v1/fai | api/v1/fai.py | [fai](features/fai.md) |
| /api/v1/notifications | api/v1/notifications.py | [notifications](features/notifications.md) |
| /api/v1/signatures | api/v1/signatures.py | [signatures](features/signatures.md) |
| /api/v1/anomaly | api/v1/anomaly.py | [anomaly](features/anomaly.md) |
| /api/v1/retention | api/v1/retention.py | [retention](features/retention.md) |
| /api/v1/auth | api/v1/auth.py | [auth](features/auth.md) |
| /api/v1/users | api/v1/users.py | [auth](features/auth.md) |
| /api/v1/database | api/v1/database_admin.py | [admin](features/admin.md) |
| /api/v1/audit | api/v1/audit.py | [admin](features/admin.md) |
| /api/v1/reports/schedules | api/v1/scheduled_reports.py | [reporting](features/reporting.md) |

## Frontend Hooks → Feature

| Hook | Feature |
|------|---------|
| useChartData | [spc-engine](features/spc-engine.md) |
| useCharacteristic | [spc-engine](features/spc-engine.md) |
| useCharacteristics | [spc-engine](features/spc-engine.md) |
| useCreateCharacteristic | [spc-engine](features/spc-engine.md) |
| useUpdateCharacteristic | [spc-engine](features/spc-engine.md) |
| useDeleteCharacteristic | [spc-engine](features/spc-engine.md) |
| useRecalculateLimits | [spc-engine](features/spc-engine.md) |
| useViolations | [spc-engine](features/spc-engine.md) |
| useAnnotations | [spc-engine](features/spc-engine.md) |
| useRulePresets | [spc-engine](features/spc-engine.md) |
| useCapability | [capability](features/capability.md) |
| useCapabilityHistory | [capability](features/capability.md) |
| useSaveCapabilitySnapshot | [capability](features/capability.md) |
| useDistributionFit | [capability](features/capability.md) |
| useNonNormalCapability | [capability](features/capability.md) |
| useBrokers | [connectivity](features/connectivity.md) |
| useOPCUAServers | [connectivity](features/connectivity.md) |
| useTagMappings | [connectivity](features/connectivity.md) |
| useGageBridges | [connectivity](features/connectivity.md) |
| useMSAStudies | [msa](features/msa.md) |
| useMSAStudy | [msa](features/msa.md) |
| useMSAResults | [msa](features/msa.md) |
| useCalculateMSA | [msa](features/msa.md) |
| useFAIReports | [fai](features/fai.md) |
| useFAIReport | [fai](features/fai.md) |
| useSubmitFAIReport | [fai](features/fai.md) |
| useApproveFAIReport | [fai](features/fai.md) |
| useSubmitSample | [data-entry](features/data-entry.md) |
| useSubmitAttributeData | [data-entry](features/data-entry.md) |
| useSamples | [data-entry](features/data-entry.md) |
| useUpdateSample | [data-entry](features/data-entry.md) |
| useExcludeSample | [data-entry](features/data-entry.md) |
| useUploadFile | [data-entry](features/data-entry.md) |
| useValidateMapping | [data-entry](features/data-entry.md) |
| useConfirmImport | [data-entry](features/data-entry.md) |
| useSmtpConfig | [notifications](features/notifications.md) |
| useWebhooks | [notifications](features/notifications.md) |
| useNotificationPreferences | [notifications](features/notifications.md) |
| useSign | [signatures](features/signatures.md) |
| usePendingApprovals | [signatures](features/signatures.md) |
| useWorkflows | [signatures](features/signatures.md) |
| useMeanings | [signatures](features/signatures.md) |
| usePasswordPolicy | [signatures](features/signatures.md) |
| useAnomalyConfig | [anomaly](features/anomaly.md) |
| useAnomalyEvents | [anomaly](features/anomaly.md) |
| useAnomalySummary | [anomaly](features/anomaly.md) |
| useTriggerAnalysis | [anomaly](features/anomaly.md) |
| useRetentionDefault | [retention](features/retention.md) |
| useRetentionOverrides | [retention](features/retention.md) |
| useEffectiveRetention | [retention](features/retention.md) |
| useTriggerPurge | [retention](features/retention.md) |
| useLogin | [auth](features/auth.md) |
| useCurrentUser | [auth](features/auth.md) |
| useUsers | [auth](features/auth.md) |
| useAssignRole | [auth](features/auth.md) |
| useAuditLogs | [admin](features/admin.md) |
| useAuditStats | [admin](features/admin.md) |
| useDatabaseConfig | [admin](features/admin.md) |
| useDatabaseStatus | [admin](features/admin.md) |
| useReportSchedules | [reporting](features/reporting.md) |
| useTriggerReport | [reporting](features/reporting.md) |
| useReportRuns | [reporting](features/reporting.md) |

## Zustand Stores → Feature

| Store | File | Feature |
|-------|------|---------|
| useAuthStore | stores/authStore.ts | [auth](features/auth.md) |
| useActivePlantId | stores/plantStore.ts | [auth](features/auth.md) — plant-scoping for all queries |
| useDashboardStore | stores/dashboardStore.ts | [spc-engine](features/spc-engine.md) |
| useThemeStore | stores/themeStore.ts | [spc-engine](features/spc-engine.md) |

## Core Services → Feature

| Service | File | Feature |
|---------|------|---------|
| SPCEngine | core/engine/spc_engine.py | [spc-engine](features/spc-engine.md) |
| ControlLimitService | core/engine/control_limits.py | [spc-engine](features/spc-engine.md) |
| NelsonRuleLibrary | core/engine/nelson_rules.py | [spc-engine](features/spc-engine.md) |
| AttributeSPCEngine | core/engine/attribute_engine.py | [spc-engine](features/spc-engine.md) |
| DistributionFitter | core/distributions.py | [capability](features/capability.md) |
| GageRREngine | core/msa/engine.py | [msa](features/msa.md) |
| AttributeMSAEngine | core/msa/attribute_msa.py | [msa](features/msa.md) |
| AnomalyDetector | core/anomaly/detector.py | [anomaly](features/anomaly.md) |
| PELTDetector | core/anomaly/pelt_detector.py | [anomaly](features/anomaly.md) |
| IsolationForestDetector | core/anomaly/iforest_detector.py | [anomaly](features/anomaly.md) |
| KSDetector | core/anomaly/ks_detector.py | [anomaly](features/anomaly.md) |
| PurgeEngine | core/purge_engine.py | [retention](features/retention.md) |
| NotificationDispatcher | core/notifications.py | [notifications](features/notifications.md) |
| EventBus | core/events/__init__.py | [notifications](features/notifications.md), [anomaly](features/anomaly.md) |
| SignatureWorkflowEngine | core/signature_engine.py | [signatures](features/signatures.md) |
| AuditService | core/audit.py | [admin](features/admin.md) |
| AuditMiddleware | core/audit.py | [admin](features/admin.md) |
| ImportService | core/import_service.py | [data-entry](features/data-entry.md) |
| OPCUAManager | core/opcua/manager.py | [connectivity](features/connectivity.md) |
| MQTTManager | core/mqtt/manager.py | [connectivity](features/connectivity.md) |

## Migrations → Feature

| Migration | Description | Feature |
|-----------|-------------|---------|
| 001 | Initial schema (sample, measurement, user, hierarchy, etc.) | [spc-engine](features/spc-engine.md), [auth](features/auth.md) |
| 006 | sample_edit_history | [data-entry](features/data-entry.md) |
| 016 | Dialect portability | [admin](features/admin.md) |
| 020 | CASCADE FKs, violation.char_id, composite indexes | [spc-engine](features/spc-engine.md) |
| 021 | retention_policy, purge_history | [retention](features/retention.md) |
| 022 | report_schedule, report_run | [reporting](features/reporting.md) |
| 024 | smtp_config, webhook_config, notification_preference | [notifications](features/notifications.md) |
| 025 | capability_history | [capability](features/capability.md) |
| 026 | audit_log | [admin](features/admin.md) |
| 030 | anomaly_detector_config, anomaly_event, anomaly_model_state | [anomaly](features/anomaly.md) |
| 031 | electronic_signatures (6 tables + user columns) | [signatures](features/signatures.md) |
| 032 | distribution_method, rule_preset, custom rule params | [spc-engine](features/spc-engine.md), [capability](features/capability.md) |
| 033 | MSA tables, FAI tables, short_run_mode | [msa](features/msa.md), [fai](features/fai.md), [spc-engine](features/spc-engine.md) |
| 034 | gage_bridge, gage_port | [connectivity](features/connectivity.md) |
| 035 | gage_bridge unique constraint | [connectivity](features/connectivity.md) |
