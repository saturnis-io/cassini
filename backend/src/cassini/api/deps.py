"""FastAPI dependency injection functions.

Provides database sessions, repository instances, and auth dependencies for API endpoints.
"""

import time
from collections.abc import AsyncGenerator
from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import make_transient

from cassini.core.alerts.manager import AlertManager
from cassini.core.auth.roles import ROLE_HIERARCHY, get_user_role_level_for_plant
from cassini.core.licensing import LicenseService
from cassini.db.database import get_session
from cassini.db.models.user import User, UserPlantRole, UserRole
from cassini.db.repositories.characteristic import CharacteristicRepository
from cassini.db.repositories.hierarchy import HierarchyRepository
from cassini.db.repositories.sample import SampleRepository
from cassini.db.repositories.user import UserRepository
from cassini.db.repositories.violation import ViolationRepository


# ---------------------------------------------------------------------------
# User cache — avoids DB hit on every authenticated request (60s TTL)
# Bounded to _USER_CACHE_MAX entries; oldest-first eviction on overflow.
# ---------------------------------------------------------------------------
_USER_CACHE_TTL = 60  # seconds
_USER_CACHE_MAX = 500  # max cached users — prevents unbounded growth
_user_cache: dict[int, tuple[float, User]] = {}


def invalidate_user_cache(user_id: int) -> None:
    """Remove a user from the in-memory cache after mutation."""
    _user_cache.pop(user_id, None)


def _get_cached_user(user_id: int) -> Optional[User]:
    """Return cached user if present and not expired."""
    entry = _user_cache.get(user_id)
    if entry is None:
        return None
    cached_at, user = entry
    if time.monotonic() - cached_at > _USER_CACHE_TTL:
        del _user_cache[user_id]
        return None
    return user


def _cache_user(user: User, session: AsyncSession) -> None:
    """Detach user from session and store in cache.

    Bounded to ``_USER_CACHE_MAX`` entries. When the limit is reached the
    oldest entry (by insertion time) is evicted — dict preserves insertion
    order since Python 3.7.
    """
    try:
        # Expunge from session so the object isn't bound to a closed session later
        session.expunge(user)
        # Make transient so SQLAlchemy doesn't try to track it
        make_transient(user)
        # Also make plant_roles and their plants transient
        for pr in user.plant_roles:
            session.expunge(pr)
            make_transient(pr)
            if pr.plant is not None:
                session.expunge(pr.plant)
                make_transient(pr.plant)
    except Exception:
        # If expunge/make_transient fails (e.g. object already detached),
        # skip caching rather than crashing the request.
        return
    # Evict oldest entries if at capacity
    while len(_user_cache) >= _USER_CACHE_MAX:
        _user_cache.pop(next(iter(_user_cache)))
    _user_cache[user.id] = (time.monotonic(), user)


# ---------------------------------------------------------------------------
# Characteristic-to-plant cache — avoids recursive hierarchy walk (5min TTL)
# ---------------------------------------------------------------------------
_CHAR_PLANT_CACHE_TTL = 300  # seconds
_char_plant_cache: dict[int, tuple[float, int]] = {}


def invalidate_char_plant_cache(characteristic_id: Optional[int] = None) -> None:
    """Remove entries from the characteristic-to-plant cache.

    If characteristic_id is None, clears the entire cache.
    """
    if characteristic_id is None:
        _char_plant_cache.clear()
    else:
        _char_plant_cache.pop(characteristic_id, None)


# ---------------------------------------------------------------------------
# Session dependency — single canonical source for all database sessions
# ---------------------------------------------------------------------------
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """Get async database session.

    This is the canonical session dependency. All repository factories and
    endpoints should use this instead of importing ``get_session`` directly.

    Yields:
        AsyncSession instance for database operations
    """
    async for session in get_session():
        yield session


# ---------------------------------------------------------------------------
# Repository factories
# ---------------------------------------------------------------------------
async def get_user_repo(
    session: AsyncSession = Depends(get_db_session),
) -> UserRepository:
    """Get user repository instance."""
    return UserRepository(session)


