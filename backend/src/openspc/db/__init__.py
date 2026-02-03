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
    Hierarchy,
    HierarchyType,
    Measurement,
    ProviderType,
    Sample,
    Severity,
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
    "Sample",
    "Measurement",
    "Violation",
    # Enums
    "HierarchyType",
    "ProviderType",
    "Severity",
]
