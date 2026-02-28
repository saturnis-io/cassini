"""
Cassini FastAPI Application.

Copyright (c) 2026 Cassini Contributors
SPDX-License-Identifier: AGPL-3.0-only
"""

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
from cassini.api.v1.msa import router as msa_router
from cassini.api.v1.hierarchy import router as hierarchy_router
from cassini.api.v1.notifications import router as notifications_router
from cassini.api.v1.oidc import router as oidc_router
from cassini.api.v1.push import router as push_router
from cassini.api.v1.erp_connectors import router as erp_router
from cassini.api.v1.hierarchy import plant_hierarchy_router
from cassini.api.v1.plants import router as plants_router
from cassini.api.v1.providers import router as providers_router
from cassini.api.v1.retention import router as retention_router
from cassini.api.v1.rule_presets import router as rule_presets_router
from cassini.api.v1.scheduled_reports import router as scheduled_reports_router
from cassini.api.v1.samples import router as samples_router
from cassini.api.v1.signatures import router as signatures_router
from cassini.api.v1.users import router as users_router
from cassini.api.v1.tags import router as tags_router
from cassini.api.v1.multivariate import router as multivariate_router
from cassini.api.v1.predictions import router as predictions_router
from cassini.api.v1.ai_analysis import router as ai_analysis_router
from cassini.api.v1.doe import router as doe_router
from cassini.api.v1.violations import router as violations_router
from cassini.api.v1.websocket import manager as ws_manager
from cassini.api.v1.websocket import router as websocket_router
from cassini.core.audit import AuditMiddleware, AuditService
from cassini.core.auth.bootstrap import bootstrap_admin_user
from cassini.core.broadcast import WebSocketBroadcaster
from cassini.core.notifications import NotificationDispatcher
from cassini.core.publish import MQTTPublisher
from cassini.core.config import get_settings
from cassini.core.licensing import LicenseService
from cassini.core.events import event_bus
from cassini.core.rate_limit import limiter
from cassini.core.providers import tag_provider_manager, opcua_provider_manager
from cassini.core.purge_engine import PurgeEngine
from cassini.core.report_scheduler import ReportScheduler
from cassini.db.database import get_database
from cassini.mqtt import mqtt_manager
from cassini.opcua.manager import opcua_manager

