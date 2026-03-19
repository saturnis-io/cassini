"""Cluster status and node registration endpoints."""
from __future__ import annotations

import os
import socket

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from cassini.core.auth.api_key import verify_api_key
from cassini.core.config import get_settings
from cassini.db.models.user import User, UserRole

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/cluster", tags=["cluster"])


class NodeInfo(BaseModel):
    id: str
    hostname: str
    pid: int
    roles: list[str]
    status: str
    version: str
    started_at: str | None = None


class ClusterStatus(BaseModel):
    mode: str  # "standalone" or "cluster"
    broker: str  # "local" or "valkey"
    nodes: list[NodeInfo]
    queue_depth: int
    leader_info: dict[str, str] | None = None


def _get_node_id(namespace: str) -> str:
    """Build a unique node identifier matching the leader election format."""
    return f"{namespace}:{socket.gethostname()}:{os.getpid()}"


async def _get_admin_or_api_key(request: Request) -> object:
    """Authenticate via JWT (admin required) or API key."""
    from cassini.api.deps import _get_user_from_jwt
    from cassini.db.database import get_database

    # Try JWT first
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        db = get_database()
        async with db.session() as session:
            try:
                user = await _get_user_from_jwt(auth, session)
                if any(pr.role == UserRole.admin for pr in user.plant_roles):
                    return user
            except HTTPException:
                pass

    # Fall back to API key (uses FastAPI's own dependency injection)
    api_key_header = request.headers.get("x-api-key", "")
    if api_key_header:
        from sqlalchemy.ext.asyncio import AsyncSession
        db = get_database()
        async with db.session() as session:
            try:
                return await verify_api_key(request=request, x_api_key=api_key_header, session=session)
            except HTTPException:
                pass

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
    )


@router.get("/status", response_model=ClusterStatus)
async def cluster_status(
    request: Request,
) -> ClusterStatus:
    """Get cluster status including all registered nodes.

    In standalone mode, returns information about the single node.
    In cluster mode, aggregates information from all registered nodes in Valkey.

    Accepts JWT (admin) or API key authentication.
    """
    await _get_admin_or_api_key(request)

    settings = get_settings()
    broker = getattr(request.app.state, "broker", None)

    # Get queue depth
    queue_depth = 0
    if broker:
        try:
            stats = await broker.task_queue.stats()
            queue_depth = stats.pending
        except Exception:
            logger.warning("cluster_status_queue_stats_failed", exc_info=True)

    # Determine mode
    is_cluster = bool(settings.broker_url)
    mode = "cluster" if is_cluster else "standalone"
    backend = broker.backend if broker else "local"

    # Build this node's info
    this_node = NodeInfo(
        id=_get_node_id(settings.broker_url or "local"),
        hostname=socket.gethostname(),
        pid=os.getpid(),
        roles=settings.role_list,
        status="healthy",
        version=settings.app_version,
    )

    nodes = [this_node]
    leader_info = None

    # In cluster mode, future enhancement: read registered nodes from Valkey
    # For now, just return this node

    return ClusterStatus(
        mode=mode,
        broker=backend,
        nodes=nodes,
        queue_depth=queue_depth,
        leader_info=leader_info,
    )