async def get_hierarchy_repo(
    session: AsyncSession = Depends(get_db_session),
) -> HierarchyRepository:
    """Get hierarchy repository instance."""
    return HierarchyRepository(session)


async def get_characteristic_repo(
    session: AsyncSession = Depends(get_db_session),
) -> CharacteristicRepository:
    """Get characteristic repository instance."""
    return CharacteristicRepository(session)


async def get_violation_repo(
    session: AsyncSession = Depends(get_db_session),
) -> ViolationRepository:
    """Get violation repository instance."""
    return ViolationRepository(session)


async def get_sample_repo(
    session: AsyncSession = Depends(get_db_session),
) -> SampleRepository:
    """Get sample repository instance."""
    return SampleRepository(session)


async def get_alert_manager(
    request: Request,
    violation_repo: ViolationRepository = Depends(get_violation_repo),
    sample_repo: SampleRepository = Depends(get_sample_repo),
) -> AlertManager:
    """Get alert manager instance with broadcaster wired."""
    manager = AlertManager(violation_repo, sample_repo)
    if hasattr(request.app.state, "broadcaster"):
        manager.add_notifier(request.app.state.broadcaster)
    return manager


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------
async def _get_user_from_jwt(
    authorization: Optional[str],
    session: AsyncSession,
) -> User:
    """Extract and validate a user from a JWT Bearer token.

    Shared logic for all JWT-based auth dependencies.  Validates the token,
    checks the user cache, verifies the user is active and that the token
    has not been revoked by a password change.

    Returns:
        Authenticated User object with plant_roles loaded.

    Raises:
        HTTPException: 401 if token is invalid, missing, or user not found.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    from cassini.core.auth.jwt import verify_access_token

    token = authorization.split(" ", 1)[1]
    payload = verify_access_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = int(payload["sub"])
    pwd_changed_claim = payload.get("pwd_changed")

    # Check in-memory cache first
    cached = _get_cached_user(user_id)
    if cached is not None:
        if not cached.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Validate JWT hasn't been revoked by password change
        if cached.password_changed_at and pwd_changed_claim is not None:
            user_pwd_epoch = int(cached.password_changed_at.timestamp())
            if pwd_changed_claim < user_pwd_epoch:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Token invalidated by password change",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        return cached

    # Cache miss — query DB
    repo = UserRepository(session)
    user = await repo.get_by_id(user_id)

    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # JWT revocation: reject tokens issued before last password change
    if user.password_changed_at and pwd_changed_claim is not None:
        user_pwd_epoch = int(user.password_changed_at.timestamp())
        if pwd_changed_claim < user_pwd_epoch:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token invalidated by password change",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Store in cache (detached from session)
    _cache_user(user, session)

    return user


async def get_current_user(
    authorization: Optional[str] = Header(None),
    session: AsyncSession = Depends(get_db_session),
) -> User:
    """Extract and validate the current user from JWT Bearer token.

    Uses an in-memory TTL cache (60s) to avoid DB queries on every request.
    Cache is invalidated on user mutations (password change, role change, etc.).

    Args:
        authorization: Authorization header value.
        session: Database session.

    Returns:
        Authenticated User object with plant_roles loaded.

    Raises:
        HTTPException: 401 if token is invalid, missing, or user not found.
    """
    return await _get_user_from_jwt(authorization, session)


async def get_current_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Require the current user to be an admin at any plant."""
    for pr in user.plant_roles:
        if pr.role == UserRole.admin:
            return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Admin privileges required",
    )


async def get_current_engineer(
    user: User = Depends(get_current_user),
) -> User:
    """Require the current user to be at least engineer at any plant."""
    for pr in user.plant_roles:
        if ROLE_HIERARCHY.get(pr.role.value, 0) >= ROLE_HIERARCHY["engineer"]:
            return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Engineer or higher privileges required",
    )


