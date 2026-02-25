"""SQLAlchemy ORM models for OpenSPC database schema."""

from openspc.db.models.annotation import Annotation
from openspc.db.models.anomaly import AnomalyDetectorConfig, AnomalyEvent, AnomalyModelState
from openspc.db.models.api_key import APIKey
from openspc.db.models.audit_log import AuditLog
from openspc.db.models.broker import MQTTBroker
from openspc.db.models.capability import CapabilityHistory
from openspc.db.models.characteristic import Characteristic, CharacteristicRule
from openspc.db.models.characteristic_config import CharacteristicConfig
from openspc.db.models.data_source import (
    DataSource,
    DataSourceType,
    MQTTDataSource,
    OPCUADataSource,
    TriggerStrategy,
)
from openspc.db.models.fai import FAIItem, FAIReport
from openspc.db.models.gage import GageBridge, GagePort
from openspc.db.models.hierarchy import Base, Hierarchy, HierarchyType
from openspc.db.models.msa import MSAMeasurement, MSAOperator, MSAPart, MSAStudy
from openspc.db.models.notification import NotificationPreference, SmtpConfig, WebhookConfig
from openspc.db.models.oidc_config import OIDCConfig
from openspc.db.models.oidc_state import OIDCAccountLink, OIDCState
from openspc.db.models.push_subscription import PushSubscription
from openspc.db.models.erp_connector import (
    ERPConnector,
    ERPFieldMapping,
    ERPSyncLog,
    ERPSyncSchedule,
)
from openspc.db.models.ai_config import AIInsight, AIProviderConfig
from openspc.db.models.doe import DOEAnalysis, DOEFactor, DOERun, DOEStudy
from openspc.db.models.multivariate import (
    CorrelationResult,
    MultivariateGroup,
    MultivariateGroupMember,
    MultivariateSample,
)
from openspc.db.models.prediction import Forecast, PredictionConfig, PredictionModel
from openspc.db.models.opcua_server import OPCUAServer
from openspc.db.models.plant import Plant
from openspc.db.models.purge_history import PurgeHistory
from openspc.db.models.report_schedule import ReportRun, ReportSchedule
from openspc.db.models.retention_policy import RetentionPolicy
from openspc.db.models.rule_preset import RulePreset
from openspc.db.models.sample import Measurement, Sample
from openspc.db.models.signature import (
    ElectronicSignature,
    PasswordPolicy,
    SignatureMeaning,
    SignatureWorkflow,
    SignatureWorkflowInstance,
    SignatureWorkflowStep,
)
from openspc.db.models.user import User, UserPlantRole, UserRole
from openspc.db.models.violation import Severity, Violation

__all__ = [
    # Base
    "Base",
    # Models
    "Annotation",
    "AnomalyDetectorConfig",
    "AnomalyEvent",
    "AnomalyModelState",
    "APIKey",
    "AuditLog",
    "CapabilityHistory",
    "MQTTBroker",
    "NotificationPreference",
    "OIDCConfig",
    "OPCUAServer",
    "DataSource",
    "MQTTDataSource",
    "OPCUADataSource",
    "FAIItem",
    "FAIReport",
    "GageBridge",
    "GagePort",
    "MSAMeasurement",
    "MSAOperator",
    "MSAPart",
    "MSAStudy",
    "Plant",
    "PurgeHistory",
    "ReportRun",
    "ReportSchedule",
    "RetentionPolicy",
    "RulePreset",
    "SmtpConfig",
    "User",
    "UserPlantRole",
    "WebhookConfig",
    "Hierarchy",
    "Characteristic",
    "CharacteristicConfig",
    "CharacteristicRule",
    "Sample",
    "Measurement",
    "Violation",
    # Electronic signatures
    "ElectronicSignature",
    "SignatureMeaning",
    "SignatureWorkflow",
    "SignatureWorkflowStep",
    "SignatureWorkflowInstance",
    "PasswordPolicy",
    # OIDC
    "OIDCState",
    "OIDCAccountLink",
    # Push notifications
    "PushSubscription",
    # ERP connectors
    "ERPConnector",
    "ERPFieldMapping",
    "ERPSyncSchedule",
    "ERPSyncLog",
    # Sprint 9: Advanced analytics
    "AIInsight",
    "AIProviderConfig",
    "CorrelationResult",
    "DOEAnalysis",
    "DOEFactor",
    "DOERun",
    "DOEStudy",
    "Forecast",
    "MultivariateGroup",
    "MultivariateGroupMember",
    "MultivariateSample",
    "PredictionConfig",
    "PredictionModel",
    # Enums
    "DataSourceType",
    "HierarchyType",
    "Severity",
    "TriggerStrategy",
    "UserRole",
]
