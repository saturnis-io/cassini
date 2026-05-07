"""SQLAlchemy ORM models for Cassini database schema."""

from cassini.db.models.annotation import Annotation
from cassini.db.models.anomaly import AnomalyDetectorConfig, AnomalyEvent, AnomalyModelState
from cassini.db.models.api_key import APIKey
from cassini.db.models.auth_token import EmailVerificationToken, PasswordResetToken
from cassini.db.models.audit_log import AuditLog
from cassini.db.models.broker import MQTTBroker
from cassini.db.models.capability import CapabilityHistory
from cassini.db.models.cep_rule import CepRule
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.models.collection_plan import (
    CollectionPlan,
    CollectionPlanExecution,
    CollectionPlanItem,
)
from cassini.db.models.characteristic_config import CharacteristicConfig
from cassini.db.models.data_source import (
    DataSource,
    DataSourceType,
    MQTTDataSource,
    OPCUADataSource,
    TriggerStrategy,
)
from cassini.db.models.fai import FAIItem, FAIReport
from cassini.db.models.fai_detail import FAIFunctionalTest, FAIMaterial, FAISpecialProcess
from cassini.db.models.gage import GageBridge, GagePort
from cassini.db.models.hierarchy import Base, Hierarchy, HierarchyType
from cassini.db.models.msa import MSAMeasurement, MSAOperator, MSAPart, MSAStudy
from cassini.db.models.notification import NotificationPreference, SmtpConfig, WebhookConfig
from cassini.db.models.oidc_config import OIDCConfig
from cassini.db.models.oidc_state import OIDCAccountLink, OIDCState
from cassini.db.models.push_subscription import PushSubscription
from cassini.db.models.erp_connector import (
    ERPConnector,
    ERPFieldMapping,
    ERPSyncLog,
    ERPSyncSchedule,
)
from cassini.db.models.ai_config import AIInsight, AIProviderConfig
from cassini.db.models.doe import DOEAnalysis, DOEFactor, DOERun, DOEStudy
from cassini.db.models.multivariate import (
    CorrelationResult,
    MultivariateGroup,
    MultivariateGroupMember,
    MultivariateSample,
)
from cassini.db.models.prediction import Forecast, PredictionConfig, PredictionModel
from cassini.db.models.opcua_server import OPCUAServer
from cassini.db.models.plant import Plant
from cassini.db.models.material import Material
from cassini.db.models.material_class import MaterialClass
from cassini.db.models.material_limit_override import MaterialLimitOverride
from cassini.db.models.purge_history import PurgeHistory
from cassini.db.models.report_schedule import ReportRun, ReportSchedule
from cassini.db.models.retention_policy import RetentionPolicy
from cassini.db.models.rule_preset import RulePreset
from cassini.db.models.sample import Measurement, Sample
from cassini.db.models.system_settings import SystemSettings
from cassini.db.models.sop_doc import SopChunk, SopDoc, SopRagBudget
from cassini.db.models.signature import (
    ElectronicSignature,
    PasswordPolicy,
    SignatureMeaning,
    SignatureWorkflow,
    SignatureWorkflowInstance,
    SignatureWorkflowStep,
)
from cassini.db.models.user import User, UserPlantRole, UserRole
from cassini.db.models.user_session import UserSession
from cassini.db.models.violation import Severity, Violation

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
    "CepRule",
    "MQTTBroker",
    "NotificationPreference",
    "OIDCConfig",
    "OPCUAServer",
    "DataSource",
    "MQTTDataSource",
    "OPCUADataSource",
    "FAIItem",
    "FAIReport",
    "FAIFunctionalTest",
    "FAIMaterial",
    "FAISpecialProcess",
    "GageBridge",
    "GagePort",
    "MSAMeasurement",
    "MSAOperator",
    "MSAPart",
    "MSAStudy",
    "Plant",
    "Material",
    "MaterialClass",
    "MaterialLimitOverride",
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
    # Advanced analytics
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
    # Collection plans
    "CollectionPlan",
    "CollectionPlanExecution",
    "CollectionPlanItem",
    # Auth tokens
    "EmailVerificationToken",
    "PasswordResetToken",
    # System settings
    "SystemSettings",
    # SOP-grounded RAG
    "SopDoc",
    "SopChunk",
    "SopRagBudget",
    # Enums
    "DataSourceType",
    "HierarchyType",
    "Severity",
    "TriggerStrategy",
    "UserRole",
    "UserSession",
]
