"""K-S distribution shift detection using scipy.

Detects gradual changes in the underlying process distribution by
comparing a reference window of stable samples against a recent
test window using the two-sample Kolmogorov-Smirnov test.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import numpy as np
import structlog

from cassini.core.anomaly.pelt_detector import AnomalyResult

if TYPE_CHECKING:
    from cassini.db.models.anomaly import AnomalyDetectorConfig

logger = structlog.get_logger(__name__)


class KSDetector:
    """Two-sample K-S distribution shift detector.

    Compares a reference window (older stable samples) against a
    recent test window to detect distributional changes.
    """

    def analyze(
        self,
        samples: list[dict],
        config: AnomalyDetectorConfig,
    ) -> AnomalyResult | None:
        """Run K-S test comparing reference and test windows.

        Args:
            samples: List of sample dicts with 'mean' key, chronological order.
            config: Detector configuration for this characteristic.

        Returns:
            AnomalyResult if distribution shift detected, None otherwise.
        """
        from scipy.stats import ks_2samp

        ref_size = config.ks_reference_window
        test_size = config.ks_test_window
        total_needed = ref_size + test_size

        if len(samples) < total_needed:
            return None

        # Reference window: older samples (before the test window)
        ref_values = np.array(
            [
                float(s.get("mean", 0.0) or 0.0)
                for s in samples[-(ref_size + test_size) : -test_size]
            ]
        )

        # Test window: most recent samples
        test_values = np.array(
            [float(s.get("mean", 0.0) or 0.0) for s in samples[-test_size:]]
        )

        if len(ref_values) < 2 or len(test_values) < 2:
            return None

        try:
            ks_stat, p_value = ks_2samp(ref_values, test_values)
        except Exception:
            logger.warning(
                "ks_test_failed",
                char_id=config.char_id,
                ref_size=len(ref_values),
                test_size=len(test_values),
            )
            return None

        if p_value >= config.ks_alpha:
            return None

        ref_mean = float(np.mean(ref_values))
        test_mean = float(np.mean(test_values))
        ref_std = float(np.std(ref_values))
        test_std = float(np.std(test_values))

        severity = self._classify_severity(p_value, config.ks_alpha)

        # Get window boundary sample IDs
        window_start_sample = samples[-(ref_size + test_size)]
        window_end_sample = samples[-1]

        summary = (
            f"Process distribution has shifted (K-S statistic: {ks_stat:.4f}, "
            f"p-value: {p_value:.4f}). Recent data does not match the "
            f"established reference distribution."
        )

        result = AnomalyResult(
            detector_type="ks_test",
            event_type="distribution_shift",
            severity=severity,
            sample_id=samples[-1].get("sample_id"),
            details={
                "ks_statistic": float(ks_stat),
                "p_value": float(p_value),
                "alpha": config.ks_alpha,
                "reference_mean": ref_mean,
                "reference_std": ref_std,
                "test_mean": test_mean,
                "test_std": test_std,
                "reference_window": len(ref_values),
                "test_window": len(test_values),
                "window_start_id": window_start_sample.get("sample_id"),
                "window_end_id": window_end_sample.get("sample_id"),
            },
            summary=summary,
        )

        logger.info(
            "ks_distribution_shift_detected",
            char_id=config.char_id,
            ks_stat=float(ks_stat),
            p_value=float(p_value),
        )

        return result

    def _classify_severity(self, p_value: float, alpha: float) -> str:
        """Classify severity based on how far below alpha the p-value is."""
        if p_value < alpha / 10:
            return "CRITICAL"
        elif p_value < alpha / 2:
            return "WARNING"
        return "INFO"
