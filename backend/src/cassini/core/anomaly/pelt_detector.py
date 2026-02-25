"""PELT change-point detection using the ruptures library.

Detects abrupt shifts in process mean or variance, which is the #1 thing
SPC engineers care about that Nelson Rules 2-4 catch late (requiring
6-14 consecutive points).

PELT (Pruned Exact Linear Time) provides O(n) average complexity.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import numpy as np
import structlog

if TYPE_CHECKING:
    from cassini.db.models.anomaly import AnomalyDetectorConfig

logger = structlog.get_logger(__name__)

# Maximum analysis window to prevent excessive compute
MAX_WINDOW = 1000


@dataclass
class AnomalyResult:
    """Intermediate result from a detector before persistence."""

    detector_type: str
    event_type: str
    severity: str
    sample_id: int | None
    details: dict
    summary: str


class PELTDetector:
    """PELT change-point detection using ruptures.

    Maintains an in-memory cache of previously detected changepoints
    per characteristic to avoid duplicate alerts.
    """

    def __init__(self) -> None:
        self._known_changepoints: dict[int, set[int]] = {}

    def analyze(
        self,
        samples: list[dict],
        config: AnomalyDetectorConfig,
    ) -> list[AnomalyResult]:
        """Run PELT on the sample window and return new changepoints.

        Args:
            samples: List of sample dicts with 'mean' and 'sample_id' keys,
                     in chronological order.
            config: Detector configuration for this characteristic.

        Returns:
            List of AnomalyResult for newly detected changepoints.
        """
        import ruptures

        if len(samples) < max(config.pelt_min_segment * 2, 10):
            return []

        # Cap at MAX_WINDOW to prevent excessive compute
        analysis_samples = samples[-MAX_WINDOW:]

        values = np.array(
            [float(s.get("mean", 0.0) or 0.0) for s in analysis_samples]
        )

        if len(values) < config.pelt_min_segment * 2:
            return []

        # Determine penalty
        penalty_str = config.pelt_penalty
        if penalty_str == "auto":
            penalty = 3.0 * np.log(len(values))
        else:
            try:
                penalty = float(penalty_str)
            except (ValueError, TypeError):
                penalty = 3.0 * np.log(len(values))

        try:
            algo = ruptures.Pelt(
                model=config.pelt_model,
                min_size=config.pelt_min_segment,
            )
            algo.fit(values)
            changepoints = algo.predict(pen=penalty)
        except Exception:
            logger.warning(
                "pelt_analysis_failed",
                char_id=config.char_id,
                n_samples=len(values),
            )
            return []

        # Filter out already-known changepoints
        char_id = config.char_id
        known = self._known_changepoints.get(char_id, set())
        new_changepoints: list[int] = []

        for cp_idx in changepoints[:-1]:  # Last element is always len(signal)
            if cp_idx <= 0 or cp_idx >= len(analysis_samples):
                continue
            sample_id = analysis_samples[cp_idx - 1].get("sample_id")
            if sample_id is not None and sample_id not in known:
                known.add(sample_id)
                new_changepoints.append(cp_idx)

        self._known_changepoints[char_id] = known

        results: list[AnomalyResult] = []
        for cp_idx in new_changepoints:
            before = values[max(0, cp_idx - 10) : cp_idx]
            after = values[cp_idx : min(len(values), cp_idx + 10)]

            if len(before) == 0 or len(after) == 0:
                continue

            before_mean = float(np.mean(before))
            after_mean = float(np.mean(after))
            shift_magnitude = abs(after_mean - before_mean)

            std_val = float(np.std(values))
            shift_sigma = (shift_magnitude / std_val) if std_val > 0 else 0.0

            severity = self._classify_severity(shift_sigma)

            if std_val > 0:
                summary = (
                    f"Process shift detected: mean changed by "
                    f"{shift_magnitude:.3f} ({shift_sigma:.1f} sigma)"
                )
            else:
                summary = f"Process shift detected: mean changed by {shift_magnitude:.3f}"

            results.append(
                AnomalyResult(
                    detector_type="pelt",
                    event_type="changepoint",
                    severity=severity,
                    sample_id=analysis_samples[cp_idx - 1].get("sample_id"),
                    details={
                        "changepoint_index": cp_idx,
                        "segment_before_mean": before_mean,
                        "segment_after_mean": after_mean,
                        "shift_magnitude": shift_magnitude,
                        "shift_sigma": shift_sigma,
                    },
                    summary=summary,
                )
            )

        if results:
            logger.info(
                "pelt_changepoints_detected",
                char_id=char_id,
                count=len(results),
            )

        return results

    def _classify_severity(self, shift_sigma: float) -> str:
        """Classify severity based on shift magnitude in sigma units."""
        if shift_sigma >= 2.0:
            return "CRITICAL"
        elif shift_sigma >= 1.0:
            return "WARNING"
        return "INFO"

    def clear_cache(self, char_id: int | None = None) -> None:
        """Clear known changepoints cache.

        Args:
            char_id: If provided, clear only for this characteristic.
                     If None, clear all.
        """
        if char_id is not None:
            self._known_changepoints.pop(char_id, None)
        else:
            self._known_changepoints.clear()
