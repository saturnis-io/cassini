"""Pydantic schemas for rule preset endpoints."""

from pydantic import BaseModel, Field


class RuleConfigItem(BaseModel):
    rule_id: int = Field(..., ge=1, le=8)
    is_enabled: bool = True
    parameters: dict | None = None


class PresetResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    is_builtin: bool
    rules_config: list[RuleConfigItem]
    plant_id: int | None = None

    model_config = {"from_attributes": True}


class CreatePresetRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    rules_config: list[RuleConfigItem]
    plant_id: int | None = None


class ApplyPresetRequest(BaseModel):
    preset_id: int
