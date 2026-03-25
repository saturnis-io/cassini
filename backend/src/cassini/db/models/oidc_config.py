"""OIDC identity provider configuration model for SSO authentication."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

import sqlalchemy as sa
from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from cassini.db.models.hierarchy import Base


class OIDCConfig(Base):
    """OIDC identity provider configuration.

    Stores connection settings for OIDC providers (e.g. Azure AD, Okta, Keycloak)
    used for SSO authentication. Client secrets are Fernet-encrypted at rest.
    """

    __tablename__ = "oidc_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    issuer_url: Mapped[str] = mapped_column(String(500), nullable=False)
    client_id: Mapped[str] = mapped_column(String(255), nullable=False)
    client_secret_encrypted: Mapped[str] = mapped_column(String(500), nullable=False)
    scopes: Mapped[str] = mapped_column(
        Text,
        default='["openid", "profile", "email"]',
        nullable=False,
    )
    role_mapping: Mapped[str] = mapped_column(
        Text,
        default="{}",
        nullable=False,
    )
    auto_provision: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=sa.True_(), nullable=False
    )
    default_role: Mapped[str] = mapped_column(
        String(20), default="operator", server_default="operator", nullable=False
    )
    claim_mapping: Mapped[str] = mapped_column(
        Text,
        default="{}",
        nullable=False,
    )
    end_session_endpoint: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    post_logout_redirect_uri: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    allowed_redirect_uris: Mapped[str] = mapped_column(
        Text, default="[]", nullable=False
    )
    sso_only: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=sa.False_(), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=sa.True_(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=True
    )

    @property
    def scopes_list(self) -> list[str]:
        """Parse scopes JSON string into a list."""
        try:
            return json.loads(self.scopes)
        except (json.JSONDecodeError, TypeError):
            return ["openid", "profile", "email"]

    @scopes_list.setter
    def scopes_list(self, value: list[str]) -> None:
        """Set scopes from a list."""
        self.scopes = json.dumps(value)

    @property
    def allowed_redirect_uris_list(self) -> list[str]:
        """Parse allowed_redirect_uris JSON string into a list."""
        try:
            return json.loads(self.allowed_redirect_uris)
        except (json.JSONDecodeError, TypeError):
            return []

    @property
    def role_mapping_dict(self) -> dict:
        """Parse role_mapping JSON string into a dict."""
        try:
            return json.loads(self.role_mapping)
        except (json.JSONDecodeError, TypeError):
            return {}

    @role_mapping_dict.setter
    def role_mapping_dict(self, value: dict) -> None:
        """Set role_mapping from a dict."""
        self.role_mapping = json.dumps(value)

    def __repr__(self) -> str:
        return (
            f"<OIDCConfig(id={self.id}, name='{self.name}', "
            f"issuer='{self.issuer_url}', active={self.is_active})>"
        )
