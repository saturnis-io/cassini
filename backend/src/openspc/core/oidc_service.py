"""OIDC authentication service for SSO integration.

Handles the OIDC authorization code flow:
1. Generate authorization URL for a given provider
2. Exchange authorization code for tokens
3. Extract user info from ID token / userinfo endpoint
4. Auto-provision local users from OIDC claims
5. Map OIDC groups/claims to OpenSPC roles
"""

import json
import secrets
import structlog
from typing import Any, Optional

from authlib.integrations.httpx_client import AsyncOAuth2Client
from authlib.oidc.core import CodeIDToken
from authlib.jose import jwt as jose_jwt

from openspc.core.auth.jwt import create_access_token, create_refresh_token
from openspc.core.auth.passwords import hash_password
from openspc.db.dialects import decrypt_password, get_encryption_key
from openspc.db.models.oidc_config import OIDCConfig
from openspc.db.models.user import User, UserPlantRole, UserRole
from openspc.db.repositories.oidc_config_repo import OIDCConfigRepository
from openspc.db.repositories.user import UserRepository

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = structlog.get_logger(__name__)

# In-memory state store for CSRF protection during OIDC flow.
# Maps state -> {provider_id, redirect_uri, nonce}
# In production, this should use a cache (Redis) or encrypted cookie.
_pending_states: dict[str, dict[str, Any]] = {}


