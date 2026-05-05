"""
Cassini FastAPI Application.

Copyright (c) 2026 Cassini Contributors
SPDX-License-Identifier: AGPL-3.0-only
"""

import asyncio
import sys
import structlog
from contextlib import asynccontextmanager

# ---------------------------------------------------------------------------
# Windows event loop policy — must be set before any asyncio operations.
# aiomqtt (paho-mqtt) uses add_reader/add_writer socket callbacks which
# require SelectorEventLoop. Windows defaults to ProactorEventLoop which
# does not implement these methods, causing MQTT connections to fail.
# SelectorEventLoop is fully compatible with uvicorn HTTP/WebSocket serving.
# ---------------------------------------------------------------------------
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from typing import AsyncGenerator

from fastapi import FastAPI, Request as FastAPIRequest
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from cassini.core.broker import create_broker
from cassini.core.broker.event_adapter import TypedEventBusAdapter
from cassini.api.v1.license import router as license_router
from cassini.api.v1.anomaly import router as anomaly_router
from cassini.api.v1.annotations import router as annotations_router
from cassini.api.v1.api_keys import router as api_keys_router
from cassini.api.v1.audit import router as audit_router
from cassini.api.v1.health import router as health_router
from cassini.api.v1.auth import router as auth_router
from cassini.api.v1.cli_auth import router as cli_auth_router
from cassini.api.v1.cluster import router as cluster_router
from cassini.api.v1.brokers import router as brokers_router
from cassini.api.v1.opcua_servers import router as opcua_servers_router
from cassini.api.v1.database_admin import router as database_admin_router
from cassini.api.v1.characteristic_config import router as config_router
from cassini.api.v1.capability import router as capability_router
from cassini.api.v1.cep_rules import router as cep_rules_router
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
from cassini.api.v1.report_analytics import router as report_analytics_router
from cassini.api.v1.scheduled_reports import router as scheduled_reports_router
from cassini.api.v1.samples import router as samples_router
from cassini.api.v1.signatures import router as signatures_router
from cassini.api.v1.system_settings import router as system_settings_router
from cassini.api.v1.users import router as users_router
from cassini.api.v1.tags import router as tags_router
from cassini.api.v1.multivariate import router as multivariate_router
from cassini.api.v1.predictions import router as predictions_router
from cassini.api.v1.ai_analysis import router as ai_analysis_router
from cassini.api.v1.correlation import router as correlation_router
from cassini.api.v1.collection_plans import router as collection_plans_router
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
# Tiered commercial routers -- registered lazily when a commercial license is active
# ---------------------------------------------------------------------------

# Pro routers -- available to Pro AND Enterprise licenses
_PRO_ROUTERS = [
    opcua_servers_router,
    distributions_router,
    msa_router,
    doe_router,
    correlation_router,
    rule_presets_router,
    ishikawa_router,
    notifications_router,
    scheduled_reports_router,
    report_analytics_router,
    api_keys_router,
    push_router,
]

# Enterprise routers -- available to Enterprise licenses ONLY
_ENTERPRISE_ROUTERS = [
    anomaly_router,
    gage_bridges_router,
    fai_router,
    multivariate_router,
    predictions_router,
    ai_analysis_router,
    signatures_router,
    oidc_router,
    erp_router,
    retention_router,
    database_admin_router,
    system_settings_router,
    cep_rules_router,
]


