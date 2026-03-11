"""
Cassini FastAPI Application.

Copyright (c) 2026 Cassini Contributors
SPDX-License-Identifier: AGPL-3.0-only
"""

import asyncio
import structlog
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from cassini.api.v1.license import router as license_router
from cassini.api.v1.anomaly import router as anomaly_router
from cassini.api.v1.annotations import router as annotations_router
from cassini.api.v1.api_keys import router as api_keys_router
from cassini.api.v1.audit import router as audit_router
from cassini.api.v1.health import router as health_router
from cassini.api.v1.auth import router as auth_router
from cassini.api.v1.brokers import router as brokers_router
from cassini.api.v1.opcua_servers import router as opcua_servers_router
from cassini.api.v1.database_admin import router as database_admin_router
from cassini.api.v1.characteristic_config import router as config_router
from cassini.api.v1.capability import router as capability_router
from cassini.api.v1.characteristics import router as characteristics_router
from cassini.api.v1.data_entry import router as data_entry_router
from cassini.api.v1.distributions import router as distributions_router
from cassini.api.v1.fai import router as fai_router
from cassini.api.v1.gage_bridges import router as gage_bridges_router
from cassini.api.v1.import_router import router as import_router
from cassini.api.v1.ishikawa import router as ishikawa_router
from cassini.api.v1.msa import router as msa_router
from cassini.api.v1.hierarchy import router as hierarchy_router
from cassini.api.v1.notifications import router as notifications_router
from cassini.api.v1.oidc import router as oidc_router
from cassini.api.v1.push import router as push_router
from cassini.api.v1.erp_connectors import router as erp_router
from cassini.api.v1.explain import router as explain_router
from cassini.api.v1.hierarchy import plant_hierarchy_router
from cassini.api.v1.plants import router as plants_router
from cassini.api.v1.material_classes import router as material_classes_router
from cassini.api.v1.materials import router as materials_router
from cassini.api.v1.material_overrides import router as material_overrides_router
from cassini.api.v1.providers import router as providers_router
from cassini.api.v1.retention import router as retention_router
from cassini.api.v1.rule_presets import router as rule_presets_router
from cassini.api.v1.scheduled_reports import router as scheduled_reports_router
from cassini.api.v1.samples import router as samples_router
from cassini.api.v1.signatures import router as signatures_router
from cassini.api.v1.system_settings import router as system_settings_router
from cassini.api.v1.users import router as users_router
from cassini.api.v1.tags import router as tags_router
from cassini.api.v1.multivariate import router as multivariate_router
from cassini.api.v1.predictions import router as predictions_router
from cassini.api.v1.ai_analysis import router as ai_analysis_router
from cassini.api.v1.doe import router as doe_router
from cassini.api.v1.violations import router as violations_router
from cassini.api.v1.websocket import manager as ws_manager
from cassini.api.v1.websocket import router as websocket_router
from cassini.core.audit import AuditMiddleware
from cassini.core.auth.bootstrap import bootstrap_admin_user
from cassini.core.broadcast import WebSocketBroadcaster
from cassini.core.commercial import activate_commercial_features
from cassini.core.compliance import refresh_compliance_cache
from cassini.core.publish import MQTTPublisher
from cassini.core.config import get_settings
from cassini.core.licensing import LicenseService
from cassini.core.events import event_bus
from cassini.core.rate_limit import limiter
from cassini.core.providers import tag_provider_manager, opcua_provider_manager
from cassini.db.database import get_database
from cassini.mqtt import mqtt_manager
from cassini.opcua.manager import opcua_manager

logger = structlog.get_logger(__name__)
settings = get_settings()

# ---------------------------------------------------------------------------
# Commercial routers -- registered lazily when a commercial license is active
# ---------------------------------------------------------------------------
_COMMERCIAL_ROUTERS = [
    anomaly_router,
    api_keys_router,
    opcua_servers_router,
    database_admin_router,
    distributions_router,
    fai_router,
    gage_bridges_router,
    ishikawa_router,
    msa_router,
    notifications_router,
    oidc_router,
    retention_router,
    rule_presets_router,
    scheduled_reports_router,
    signatures_router,
    system_settings_router,
    push_router,
    erp_router,
    multivariate_router,
    predictions_router,
    ai_analysis_router,
    doe_router,
]


