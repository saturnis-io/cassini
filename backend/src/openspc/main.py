"""OpenSPC FastAPI Application."""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from openspc.api.v1.api_keys import router as api_keys_router
from openspc.api.v1.brokers import router as brokers_router
from openspc.api.v1.characteristic_config import router as config_router
from openspc.api.v1.characteristics import router as characteristics_router
from openspc.api.v1.data_entry import router as data_entry_router
from openspc.api.v1.hierarchy import router as hierarchy_router
from openspc.api.v1.providers import router as providers_router
from openspc.api.v1.samples import router as samples_router
from openspc.api.v1.violations import router as violations_router
from openspc.api.v1.websocket import manager as ws_manager
from openspc.api.v1.websocket import router as websocket_router
from openspc.core.broadcast import WebSocketBroadcaster
from openspc.core.events import event_bus
from openspc.core.providers import tag_provider_manager
from openspc.db.database import get_database
from openspc.mqtt import mqtt_manager

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

    # Initialize MQTT manager with database session
    try:
        async with db.session() as session:
            mqtt_connected = await mqtt_manager.initialize(session)
            if mqtt_connected:
                logger.info("MQTT manager connected successfully")

                # Initialize TAG provider if MQTT is connected
                tag_connected = await tag_provider_manager.initialize(session)
                if tag_connected:
                    logger.info("TAG provider initialized successfully")
                else:
                    logger.info("TAG provider initialization deferred")
            else:
                logger.info("MQTT manager initialized but not connected (no active broker)")
    except Exception as e:
        logger.warning(f"Failed to initialize MQTT manager: {e}")

    # Store managers in app state
    app.state.mqtt_manager = mqtt_manager
    app.state.tag_provider_manager = tag_provider_manager

    logger.info("OpenSPC application startup complete")

    yield

    # Shutdown
    logger.info("Shutting down OpenSPC application")

    # Shutdown TAG provider first (before MQTT)
    await tag_provider_manager.shutdown()

    # Shutdown MQTT manager
    await mqtt_manager.shutdown()

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
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(hierarchy_router, prefix="/api/v1/hierarchy")
app.include_router(api_keys_router)
app.include_router(brokers_router)
app.include_router(characteristics_router)
app.include_router(config_router)
app.include_router(data_entry_router)
app.include_router(providers_router)
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