class OIDCService:
    """Service for OIDC authentication flows."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = OIDCConfigRepository(session)
        self.user_repo = UserRepository(session)

    def _decrypt_client_secret(self, encrypted: str) -> str:
        """Decrypt the client secret using the database encryption key."""
        key = get_encryption_key()
        return decrypt_password(encrypted, key)

    async def _get_oidc_metadata(self, issuer_url: str) -> dict:
        """Fetch OIDC provider metadata from the well-known endpoint."""
        import httpx

        well_known_url = f"{issuer_url.rstrip('/')}/.well-known/openid-configuration"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(well_known_url)
            resp.raise_for_status()
            return resp.json()

    async def get_authorization_url(
        self, provider_id: int, redirect_uri: str
    ) -> str:
        """Generate the OIDC authorization URL for a provider.

        Args:
            provider_id: ID of the OIDC provider configuration.
            redirect_uri: The callback URL where the provider will redirect.

        Returns:
            The authorization URL to redirect the user to.

        Raises:
            ValueError: If the provider is not found or inactive.
        """
        config = await self.repo.get_by_id(provider_id)
        if config is None or not config.is_active:
            raise ValueError(f"OIDC provider {provider_id} not found or inactive")

        metadata = await self._get_oidc_metadata(config.issuer_url)
        authorization_endpoint = metadata["authorization_endpoint"]

        client_secret = self._decrypt_client_secret(config.client_secret_encrypted)
        scopes = config.scopes_list

        oauth_client = AsyncOAuth2Client(
            client_id=config.client_id,
            client_secret=client_secret,
            scope=" ".join(scopes),
            redirect_uri=redirect_uri,
        )

        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)

        # Store state for verification in callback
        _pending_states[state] = {
            "provider_id": provider_id,
            "redirect_uri": redirect_uri,
            "nonce": nonce,
        }

        url, _ = oauth_client.create_authorization_url(
            authorization_endpoint,
            state=state,
            nonce=nonce,
        )

        logger.info(
            "oidc_auth_url_generated",
            provider_id=provider_id,
            provider_name=config.name,
        )

        return url

    async def handle_callback(
        self, code: str, state: str
    ) -> dict[str, Any]:
        """Handle the OIDC callback after provider authentication.

        Exchanges the authorization code for tokens, extracts user info,
        provisions a local user if needed, and returns OpenSPC JWTs.

        Args:
            code: The authorization code from the provider.
            state: The state parameter for CSRF validation.

        Returns:
            Dict with access_token, refresh_token, and user info.

        Raises:
            ValueError: If state is invalid or callback processing fails.
        """
        # Validate state
        pending = _pending_states.pop(state, None)
        if pending is None:
            raise ValueError("Invalid or expired OIDC state parameter")

        provider_id = pending["provider_id"]
        redirect_uri = pending["redirect_uri"]
        nonce = pending["nonce"]

        config = await self.repo.get_by_id(provider_id)
        if config is None:
            raise ValueError(f"OIDC provider {provider_id} not found")

        metadata = await self._get_oidc_metadata(config.issuer_url)
        token_endpoint = metadata["token_endpoint"]
        userinfo_endpoint = metadata.get("userinfo_endpoint")

        client_secret = self._decrypt_client_secret(config.client_secret_encrypted)

        oauth_client = AsyncOAuth2Client(
            client_id=config.client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
        )

        # Exchange code for tokens
        token_response = await oauth_client.fetch_token(
            token_endpoint,
            code=code,
            grant_type="authorization_code",
        )

        # Extract user info from ID token or userinfo endpoint
        user_info = await self._extract_user_info(
            oauth_client, token_response, userinfo_endpoint, config, nonce
        )

        logger.info(
            "oidc_callback_processed",
            provider_id=provider_id,
            provider_name=config.name,
            oidc_subject=user_info.get("sub"),
            email=user_info.get("email"),
        )

        # Provision or find local user
        user = await self.provision_user(user_info, config)

        # Issue OpenSPC JWTs
        access_token = create_access_token(user.id, user.username)
        refresh_token = create_refresh_token(user.id)

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user_id": user.id,
            "username": user.username,
        }

    async def _extract_user_info(
        self,
        oauth_client: AsyncOAuth2Client,
        token_response: dict,
        userinfo_endpoint: Optional[str],
        config: OIDCConfig,
        nonce: str,
    ) -> dict[str, Any]:
        """Extract user information from the OIDC token response.

        Tries the ID token first, then falls back to the userinfo endpoint.
        """
        user_info: dict[str, Any] = {}

        # Try ID token first
        id_token = token_response.get("id_token")
        if id_token:
            try:
                # Decode without verification for user info extraction.
                # The token was received directly from the token endpoint over TLS,
                # which is sufficient for confidential clients per OIDC spec.
                import base64

                parts = id_token.split(".")
                if len(parts) == 3:
                    # Add padding
                    payload_b64 = parts[1] + "=" * (4 - len(parts[1]) % 4)
                    payload = json.loads(base64.urlsafe_b64decode(payload_b64))
                    user_info = payload
            except Exception as e:
                logger.warning("oidc_id_token_decode_failed", error=str(e))

        # Fall back to or supplement with userinfo endpoint
        if userinfo_endpoint and (not user_info or "email" not in user_info):
            try:
                oauth_client.token = token_response
                resp = await oauth_client.get(userinfo_endpoint)
                if resp.status_code == 200:
                    userinfo_data = resp.json()
                    user_info.update(userinfo_data)
            except Exception as e:
                logger.warning("oidc_userinfo_fetch_failed", error=str(e))

        if not user_info.get("sub"):
            raise ValueError("OIDC response did not include a subject (sub) claim")

        return user_info

    async def provision_user(
        self, user_info: dict[str, Any], config: OIDCConfig
    ) -> User:
        """Find or create a local user from OIDC user info.

        If the user exists (by email or username), returns the existing user.
        If auto_provision is enabled and the user doesn't exist, creates a new one.

        Args:
            user_info: OIDC claims dict (must include 'sub', may include 'email', 'name', etc.)
            config: The OIDC provider configuration.

        Returns:
            The local User object.

        Raises:
            ValueError: If user doesn't exist and auto_provision is disabled.
        """
        email = user_info.get("email")
        preferred_username = user_info.get("preferred_username") or user_info.get("name")
        oidc_sub = user_info.get("sub", "")

        # Try to find existing user by email
        existing_user: Optional[User] = None
        if email:
            stmt = (
                select(User)
                .where(User.email == email)
                .options(selectinload(User.plant_roles).selectinload(UserPlantRole.plant))
            )
            result = await self.session.execute(stmt)
            existing_user = result.scalar_one_or_none()

        # Try to find by username if not found by email
        if existing_user is None and preferred_username:
            existing_user = await self.user_repo.get_by_username(preferred_username)

        if existing_user is not None:
            logger.info(
                "oidc_user_found",
                user_id=existing_user.id,
                username=existing_user.username,
            )
            # Map roles from OIDC claims on each login
            await self._apply_role_mapping(existing_user, user_info, config)
            return existing_user

        # User not found — check if auto-provisioning is enabled
        if not config.auto_provision:
            raise ValueError(
                f"User not found and auto-provisioning is disabled for provider '{config.name}'"
            )

        # Generate a username from OIDC claims
        username = self._generate_username(user_info)

        # Create user with a random password (SSO users don't use password login)
        random_password = secrets.token_urlsafe(32)
        new_user = await self.user_repo.create(
            username=username,
            hashed_password=hash_password(random_password),
            email=email,
        )

        logger.info(
            "oidc_user_provisioned",
            user_id=new_user.id,
            username=username,
            provider=config.name,
        )

        # Apply role mapping for the new user
        await self._apply_role_mapping(new_user, user_info, config)

        return new_user

    def _generate_username(self, user_info: dict[str, Any]) -> str:
        """Generate a unique username from OIDC claims."""
        candidates = [
            user_info.get("preferred_username"),
            user_info.get("name"),
            user_info.get("email", "").split("@")[0] if user_info.get("email") else None,
            f"sso-{user_info.get('sub', secrets.token_hex(4))[:16]}",
        ]
        for candidate in candidates:
            if candidate:
                # Sanitize: keep alphanumeric and common separators
                clean = "".join(c for c in candidate if c.isalnum() or c in "-_.")
                if clean:
                    return clean[:50]  # Max 50 chars for username field

        return f"sso-{secrets.token_hex(4)}"

    async def _apply_role_mapping(
        self, user: User, user_info: dict[str, Any], config: OIDCConfig
    ) -> None:
        """Map OIDC groups/claims to OpenSPC roles.

        The role_mapping config is a JSON dict like:
        {
            "admin_group": "admin",
            "engineers": "engineer",
            "quality_team": "supervisor"
        }

        Where keys are OIDC group names (from the 'groups' claim)
        and values are OpenSPC role names.
        """
        role_mapping = config.role_mapping_dict
        if not role_mapping:
            # No role mapping configured — assign default role to all plants
            await self._assign_default_role(user, config)
            return

        # Get user's groups from OIDC claims
        oidc_groups = user_info.get("groups", [])
        if isinstance(oidc_groups, str):
            oidc_groups = [oidc_groups]

        # Also check roles claim (common in some providers)
        oidc_roles = user_info.get("roles", [])
        if isinstance(oidc_roles, str):
            oidc_roles = [oidc_roles]

        all_claims = set(oidc_groups + oidc_roles)

        # Find the highest matching role
        role_hierarchy = {"operator": 1, "supervisor": 2, "engineer": 3, "admin": 4}
        best_role = config.default_role
        best_level = role_hierarchy.get(best_role, 1)

        for claim_value, openspc_role in role_mapping.items():
            if claim_value in all_claims:
                level = role_hierarchy.get(openspc_role, 0)
                if level > best_level:
                    best_role = openspc_role
                    best_level = level

        # Assign the role at all plants
        try:
            role_enum = UserRole(best_role)
        except ValueError:
            role_enum = UserRole.operator

        # Get all plants and assign role
        from openspc.db.models.plant import Plant

        stmt = select(Plant).where(Plant.is_active == True)  # noqa: E712
        result = await self.session.execute(stmt)
        plants = result.scalars().all()

        for plant in plants:
            await self.user_repo.assign_plant_role(user.id, plant.id, role_enum)

        await self.session.flush()

    async def _assign_default_role(self, user: User, config: OIDCConfig) -> None:
        """Assign the provider's default role at all plants if user has no roles."""
        # Only assign if user has no existing plant roles
        if user.plant_roles and len(user.plant_roles) > 0:
            return

        try:
            role_enum = UserRole(config.default_role)
        except ValueError:
            role_enum = UserRole.operator

        from openspc.db.models.plant import Plant

        stmt = select(Plant).where(Plant.is_active == True)  # noqa: E712
        result = await self.session.execute(stmt)
        plants = result.scalars().all()

        for plant in plants:
            await self.user_repo.assign_plant_role(user.id, plant.id, role_enum)

        await self.session.flush()

    @staticmethod
    def map_roles(oidc_claims: dict[str, Any], role_mapping_config: dict[str, str]) -> str:
        """Map OIDC groups/claims to the best matching OpenSPC role.

        Args:
            oidc_claims: OIDC token claims.
            role_mapping_config: Mapping of OIDC group name -> OpenSPC role.

        Returns:
            The highest matching OpenSPC role name.
        """
        oidc_groups = oidc_claims.get("groups", [])
        if isinstance(oidc_groups, str):
            oidc_groups = [oidc_groups]

        role_hierarchy = {"operator": 1, "supervisor": 2, "engineer": 3, "admin": 4}
        best_role = "operator"
        best_level = 1

        for claim_value, openspc_role in role_mapping_config.items():
            if claim_value in oidc_groups:
                level = role_hierarchy.get(openspc_role, 0)
                if level > best_level:
                    best_role = openspc_role
                    best_level = level

        return best_role
