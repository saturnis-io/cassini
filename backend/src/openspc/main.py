"""OpenSPC FastAPI Application."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from openspc.api.v1.characteristics import router as characteristics_router
from openspc.api.v1.hierarchy import router as hierarchy_router
from openspc.api.v1.samples import router as samples_router
from openspc.api.v1.violations import router as violations_router
from openspc.api.v1.websocket import manager as ws_manager
from openspc.api.v1.websocket import router as websocket_router
from openspc.core.broadcast import WebSocketBroadcaster
from openspc.core.events import event_bus
from openspc.db.database import get_database

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup
    logger.info("Starting OpenSPC application")

    # Initialize database connection
    db = get_database()

    # Start WebSocket connection manager
    await ws_manager.start()

    # Initialize WebSocket broadcaster and wire it to event bus
    broadcaster = WebSocketBroadcaster(ws_manager, event_bus)

    # Store broadcaster in app state for access by other components
    app.state.broadcaster = broadcaster

    logger.info("OpenSPC application startup complete")

    yield

    # Shutdown
    logger.info("Shutting down OpenSPC application")

    # Wait for pending event handlers to complete
    await event_bus.shutdown()

    # Stop WebSocket connection manager
    await ws_manager.stop()

    # Dispose database connection
    await db.dispose()

    logger.info("OpenSPC application shutdown complete")


app = FastAPI(
    title="OpenSPC",
    description="Event-Driven Statistical Process Control System",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(hierarchy_router)
app.include_router(characteristics_router)
app.include_router(samples_router)
app.include_router(violations_router)
app.include_router(websocket_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "name": "OpenSPC",
        "version": "0.1.0",
        "docs": "/docs",
    }
