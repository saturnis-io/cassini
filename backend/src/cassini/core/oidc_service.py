"""OIDC authentication service for SSO integration.

Handles the OIDC authorization code flow:
1. Generate authorization URL for a given provider
2. Exchange authorization code for tokens
3. Extract user info from ID token / userinfo endpoint
4. Auto-provision local users from OIDC claims
5. Map OIDC groups/claims to Cassini roles
6. DB-backed CSRF state tokens and account linking
7. RP-initiated logout
"""

import json
import secrets
import structlog
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from urllib.parse import quote, urlparse

from authlib.integrations.httpx_client import AsyncOAuth2Client
from authlib.oidc.core import CodeIDToken
from authlib.jose import jwt as jose_jwt

from cassini.core.auth.jwt import create_access_token, create_refresh_token
from cassini.core.auth.passwords import hash_password
from cassini.db.dialects import decrypt_password, get_encryption_key
from cassini.db.models.oidc_config import OIDCConfig
from cassini.db.models.oidc_state import OIDCState, OIDCAccountLink
from cassini.db.models.user import User, UserPlantRole, UserRole
from cassini.db.repositories.oidc_config_repo import OIDCConfigRepository
from cassini.db.repositories.oidc_state_repo import OIDCStateRepository
from cassini.db.repositories.user import UserRepository

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = structlog.get_logger(__name__)


