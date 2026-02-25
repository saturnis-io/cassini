"""ERP outbound publisher — pushes SPC events to configured ERP connectors.

Subscribes to SampleProcessedEvent and ViolationCreatedEvent on the event bus,
then pushes mapped data to all active connectors with outbound field mappings.
Follows the NotificationDispatcher pattern.
"""

import json
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from openspc.core.events import EventBus, SampleProcessedEvent, ViolationCreatedEvent
from openspc.db.models.erp_connector import ERPConnector, ERPFieldMapping

logger = structlog.get_logger(__name__)


class ERPOutboundPublisher:
    """Pushes SPC data to ERP systems on domain events."""

    def __init__(self, event_bus: EventBus, session_factory: Any) -> None:
        self._event_bus = event_bus
        self._session_factory = session_factory
        self._setup_subscriptions()
        logger.info("ERPOutboundPublisher initialized")

    def _setup_subscriptions(self) -> None:
        self._event_bus.subscribe(SampleProcessedEvent, self._on_sample_processed)
        self._event_bus.subscribe(ViolationCreatedEvent, self._on_violation_created)

    async def _on_sample_processed(self, event: SampleProcessedEvent) -> None:
        payload = {
            "event_type": "sample_processed",
            "sample_id": event.sample_id,
            "characteristic_id": event.characteristic_id,
            "mean": event.mean,
            "range_value": event.range_value,
            "zone": event.zone,
            "in_control": event.in_control,
            "timestamp": event.timestamp.isoformat(),
        }
        await self._push_to_connectors("sample", payload)

    async def _on_violation_created(self, event: ViolationCreatedEvent) -> None:
        payload = {
            "event_type": "violation_created",
            "violation_id": event.violation_id,
            "sample_id": event.sample_id,
            "characteristic_id": event.characteristic_id,
            "rule_id": event.rule_id,
            "rule_name": event.rule_name,
            "severity": event.severity,
            "timestamp": event.timestamp.isoformat(),
        }
        await self._push_to_connectors("violation", payload)

    async def _push_to_connectors(self, openspc_entity: str, payload: dict[str, Any]) -> None:
        """Push data to all active connectors with outbound mappings for this entity."""
        async with self._session_factory() as session:
            # Find active connectors with outbound mappings
            stmt = (
                select(ERPConnector)
                .where(ERPConnector.is_active == True)  # noqa: E712
                .options(selectinload(ERPConnector.field_mappings))
            )
            result = await session.execute(stmt)
            connectors = result.scalars().all()

            for connector in connectors:
                # Filter to outbound/bidirectional mappings for this entity
                outbound_mappings = [
                    m
                    for m in connector.field_mappings
                    if m.is_active
                    and m.direction in ("outbound", "bidirectional")
                    and m.openspc_entity == openspc_entity
                ]

                if not outbound_mappings:
                    continue

                try:
                    # Build mapped payload
                    mapped_data = self._apply_outbound_mappings(payload, outbound_mappings)

                    # Create adapter and push
                    from openspc.core.erp.sync_engine import create_adapter

                    adapter = create_adapter(connector)

                    # Use the first mapping's erp_entity as the target
                    erp_entity = outbound_mappings[0].erp_entity
                    await adapter.push_record(erp_entity, mapped_data)

                    logger.info(
                        "erp_outbound_push_success",
                        connector_id=connector.id,
                        entity=openspc_entity,
                    )
                except Exception as e:
                    logger.warning(
                        "erp_outbound_push_failed",
                        connector_id=connector.id,
                        error=str(e),
                    )

    def _apply_outbound_mappings(
        self, payload: dict[str, Any], mappings: list[ERPFieldMapping]
    ) -> dict[str, Any]:
        """Apply field mappings to transform SPC data for the ERP system."""
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
            self._set_nested(result, mapping.erp_field_path, value)

        return result

    def _set_nested(self, data: dict, path: str, value: Any) -> None:
        """Set a nested value using dot notation path."""
        parts = path.replace("$.", "").split(".")
        current = data
        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]
        if parts:
            current[parts[-1]] = value
