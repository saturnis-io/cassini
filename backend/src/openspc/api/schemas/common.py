"""Common Pydantic schemas for OpenSPC REST API.

Provides reusable schemas for pagination, response envelopes, and error handling.
"""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class PaginationParams(BaseModel):
    """Query parameters for paginated endpoints.

    Attributes:
        offset: Number of items to skip (default: 0)
        limit: Maximum number of items to return (default: 100, max: 1000)
    """

    offset: int = Field(default=0, ge=0, description="Number of items to skip")
    limit: int = Field(
        default=100,
        ge=1,
        le=1000,
        description="Maximum number of items to return",
    )


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper.

    Wraps a list of items with pagination metadata.

    Attributes:
        items: List of items for the current page
        total: Total number of items across all pages
        offset: Current offset used
        limit: Current limit used
    """

    items: list[T]
    total: int
    offset: int
    limit: int


class ErrorResponse(BaseModel):
    """Standard error response format.

    Attributes:
        detail: Human-readable error message
        code: Optional error code for client-side handling
    """

    detail: str
    code: str | None = None


class SuccessResponse(BaseModel):
    """Standard success response format.

    Used for operations that don't return specific data.

    Attributes:
        message: Success message
    """

    message: str