async def _recover_pending_spc(session, spc_queue) -> None:
    """Re-enqueue samples with spc_status='pending_spc' from a previous crash."""
    from collections import defaultdict
    from sqlalchemy import select as sa_select
    from cassini.db.models.sample import Sample
    from cassini.core.engine.spc_queue import SPCEvaluationRequest

    stmt = (
        sa_select(Sample.id, Sample.char_id, Sample.material_id)
        .where(Sample.spc_status == "pending_spc")
        .order_by(Sample.id)
    )
    result = await session.execute(stmt)
    rows = result.all()

    if not rows:
        return

    groups: dict[tuple[int, int | None], list[int]] = defaultdict(list)
    for row in rows:
        groups[(row.char_id, row.material_id)].append(row.id)

    for (char_id, material_id), sample_ids in groups.items():
        try:
            spc_queue.enqueue_nowait(SPCEvaluationRequest(
                characteristic_id=char_id,
                sample_ids=sample_ids,
                material_id=material_id,
            ))
        except asyncio.QueueFull:
            logger.error("spc_recovery_queue_full", char_id=char_id, pending=len(sample_ids))
            break

    logger.info("spc_recovery_complete", groups=len(groups), total_samples=len(rows))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup -- configure structlog BEFORE any logging calls
    from cassini.core.logging import configure_logging
    configure_logging(settings.log_format)

    logger.info("Starting Cassini application")

    # Store module-level license service on app.state (single instance)
    app.state.license_service = _license_svc
    license_service = _license_svc
    logger.info("License service initialized", edition=license_service.edition)

    # Lazy commercial activation state
    app.state.commercial_lock = asyncio.Lock()
    app.state.commercial_active = False
    app.state.commercial_routers = _COMMERCIAL_ROUTERS
    app.state.compliance_excess = 0

    # Initialize database connection
    db = get_database()

    # Store db and event_bus on app.state for lazy activation
    app.state.db = db
    app.state.event_bus = event_bus

    # Bootstrap admin user if no users exist
    try:
        async with db.session() as session:
            await bootstrap_admin_user(session)
    except Exception as e:
        logger.warning("admin_bootstrap_failed", error=str(e))

    # Check if database schema is up to date with Alembic head
    try:
        from alembic.config import Config as AlembicConfig
        from alembic.script import ScriptDirectory
        from alembic.runtime.migration import MigrationContext

        alembic_cfg = AlembicConfig()
        alembic_cfg.set_main_option("script_location", "alembic")
        script = ScriptDirectory.from_config(alembic_cfg)
        head_rev = script.get_current_head()

        async with db.engine.connect() as conn:
            def get_current_rev(sync_conn):
                context = MigrationContext.configure(sync_conn)
                return context.get_current_revision()
            current_rev = await conn.run_sync(get_current_rev)

        if current_rev != head_rev:
            logger.warning(
                "Database migration is behind: current=%s, head=%s. "
                "Run 'alembic upgrade head' to update.",
                current_rev, head_rev,
            )
        else:
            logger.info("Database schema is up to date (revision: %s)", current_rev)
    except Exception:
        logger.debug("Could not check migration status (non-fatal)", exc_info=True)

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
                logger.info(
                    "MQTT manager initialized -- brokers connecting in background "
                    "or no active brokers configured"
                )
    except Exception as e:
        logger.warning("mqtt_init_failed", error=str(e))

    # Initialize MQTT outbound publisher (after MQTT manager so brokers are connected)
    mqtt_publisher = MQTTPublisher(mqtt_manager, event_bus, db.session)
    app.state.mqtt_publisher = mqtt_publisher
    logger.info("MQTT outbound publisher initialized")

    # Store community managers in app state
    app.state.mqtt_manager = mqtt_manager
    app.state.tag_provider_manager = tag_provider_manager

    # -----------------------------------------------------------------------
    # Commercial-only services -- gated behind license
    # -----------------------------------------------------------------------
    if license_service.is_commercial:
        await activate_commercial_features(app, _COMMERCIAL_ROUTERS, db, event_bus)
    else:
        logger.info("Community edition -- enterprise services not initialized")

    # Compute initial compliance status
    try:
        async with db.session() as session:
            await refresh_compliance_cache(app, session)
    except Exception as e:
        logger.warning("initial_compliance_check_failed", error=str(e))

    # Wire rule cache invalidation to event bus (must happen once per worker)
    from cassini.core.events.events import CharacteristicUpdatedEvent
    from cassini.core.engine.spc_engine import invalidate_rule_cache

    async def _on_characteristic_updated(event: CharacteristicUpdatedEvent) -> None:
        invalidate_rule_cache(event.characteristic_id)

    event_bus.subscribe(CharacteristicUpdatedEvent, _on_characteristic_updated)

    # Start async SPC queue (commercial feature but always starts — community just won't use it)
    from cassini.core.engine.spc_queue import get_spc_queue
    from cassini.core.engine.rolling_window import get_shared_window_manager

    spc_queue = get_spc_queue()
    await spc_queue.start(db.session, event_bus, get_shared_window_manager())
    app.state.spc_queue = spc_queue

    try:
        async with db.session() as session:
            await _recover_pending_spc(session, spc_queue)
    except Exception as e:
        logger.warning("spc_recovery_failed", error=str(e))

    logger.info("Cassini application startup complete")

    yield

    # Shutdown
    logger.info("Shutting down Cassini application")

    # Shutdown commercial services (may not exist in Community edition)
    if hasattr(app.state, 'report_scheduler'):
        await app.state.report_scheduler.stop()

    if hasattr(app.state, 'purge_engine'):
        await app.state.purge_engine.stop()

    if hasattr(app.state, 'erp_sync_engine'):
        await app.state.erp_sync_engine.stop()

    # Shutdown OPC-UA (commercial -- may not be initialized)
    if hasattr(app.state, 'opcua_provider_manager'):
        await opcua_provider_manager.shutdown()

    if hasattr(app.state, 'opcua_manager'):
        await opcua_manager.shutdown()

    # Shutdown TAG provider first (before MQTT) -- community
    await tag_provider_manager.shutdown()

    # Shutdown MQTT manager -- community
    await mqtt_manager.shutdown()

    # Shutdown SPC queue (drain remaining items)
    if hasattr(app.state, 'spc_queue'):
        await app.state.spc_queue.shutdown(timeout=10.0)

    # Wait for pending event handlers to complete
    await event_bus.shutdown()

    # Stop WebSocket connection manager
    await ws_manager.stop()

    # Dispose database connection
    await db.dispose()

    logger.info("Cassini application shutdown complete")


