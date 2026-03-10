"""Commercial feature activation for lazy license loading.

Provides the function to dynamically activate commercial routers and services
when a license is uploaded at runtime (not just at startup).
"""

import structlog

from fastapi import FastAPI

logger = structlog.get_logger(__name__)


async def activate_commercial_features(
    app: FastAPI,
    commercial_routers: list,
    db,
    event_bus,
) -> None:
    """Activate all commercial-edition routers and services.

    This function is idempotent -- calling it multiple times is safe.
    It acquires app.state.commercial_lock to prevent concurrent activation.

    Args:
        app: FastAPI application instance.
        commercial_routers: List of APIRouter instances to register.
        db: Database instance (with .session() context manager).
        event_bus: Application event bus for wiring subscriptions.
    """
    import asyncio

    lock: asyncio.Lock = app.state.commercial_lock

    async with lock:
        if app.state.commercial_active:
            logger.info("Commercial features already active, skipping")
            return

        logger.info("Activating commercial features")

        # Register commercial routers
        for router in commercial_routers:
            app.include_router(router)
        logger.info(
            "commercial_routers_registered",
            router_count=len(commercial_routers),
        )

        # --- Initialize commercial services (same order as original lifespan) ---

        # OPC-UA manager
        from cassini.core.providers import opcua_provider_manager
        from cassini.opcua.manager import opcua_manager

        try:
            async with db.session() as session:
                opcua_connected = await opcua_manager.initialize(session)
                if opcua_connected:
                    logger.info("OPC-UA manager connected successfully")
                    opcua_prov_ok = await opcua_provider_manager.initialize(session)
                    if opcua_prov_ok:
                        logger.info("OPC-UA provider initialized successfully")
                    else:
                        logger.info("OPC-UA provider initialization deferred")
                else:
                    logger.info(
                        "OPC-UA manager initialized -- servers connecting in background "
                        "or no active servers configured"
                    )
        except Exception as e:
            logger.warning("opcua_init_failed", error=str(e))
        app.state.opcua_manager = opcua_manager
        app.state.opcua_provider_manager = opcua_provider_manager

        # Anomaly detector (subscribes to SampleProcessedEvent)
        from cassini.core.anomaly.detector import AnomalyDetector

        anomaly_detector = AnomalyDetector(event_bus, db.session)
        anomaly_detector.setup_subscriptions()  # FIX: was missing in original lifespan
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
        from cassini.core.notifications import NotificationDispatcher

        notification_dispatcher = NotificationDispatcher(event_bus, db.session)
        app.state.notification_dispatcher = notification_dispatcher
        logger.info("Notification dispatcher initialized")

        # Push notification service
        from cassini.core.push_service import PushNotificationService

        push_service = PushNotificationService(event_bus, db.session)
        app.state.push_service = push_service

        # ERP sync engine (background scheduler)
        from cassini.core.erp.sync_engine import ERPSyncEngine

        erp_sync_engine = ERPSyncEngine(event_bus)
        await erp_sync_engine.start()
        app.state.erp_sync_engine = erp_sync_engine

        # ERP outbound publisher
        from cassini.core.erp.outbound_publisher import ERPOutboundPublisher

        erp_outbound_publisher = ERPOutboundPublisher(event_bus, db.session)
        app.state.erp_outbound_publisher = erp_outbound_publisher
        logger.info("ERP integration services initialized")

        # Audit trail service and event bus subscriptions
        from cassini.core.audit import AuditService

        audit_service = AuditService(db.session)
        app.state.audit_service = audit_service

        # Wire audit service into background event subscribers
        notification_dispatcher._audit_service = audit_service
        anomaly_detector._audit_service = audit_service

        # Consolidate all audit event subscriptions
        audit_service.setup_subscriptions(event_bus)
        logger.info("Audit trail service initialized")

        # Start retention purge engine (background, 24h interval)
        from cassini.core.purge_engine import PurgeEngine

        purge_engine = PurgeEngine(event_bus=event_bus)
        await purge_engine.start()
        app.state.purge_engine = purge_engine

        # Start report scheduler (background, checks every 15 minutes)
        from cassini.core.report_scheduler import ReportScheduler

        report_scheduler = ReportScheduler()
        await report_scheduler.start()
        app.state.report_scheduler = report_scheduler

        app.state.commercial_active = True
        logger.info("Commercial services initialization complete")
