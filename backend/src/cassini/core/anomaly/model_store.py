"""Model serialization and persistence for ML-based detectors.

Handles joblib serialization of scikit-learn models to/from
base64-encoded blobs for database storage.
"""

from __future__ import annotations

import base64
import io
from datetime import datetime, timezone

import structlog

from cassini.core.anomaly.feature_builder import FEATURE_NAMES

logger = structlog.get_logger(__name__)


def serialize_model(model: object) -> str:
    """Serialize a scikit-learn model to a base64-encoded string.

    Uses joblib for efficient serialization of numpy-heavy objects.

    Args:
        model: A trained scikit-learn model instance.

    Returns:
        Base64-encoded string of the serialized model.
    """
    import joblib

    buffer = io.BytesIO()
    joblib.dump(model, buffer)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def deserialize_model(blob: str) -> object:
    """Deserialize a scikit-learn model from a base64-encoded string.

    Args:
        blob: Base64-encoded string from the database.

    Returns:
        The deserialized model object.
    """
    import joblib

    raw = base64.b64decode(blob)
    buffer = io.BytesIO(raw)
    return joblib.load(buffer)


async def save_model_state(
    session,
    char_id: int,
    detector_type: str,
    model: object,
    training_samples: int,
    training_started_at: datetime,
) -> None:
    """Persist a trained model to the anomaly_model_state table.

    Uses upsert semantics: updates if (char_id, detector_type) exists,
    inserts otherwise.

    Args:
        session: SQLAlchemy async session.
        char_id: Characteristic ID the model belongs to.
        detector_type: Detector type string (e.g., 'isolation_forest').
        model: Trained model to serialize.
        training_samples: Number of samples used for training.
        training_started_at: When training started.
    """
    from sqlalchemy import select

    from cassini.db.models.anomaly import AnomalyModelState

    blob = serialize_model(model)
    now = datetime.now(timezone.utc)

    stmt = select(AnomalyModelState).where(
        AnomalyModelState.char_id == char_id,
        AnomalyModelState.detector_type == detector_type,
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.model_blob = blob
        existing.training_samples = training_samples
        existing.training_started_at = training_started_at
        existing.training_completed_at = now
        existing.feature_names = FEATURE_NAMES
    else:
        state = AnomalyModelState(
            char_id=char_id,
            detector_type=detector_type,
            model_blob=blob,
            training_samples=training_samples,
            training_started_at=training_started_at,
            training_completed_at=now,
            feature_names=FEATURE_NAMES,
        )
        session.add(state)

    await session.flush()
    logger.info(
        "model_state_saved",
        char_id=char_id,
        detector_type=detector_type,
        training_samples=training_samples,
    )


async def load_model_state(
    session, char_id: int, detector_type: str
) -> object | None:
    """Load a trained model from the database.

    Args:
        session: SQLAlchemy async session.
        char_id: Characteristic ID.
        detector_type: Detector type string.

    Returns:
        Deserialized model object, or None if no state exists.
    """
    from sqlalchemy import select

    from cassini.db.models.anomaly import AnomalyModelState

    stmt = select(AnomalyModelState).where(
        AnomalyModelState.char_id == char_id,
        AnomalyModelState.detector_type == detector_type,
    )
    result = await session.execute(stmt)
    state = result.scalar_one_or_none()

    if state is None:
        return None

    try:
        return deserialize_model(state.model_blob)
    except Exception:
        logger.warning(
            "model_deserialization_failed",
            char_id=char_id,
            detector_type=detector_type,
        )
        return None