class OIDCService:
    """Service for OIDC authentication flows."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = OIDCConfigRepository(session)
        self.user_repo = UserRepository(session)
        self.state_repo = OIDCStateRepository(session)

    def _decrypt_client_secret(self, encrypted: str) -> str:
        """Decrypt the client secret using the database encryption key."""
        key = get_encryption_key()
        return decrypt_password(encrypted, key)

    def _validate_redirect_uri(
        self, redirect_uri: str, config: OIDCConfig
    ) -> None:
        """Validate redirect_uri against provider allowlist.

        Rejects:
        - URIs that are not well-formed HTTP/HTTPS URLs
        - URIs not in the provider's allowed_redirect_uris list
        - All URIs when no allowlist is configured (fail-closed)

        Raises:
            ValueError: If the URI is invalid or not allowed.
        """
        # Parse and validate basic URL structure
        parsed = urlparse(redirect_uri)
        if parsed.scheme not in ("http", "https"):
            logger.warning(
                "oidc_redirect_uri_rejected",
                reason="invalid_scheme",
                provider_id=config.id,
            )
            raise ValueError("redirect_uri must use http or https scheme")

        if not parsed.netloc:
            logger.warning(
                "oidc_redirect_uri_rejected",
                reason="missing_host",
                provider_id=config.id,
            )
            raise ValueError("redirect_uri must include a host")

        # Check against allowlist (fail-closed: reject if no allowlist)
        allowed_uris = config.allowed_redirect_uris_list
        if not allowed_uris:
            logger.warning(
                "oidc_redirect_uri_rejected",
                reason="no_allowlist_configured",
                provider_id=config.id,
            )
            raise ValueError(
                "No allowed redirect URIs configured for this provider"
            )

        if redirect_uri not in allowed_uris:
            logger.warning(
                "oidc_redirect_uri_rejected",
                reason="not_in_allowlist",
                provider_id=config.id,
            )
            raise ValueError("redirect_uri not in allowed list for this provider")

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

        # Validate redirect_uri is a well-formed HTTP(S) URL
        self._validate_redirect_uri(redirect_uri, config)

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

        # Store state in DB for verification in callback
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        await self.state_repo.create_state(
            state=state,
            nonce=nonce,
            provider_id=provider_id,
            redirect_uri=redirect_uri,
            expires_at=expires_at,
        )
        # Opportunistic cleanup of expired states
        await self.state_repo.cleanup_expired()

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
        provisions a local user if needed, and returns Cassini JWTs.

        Args:
            code: The authorization code from the provider.
            state: The state parameter for CSRF validation.

        Returns:
            Dict with access_token, refresh_token, and user info.

        Raises:
            ValueError: If state is invalid or callback processing fails.
        """
        # Validate state from DB (atomically pop to prevent reuse)
        pending_state = await self.state_repo.pop_state(state)
        if pending_state is None:
            raise ValueError("Invalid or expired OIDC state parameter")

        provider_id = pending_state.provider_id
        redirect_uri = pending_state.redirect_uri
        nonce = pending_state.nonce

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

        # Issue Cassini JWTs (embed password_changed_at for revocation)
        access_token = create_access_token(user.id, user.username, user.password_changed_at)
        refresh_token = create_refresh_token(user.id, user.password_changed_at)

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
        Applies claim mapping from provider config to normalize claim names.
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
                    # Validate nonce to prevent replay attacks (OIDC Core 3.1.3.7)
                    if payload.get("nonce") != nonce:
                        raise ValueError("ID token nonce mismatch — possible replay")
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

        # Apply claim mapping from provider config
        claim_mapping: dict[str, str] = {}
        if hasattr(config, "claim_mapping") and config.claim_mapping:
            try:
                claim_mapping = (
                    json.loads(config.claim_mapping)
                    if isinstance(config.claim_mapping, str)
                    else config.claim_mapping
                )
            except (json.JSONDecodeError, TypeError):
                pass

        # Map provider-specific claim names to standard ones
        mapped_info: dict[str, Any] = {}
        for standard_claim, provider_claim in claim_mapping.items():
            if provider_claim in user_info:
                mapped_info[standard_claim] = user_info[provider_claim]
        # Merge: mapped claims fill in missing standard claims without overriding
        for key, value in mapped_info.items():
            if key not in user_info:
                user_info[key] = value

        return user_info

    async def provision_user(
        self, user_info: dict[str, Any], config: OIDCConfig
    ) -> User:
        """Find or create a local user from OIDC user info.

        Lookup order:
        1. Account link (provider_id + sub) -- fastest, most reliable
        2. Email match
        3. Username match
        4. Auto-provision (if enabled)

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

        # 1. Try to find existing user via account link first
        account_link = await self.state_repo.get_by_subject(config.id, oidc_sub)
        if account_link is not None:
            existing_user = await self.user_repo.get_by_id(account_link.user_id)
            if existing_user is not None:
                logger.info(
                    "oidc_user_found_via_link",
                    user_id=existing_user.id,
                    username=existing_user.username,
                    provider_id=config.id,
                )
                await self._apply_role_mapping(existing_user, user_info, config)
                return existing_user

        # 2. Try to find existing user by email
        existing_user: Optional[User] = None
        if email:
            stmt = (
                select(User)
                .where(User.email == email)
                .options(selectinload(User.plant_roles).selectinload(UserPlantRole.plant))
            )
            result = await self.session.execute(stmt)
            existing_user = result.scalar_one_or_none()

        # 3. Try to find by username if not found by email
        if existing_user is None and preferred_username:
            existing_user = await self.user_repo.get_by_username(preferred_username)

        if existing_user is not None:
            logger.info(
                "oidc_user_found",
                user_id=existing_user.id,
                username=existing_user.username,
            )
            # Create account link for future fast lookups
            await self.state_repo.create_account_link(
                user_id=existing_user.id,
                provider_id=config.id,
                oidc_subject=oidc_sub,
            )
            # Map roles from OIDC claims on each login
            await self._apply_role_mapping(existing_user, user_info, config)
            return existing_user

        # User not found -- check if auto-provisioning is enabled
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

        # Create account link for the new user
        await self.state_repo.create_account_link(
            user_id=new_user.id,
            provider_id=config.id,
            oidc_subject=oidc_sub,
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
        """Map OIDC groups/claims to Cassini roles.

        The role_mapping config supports two formats:

        Legacy (all-plant):
            {"admin_group": "admin", "engineers": "engineer"}

        Plant-scoped:
            {"admin_group": {"*": "admin"}}
            {"team_a": {"1": "engineer", "2": "operator"}}

        Where keys are OIDC group names (from the 'groups' or 'roles' claim)
        and values are either a role string or a dict mapping plant IDs to roles.
        The special key "*" means all plants.
        """
        role_mapping = config.role_mapping_dict
        if not role_mapping:
            # No role mapping configured -- assign default role to all plants
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

        # Find the highest matching role (for all-plant / wildcard assignment)
        role_hierarchy = {"operator": 1, "supervisor": 2, "engineer": 3, "admin": 4}
        best_role = config.default_role
        best_level = role_hierarchy.get(best_role, 1)

        for claim_value, role_config in role_mapping.items():
            if claim_value in all_claims:
                if isinstance(role_config, str):
                    # Legacy format: treat as all-plant assignment
                    level = role_hierarchy.get(role_config, 0)
                    if level > best_level:
                        best_role = role_config
                        best_level = level
                elif isinstance(role_config, dict):
                    # Plant-scoped format -- "*" key means all plants
                    wildcard_role = role_config.get("*")
                    if wildcard_role:
                        level = role_hierarchy.get(wildcard_role, 0)
                        if level > best_level:
                            best_role = wildcard_role
                            best_level = level

        # Collect per-plant role assignments from scoped config
        per_plant_roles: dict[int, str] = {}
        for claim_value, role_config in role_mapping.items():
            if claim_value in all_claims and isinstance(role_config, dict):
                for plant_key, role_val in role_config.items():
                    if plant_key != "*":
                        try:
                            pid = int(plant_key)
                            per_plant_roles[pid] = role_val
                        except (ValueError, TypeError):
                            pass

        # Get all plants
        from cassini.db.models.plant import Plant

        stmt = select(Plant).where(Plant.is_active == True)  # noqa: E712
        result = await self.session.execute(stmt)
        plants = result.scalars().all()

        if per_plant_roles:
            # Assign per-plant roles where specified, fall back to best_role
            for plant in plants:
                plant_role = per_plant_roles.get(plant.id, best_role)
                try:
                    role_enum = UserRole(plant_role)
                except ValueError:
                    role_enum = UserRole.operator
                await self.user_repo.assign_plant_role(user.id, plant.id, role_enum)
        else:
            # Assign best_role to all plants (existing behavior)
            try:
                role_enum = UserRole(best_role)
            except ValueError:
                role_enum = UserRole.operator
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

        from cassini.db.models.plant import Plant

        stmt = select(Plant).where(Plant.is_active == True)  # noqa: E712
        result = await self.session.execute(stmt)
        plants = result.scalars().all()

        for plant in plants:
            await self.user_repo.assign_plant_role(user.id, plant.id, role_enum)

        await self.session.flush()

    async def initiate_logout(self, provider_id: int) -> Optional[str]:
        """Get the IdP end_session_endpoint URL for RP-initiated logout.

        Returns the full logout URL with post_logout_redirect_uri, or None
        if the provider doesn't support RP-initiated logout.
        """
        config = await self.repo.get_by_id(provider_id)
        if config is None:
            return None

        end_session_url = getattr(config, "end_session_endpoint", None)
        if not end_session_url:
            # Try discovery
            try:
                metadata = await self._get_oidc_metadata(config.issuer_url)
                end_session_url = metadata.get("end_session_endpoint")
            except Exception:
                pass

        if not end_session_url:
            return None

        # Append post_logout_redirect_uri if configured
        post_logout_uri = getattr(config, "post_logout_redirect_uri", None)
        if post_logout_uri:
            # Validate it's a well-formed HTTP(S) URL before using
            parsed_logout = urlparse(post_logout_uri)
            if parsed_logout.scheme in ("http", "https") and parsed_logout.netloc:
                separator = "&" if "?" in end_session_url else "?"
                encoded_uri = quote(post_logout_uri, safe="")
                end_session_url = f"{end_session_url}{separator}post_logout_redirect_uri={encoded_uri}"
            else:
                logger.warning(
                    "oidc_logout_invalid_redirect",
                    provider_id=provider_id,
                )

        return end_session_url

    @staticmethod
    def map_roles(oidc_claims: dict[str, Any], role_mapping_config: dict[str, str]) -> str:
        """Map OIDC groups/claims to the best matching Cassini role.

        Args:
            oidc_claims: OIDC token claims.
            role_mapping_config: Mapping of OIDC group name -> Cassini role.

        Returns:
            The highest matching Cassini role name.
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
