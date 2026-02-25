"""Pydantic schemas for OIDC SSO configuration endpoints."""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class OIDCProviderPublic(BaseModel):
    """Public-facing OIDC provider info for the login page. No secrets."""

    id: int
    name: str

    model_config = {"from_attributes": True}


class OIDCConfigCreate(BaseModel):
    """Schema for creating a new OIDC provider configuration."""

    name: str = Field(..., min_length=1, max_length=100, description="Display name (e.g. 'Azure AD')")
    issuer_url: str = Field(..., min_length=1, max_length=500, description="OIDC issuer URL")
    client_id: str = Field(..., min_length=1, max_length=255, description="OAuth2 client ID")
    client_secret: str = Field(..., min_length=1, description="OAuth2 client secret (will be encrypted)")
    scopes: list[str] = Field(
        default=["openid", "profile", "email"],
        description="OIDC scopes to request",
    )
    role_mapping: dict[str, Any] = Field(
        default={},
        description="Mapping of OIDC group/claim -> OpenSPC role (string) or plant-scoped dict",
    )
    auto_provision: bool = Field(
        default=True,
        description="Auto-create local users on first SSO login",
    )
    default_role: str = Field(
        default="operator",
        description="Default role for auto-provisioned users",
    )
    claim_mapping: dict[str, str] = Field(
        default={},
        description='Map provider claim names to standard ones: {"email": "mail", "groups": "memberOf"}',
    )
    end_session_endpoint: Optional[str] = Field(
        None,
        max_length=500,
        description="Override for RP-initiated logout endpoint",
    )
    post_logout_redirect_uri: Optional[str] = Field(
        None,
        max_length=500,
        description="Redirect after IdP logout",
    )


class OIDCConfigUpdate(BaseModel):
    """Schema for updating an OIDC provider configuration. All fields optional."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    issuer_url: Optional[str] = Field(None, min_length=1, max_length=500)
    client_id: Optional[str] = Field(None, min_length=1, max_length=255)
    client_secret: Optional[str] = Field(None, min_length=1, description="New client secret (will be encrypted)")
    scopes: Optional[list[str]] = None
    role_mapping: Optional[dict[str, Any]] = None
    auto_provision: Optional[bool] = None
    default_role: Optional[str] = None
    is_active: Optional[bool] = None
    claim_mapping: Optional[dict[str, str]] = None
    end_session_endpoint: Optional[str] = Field(None, max_length=500)
    post_logout_redirect_uri: Optional[str] = Field(None, max_length=500)


class OIDCConfigResponse(BaseModel):
    """Response schema for OIDC provider config. Client secret is masked."""

    id: int
    name: str
    issuer_url: str
    client_id: str
    client_secret_masked: str = Field(description="Masked client secret (e.g. '****abcd')")
    scopes: list[str]
    role_mapping: dict[str, Any]
    auto_provision: bool
    default_role: str
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime] = None
    claim_mapping: dict[str, str] = {}
    end_session_endpoint: Optional[str] = None
    post_logout_redirect_uri: Optional[str] = None

    model_config = {"from_attributes": True}


class OIDCAuthorizationResponse(BaseModel):
    """Response for the authorization URL generation."""

    authorization_url: str


class OIDCCallbackResponse(BaseModel):
    """Response after successful OIDC callback."""

    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str


class AccountLinkResponse(BaseModel):
    """Response for an OIDC account link."""

    id: int
    user_id: int
    provider_id: int
    provider_name: str
    oidc_subject: str
    linked_at: datetime

    model_config = {"from_attributes": True}


class AccountLinkCreate(BaseModel):
    """Request to manually link an OIDC account."""

    provider_id: int


class OIDCLogoutResponse(BaseModel):
    """Response for RP-initiated logout."""

    logout_url: Optional[str] = None
    message: str
