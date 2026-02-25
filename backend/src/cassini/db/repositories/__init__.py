"""Repository pattern implementation for Cassini database operations.

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
    - OPCUAServerRepository: OPC-UA server configuration management
"""

from cassini.db.repositories.ai_config_repo import AIInsightRepository, AIProviderConfigRepository
from cassini.db.repositories.base import BaseRepository
from cassini.db.repositories.broker import BrokerRepository
from cassini.db.repositories.capability import CapabilityHistoryRepository
from cassini.db.repositories.characteristic import CharacteristicRepository
from cassini.db.repositories.data_source import DataSourceRepository
from cassini.db.repositories.doe_repo import DOEAnalysisRepository, DOERunRepository, DOEStudyRepository
from cassini.db.repositories.hierarchy import HierarchyNode, HierarchyRepository
from cassini.db.repositories.multivariate_repo import (
    CorrelationResultRepository,
    MultivariateGroupRepository,
)
from cassini.db.repositories.prediction_repo import (
    ForecastRepository,
    PredictionConfigRepository,
    PredictionModelRepository,
)
from cassini.db.repositories.oidc_config_repo import OIDCConfigRepository
from cassini.db.repositories.opcua_server import OPCUAServerRepository
from cassini.db.repositories.plant import PlantRepository
from cassini.db.repositories.purge_history import PurgeHistoryRepository
from cassini.db.repositories.retention import RetentionRepository
from cassini.db.repositories.sample import SampleRepository
from cassini.db.repositories.user import UserRepository
from cassini.db.repositories.violation import ViolationRepository

__all__ = [
    # Base
    "BaseRepository",
    # Repositories
    "AIInsightRepository",
    "AIProviderConfigRepository",
    "BrokerRepository",
    "CapabilityHistoryRepository",
    "CorrelationResultRepository",
    "DataSourceRepository",
    "DOEAnalysisRepository",
    "DOERunRepository",
    "DOEStudyRepository",
    "ForecastRepository",
    "HierarchyRepository",
    "MultivariateGroupRepository",
    "OIDCConfigRepository",
    "OPCUAServerRepository",
    "PlantRepository",
    "PredictionConfigRepository",
    "PredictionModelRepository",
    "PurgeHistoryRepository",
    "RetentionRepository",
    "UserRepository",
    "CharacteristicRepository",
    "SampleRepository",
    "ViolationRepository",
    # Data structures
    "HierarchyNode",
]
