"""Schemas for system settings API."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

_HEX_RE = re.compile(r"^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$")
_SAFE_URL_PREFIXES = ("http://", "https://", "data:image/")


class BrandColorSeed(BaseModel):
    """A color seed with optional light/dark overrides."""

    hex: str
    light_override: str | None = None
    dark_override: str | None = None

    @field_validator("hex", "light_override", "dark_override")
    @classmethod
    def validate_hex(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not _HEX_RE.match(v):
            raise ValueError("Must be a valid hex color (e.g. #FF0000 or #F00)")
        return v


class LogoColors(BaseModel):
    """Per-element colors for the default Saturn logo."""

    planet: str | None = None
    ring: str | None = None
    line: str | None = None
    dot: str | None = None

    @field_validator("planet", "ring", "line", "dot")
    @classmethod
    def validate_hex(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not _HEX_RE.match(v):
            raise ValueError("Must be a valid hex color (e.g. #FF0000 or #F00)")
        return v


class BrandConfigSchema(BaseModel):
    """Enterprise branding configuration."""

    app_name: str | None = Field(None, max_length=50)
    logo_url: str | None = None
    logo_colors: LogoColors | None = None
    primary: BrandColorSeed | None = None
    accent: BrandColorSeed | None = None
    destructive: BrandColorSeed | None = None
    warning: BrandColorSeed | None = None
    success: BrandColorSeed | None = None
    heading_font: str | None = None
    body_font: str | None = None
    visual_style: Literal["modern", "retro", "glass"] | None = None
    login_mode: Literal["saturn", "static"] | None = None
    login_background_url: str | None = None
    preset_id: str | None = None

    @field_validator("logo_url", "login_background_url")
    @classmethod
    def validate_url(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v.startswith(_SAFE_URL_PREFIXES):
            raise ValueError(
                "URL must start with http://, https://, or data:image/"
            )
        return v


class DisplayKeyFormatSchema(BaseModel):
    """Site-wide display key formatting for sample identifiers."""

    date_pattern: str = Field("YYMMDD", max_length=30)
    separator: Literal["-", ".", "/", "#"] = "-"
    number_placement: Literal["after", "before"] = "after"
    number_digits: int = Field(3, ge=1, le=6)


class SystemSettingsResponse(BaseModel):
    """Response schema for system settings."""

    model_config = {"from_attributes": True}

    date_format: str
    datetime_format: str
    brand_config: BrandConfigSchema | None = None
    display_key_format: DisplayKeyFormatSchema | None = None
    updated_at: datetime


class SystemSettingsUpdate(BaseModel):
    """Update schema for system settings."""

    date_format: str | None = Field(None, max_length=50)
    datetime_format: str | None = Field(None, max_length=50)
    brand_config: BrandConfigSchema | None = None
    display_key_format: DisplayKeyFormatSchema | None = None