def require_role(min_role: str):
    """Factory that returns a dependency checking if user has >= min_role at any plant."""
    min_level = ROLE_HIERARCHY.get(min_role, 0)

    async def check_role(user: User = Depends(get_current_user)) -> User:
        for pr in user.plant_roles:
            if ROLE_HIERARCHY.get(pr.role.value, 0) >= min_level:
                return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{min_role} or higher privileges required",
        )

    return check_role


# ---------------------------------------------------------------------------
# Plant-scoped RBAC helpers
# ---------------------------------------------------------------------------
# get_user_role_level_for_plant is imported from core.auth.roles above


def check_plant_role(user: User, plant_id: int, min_role: str) -> None:
    """Verify user has at least min_role for a specific plant. Raises 403 if not."""
    min_level = ROLE_HIERARCHY.get(min_role, 0)
    if get_user_role_level_for_plant(user, plant_id) < min_level:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"{min_role} or higher privileges required for this plant",
        )


def get_accessible_plant_ids(user: User) -> set[int]:
    """Return the set of plant IDs the user has any role at.

    Admin users at any plant are treated as having access to every plant — the
    caller should detect the wildcard case via ``user_is_global_admin(user)``
    and skip plant filtering entirely. For non-admin users this function
    returns the explicit plant_ids their UserPlantRole rows reference.
    """
    return {pr.plant_id for pr in user.plant_roles}


def user_is_global_admin(user: User) -> bool:
    """True if the user has the admin role at any plant.

    Mirrors ``get_user_role_level_for_plant``'s admin-everywhere semantics —
    admins can read any plant's data. Used for list-endpoint filtering of
    operational data (samples, violations, characteristics).

    Note: audit-log queries DO NOT use this helper. Admin-scoped tenant
    isolation requires that an admin at Plant A cannot read Plant B's audit
    rows; use ``get_admin_plant_ids`` for that path.
    """
    return any(pr.role == UserRole.admin for pr in user.plant_roles)


def get_admin_plant_ids(user: User) -> set[int]:
    """Return the set of plant IDs the user has the *admin* role at.

    Distinct from ``get_accessible_plant_ids`` which includes any role.
    Used by audit-log queries which require admin-at-plant for visibility
    rather than admin-anywhere.
    """
    return {pr.plant_id for pr in user.plant_roles if pr.role == UserRole.admin}


async def resolve_plant_id_for_sample(
    sample_id: int, session: AsyncSession
) -> Optional[int]:
    """Resolve the plant_id that owns a sample via sample → characteristic → hierarchy.

    Returns ``None`` when the sample does not exist; callers should treat that
    as "not found" rather than leaking existence information.
    """
    from sqlalchemy import select as sa_select

    from cassini.db.models.sample import Sample

    char_id = (
        await session.execute(
            sa_select(Sample.char_id).where(Sample.id == sample_id)
        )
    ).scalar_one_or_none()
    if char_id is None:
        return None
    try:
        return await resolve_plant_id_for_characteristic(char_id, session)
    except HTTPException:
        return None


async def resolve_plant_id_for_violation(
    violation_id: int, session: AsyncSession
) -> Optional[int]:
    """Resolve the plant_id that owns a violation via violation → sample → characteristic.

    Returns ``None`` when the violation does not exist or its plant cannot be
    resolved.
    """
    from sqlalchemy import select as sa_select

    from cassini.db.models.violation import Violation

    char_id = (
        await session.execute(
            sa_select(Violation.char_id).where(Violation.id == violation_id)
        )
    ).scalar_one_or_none()
    if char_id is None:
        # Fall back to char via sample (older rows may not have char_id denormalized)
        from cassini.db.models.sample import Sample as _Sample

        char_id = (
            await session.execute(
                sa_select(_Sample.char_id)
                .join(Violation, Violation.sample_id == _Sample.id)
                .where(Violation.id == violation_id)
            )
        ).scalar_one_or_none()
    if char_id is None:
        return None
    try:
        return await resolve_plant_id_for_characteristic(char_id, session)
    except HTTPException:
        return None


