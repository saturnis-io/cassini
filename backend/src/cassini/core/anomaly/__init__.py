"""AI/ML anomaly detection for Cassini.

Provides PELT change-point detection, Isolation Forest multivariate
outlier detection, and K-S distribution shift detection.
"""

from cassini.core.anomaly.detector import AnomalyDetector, AnomalyResult

__all__ = [
    "AnomalyDetector",
    "AnomalyResult",
]
