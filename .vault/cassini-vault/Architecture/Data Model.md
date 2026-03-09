---
type: feature
status: active
tags:
  - architecture
  - active
---

# Data Model

Cassini uses SQLAlchemy 2.0+ async ORM with ~45 models across 38 Alembic migrations. Multi-dialect: SQLite (dev), PostgreSQL, MySQL, MSSQL.

## Core SPC Entities

### Plant & Hierarchy

- **Plant**: Top-level organizational unit. Users have per-plant roles.
- **Hierarchy**: ISA-95 tree (Site > Area > Line > Cell > Unit). Adjacency list with materialized path (`/1/2/5/`) for efficient subtree queries. Unique constraint on `(parent_id, name)`.

### Characteristic

The SPC configuration for a measurement point. Key fields:

- SPC params: `subgroup_size`, `target_value`, `chart_type`, `data_type` (variable/attribute)
- Spec limits: `usl`, `lsl`
- Control limits: `ucl`, `lcl`, `center_line`, `sigma`, `limit_calc_method`
- Advanced: `distribution_method`, `box_cox_lambda`, `short_run_mode`, `use_laney_correction`
- Relationships: belongs to Hierarchy, has many Samples, has optional DataSource (one-to-one)

### Sample & Measurement

- **Sample**: A sampling event with denormalized stats (`mean`, `range_value`, `std_dev`), control status (`in_control`, `is_excluded`), and context (`batch_number`, `operator_id`, `source`).
- **Measurement**: Individual values within a sample (for `subgroup_size > 1`). Ordered by `sequence`.

### Violation

Nelson rule breach records. Fields: `rule_id`, `rule_name`, `severity` (WARNING/CRITICAL), acknowledgment workflow (`ack_user`, `ack_reason`, `ack_timestamp`). `char_id` is denormalized from `sample.char_id` for direct querying.

### CharacteristicRule & RulePreset

Per-characteristic Nelson rule config with optional custom parameters. 4 built-in presets: Nelson, AIAG, WECO, Wheeler.

## Data Source (JTI Polymorphism)

- **DataSource** (base table) with `type` discriminator
- **MQTTDataSource**: `mqtt_topic`, `trigger_strategy`, links to `MQTTBroker`
- **OPCUADataSource**: `node_id`, `namespace_uri`, links to `OPCUAServer`
- No `provider_type` column — check `char.data_source is None` for manual entry
- Never explicitly `.join(DataSource)` on subclass queries (SQLAlchemy auto-joins)

## Connectivity

- **MQTTBroker**: Connection config for MQTT servers
- **OPCUAServer**: OPC-UA server connection config
- **GageBridge** + **GagePort**: Serial gage bridge devices and their port configurations

## Compliance & Quality

- **MSAStudy**, **MSAOperator**, **MSAPart**, **MSAMeasurement**: Gage R&R / Measurement System Analysis (crossed ANOVA, range, nested methods)
- **FAIReport** + **FAIItem**: First Article Inspection (AS9102 Rev C, Forms 1/2/3), draft > submitted > approved workflow with separation of duties
- **SignatureWorkflow**, **SignatureWorkflowInstance**, **ElectronicSignature**: 21 CFR Part 11 e-signatures with SHA-256 content hashing
- **CapabilityHistory**: Capability snapshot tracking (Cp/Cpk/Pp/Ppk/Cpm over time)

## Operations

- **AuditLog**: Fire-and-forget logging of POST/PUT/PATCH/DELETE via middleware, plus explicit calls for background operations
- **RetentionPolicy** + **PurgeHistory**: Per-plant data retention with inheritance chain resolution
- **SmtpConfig**, **WebhookConfig**, **NotificationPreference**, **PushSubscription**: Multi-channel notification system
- **ReportSchedule** + **ReportRun**: Scheduled PDF/HTML report generation
- **ERPConnector**: ERP/LIMS integration with Fernet-encrypted auth config

## Auth & Admin

- **User** + **UserPlantRole**: Per-plant RBAC (operator < supervisor < engineer < admin)
- **APIKey**: SHA-256 hashed, shown once at creation
- **OIDCConfig**: Per-plant SSO configuration
- **ReasonCode**: Standardized violation acknowledgment reasons

## Analytics (Sprint 9)

- **AnomalyDetectorConfig**, **AnomalyEvent**, **AnomalyBaseline**: ML anomaly detection
- **MultivariateGroup**, **MultivariateGroupMember**, **MultivariateSample**: Multivariate SPC
- **PredictionModel** + **Forecast**: Time-series forecasting
- **DOEStudy**, **DOEFactor**, **DOERun**, **DOEAnalysis**: Design of Experiments

## Key Constraints

- All FKs use CASCADE (migration 020 hardening)
- Timezone-aware datetimes
- Plant-scoped unique names
- Composite indexes on hot query paths (`sample(char_id, is_excluded, timestamp DESC)`)
- Naming convention for Alembic: `fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s`

## Related Notes

- [[System Overview]] — Architecture context
- [[API Contracts]] — How the data model is exposed
- [[Features/SPC Engine]] — Core processing that drives Sample/Violation creation
- [[Features/Connectivity]] — DataSource JTI and ingestion layer
