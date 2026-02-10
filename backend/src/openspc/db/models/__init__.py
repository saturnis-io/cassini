"""SQLAlchemy ORM models for OpenSPC database schema."""

from openspc.db.models.annotation import Annotation
from openspc.db.models.api_key import APIKey
from openspc.db.models.broker import MQTTBroker
from openspc.db.models.characteristic import Characteristic, CharacteristicRule
from openspc.db.models.data_source import (
    DataSource,
    DataSourceType,
    MQTTDataSource,
    OPCUADataSource,
    TriggerStrategy,
)
from openspc.db.models.hierarchy import Base, Hierarchy, HierarchyType
from openspc.db.models.plant import Plant
from openspc.db.models.sample import Measurement, Sample
from openspc.db.models.user import User, UserPlantRole, UserRole
from openspc.db.models.violation import Severity, Violation

__all__ = [
    # Base
    "Base",
    # Models
    "Annotation",
    "APIKey",
    "MQTTBroker",
    "DataSource",
    "MQTTDataSource",
    "OPCUADataSource",
    "Plant",
    "User",
    "UserPlantRole",
    "Hierarchy",
    "Characteristic",
    "CharacteristicRule",
    "Sample",
    "Measurement",
    "Violation",
    # Enums
    "DataSourceType",
    "HierarchyType",
    "Severity",
    "TriggerStrategy",
    "UserRole",
]
