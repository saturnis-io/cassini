"""Health check endpoint for Docker and monitoring."""

from datetime import datetime, timezone

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.config import get_settings
from cassini.db.database import get_session

logger = structlog.get_logger(__name__)

router = APIRouter(tags=["health"])


async def _try_get_admin(request: Request) -> bool:
    """Best-effort check if request has valid admin credentials.

    Returns True if the caller is an authenticated admin, False otherwise.
    Never raises — swallows auth failures silently.
    """
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return False

    try:
        from cassini.core.auth.jwt import decode_access_token
        from cassini.db.database import get_database
        from cassini.db.models.user import User, UserRole
        from sqlalchemy.orm import selectinload

        token = auth_header.split(" ", 1)[1]
        payload = decode_access_token(token)
        user_id = int(payload.get("sub", 0))
        if not user_id:
            return False

        db = get_database()
        async with db.session() as session:
            from sqlalchemy import select
            stmt = (
                select(User)
                .options(selectinload(User.plant_roles))
                .where(User.id == user_id, User.is_active == True)  # noqa: E712
            )
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            if not user:
                return False
            return any(pr.role == UserRole.admin for pr in user.plant_roles)
    except Exception:
        return False


@router.get("/health")
async def health_check(request: Request, session: AsyncSession = Depends(get_session)):
    """Return application health status with database connectivity.

    Anonymous callers receive only status and database connectivity.
    Authenticated admins receive full details including version, SPC queue
    stats, and timestamp.
    """
    settings = get_settings()
    db_ok = False
    try:
        await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    status_str = "healthy" if db_ok else "degraded"

    # Check if caller is an authenticated admin
    is_admin = await _try_get_admin(request)

    if not is_admin:
        # Minimal response for anonymous / non-admin callers
        return {
            "status": status_str,
            "database": "connected" if db_ok else "disconnected",
        }

    # Full response for admin callers
    spc_queue_stats = None
    if hasattr(request.app.state, "spc_queue"):
        spc_queue_stats = request.app.state.spc_queue.stats

    return {
        "status": status_str,
        "version": settings.app_version,
        "database": "connected" if db_ok else "disconnected",
        "spc_queue": spc_queue_stats,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
