"""Isolation Forest multivariate anomaly detection using scikit-learn.

Detects outliers using multiple features simultaneously, catching
anomalies that univariate control charts miss (e.g., mean is in-zone
but range+mean+trend combination is unusual).

scikit-learn is an optional dependency. This module uses lazy imports
to avoid startup cost when Isolation Forest is not enabled.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

import numpy as np
import structlog

from openspc.core.anomaly.feature_builder import FEATURE_NAMES, build_features
from openspc.core.anomaly.model_store import load_model_state, save_model_state
from openspc.core.anomaly.pelt_detector import AnomalyResult

if TYPE_CHECKING:
    from openspc.db.models.anomaly import AnomalyDetectorConfig

logger = structlog.get_logger(__name__)

# Maximum training samples to prevent excessive compute
MAX_TRAINING_SAMPLES = 5000


class IsolationForestDetector:
    """Isolation Forest multivariate anomaly detector.

    Maintains an in-memory cache of trained models per characteristic.
    Models are periodically retrained and persisted to the database
    for recovery after restarts.
    """

    def __init__(self) -> None:
        self._models: dict[int, Any] = {}
        self._sample_counts: dict[int, int] = {}

    async def score(
        self,
        session: Any,
        char_id: int,
        samples: list[dict],
        config: AnomalyDetectorConfig,
    ) -> AnomalyResult | None:
        """Score the latest sample against the trained model.

        Args:
            session: SQLAlchemy async session.
            char_id: Characteristic ID.
            samples: List of sample dicts in chronological order.
            config: Detector configuration.

        Returns:
            AnomalyResult if anomaly detected, None otherwise.
        """
        if len(samples) < config.iforest_min_training:
            return None

        # Track sample count for retrain scheduling
        count = self._sample_counts.get(char_id, 0) + 1
        self._sample_counts[char_id] = count

        # Load model from DB if not in memory
        if char_id not in self._models:
            model = await load_model_state(session, char_id, "isolation_forest")
            if model is not None:
                self._models[char_id] = model
                logger.info("iforest_model_loaded_from_db", char_id=char_id)

        # Retrain if needed
        if (
            char_id not in self._models
            or count % config.iforest_retrain_interval == 0
        ):
            await self._retrain(session, char_id, samples, config)

        model = self._models.get(char_id)
        if model is None:
            return None

        # Build feature vector for latest sample
        features = build_features(samples[-1], samples)
        feature_array = np.array([features])

        try:
            score = float(model.decision_function(feature_array)[0])
        except Exception:
            logger.warning(
                "iforest_scoring_failed", char_id=char_id
            )
            return None

        if score < config.anomaly_score_threshold:
            severity = "CRITICAL" if score < -0.7 else "WARNING"

            result = AnomalyResult(
                detector_type="isolation_forest",
                event_type="outlier",
                severity=severity,
                sample_id=samples[-1].get("sample_id"),
                details={
                    "anomaly_score": score,
                    "features": dict(zip(FEATURE_NAMES, features)),
                    "threshold": config.anomaly_score_threshold,
                },
                summary=(
                    f"Multivariate anomaly detected (score: {score:.3f}, "
                    f"threshold: {config.anomaly_score_threshold})"
                ),
            )

            logger.info(
                "iforest_anomaly_detected",
                char_id=char_id,
                score=score,
            )
            return result

        return None

    async def _retrain(
        self,
        session: Any,
        char_id: int,
        samples: list[dict],
        config: AnomalyDetectorConfig,
    ) -> None:
        """Retrain the Isolation Forest model.

        Args:
            session: SQLAlchemy async session.
            char_id: Characteristic ID.
            samples: Full sample window for training.
            config: Detector configuration.
        """
        try:
            from sklearn.ensemble import IsolationForest
        except ImportError:
            logger.warning(
                "scikit_learn_not_installed",
                char_id=char_id,
                msg="Install scikit-learn for Isolation Forest support: pip install openspc[ml]",
            )
            return

        training_started = datetime.now(timezone.utc)

        # Cap training data
        training_samples = samples[-MAX_TRAINING_SAMPLES:]

        if len(training_samples) < config.iforest_min_training:
            return

        # Build feature matrix
        feature_matrix = np.array(
            [
                build_features(s, training_samples[: i + 1])
                for i, s in enumerate(training_samples)
            ]
        )

        try:
            model = IsolationForest(
                contamination=config.iforest_contamination,
                n_estimators=config.iforest_n_estimators,
                random_state=42,
            )
            model.fit(feature_matrix)
        except Exception:
            logger.warning(
                "iforest_training_failed",
                char_id=char_id,
                n_samples=len(training_samples),
            )
            return

        self._models[char_id] = model

        # Persist to DB for recovery
        await save_model_state(
            session=session,
            char_id=char_id,
            detector_type="isolation_forest",
            model=model,
            training_samples=len(training_samples),
            training_started_at=training_started,
        )

        logger.info(
            "iforest_model_retrained",
            char_id=char_id,
            n_samples=len(training_samples),
        )

    def clear_cache(self, char_id: int | None = None) -> None:
        """Clear model cache.

        Args:
            char_id: If provided, clear only for this characteristic.
                     If None, clear all.
        """
        if char_id is not None:
            self._models.pop(char_id, None)
            self._sample_counts.pop(char_id, None)
        else:
            self._models.clear()
            self._sample_counts.clear()
