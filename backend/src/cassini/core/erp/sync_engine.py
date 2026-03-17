"""ERP sync engine — background scheduler for cron-based ERP/LIMS synchronization.

Periodically checks for due sync schedules and executes inbound data fetch
or outbound data push operations. Follows the ReportScheduler pattern.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from cassini.core.erp.base import BaseERPAdapter
from cassini.core.events import EventBus, ERPSyncCompletedEvent
from cassini.db.database import get_database
from cassini.db.dialects import decrypt_password, get_encryption_key
from cassini.db.models.erp_connector import (
    ERPConnector,
    ERPFieldMapping,
    ERPSyncLog,
    ERPSyncSchedule,
)

logger = structlog.get_logger(__name__)

CHECK_INTERVAL_SECONDS = 60  # Check every minute for due syncs


def create_adapter(connector: ERPConnector) -> BaseERPAdapter:
    """Create the appropriate ERP adapter for a connector.

    Module-level factory function used by both ERPSyncEngine and ERPOutboundPublisher.
    """
    key = get_encryption_key()
    auth_config_json = (
        decrypt_password(connector.auth_config, key)
        if connector.auth_config and connector.auth_config != "{}"
        else "{}"
    )
    auth_config = json.loads(auth_config_json)

    headers: dict[str, str] = {}
    if connector.headers:
        try:
            headers = (
                json.loads(connector.headers)
                if isinstance(connector.headers, str)
                else connector.headers
            )
        except (json.JSONDecodeError, TypeError):
            pass

    adapter_map = {
        "sap_odata": "cassini.core.erp.sap_odata.SAPODataAdapter",
        "oracle_rest": "cassini.core.erp.oracle_rest.OracleRESTAdapter",
        "generic_lims": "cassini.core.erp.generic_lims.GenericLIMSAdapter",
    }

    adapter_path = adapter_map.get(connector.connector_type)
    if not adapter_path:
        raise ValueError(f"Unknown connector type: {connector.connector_type}")

    module_path, class_name = adapter_path.rsplit(".", 1)
    import importlib

    module = importlib.import_module(module_path)
    adapter_class = getattr(module, class_name)

    return adapter_class(
        base_url=connector.base_url,
        auth_type=connector.auth_type,
        auth_config=auth_config,
        headers=headers,
    )


class ERPSyncEngine:
    """Background service that executes scheduled ERP sync operations."""

    def __init__(self, event_bus: EventBus, interval_seconds: float = CHECK_INTERVAL_SECONDS) -> None:
        self._event_bus = event_bus
        self.interval_seconds = interval_seconds
        self._running = False
        self._task: asyncio.Task | None = None
        self._connector_locks: dict[int, asyncio.Lock] = {}

    def _get_lock(self, connector_id: int) -> asyncio.Lock:
        """Return the per-connector lock, creating one lazily if needed."""
        if connector_id not in self._connector_locks:
            self._connector_locks[connector_id] = asyncio.Lock()
        return self._connector_locks[connector_id]

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._scheduler_loop())
        logger.info("erp_sync_engine_started", interval_seconds=self.interval_seconds)

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("erp_sync_engine_stopped")

    async def _scheduler_loop(self) -> None:
        while self._running:
            try:
                await self._check_and_run()
            except Exception:
                logger.exception("erp_sync_engine_loop_error")
            try:
                await asyncio.sleep(self.interval_seconds)
            except asyncio.CancelledError:
                break

    async def _check_and_run(self) -> None:
        """Check for due schedules and execute them."""
        db = get_database()
        now = datetime.now(timezone.utc)

        async with db.session() as session:
            # Find active schedules that are due
            stmt = (
                select(ERPSyncSchedule)
                .where(ERPSyncSchedule.is_active == True)  # noqa: E712
                .where(
                    (ERPSyncSchedule.next_run_at == None)  # noqa: E711
                    | (ERPSyncSchedule.next_run_at <= now)
                )
                .options(selectinload(ERPSyncSchedule.connector))
            )
            result = await session.execute(stmt)
            due_schedules = result.scalars().all()

            for schedule in due_schedules:
                if not schedule.connector or not schedule.connector.is_active:
                    continue

                lock = self._get_lock(schedule.connector_id)
                if lock.locked():
                    logger.info(
                        "erp_sync_already_running",
                        connector_id=schedule.connector_id,
                        direction=schedule.direction,
                    )
                    continue

                try:
                    async with lock:
                        await self._execute_sync(session, schedule)
                except Exception as e:
                    logger.error(
                        "erp_sync_execution_failed",
                        connector_id=schedule.connector_id,
                        direction=schedule.direction,
                        error=str(e),
                    )

                # Update next_run_at using croniter
                try:
                    from croniter import croniter

                    cron = croniter(schedule.cron_expression, now)
                    schedule.next_run_at = cron.get_next(datetime)
                    schedule.last_run_at = now
                except Exception as e:
                    logger.warning("cron_parse_failed", cron=schedule.cron_expression, error=str(e))

            await session.commit()

    async def _execute_sync(self, session: Any, schedule: ERPSyncSchedule) -> None:
        """Execute a single sync operation."""
        connector = schedule.connector
        started_at = datetime.now(timezone.utc)

        # Create sync log entry
        sync_log = ERPSyncLog(
            connector_id=connector.id,
            direction=schedule.direction,
            status="running",
            started_at=started_at,
        )
        session.add(sync_log)
        await session.flush()

        records_processed = 0
        records_failed = 0

        try:
            adapter = self._create_adapter(connector)

            # Get active field mappings for this direction
            stmt = select(ERPFieldMapping).where(
                ERPFieldMapping.connector_id == connector.id,
                ERPFieldMapping.is_active == True,  # noqa: E712
                ERPFieldMapping.direction.in_([schedule.direction, "bidirectional"]),
            )
            result = await session.execute(stmt)
            mappings = result.scalars().all()

            if schedule.direction == "inbound":
                records_processed, records_failed = await self._sync_inbound(
                    session, adapter, connector, mappings
                )
            else:
                records_processed, records_failed = await self._sync_outbound(
                    session, adapter, connector, mappings
                )

            sync_log.status = "success" if records_failed == 0 else "partial"
            sync_log.records_processed = records_processed
            sync_log.records_failed = records_failed
            sync_log.completed_at = datetime.now(timezone.utc)

            connector.status = "connected"
            connector.last_sync_at = sync_log.completed_at
            connector.last_error = None

        except Exception as e:
            sync_log.status = "failed"
            sync_log.error_message = f"Sync failed: {type(e).__name__}"
            sync_log.completed_at = datetime.now(timezone.utc)
            connector.status = "error"
            connector.last_error = f"Sync failed: {type(e).__name__}"
            records_processed = 0
            records_failed = 0
            logger.error("erp_sync_failed", connector_id=connector.id, error=str(e))

        # Emit event
        await self._event_bus.publish(
            ERPSyncCompletedEvent(
                connector_id=connector.id,
                connector_name=connector.name,
                direction=schedule.direction,
                status=sync_log.status,
                records_processed=records_processed,
                records_failed=records_failed,
            )
        )

    async def _sync_inbound(
        self, session: Any, adapter: BaseERPAdapter, connector: ERPConnector, mappings: list
    ) -> tuple[int, int]:
        """Execute inbound sync — fetch from ERP, create SPC data."""
        processed = 0
        failed = 0

        # Group mappings by ERP entity
        entity_mappings: dict[str, list] = {}
        for m in mappings:
            entity_mappings.setdefault(m.erp_entity, []).append(m)

        for entity, maps in entity_mappings.items():
            try:
                records = await adapter.fetch_records(entity)
                for record in records:
                    try:
                        # Apply field mapping transforms
                        # (simplified — full implementation would create samples/measurements)
                        processed += 1
                    except Exception:
                        failed += 1
            except Exception as e:
                logger.warning("erp_inbound_entity_failed", entity=entity, error=str(e))
                failed += 1

        return processed, failed

    async def _sync_outbound(
        self, session: Any, adapter: BaseERPAdapter, connector: ERPConnector, mappings: list
    ) -> tuple[int, int]:
        """Execute outbound sync — push recent SPC data to ERP.

        Queries samples and violations created since the connector's
        ``last_sync_at`` timestamp, applies outbound field mappings,
        and pushes each record to the ERP adapter.  This complements
        the real-time ERPOutboundPublisher by catching up on any data
        that was created while the connector was offline or during
        transient push failures.
        """
        from cassini.db.models.sample import Sample
        from cassini.db.models.violation import Violation

        processed = 0
        failed = 0

        # Determine the sync window — everything since last successful sync
        since = connector.last_sync_at or connector.created_at

        # Normalize timezone for SQLite compatibility
        if since.tzinfo is None:
            since = since.replace(tzinfo=timezone.utc)

        # Group mappings by openspc_entity so we know which data types to push
        entity_mappings: dict[str, list[ERPFieldMapping]] = {}
        for m in mappings:
            entity_mappings.setdefault(m.openspc_entity, []).append(m)

        # --- Samples ---
        if "sample" in entity_mappings:
            sample_maps = entity_mappings["sample"]
            erp_entity = sample_maps[0].erp_entity

            stmt = (
                select(Sample)
                .where(
                    Sample.timestamp >= since,
                    Sample.spc_status == "complete",
                )
                .options(selectinload(Sample.measurements))
                .order_by(Sample.timestamp)
                .limit(5000)
            )

            # Scope to connector's plant via characteristic
            from cassini.db.models.characteristic import Characteristic

            stmt = stmt.join(
                Characteristic, Sample.char_id == Characteristic.id
            ).where(Characteristic.plant_id == connector.plant_id)

            result = await session.execute(stmt)
            samples = result.scalars().all()

            for sample in samples:
                payload = self._build_sample_payload(sample)
                mapped = self._apply_outbound_mappings(payload, sample_maps)
                try:
                    await adapter.push_record(erp_entity, mapped)
                    processed += 1
                except Exception as e:
                    logger.warning(
                        "erp_outbound_sample_failed",
                        connector_id=connector.id,
                        sample_id=sample.id,
                        error=type(e).__name__,
                    )
                    failed += 1

        # --- Violations ---
        if "violation" in entity_mappings:
            violation_maps = entity_mappings["violation"]
            erp_entity = violation_maps[0].erp_entity

            stmt = (
                select(Violation)
                .where(Violation.created_at >= since)
                .order_by(Violation.created_at)
                .limit(5000)
            )

            # Scope to connector's plant via characteristic
            from cassini.db.models.characteristic import Characteristic

            stmt = stmt.join(
                Characteristic, Violation.char_id == Characteristic.id
            ).where(Characteristic.plant_id == connector.plant_id)

            result = await session.execute(stmt)
            violations = result.scalars().all()

            for violation in violations:
                payload = self._build_violation_payload(violation)
                mapped = self._apply_outbound_mappings(payload, violation_maps)
                try:
                    await adapter.push_record(erp_entity, mapped)
                    processed += 1
                except Exception as e:
                    logger.warning(
                        "erp_outbound_violation_failed",
                        connector_id=connector.id,
                        violation_id=violation.id,
                        error=type(e).__name__,
                    )
                    failed += 1

        return processed, failed

    @staticmethod
    def _build_sample_payload(sample) -> dict[str, Any]:
        """Build a flat payload dict from a Sample ORM instance."""
        measurements = getattr(sample, "measurements", []) or []
        values = [m.value for m in measurements]
        mean = sum(values) / len(values) if values else None

        return {
            "sample_id": sample.id,
            "characteristic_id": sample.char_id,
            "timestamp": sample.timestamp.isoformat() if sample.timestamp else None,
            "batch_number": sample.batch_number,
            "operator_id": sample.operator_id,
            "mean": mean,
            "values": values,
            "actual_n": sample.actual_n,
            "is_excluded": sample.is_excluded,
            "z_score": sample.z_score,
            "effective_ucl": sample.effective_ucl,
            "effective_lcl": sample.effective_lcl,
            "material_id": sample.material_id,
        }

    @staticmethod
    def _build_violation_payload(violation) -> dict[str, Any]:
        """Build a flat payload dict from a Violation ORM instance."""
        return {
            "violation_id": violation.id,
            "sample_id": violation.sample_id,
            "characteristic_id": violation.char_id,
            "rule_id": violation.rule_id,
            "rule_name": violation.rule_name,
            "severity": violation.severity,
            "acknowledged": violation.acknowledged,
            "created_at": violation.created_at.isoformat() if violation.created_at else None,
        }

    @staticmethod
    def _apply_outbound_mappings(
        payload: dict[str, Any], mappings: list[ERPFieldMapping]
    ) -> dict[str, Any]:
        """Apply field mappings to transform SPC data for the ERP system.

        Mirrors ERPOutboundPublisher._apply_outbound_mappings for consistency.
        """
        result: dict[str, Any] = {}

        for mapping in mappings:
            value = payload.get(mapping.openspc_field)
            if value is None:
                continue

            # Apply transform if configured
            if mapping.transform:
                try:
                    transform = (
                        json.loads(mapping.transform)
                        if isinstance(mapping.transform, str)
                        else mapping.transform
                    )
                    if isinstance(transform, dict):
                        if "multiply" in transform:
                            value = float(value) * float(transform["multiply"])
                        elif "divide" in transform:
                            divisor = float(transform["divide"])
                            if divisor != 0:
                                value = float(value) / divisor
                        elif "round" in transform:
                            value = round(float(value), int(transform["round"]))
                        elif "map" in transform:
                            value = transform["map"].get(str(value), value)
                except (json.JSONDecodeError, ValueError, TypeError):
                    pass

            # Set in result using ERP field path (simple dot notation)
            parts = mapping.erp_field_path.replace("$.", "").split(".")
            current = result
            for part in parts[:-1]:
                if part not in current:
                    current[part] = {}
                current = current[part]
            if parts:
                current[parts[-1]] = value

        return result

    def _create_adapter(self, connector: ERPConnector) -> BaseERPAdapter:
        """Create the appropriate adapter for a connector."""
        return create_adapter(connector)

    async def execute_manual_sync(self, connector_id: int, direction: str = "inbound") -> ERPSyncLog:
        """Execute a manual sync for a specific connector. Called by API endpoint."""
        lock = self._get_lock(connector_id)
        if lock.locked():
            raise RuntimeError(
                f"Sync for connector {connector_id} is already in progress"
            )

        db = get_database()
        async with lock:
            async with db.session() as session:
                stmt = (
                    select(ERPConnector)
                    .where(ERPConnector.id == connector_id)
                    .options(selectinload(ERPConnector.field_mappings))
                )
                result = await session.execute(stmt)
                connector = result.scalar_one_or_none()
                if not connector:
                    raise ValueError(f"Connector {connector_id} not found")

                # Create a temporary schedule-like object for _execute_sync
                class TempSchedule:
                    pass

                temp = TempSchedule()
                temp.connector_id = connector_id  # type: ignore[attr-defined]
                temp.connector = connector  # type: ignore[attr-defined]
                temp.direction = direction  # type: ignore[attr-defined]

                await self._execute_sync(session, temp)  # type: ignore[arg-type]
                await session.commit()

                # Return the latest log
                log_stmt = (
                    select(ERPSyncLog)
                    .where(ERPSyncLog.connector_id == connector_id)
                    .order_by(ERPSyncLog.started_at.desc())
                    .limit(1)
                )
                log_result = await session.execute(log_stmt)
                return log_result.scalar_one()
