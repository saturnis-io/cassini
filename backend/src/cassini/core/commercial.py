"""Commercial feature activation for lazy license loading.

Provides the function to dynamically activate commercial routers and services
when a license is uploaded at runtime (not just at startup).

Supports tiered activation: Pro routers/services are a subset of Enterprise.
Calling with tier="enterprise" after tier="pro" upgrades without duplicating
Pro routers or services.
"""

import structlog

from fastapi import FastAPI

logger = structlog.get_logger(__name__)

# Tier rank for comparison -- higher rank is a superset of lower
_TIER_RANK = {"community": 0, "pro": 1, "enterprise": 2}


async def activate_commercial_features(
    app: FastAPI,
    routers: list,
    db,
    event_bus,
    *,
    tier: str = "enterprise",
) -> None:
    """Activate commercial-edition routers and services for the given tier.

    This function is idempotent and upgrade-safe:
    - Routers are tracked by id() in app.state.registered_routers to prevent
      FastAPI duplicate route registration.
    - Services are split into Pro-level and Enterprise-level. Pro services
      initialise on the first commercial activation. Enterprise services
      initialise only when tier is "enterprise".
    - Calling again with a higher tier (e.g. pro -> enterprise) registers
      the additional routers and starts the additional services without
      duplicating what is already running.

    Args:
        app: FastAPI application instance.
        routers: List of APIRouter instances to register for this tier.
        db: Database instance (with .session() context manager).
        event_bus: Application event bus for wiring subscriptions.
        tier: License tier -- "pro" or "enterprise".
    """
    import asyncio

    lock: asyncio.Lock = app.state.commercial_lock
    current_tier: str | None = app.state.commercial_tier

    current_rank = _TIER_RANK.get(current_tier, 0) if current_tier else 0
    requested_rank = _TIER_RANK.get(tier, 0)

    async with lock:
        if requested_rank <= current_rank:
            logger.info(
                "Commercial features already active at requested tier or higher, skipping",
                current_tier=current_tier,
                requested_tier=tier,
            )
            return

        logger.info("Activating commercial features", tier=tier, previous_tier=current_tier)

        # ------------------------------------------------------------------
        # Register routers (deduplicated via id tracking)
        # ------------------------------------------------------------------
        registered: set = app.state.registered_routers
        new_count = 0
        for router in routers:
            router_id = id(router)
            if router_id not in registered:
                app.include_router(router)
                registered.add(router_id)
                new_count += 1
        if new_count:
            logger.info("commercial_routers_registered", new_count=new_count, total=len(registered))

        # ------------------------------------------------------------------
        # Pro-level services -- initialised on first commercial activation
        # ------------------------------------------------------------------
        if not current_tier:
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

            # Notification dispatcher (email + webhooks)
            from cassini.core.notifications import NotificationDispatcher

            notification_dispatcher = NotificationDispatcher(event_bus, db.session)
            app.state.notification_dispatcher = notification_dispatcher
            logger.info("Notification dispatcher initialized")

            # Push notification service
            from cassini.core.push_service import PushNotificationService

            push_service = PushNotificationService(event_bus, db.session)
            app.state.push_service = push_service

            # Audit trail event subscriptions (commercial events only).
            # The AuditService itself is initialised in main.py lifespan
            # for ALL tiers; here we just wire the commercial event handlers.
            if hasattr(app.state, 'audit_service'):
                app.state.audit_service.setup_subscriptions(event_bus)
                logger.info("Audit trail commercial event subscriptions wired")

            # Start report scheduler (background, checks every 15 minutes)
            from cassini.core.report_scheduler import ReportScheduler

            report_scheduler = ReportScheduler()
            await report_scheduler.start()
            app.state.report_scheduler = report_scheduler

            logger.info("Pro-level services initialized")

        # ------------------------------------------------------------------
        # Enterprise-only services -- initialised when tier is "enterprise"
        # ------------------------------------------------------------------
        if tier == "enterprise" and _TIER_RANK.get(current_tier, 0) < _TIER_RANK["enterprise"]:
            # Anomaly detector (subscribes to SampleProcessedEvent)
            from cassini.core.anomaly.detector import AnomalyDetector

            anomaly_detector = AnomalyDetector(event_bus, db.session)
            anomaly_detector.setup_subscriptions()
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

            # Wire audit service into background event subscribers
            if hasattr(app.state, 'audit_service'):
                notification_dispatcher = getattr(app.state, 'notification_dispatcher', None)
                if notification_dispatcher:
                    notification_dispatcher._audit_service = app.state.audit_service
                anomaly_detector._audit_service = app.state.audit_service

            # Start retention purge engine (background, 24h interval)
            from cassini.core.purge_engine import PurgeEngine

            purge_engine = PurgeEngine(event_bus=event_bus)
            await purge_engine.start()
            app.state.purge_engine = purge_engine

            logger.info("Enterprise-level services initialized")

        app.state.commercial_tier = tier
        logger.info("Commercial services initialization complete", tier=tier)
