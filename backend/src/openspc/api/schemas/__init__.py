"""Pydantic schemas for OpenSPC REST API.

This module provides all request and response schemas for the OpenSPC API,
organized by domain model.
"""

from openspc.api.schemas.characteristic import (
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
from openspc.api.schemas.common import (
    ErrorResponse,
    PaginatedResponse,
    PaginationParams,
    SuccessResponse,
)
from openspc.api.schemas.hierarchy import (
    HierarchyCreate,
    HierarchyResponse,
    HierarchyTreeNode,
    HierarchyUpdate,
)
from openspc.api.schemas.plant import (
    PlantCreate,
    PlantResponse,
    PlantUpdate,
)
from openspc.api.schemas.sample import (
    SampleCreate,
    SampleExclude,
    SampleResponse,
)
from openspc.api.schemas.violation import (
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
