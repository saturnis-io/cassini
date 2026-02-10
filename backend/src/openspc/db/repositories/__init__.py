"""Repository pattern implementation for OpenSPC database operations.

This module provides repository classes for each domain model, implementing
the Repository Pattern to abstract database access and provide a clean API
for data operations.

Repositories:
    - BaseRepository: Generic CRUD operations for all models
    - HierarchyRepository: Tree operations for equipment hierarchy
    - CharacteristicRepository: Filtering and relationship loading
    - SampleRepository: Time-series queries and rolling windows
    - ViolationRepository: Acknowledgment tracking and filtering
    - BrokerRepository: MQTT broker configuration management
"""

from openspc.db.repositories.base import BaseRepository
from openspc.db.repositories.broker import BrokerRepository
from openspc.db.repositories.characteristic import CharacteristicRepository
from openspc.db.repositories.data_source import DataSourceRepository
from openspc.db.repositories.hierarchy import HierarchyNode, HierarchyRepository
from openspc.db.repositories.plant import PlantRepository
from openspc.db.repositories.sample import SampleRepository
from openspc.db.repositories.user import UserRepository
from openspc.db.repositories.violation import ViolationRepository

__all__ = [
    # Base
    "BaseRepository",
    # Repositories
    "BrokerRepository",
    "DataSourceRepository",
    "HierarchyRepository",
    "PlantRepository",
    "UserRepository",
    "CharacteristicRepository",
    "SampleRepository",
    "ViolationRepository",
    # Data structures
    "HierarchyNode",
]