async def _recover_pending_spc(session, spc_queue=None, task_queue=None) -> None:
    """Re-enqueue samples with spc_status='pending_spc' from a previous crash."""
    from cassini.core.engine.spc_recovery import recover_pending_spc

    await recover_pending_spc(
        session,
        spc_queue=spc_queue,
        task_queue=task_queue,
    )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup -- configure structlog BEFORE any logging calls
    from cassini.core.logging import configure_logging
    configure_logging(settings.log_format)

    logger.info("Starting Cassini application")

    # Drain mode flag — load balancers poll /health/ready and stop sending
    # traffic when this is True.  Set to True at the very start of shutdown.
    app.state.draining = False

    # -----------------------------------------------------------------------
    # Broker abstraction — wraps event_bus for cluster-ready pub/sub
    # -----------------------------------------------------------------------
    broker = create_broker(broker_url=settings.broker_url)
    app.state.broker = broker

    # Wrap the broker's event bus with TypedEventBusAdapter for backward compat
    typed_event_bus = TypedEventBusAdapter(broker.event_bus)

    # Register all known event types to string topics
    from cassini.core.events.events import (
        SampleProcessedEvent,
        ViolationCreatedEvent,
        ViolationAcknowledgedEvent,
        ControlLimitsUpdatedEvent,
        CharacteristicCreatedEvent,
        CharacteristicUpdatedEvent,
        CharacteristicDeletedEvent,
        AlertThresholdExceededEvent,
        AnomalyDetectedEvent,
        SignatureCreatedEvent,
        SignatureRejectedEvent,
        WorkflowCompletedEvent,
        WorkflowExpiredEvent,
        SignatureInvalidatedEvent,
        ERPSyncCompletedEvent,
        PredictedOOCEvent,
        CorrelationAlertEvent,
        PurgeCompletedEvent,
        BatchEvaluationCompleteEvent,
    )

    _event_mappings: list[tuple[type, str]] = [
        (SampleProcessedEvent, "sample.processed"),
        (ViolationCreatedEvent, "violation.created"),
        (ViolationAcknowledgedEvent, "violation.acknowledged"),
        (ControlLimitsUpdatedEvent, "control_limits.updated"),
        (CharacteristicCreatedEvent, "characteristic.created"),
        (CharacteristicUpdatedEvent, "characteristic.updated"),
        (CharacteristicDeletedEvent, "characteristic.deleted"),
        (AlertThresholdExceededEvent, "alert.threshold_exceeded"),
        (AnomalyDetectedEvent, "anomaly.detected"),
        (SignatureCreatedEvent, "signature.created"),
        (SignatureRejectedEvent, "signature.rejected"),
        (WorkflowCompletedEvent, "workflow.completed"),
        (WorkflowExpiredEvent, "workflow.expired"),
        (SignatureInvalidatedEvent, "signature.invalidated"),
        (ERPSyncCompletedEvent, "erp_sync.completed"),
        (PredictedOOCEvent, "predicted_ooc"),
        (CorrelationAlertEvent, "correlation.alert"),
        (PurgeCompletedEvent, "purge.completed"),
        (BatchEvaluationCompleteEvent, "batch_evaluation.complete"),
    ]
    for event_cls, topic in _event_mappings:
        typed_event_bus.register_event_type(event_cls, topic)

    # Bridge the legacy module-level event_bus singleton to the new
    # TypedEventBusAdapter.  Any code that imports the old ``event_bus``
    # and calls ``await event_bus.publish(SomeEvent(...))`` will now
    # forward through the adapter, ensuring a single event bus for the
    # entire process (no split-brain).
    event_bus.set_delegate(typed_event_bus)

    logger.info(
        "broker_initialized",
        backend=broker.backend,
        roles=settings.role_list,
    )

    # Store module-level license service on app.state (single instance)
    app.state.license_service = _license_svc
    license_service = _license_svc
    logger.info("License service initialized", edition=license_service.edition)

    # Lazy commercial activation state
    app.state.commercial_lock = asyncio.Lock()
    app.state.commercial_tier = None  # None = community, "pro", "enterprise"
    app.state.pro_routers = _PRO_ROUTERS
    app.state.enterprise_routers = _ENTERPRISE_ROUTERS
    app.state.registered_routers = set()  # Track registered routers to prevent duplicates
    app.state.compliance_excess = 0

    # Initialize database connection
    db = get_database()

    # Store db and event_bus on app.state for lazy activation
    app.state.db = db
    app.state.event_bus = typed_event_bus

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
    # In cluster mode, pass the BroadcastChannel for cross-node fan-out
    _bc_channel = broker.broadcast if broker.backend != "local" else None
    broadcaster = WebSocketBroadcaster(
        ws_manager, typed_event_bus, broadcast_channel=_bc_channel
    )

    # Store broadcaster in app state for access by other components
    app.state.broadcaster = broadcaster

    # Initialize MQTT / ingestion subsystems (gated by ingestion role)
    if settings.has_role("ingestion"):
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
        mqtt_publisher = MQTTPublisher(mqtt_manager, typed_event_bus, db.session)
        app.state.mqtt_publisher = mqtt_publisher
        logger.info("MQTT outbound publisher initialized")
    else:
        logger.info("ingestion_role_skipped", roles=settings.role_list)

    # Store community managers in app state (always — used by API endpoints)
    app.state.mqtt_manager = mqtt_manager
    app.state.tag_provider_manager = tag_provider_manager

    # -----------------------------------------------------------------------
    # Audit trail service -- always active for ALL tiers (regulatory compliance)
    # -----------------------------------------------------------------------
    from cassini.core.audit import AuditService

    audit_service = AuditService(db.session)
    app.state.audit_service = audit_service
    # Start the queue + writer task. recover_last_hash() runs inside
    # start_writer() so the cached chain tail is set before the writer
    # appends.  After this call, AuditService.log() is a fast non-blocking
    # enqueue; the writer drains the queue in batches.
    await audit_service.start_writer()
    logger.info("Audit trail service initialized (all tiers)")

    # -----------------------------------------------------------------------
    # Signature HMAC key — fail-fast verification (21 CFR Part 11 §11.10(e))
    #
    # The key file is resolved relative to a STABLE data directory
    # (CASSINI_DATA_DIR or `<backend>/data`), NEVER relative to CWD. If
    # the file is missing AND the database already contains historical
    # signatures, refuse to start so a silent regeneration cannot mark
    # every prior signature as tampered.
    # -----------------------------------------------------------------------
    try:
        from cassini.core.signature_engine import verify_signature_key_path
        from cassini.db.models.signature import ElectronicSignature
        from sqlalchemy import func, select

        async with db.session() as session:
            result = await session.execute(
                select(func.count()).select_from(ElectronicSignature)
            )
            sig_count = result.scalar_one() or 0
        verify_signature_key_path(signatures_exist=sig_count > 0)
    except RuntimeError:
        # Re-raise to abort startup with a clean traceback
        raise
    except Exception as e:
        # Database not yet migrated, table missing on fresh install, etc.
        # In that case there are no signatures by definition — log and
        # continue. The key will be generated lazily on first sign().
        logger.debug(
            "signature_key_precheck_skipped",
            reason=type(e).__name__,
        )

    # -----------------------------------------------------------------------
    # Commercial-only services -- gated behind license
    # -----------------------------------------------------------------------
    if license_service.is_commercial:
        tier = license_service.tier
        routers = _PRO_ROUTERS + _ENTERPRISE_ROUTERS if license_service.is_enterprise else _PRO_ROUTERS
        await activate_commercial_features(app, routers, db, typed_event_bus, tier=tier)
    else:
        logger.info("Community edition -- commercial services not initialized")

    # -----------------------------------------------------------------------
    # Streaming CEP engine (Enterprise) — subscribes to SampleProcessedEvent
    # and fires multi-stream pattern matches as violations. In cluster
    # mode the elected leader for the "cep" role evaluates rules; other
    # nodes still mutate streaming state so a takeover resumes cleanly.
    # -----------------------------------------------------------------------
    if license_service.is_enterprise:
        from cassini.core.cep.engine import CepEngine

        cep_leader = None
        cep_redis_client = getattr(broker.event_bus, "_client", None)
        if broker.backend != "local" and cep_redis_client is not None:
            from cassini.core.broker.leader import LeaderElection

            cep_leader = LeaderElection(
                redis_client=cep_redis_client,
                role="cep",
                namespace=getattr(settings, "broker_namespace", "default"),
            )
            try:
                if await cep_leader.try_acquire():
                    cep_leader.start_renewal()
            except Exception:
                logger.warning("cep_leader_acquire_failed", exc_info=True)

        cep_engine = CepEngine(
            session_factory=db.session,
            event_bus=typed_event_bus,
            leader_election=cep_leader,
        )
        if hasattr(app.state, "audit_service"):
            cep_engine.attach_audit_service(app.state.audit_service)
        await cep_engine.start()
        app.state.cep_engine = cep_engine
        app.state.cep_leader = cep_leader
        logger.info("CEP engine initialized")

    # Compute initial compliance status
    try:
        async with db.session() as session:
            await refresh_compliance_cache(app, session)
    except Exception as e:
        logger.warning("initial_compliance_check_failed", error=str(e))

    # Wire rule cache invalidation to event bus (must happen once per worker)
    from cassini.core.engine.spc_engine import invalidate_rule_cache

    async def _on_characteristic_updated(event) -> None:
        # Handle both typed event objects and raw dict payloads safely
        if hasattr(event, 'characteristic_id'):
            char_id = event.characteristic_id
        elif isinstance(event, dict):
            char_id = event.get('characteristic_id')
        else:
            char_id = None
        if char_id is not None:
            invalidate_rule_cache(char_id)

    typed_event_bus.subscribe(CharacteristicUpdatedEvent, _on_characteristic_updated)

    # Start async SPC queue (gated by spc role)
    if settings.has_role("spc"):
        from cassini.core.engine.spc_queue import get_spc_queue
        from cassini.core.engine.rolling_window import get_shared_window_manager

        window_manager = get_shared_window_manager()

        spc_queue = get_spc_queue()
        await spc_queue.start(db.session, typed_event_bus, window_manager)
        app.state.spc_queue = spc_queue

        # Start broker-based SPC consumer (reads from broker.task_queue)
        from cassini.core.engine.spc_consumer import SPCConsumerService

        spc_consumer = SPCConsumerService(
            task_queue=broker.task_queue,
            session_factory=db.session,
            event_bus=typed_event_bus,
            window_manager=window_manager,
        )
        await spc_consumer.start()
        app.state.spc_consumer = spc_consumer

        # Pass exactly ONE queue to recovery to avoid double-evaluation.
        # Cluster mode (broker.backend != "local"): use broker.task_queue
        # Local mode: use the in-process SPCQueue
        _is_cluster = broker.backend != "local"
        try:
            async with db.session() as session:
                await _recover_pending_spc(
                    session,
                    spc_queue=None if _is_cluster else spc_queue,
                    task_queue=broker.task_queue if _is_cluster else None,
                )
        except Exception as e:
            logger.warning("spc_recovery_failed", error=str(e))
    else:
        logger.info("spc_role_skipped", roles=settings.role_list)

    logger.info("Cassini application startup complete")

    yield

    # Shutdown — signal drain FIRST so /health/ready returns 503 immediately
    app.state.draining = True
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

    # Shutdown TAG provider first (before MQTT) -- community (only if ingestion role)
    if settings.has_role("ingestion"):
        await tag_provider_manager.shutdown()
        await mqtt_manager.shutdown()

    # Shutdown CEP engine (release leader lock, unsubscribe handlers)
    if hasattr(app.state, "cep_engine"):
        try:
            await app.state.cep_engine.stop()
        except Exception:
            logger.warning("cep_engine_stop_failed", exc_info=True)
    if getattr(app.state, "cep_leader", None) is not None:
        try:
            await app.state.cep_leader.release()
        except Exception:
            logger.debug("cep_leader_release_failed", exc_info=True)

    # Shutdown SPC consumer (broker-based) and queue (drain remaining items)
    if hasattr(app.state, 'spc_consumer'):
        await app.state.spc_consumer.stop(timeout=10.0)

    if hasattr(app.state, 'spc_queue'):
        await app.state.spc_queue.shutdown(timeout=10.0)

    # Disconnect the legacy singleton before shutting down the adapter
    event_bus.set_delegate(None)

    # Wait for pending event handlers to complete, then shutdown broker
    await typed_event_bus.shutdown()
    await broker.broadcast.shutdown()

    # Drain audit queue + stop writer.  Done after the event bus shuts
    # down so any audit events emitted during teardown still land.
    if hasattr(app.state, "audit_service"):
        try:
            await app.state.audit_service.stop_writer(timeout=10.0)
        except Exception:
            logger.warning("audit_writer_stop_failed", exc_info=True)

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