logger = structlog.get_logger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    # Startup -- configure structlog BEFORE any logging calls
    from cassini.core.logging import configure_logging
    configure_logging(settings.log_format)

    logger.info("Starting Cassini application")

    # Initialize license service
    license_service = LicenseService(license_path=settings.license_file or None)
    app.state.license_service = license_service
    logger.info("License service initialized", edition=license_service.edition)

    # Initialize database connection
    db = get_database()

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
                    "MQTT manager initialized — brokers connecting in background "
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
    # Commercial-only services — gated behind license
    # -----------------------------------------------------------------------
    if license_service.is_commercial:
        logger.info("Initializing commercial services")

        # OPC-UA manager (commercial)
        try:
            async with db.session() as session:
                opcua_connected = await opcua_manager.initialize(session)
                if opcua_connected:
                    logger.info("OPC-UA manager connected successfully")

                    # Initialize OPC-UA provider if servers are connected
                    opcua_prov_ok = await opcua_provider_manager.initialize(session)
                    if opcua_prov_ok:
                        logger.info("OPC-UA provider initialized successfully")
                    else:
                        logger.info("OPC-UA provider initialization deferred")
                else:
                    logger.info(
                        "OPC-UA manager initialized — servers connecting in background "
                        "or no active servers configured"
                    )
        except Exception as e:
            logger.warning("opcua_init_failed", error=str(e))
        app.state.opcua_manager = opcua_manager
        app.state.opcua_provider_manager = opcua_provider_manager

        # Anomaly detector (subscribes to SampleProcessedEvent)
        from cassini.core.anomaly.detector import AnomalyDetector
        anomaly_detector = AnomalyDetector(event_bus, db.session)
        app.state.anomaly_detector = anomaly_detector
        logger.info("Anomaly detector initialized")

        # Forecasting engine (subscribes to SampleProcessedEvent)
        try:
            from cassini.core.forecasting import ForecastingEngine
            forecasting_engine = ForecastingEngine(event_bus, db.session)
            forecasting_engine.setup_subscriptions()
            app.state.forecasting_engine = forecasting_engine
            logger.info("Forecasting engine initialized")
        except ImportError:
            logger.info("Forecasting engine unavailable (statsmodels not installed)")

        # Signature workflow engine
        from cassini.core.signature_engine import SignatureWorkflowEngine
        signature_engine = SignatureWorkflowEngine(db.session, event_bus)
        app.state.signature_engine = signature_engine
        logger.info("Signature workflow engine initialized")

        # Notification dispatcher (email + webhooks)
        notification_dispatcher = NotificationDispatcher(event_bus, db.session)
        app.state.notification_dispatcher = notification_dispatcher
        logger.info("Notification dispatcher initialized")

        # Push notification service (subscribes to events)
        from cassini.core.push_service import PushNotificationService
        push_service = PushNotificationService(event_bus, db.session)
        app.state.push_service = push_service

        # ERP sync engine (background scheduler)
        from cassini.core.erp.sync_engine import ERPSyncEngine
        erp_sync_engine = ERPSyncEngine(event_bus)
        await erp_sync_engine.start()
        app.state.erp_sync_engine = erp_sync_engine

        # ERP outbound publisher (subscribes to events)
        from cassini.core.erp.outbound_publisher import ERPOutboundPublisher
        erp_outbound_publisher = ERPOutboundPublisher(event_bus, db.session)
        app.state.erp_outbound_publisher = erp_outbound_publisher
        logger.info("ERP integration services initialized")

        # Audit trail service and event bus subscriptions
        audit_service = AuditService(db.session)
        app.state.audit_service = audit_service

        async def _audit_violation_created(event):
            await audit_service.log_event(
                action="violation_created",
                resource_type="violation",
                resource_id=event.violation_id,
                detail={"rule_id": event.rule_id, "rule_name": event.rule_name, "severity": event.severity},
            )

        async def _audit_limits_updated(event):
            await audit_service.log_event(
                action="recalculate",
                resource_type="characteristic",
                resource_id=event.characteristic_id,
                detail={"ucl": event.ucl, "lcl": event.lcl, "center_line": event.center_line},
            )

        async def _audit_char_created(event):
            await audit_service.log_event(
                action="create",
                resource_type="characteristic",
                resource_id=event.characteristic_id,
                detail={"name": event.name, "chart_type": event.chart_type},
            )

        async def _audit_char_deleted(event):
            await audit_service.log_event(
                action="delete",
                resource_type="characteristic",
                resource_id=event.characteristic_id,
                detail={"name": event.name},
            )

        async def _audit_anomaly_detected(event):
            await audit_service.log_event(
                action="detect",
                resource_type="anomaly",
                resource_id=event.characteristic_id,
                detail={
                    "source": "event_bus",
                    "anomaly_event_id": event.anomaly_event_id,
                    "detector_type": event.detector_type,
                    "event_type": event.event_type,
                    "severity": event.severity,
                },
            )

        async def _audit_erp_sync_completed(event):
            await audit_service.log_event(
                action="sync",
                resource_type="erp_connector",
                resource_id=event.connector_id,
                detail={
                    "source": "event_bus",
                    "connector_name": event.connector_name,
                    "direction": event.direction,
                    "status": event.status,
                    "records_processed": event.records_processed,
                    "records_failed": event.records_failed,
                },
            )

        from cassini.core.events import (
            ViolationCreatedEvent,
            ControlLimitsUpdatedEvent,
            CharacteristicCreatedEvent,
            CharacteristicDeletedEvent,
            AnomalyDetectedEvent,
            ERPSyncCompletedEvent,
        )
        event_bus.subscribe(ViolationCreatedEvent, _audit_violation_created)
        event_bus.subscribe(ControlLimitsUpdatedEvent, _audit_limits_updated)
        event_bus.subscribe(CharacteristicCreatedEvent, _audit_char_created)
        event_bus.subscribe(CharacteristicDeletedEvent, _audit_char_deleted)
        event_bus.subscribe(AnomalyDetectedEvent, _audit_anomaly_detected)
        event_bus.subscribe(ERPSyncCompletedEvent, _audit_erp_sync_completed)
        logger.info("Audit trail service initialized")

        # Start retention purge engine (background, 24h interval)
        purge_engine = PurgeEngine()
        await purge_engine.start()
        app.state.purge_engine = purge_engine

        # Start report scheduler (background, checks every 15 minutes)
        report_scheduler = ReportScheduler()
        await report_scheduler.start()
        app.state.report_scheduler = report_scheduler

        logger.info("Commercial services initialization complete")
    else:
        logger.info("Community edition — enterprise services not initialized")

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

    # Shutdown OPC-UA (commercial — may not be initialized)
    if hasattr(app.state, 'opcua_provider_manager'):
        await opcua_provider_manager.shutdown()

    if hasattr(app.state, 'opcua_manager'):
        await opcua_manager.shutdown()

    # Shutdown TAG provider first (before MQTT) — community
    await tag_provider_manager.shutdown()

    # Shutdown MQTT manager — community
    await mqtt_manager.shutdown()

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

