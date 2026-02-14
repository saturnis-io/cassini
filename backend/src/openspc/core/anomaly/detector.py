"""AnomalyDetector — main orchestrator for anomaly detection.

Subscribes to SampleProcessedEvent on the Event Bus. For each sample,
runs enabled detectors (PELT, Isolation Forest, K-S), persists anomaly
events, and publishes AnomalyDetectedEvent notifications.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import numpy as np
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from openspc.core.anomaly.iforest_detector import IsolationForestDetector
from openspc.core.anomaly.ks_detector import KSDetector
from openspc.core.anomaly.pelt_detector import AnomalyResult, PELTDetector
from openspc.core.anomaly.summary import generate_event_summary
from openspc.core.events.events import AnomalyDetectedEvent, SampleProcessedEvent

logger = structlog.get_logger(__name__)

# Re-export AnomalyResult at the package level
__all__ = ["AnomalyDetector", "AnomalyResult"]


class AnomalyDetector:
    """Orchestrates anomaly detection across multiple algorithms.

    Lifecycle:
    1. Created during app startup (lifespan)
    2. Subscribes to SampleProcessedEvent on the Event Bus
    3. For each event, loads config, runs enabled detectors
    4. Persists anomaly events and publishes notifications
    """

    def __init__(self, event_bus: Any, session_factory: Any) -> None:
        """Initialize the anomaly detector.

        Args:
            event_bus: The application EventBus instance.
            session_factory: Async session factory for database access.
        """
        self._event_bus = event_bus
        self._session_factory = session_factory
        self._pelt = PELTDetector()
        self._iforest = IsolationForestDetector()
        self._ks = KSDetector()

    def setup_subscriptions(self) -> None:
        """Subscribe to SampleProcessedEvent on the Event Bus."""
        self._event_bus.subscribe(
            SampleProcessedEvent, self._on_sample_processed
        )
        logger.info("anomaly_detector_subscriptions_active")

    async def _on_sample_processed(
        self, event: SampleProcessedEvent
    ) -> None:
        """Handle a processed sample — run all enabled detectors.

        Args:
            event: The SampleProcessedEvent from the SPC engine.
        """
        try:
            async with self._session_factory() as session:
                await self._process_sample(session, event)
                await session.commit()
        except Exception:
            logger.exception(
                "anomaly_detection_failed",
                characteristic_id=event.characteristic_id,
                sample_id=event.sample_id,
            )

    async def _process_sample(
        self, session: AsyncSession, event: SampleProcessedEvent
    ) -> None:
        """Run detectors and persist results within a session."""
        config = await self._get_config(session, event.characteristic_id)
        if config is None or not config.is_enabled:
            return

        # Load analysis window
        samples = await self._load_window(session, event.characteristic_id)
        if len(samples) < 10:
            return

        results: list[AnomalyResult] = []

        # PELT change-point detection
        if config.pelt_enabled:
            pelt_results = self._pelt.analyze(samples, config)
            results.extend(pelt_results)

        # Isolation Forest scoring
        if config.iforest_enabled:
            iforest_result = await self._iforest.score(
                session, event.characteristic_id, samples, config
            )
            if iforest_result:
                results.append(iforest_result)

        # K-S distribution shift
        if config.ks_enabled:
            ks_result = self._ks.analyze(samples, config)
            if ks_result:
                results.append(ks_result)

        # Persist and notify
        for result in results:
            anomaly_event = await self._persist_event(
                session, event.characteristic_id, result, samples
            )
            await self._publish_notification(anomaly_event, result)

    async def _get_config(
        self, session: AsyncSession, char_id: int
    ) -> Any | None:
        """Load detector configuration for a characteristic.

        Returns default configuration if none exists.
        """
        from openspc.db.models.anomaly import AnomalyDetectorConfig

        stmt = select(AnomalyDetectorConfig).where(
            AnomalyDetectorConfig.char_id == char_id
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def _load_window(
        self, session: AsyncSession, char_id: int, max_size: int = 1000
    ) -> list[dict]:
        """Load the analysis window of recent samples.

        Returns sample data as plain dictionaries with pre-extracted
        values to avoid lazy loading issues.
        """
        from openspc.db.models.sample import Measurement, Sample

        stmt = (
            select(Sample)
            .options(selectinload(Sample.measurements))
            .where(Sample.char_id == char_id, Sample.is_excluded == False)
            .order_by(Sample.timestamp.desc())
            .limit(max_size)
        )

        result = await session.execute(stmt)
        samples = list(result.scalars().all())

        data: list[dict] = []
        for sample in reversed(samples):  # Chronological order
            measurements = sample.measurements
            values = [m.value for m in measurements] if measurements else []

            mean = float(np.mean(values)) if values else 0.0
            range_value = (
                float(max(values) - min(values))
                if len(values) > 1
                else 0.0
            )

            # Calculate sigma_distance if z_score is available
            sigma_distance = float(sample.z_score) if sample.z_score else 0.0

            # Timestamp epoch for time_gap feature
            ts = sample.timestamp
            ts_epoch = ts.timestamp() if ts else 0.0

            data.append(
                {
                    "sample_id": sample.id,
                    "mean": mean,
                    "range_value": range_value,
                    "sigma_distance": sigma_distance,
                    "timestamp": ts,
                    "timestamp_epoch": ts_epoch,
                }
            )

        return data

    async def _persist_event(
        self,
        session: AsyncSession,
        char_id: int,
        result: AnomalyResult,
        samples: list[dict],
    ) -> Any:
        """Persist an anomaly event to the database.

        Args:
            session: Active database session.
            char_id: Characteristic ID.
            result: AnomalyResult from a detector.
            samples: The analysis window samples.

        Returns:
            The created AnomalyEvent ORM instance.
        """
        from openspc.db.models.anomaly import AnomalyEvent

        summary = generate_event_summary(result)

        # Window boundary IDs
        window_start_id = samples[0].get("sample_id") if samples else None
        window_end_id = samples[-1].get("sample_id") if samples else None

        event = AnomalyEvent(
            char_id=char_id,
            detector_type=result.detector_type,
            event_type=result.event_type,
            severity=result.severity,
            details=result.details,
            sample_id=result.sample_id,
            window_start_id=window_start_id,
            window_end_id=window_end_id,
            summary=summary,
            detected_at=datetime.now(timezone.utc),
        )
        session.add(event)
        await session.flush()
        await session.refresh(event)

        logger.info(
            "anomaly_event_persisted",
            event_id=event.id,
            char_id=char_id,
            detector=result.detector_type,
            severity=result.severity,
        )

        return event

    async def _publish_notification(
        self, anomaly_event: Any, result: AnomalyResult
    ) -> None:
        """Publish AnomalyDetectedEvent to the Event Bus.

        Args:
            anomaly_event: The persisted AnomalyEvent ORM instance.
            result: The original AnomalyResult.
        """
        notification = AnomalyDetectedEvent(
            anomaly_event_id=anomaly_event.id,
            characteristic_id=anomaly_event.char_id,
            detector_type=result.detector_type,
            event_type=result.event_type,
            severity=result.severity,
            summary=anomaly_event.summary or "",
            sample_id=result.sample_id,
        )

        try:
            await self._event_bus.publish(notification)
        except Exception:
            logger.warning(
                "anomaly_notification_publish_failed",
                event_id=anomaly_event.id,
            )

    async def analyze_characteristic(
        self, session: AsyncSession, char_id: int
    ) -> list[AnomalyResult]:
        """Run a full on-demand analysis for a characteristic.

        This is the manual trigger endpoint implementation. Unlike the
        event-driven flow, this always runs all enabled detectors and
        returns results directly.

        Args:
            session: Active database session.
            char_id: Characteristic ID to analyze.

        Returns:
            List of AnomalyResult objects from all detectors.
        """
        config = await self._get_config(session, char_id)
        if config is None or not config.is_enabled:
            return []

        samples = await self._load_window(session, char_id)
        if len(samples) < 10:
            return []

        results: list[AnomalyResult] = []

        if config.pelt_enabled:
            # Clear cache for fresh analysis
            self._pelt.clear_cache(char_id)
            pelt_results = self._pelt.analyze(samples, config)
            results.extend(pelt_results)

        if config.iforest_enabled:
            iforest_result = await self._iforest.score(
                session, char_id, samples, config
            )
            if iforest_result:
                results.append(iforest_result)

        if config.ks_enabled:
            ks_result = self._ks.analyze(samples, config)
            if ks_result:
                results.append(ks_result)

        # Persist all results
        for result in results:
            anomaly_event = await self._persist_event(
                session, char_id, result, samples
            )
            await self._publish_notification(anomaly_event, result)

        return results