# Security headers middleware — registered BEFORE CORS so it runs AFTER CORS
# in Starlette's LIFO middleware chain.
@app.middleware("http")
async def security_headers(request: FastAPIRequest, call_next):
    response = await call_next(request)
    if request.method == "OPTIONS":
        return response  # Skip preflight
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    # CSP only on HTML responses (not API JSON).
    # CSP: unsafe-inline required for Vite SPA module loading.
    # TODO: Migrate to nonce-based CSP in a future wave.
    if "text/html" in response.headers.get("content-type", ""):
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob:; "
            "connect-src 'self' ws: wss:; "
            "frame-ancestors 'none'"
        )
    return response

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Accept-Language", "X-API-Key", "X-Hub-Signature-256"],
)

# Compliance enforcement middleware (between CORS and Audit)
from cassini.api.middleware.compliance import ComplianceMiddleware, LicenseEnforcementMiddleware

app.add_middleware(ComplianceMiddleware)

# License tier enforcement -- blocks commercial endpoints when license is
# removed or downgraded at runtime.  Registered after commercial routers
# so it can inspect them.  Starlette middleware is LIFO, so this runs
# AFTER ComplianceMiddleware (compliance takes priority).
app.add_middleware(LicenseEnforcementMiddleware)

# Audit trail middleware (gets AuditService lazily from app.state)
app.add_middleware(AuditMiddleware)

