"""Pydantic schemas for Material Management operations."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# --- MaterialClass schemas ---


class MaterialClassCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=100)
    parent_id: int | None = None
    description: str | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper()


class MaterialClassUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    parent_id: int | None = Field(default=None, description="Set to null to make root class")
    description: str | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip().upper()
            return v if v else None
        return v


class MaterialClassResponse(BaseModel):
    id: int
    plant_id: int
    parent_id: int | None
    name: str
    code: str
    path: str
    depth: int
    description: str | None
    material_count: int = 0
    children_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MaterialClassTreeNode(MaterialClassResponse):
    children: list["MaterialClassTreeNode"] = []
    materials: list["MaterialResponse"] = []


# --- Material schemas ---


class MaterialCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = Field(..., min_length=1, max_length=100)
    class_id: int | None = None
    description: str | None = None
    properties: dict | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str) -> str:
        return v.strip().upper()


class MaterialUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    class_id: int | None = None
    description: str | None = None
    properties: dict | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip().upper()
            return v if v else None
        return v


class MaterialResponse(BaseModel):
    id: int
    plant_id: int
    class_id: int | None
    name: str
    code: str
    description: str | None
    properties: dict | None
    class_name: str | None = None
    class_path: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- MaterialLimitOverride schemas ---


class MaterialLimitOverrideCreate(BaseModel):
    material_id: int | None = None
    class_id: int | None = None
    ucl: float | None = None
    lcl: float | None = None
    stored_sigma: float | None = None
    stored_center_line: float | None = None
    target_value: float | None = None
    usl: float | None = None
    lsl: float | None = None

    @model_validator(mode="after")
    def exactly_one_target(self) -> "MaterialLimitOverrideCreate":
        if (self.material_id is None) == (self.class_id is None):
            raise ValueError("Exactly one of material_id or class_id must be provided")
        return self


class MaterialLimitOverrideUpdate(BaseModel):
    ucl: float | None = None
    lcl: float | None = None
    stored_sigma: float | None = None
    stored_center_line: float | None = None
    target_value: float | None = None
    usl: float | None = None
    lsl: float | None = None


class MaterialLimitOverrideResponse(BaseModel):
    id: int
    characteristic_id: int
    material_id: int | None
    class_id: int | None
    material_name: str | None = None
    class_name: str | None = None
    class_path: str | None = None
    ucl: float | None
    lcl: float | None
    stored_sigma: float | None
    stored_center_line: float | None
    target_value: float | None
    usl: float | None
    lsl: float | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Resolution schemas ---


class ResolvedLimitField(BaseModel):
    value: float | None
    source_type: str  # "material", "class", "characteristic"
    source_name: str
    source_id: int | None = None


class ResolvedLimitsResponse(BaseModel):
    ucl: ResolvedLimitField
    lcl: ResolvedLimitField
    stored_sigma: ResolvedLimitField
    stored_center_line: ResolvedLimitField
    target_value: ResolvedLimitField
    usl: ResolvedLimitField
    lsl: ResolvedLimitField
