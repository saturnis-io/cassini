"""Event bus and event definitions for Cassini.

This module provides an asynchronous event bus for decoupled component
communication within the Cassini system.

Usage:
    >>> from cassini.core.events import (
    ...     event_bus,
    ...     EventBus,
    ...     SampleProcessedEvent,
    ...     ViolationCreatedEvent,
    ... )
    >>>
    >>> # Subscribe to events
    >>> async def handle_sample(event: SampleProcessedEvent):
    ...     print(f"Sample {event.sample_id} processed")
    >>>
    >>> event_bus.subscribe(SampleProcessedEvent, handle_sample)
    >>>
    >>> # Publish events
    >>> await event_bus.publish(SampleProcessedEvent(
    ...     sample_id=1,
    ...     characteristic_id=1,
    ...     mean=10.5,
    ...     range_value=None,
    ...     zone="zone_c_upper",
    ...     in_control=True
    ... ))
"""

from cassini.core.events.bus import EventBus, EventHandler, event_bus
from cassini.core.events.events import (
    AlertThresholdExceededEvent,
    AnomalyDetectedEvent,
    BatchEvaluationCompleteEvent,
    CharacteristicCreatedEvent,
    CharacteristicDeletedEvent,
    CharacteristicUpdatedEvent,
    ControlLimitsUpdatedEvent,
    CorrelationAlertEvent,
    ERPSyncCompletedEvent,
    Event,
    PredictedOOCEvent,
    PurgeCompletedEvent,
    SampleProcessedEvent,
    SignatureCreatedEvent,
    SignatureInvalidatedEvent,
    SignatureRejectedEvent,
    ViolationAcknowledgedEvent,
    ViolationCreatedEvent,
    WorkflowCompletedEvent,
    WorkflowExpiredEvent,
)

__all__ = [
    # Event bus
    "EventBus",
    "EventHandler",
    "event_bus",
    # Base event
    "Event",
    # Sample events
    "SampleProcessedEvent",
    # Violation events
    "ViolationCreatedEvent",
    "ViolationAcknowledgedEvent",
    # Control limits events
    "ControlLimitsUpdatedEvent",
    # Characteristic events
    "CharacteristicCreatedEvent",
    "CharacteristicUpdatedEvent",
    "CharacteristicDeletedEvent",
    # Alert events
    "AlertThresholdExceededEvent",
    # Anomaly events
    "AnomalyDetectedEvent",
    # Signature events
    "SignatureCreatedEvent",
    "SignatureRejectedEvent",
    "WorkflowCompletedEvent",
    "WorkflowExpiredEvent",
    "SignatureInvalidatedEvent",
    # ERP events
    "ERPSyncCompletedEvent",
    # Prediction events
    "PredictedOOCEvent",
    # Correlation events
    "CorrelationAlertEvent",
    # Purge events
    "PurgeCompletedEvent",
    # Batch evaluation events
    "BatchEvaluationCompleteEvent",
]