# ---------------------------------------------------------------------------
# Register routers -- Community (always) vs Commercial (license-gated, lazy)
# ---------------------------------------------------------------------------

# Community routers -- always registered regardless of license
app.include_router(auth_router)
app.include_router(cli_auth_router)
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
app.include_router(collection_plans_router)
app.include_router(websocket_router)
app.include_router(health_router, prefix="/api/v1")
app.include_router(brokers_router)
app.include_router(providers_router)
app.include_router(license_router)
app.include_router(audit_router)
app.include_router(cluster_router)
app.include_router(explain_router)

# Commercial routers are registered lazily via activate_commercial_features()
# when a valid commercial license is present at startup or uploaded at runtime.

# Reuse the same LicenseService config as lifespan (single instance created here,
# stored on app.state during lifespan startup)
_license_svc = LicenseService(
    license_path=settings.license_file or None,
    public_key_path=settings.license_public_key_file or None,
    dev_tier=settings.dev_tier,
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
        """Serve frontend static assets, SPA fallback for client-side routing.

        API paths are explicitly excluded — commercial routers are registered
        lazily during lifespan startup (after this catch-all), so without
        this guard their GET routes would receive HTML instead of JSON.
        """
        if path.startswith("api/"):
            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=404,
                content={"detail": "Not found"},
            )
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
            "docs": "/docs",
        }
