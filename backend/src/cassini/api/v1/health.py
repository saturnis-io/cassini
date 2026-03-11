"""Health check endpoint for Docker and monitoring."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.core.config import get_settings
from cassini.db.database import get_session

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check(request: Request, session: AsyncSession = Depends(get_session)):
    """Return application health status with database connectivity."""
    settings = get_settings()
    db_ok = False
    try:
        await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    spc_queue_stats = None
    if hasattr(request.app.state, "spc_queue"):
        spc_queue_stats = request.app.state.spc_queue.stats

    status = "healthy" if db_ok else "degraded"

    return {
        "status": status,
        "version": settings.app_version,
        "database": "connected" if db_ok else "disconnected",
        "spc_queue": spc_queue_stats,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
