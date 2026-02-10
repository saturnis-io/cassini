"""Database module for OpenSPC."""

from openspc.db.database import (
    DatabaseConfig,
    get_database,
    get_session,
    set_database,
)
from openspc.db.models import (
    Base,
    Characteristic,
    CharacteristicRule,
    DataSource,
    DataSourceType,
    Hierarchy,
    HierarchyType,
    Measurement,
    MQTTDataSource,
    OPCUADataSource,
    Sample,
    Severity,
    TriggerStrategy,
    Violation,
)

__all__ = [
    # Database configuration
    "DatabaseConfig",
    "get_database",
    "set_database",
    "get_session",
    # Base
    "Base",
    # Models
    "Hierarchy",
    "Characteristic",
    "CharacteristicRule",
    "DataSource",
    "MQTTDataSource",
    "OPCUADataSource",
    "Sample",
    "Measurement",
    "Violation",
    # Enums
    "DataSourceType",
    "HierarchyType",
    "Severity",
    "TriggerStrategy",
]