async def get_current_user_no_api_key(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_db_session),
) -> User:
    """Full user auth required. API keys rejected. For signature operations.

    Electronic signatures under 21 CFR Part 11 must be attributable to an
    authenticated individual, not a system-level API key.
    """
    if x_api_key and (not authorization or not authorization.startswith("Bearer ")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Electronic signatures require user authentication, not API key",
        )

    return await _get_user_from_jwt(authorization, session)


async def get_current_user_or_api_key(
    authorization: Optional[str] = Header(None),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
    session: AsyncSession = Depends(get_db_session),
):
    """Dual auth: try JWT first, fall back to API key.

    Returns either a User object (JWT) or an APIKey object (API key).
    """
    # Try JWT first
    if authorization and authorization.startswith("Bearer "):
        from cassini.core.auth.jwt import verify_access_token as _verify_access

        token = authorization.split(" ", 1)[1]
        payload = _verify_access(token)
        if payload is not None:
            user_id = int(payload["sub"])
            pwd_changed_claim = payload.get("pwd_changed")
            repo = UserRepository(session)
            user = await repo.get_by_id(user_id)
            if user and user.is_active:
                # Validate JWT hasn't been revoked by password change
                if user.password_changed_at and pwd_changed_claim is not None:
                    user_pwd_epoch = int(user.password_changed_at.timestamp())
                    if pwd_changed_claim < user_pwd_epoch:
                        raise HTTPException(
                            status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Token invalidated by password change",
                            headers={"WWW-Authenticate": "Bearer"},
                        )
                return user

    # Fall back to API key (lazy import to avoid circular dependency)
    if x_api_key:
        try:
            from cassini.core.auth.api_key import verify_api_key

            api_key = await verify_api_key(x_api_key=x_api_key, session=session)
            return api_key
        except HTTPException:
            pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def resolve_plant_id_for_characteristic(
    characteristic_id: int,
    session: AsyncSession,
) -> int:
    """Resolve the plant_id that a characteristic belongs to via hierarchy.

    Uses a recursive CTE (single query) instead of walking up the tree one
    node at a time. Results are cached for 5 minutes.

    Works on both SQLite and PostgreSQL.
    """
    from sqlalchemy import select as sa_select

    from cassini.db.models.characteristic import Characteristic

    # Check cache first
    cache_entry = _char_plant_cache.get(characteristic_id)
    if cache_entry is not None:
        cached_at, plant_id = cache_entry
        if time.monotonic() - cached_at <= _CHAR_PLANT_CACHE_TTL:
            return plant_id
        del _char_plant_cache[characteristic_id]

    # Get the hierarchy_id for the characteristic
    char_row = (
        await session.execute(
            sa_select(Characteristic.hierarchy_id).where(
                Characteristic.id == characteristic_id
            )
        )
    ).scalar_one_or_none()

    if char_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Characteristic {characteristic_id} not found",
        )

    hierarchy_id = char_row

    # Single recursive CTE query — works on SQLite and PostgreSQL.
    # depth < 50 guard prevents infinite recursion on cyclic data.
    cte_sql = text("""
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_id, plant_id, 1 AS depth
            FROM hierarchy
            WHERE id = :start_id
            UNION ALL
            SELECT h.id, h.parent_id, h.plant_id, a.depth + 1
            FROM hierarchy h
            JOIN ancestors a ON h.id = a.parent_id
            WHERE a.depth < 50
        )
        SELECT plant_id FROM ancestors WHERE plant_id IS NOT NULL LIMIT 1
    """)
    result = await session.execute(cte_sql, {"start_id": hierarchy_id})
    plant_id = result.scalar_one_or_none()

    if plant_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Could not resolve plant for characteristic {characteristic_id}",
        )

    # Cache the result
    _char_plant_cache[characteristic_id] = (time.monotonic(), plant_id)
    return plant_id


def get_license_service(request: Request) -> LicenseService:
    """Get the LicenseService from app state."""
    return request.app.state.license_service
