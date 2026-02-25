"""Pydantic schemas for Cassini REST API.

This module provides all request and response schemas for the Cassini API,
organized by domain model.
"""

from cassini.api.schemas.characteristic import (
    CharacteristicCreate,
    CharacteristicResponse,
    CharacteristicSummary,
    CharacteristicUpdate,
    ChartDataResponse,
    ChartSample,
    ControlLimits,
    ControlLimitsResponse,
    NelsonRuleConfig,
    SpecLimits,
    ZoneBoundaries,
)
from cassini.api.schemas.common import (
    ErrorResponse,
    PaginatedResponse,
    PaginationParams,
    SuccessResponse,
)
from cassini.api.schemas.hierarchy import (
    HierarchyCreate,
    HierarchyResponse,
    HierarchyTreeNode,
    HierarchyUpdate,
)
from cassini.api.schemas.plant import (
    PlantCreate,
    PlantResponse,
    PlantUpdate,
)
from cassini.api.schemas.sample import (
    SampleCreate,
    SampleExclude,
    SampleResponse,
)
from cassini.api.schemas.violation import (
    ViolationAcknowledge,
    ViolationResponse,
    ViolationStats,
)

__all__ = [
    # Common schemas
    "PaginationParams",
    "PaginatedResponse",
    "ErrorResponse",
    "SuccessResponse",
    # Hierarchy schemas
    "HierarchyCreate",
    "HierarchyUpdate",
    "HierarchyResponse",
    "HierarchyTreeNode",
    # Plant schemas
    "PlantCreate",
    "PlantUpdate",
    "PlantResponse",
    # Characteristic schemas
    "CharacteristicCreate",
    "CharacteristicUpdate",
    "CharacteristicResponse",
    "CharacteristicSummary",
    "ChartDataResponse",
    "ChartSample",
    "ControlLimits",
    "ControlLimitsResponse",
    "SpecLimits",
    "ZoneBoundaries",
    "NelsonRuleConfig",
    # Sample schemas
    "SampleCreate",
    "SampleResponse",
    "SampleExclude",
    # Violation schemas
    "ViolationResponse",
    "ViolationAcknowledge",
    "ViolationStats",
]
