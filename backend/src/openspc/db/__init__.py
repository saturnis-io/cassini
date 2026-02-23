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
    FAIItem,
    FAIReport,
    Hierarchy,
    HierarchyType,
    Measurement,
    MQTTDataSource,
    MSAMeasurement,
    MSAOperator,
    MSAPart,
    MSAStudy,
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
    "Characteristic",
    "CharacteristicConfig",
    "CharacteristicRule",
    "DataSource",
    "FAIItem",
    "FAIReport",
    "Hierarchy",
    "Measurement",
    "MQTTDataSource",
    "MSAMeasurement",
    "MSAOperator",
    "MSAPart",
    "MSAStudy",
    "OPCUADataSource",
    "OPCUAServer",
    "Sample",
    "Violation",
    # Enums
    "DataSourceType",
    "HierarchyType",
    "Severity",
    "TriggerStrategy",
]