# Rate limiting — attach limiter to app state and register 429 handler
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Audit trail middleware (gets AuditService lazily from app.state)
app.add_middleware(AuditMiddleware)

# ---------------------------------------------------------------------------
# Register routers — Community (always) vs Commercial (license-gated)
# ---------------------------------------------------------------------------

# Community routers — always registered regardless of license
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(hierarchy_router, prefix="/api/v1/hierarchy")
app.include_router(plant_hierarchy_router, prefix="/api/v1/plants/{plant_id}/hierarchies")
app.include_router(plants_router)
app.include_router(characteristics_router)
app.include_router(config_router)
app.include_router(samples_router)
app.include_router(violations_router)
app.include_router(data_entry_router)
app.include_router(import_router)
app.include_router(annotations_router)
app.include_router(tags_router)
app.include_router(capability_router)
app.include_router(websocket_router)
app.include_router(health_router, prefix="/api/v1")
app.include_router(brokers_router)
app.include_router(license_router)

# Commercial routers — only registered with a valid commercial license
_license_svc = LicenseService(license_path=settings.license_file or None)
if _license_svc.is_commercial:
    app.include_router(anomaly_router)
    app.include_router(audit_router)
    app.include_router(api_keys_router)
    app.include_router(opcua_servers_router)
    app.include_router(database_admin_router)
    app.include_router(distributions_router)
    app.include_router(fai_router)
    app.include_router(gage_bridges_router)
    app.include_router(msa_router)
    app.include_router(notifications_router)
    app.include_router(oidc_router)
    app.include_router(providers_router)
    app.include_router(retention_router)
    app.include_router(rule_presets_router)
    app.include_router(scheduled_reports_router)
    app.include_router(signatures_router)
    app.include_router(push_router)
    app.include_router(erp_router)
    app.include_router(multivariate_router)
    app.include_router(predictions_router)
    app.include_router(ai_analysis_router)
    app.include_router(doe_router)
    logger.info("Commercial license detected — enterprise routers registered",
                router_count=22)
else:
    logger.info("Community edition — enterprise routers not registered")

# Dev tools router — only registered in sandbox mode
if settings.sandbox:
    from cassini.api.v1.devtools import router as devtools_router

    app.include_router(devtools_router)
    logger.info("Sandbox mode enabled — devtools router registered")


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint with real DB connectivity verification."""
    try:
        db = get_database()
        async with db.session() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception:
        return {"status": "unhealthy"}


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint."""
    return {
        "name": "Cassini",
        "version": settings.app_version,
        "docs": "/docs",
    }