app = FastAPI(
    title="Cassini",
    description="Cassini - Event-Driven Statistical Process Control System",
    version=settings.app_version,
    lifespan=lifespan,
)

# Rate limiting -- attach limiter to app state and register 429 handler
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Accept-Language", "X-API-Key", "X-Hub-Signature-256"],
)

# Compliance enforcement middleware (between CORS and Audit)
from cassini.api.middleware.compliance import ComplianceMiddleware

app.add_middleware(ComplianceMiddleware)

# Audit trail middleware (gets AuditService lazily from app.state)
app.add_middleware(AuditMiddleware)

# ---------------------------------------------------------------------------
# Register routers -- Community (always) vs Commercial (license-gated, lazy)
# ---------------------------------------------------------------------------

# Community routers -- always registered regardless of license
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(hierarchy_router, prefix="/api/v1/hierarchy")
app.include_router(plant_hierarchy_router, prefix="/api/v1/plants/{plant_id}/hierarchies")
app.include_router(plants_router)
app.include_router(characteristics_router)
app.include_router(config_router)
app.include_router(samples_router)
app.include_router(material_classes_router)
app.include_router(materials_router)
app.include_router(material_overrides_router)
app.include_router(violations_router)
app.include_router(data_entry_router)
app.include_router(import_router)
app.include_router(annotations_router)
app.include_router(tags_router)
app.include_router(capability_router)
app.include_router(websocket_router)
app.include_router(health_router, prefix="/api/v1")
app.include_router(brokers_router)
app.include_router(providers_router)
app.include_router(license_router)
app.include_router(audit_router)
app.include_router(explain_router)

# Commercial routers are registered lazily via activate_commercial_features()
# when a valid commercial license is present at startup or uploaded at runtime.

# Reuse the same LicenseService config as lifespan (single instance created here,
# stored on app.state during lifespan startup)
_license_svc = LicenseService(
    license_path=settings.license_file or None,
    public_key_path=settings.license_public_key_file or None,
    dev_commercial=settings.dev_commercial,
)

# Extension hook -- commercial package registers additional routers/services
try:
    from cassini_enterprise import initialize as init_enterprise  # type: ignore[import-not-found]
    init_enterprise(app, _license_svc)
    logger.info("Commercial extension package loaded")
except ImportError:
    pass  # Community edition -- no extension package

# Dev tools router -- only registered in sandbox mode
if settings.sandbox:
    from cassini.api.v1.devtools import router as devtools_router

    app.include_router(devtools_router)
    logger.info("Sandbox mode enabled -- devtools router registered")


@app.get("/health")
async def health_check():
    """Health check endpoint with real DB connectivity verification."""
    try:
        db = get_database()
        async with db.session() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception:
        from starlette.responses import JSONResponse
        return JSONResponse(status_code=503, content={"status": "unhealthy"})


# ---------------------------------------------------------------------------
# Frontend static file serving (production / Docker)
# ---------------------------------------------------------------------------
# When a built frontend exists (e.g. inside the Docker image at
# /app/frontend/dist), serve it directly from the backend.  In development
# the Vite dev server handles the frontend, so this block is skipped.
# ---------------------------------------------------------------------------
from pathlib import Path as _Path
from starlette.responses import FileResponse as _FileResponse

_frontend_dist_candidates = [
    _Path("/app/frontend/dist"),
    _Path(__file__).resolve().parent.parent.parent.parent / "frontend" / "dist",
]
_frontend_dist = next(
    (p for p in _frontend_dist_candidates if p.is_dir()), None
)

if _frontend_dist:
    _resolved_dist = _frontend_dist.resolve()
    _index_html = _resolved_dist / "index.html"

    @app.get("/", include_in_schema=False)
    async def serve_spa_root():
        """Serve the frontend SPA index page."""
        return _FileResponse(_index_html)

    @app.get("/{path:path}", include_in_schema=False)
    async def serve_frontend(path: str):
        """Serve frontend static assets, SPA fallback for client-side routing."""
        file = (_resolved_dist / path).resolve()
        if file.is_file() and file.is_relative_to(_resolved_dist):
            return _FileResponse(file)
        return _FileResponse(_index_html)

    logger.info("frontend_serving_enabled", dist_dir=str(_resolved_dist))
else:

    @app.get("/")
    async def root() -> dict[str, str]:
        """Root endpoint (no built frontend found)."""
        return {
            "name": "Cassini",
            "version": settings.app_version,
            "docs": "/docs",
        }
