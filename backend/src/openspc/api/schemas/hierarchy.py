"""Pydantic schemas for Hierarchy operations.

Schemas for ISA-95 equipment hierarchy management.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class HierarchyCreate(BaseModel):
    """Schema for creating a new hierarchy node.

    Attributes:
        parent_id: ID of parent node (None for root nodes)
        name: Display name of the hierarchy node
        type: ISA-95 hierarchy type
    """

    parent_id: int | None = None
    name: str = Field(..., min_length=1, max_length=100, description="Hierarchy node name")
    type: Literal["Site", "Area", "Line", "Cell", "Unit"] = Field(
        ..., description="ISA-95 hierarchy type"
    )


class HierarchyUpdate(BaseModel):
    """Schema for updating an existing hierarchy node.

    All fields are optional to support partial updates.

    Attributes:
        name: New display name
        type: New ISA-95 hierarchy type
    """

    name: str | None = Field(None, min_length=1, max_length=100)
    type: Literal["Site", "Area", "Line", "Cell", "Unit"] | None = None


class HierarchyResponse(BaseModel):
    """Schema for hierarchy node response.

    Attributes:
        id: Unique identifier
        parent_id: ID of parent node (None for root)
        name: Display name
        type: ISA-95 hierarchy type
    """

    id: int
    parent_id: int | None
    name: str
    type: str

    model_config = ConfigDict(from_attributes=True)


class HierarchyTreeNode(BaseModel):
    """Schema for hierarchical tree representation.

    Recursive schema that includes children and metadata.

    Attributes:
        id: Unique identifier
        name: Display name
        type: ISA-95 hierarchy type
        children: List of child nodes
        characteristic_count: Number of characteristics at this node
    """

    id: int
    name: str
    type: str
    children: list["HierarchyTreeNode"] = []
    characteristic_count: int = 0

    model_config = ConfigDict(from_attributes=True)


# Resolve forward references for recursive types
HierarchyTreeNode.model_rebuild()
