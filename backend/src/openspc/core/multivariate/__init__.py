"""Multivariate SPC engines — Hotelling T², MEWMA, correlation, PCA, decomposition."""

from openspc.core.multivariate.correlation import CorrelationEngine
from openspc.core.multivariate.decomposition import T2Decomposition
from openspc.core.multivariate.hotelling import HotellingT2Engine
from openspc.core.multivariate.mewma import MEWMAEngine

__all__ = [
    "HotellingT2Engine",
    "MEWMAEngine",
    "CorrelationEngine",
    "T2Decomposition",
]
