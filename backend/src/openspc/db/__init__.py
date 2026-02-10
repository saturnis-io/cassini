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
    CharacteristicConfig,
    CharacteristicRule,
    DataSource,
    DataSourceType,
    Hierarchy,
    HierarchyType,
    Measurement,
    MQTTDataSource,
    OPCUADataSource,
    OPCUAServer,
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
    "CharacteristicConfig",
    "CharacteristicRule",
    "DataSource",
    "MQTTDataSource",
    "OPCUADataSource",
    "OPCUAServer",
    "Sample",
    "Measurement",
    "Violation",
    # Enums
    "DataSourceType",
    "HierarchyType",
    "Severity",
    "TriggerStrategy",
]
