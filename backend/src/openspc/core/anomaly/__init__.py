"""AI/ML anomaly detection for OpenSPC.

Provides PELT change-point detection, Isolation Forest multivariate
outlier detection, and K-S distribution shift detection.
"""

from openspc.core.anomaly.detector import AnomalyDetector, AnomalyResult

__all__ = [
    "AnomalyDetector",
    "AnomalyResult",
]
