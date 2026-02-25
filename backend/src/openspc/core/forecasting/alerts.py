"""Predicted out-of-control alert detection.

Scans a list of forecasted values against UCL / LCL and returns the
first step at which a breach is predicted.
"""

from __future__ import annotations


def check_predicted_ooc(
    forecast_values: list[float],
    ucl: float | None,
    lcl: float | None,
) -> int | None:
    """Check if any forecasted value crosses control limits.

    Args:
        forecast_values: Predicted values for future steps.
        ucl: Upper control limit (``None`` if not set).
        lcl: Lower control limit (``None`` if not set).

    Returns:
        1-based step number of the first predicted OOC, or ``None`` if
        all forecasted values remain within control limits.
    """
    for i, value in enumerate(forecast_values):
        if ucl is not None and value > ucl:
            return i + 1
        if lcl is not None and value < lcl:
            return i + 1
    return None
