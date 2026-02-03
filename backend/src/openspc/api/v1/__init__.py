"""OpenSPC API v1 endpoints."""

from openspc.api.v1.characteristics import router as characteristics_router
from openspc.api.v1.hierarchy import router as hierarchy_router
from openspc.api.v1.samples import router as samples_router
from openspc.api.v1.violations import router as violations_router
from openspc.api.v1.websocket import router as websocket_router

__all__ = [
    "characteristics_router",
    "hierarchy_router",
    "samples_router",
    "violations_router",
    "websocket_router",
]
