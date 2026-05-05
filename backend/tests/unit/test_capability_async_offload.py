"""Tests proving CPU-bound capability work does not block the event loop.

Validates the thread-offload wrappers introduced in C16 / H14:
  - calculate_capability_async: Shapiro-Wilk at n=5000 runs in worker thread
  - compute_capability_confidence_intervals_async: bootstrap CI matrix offloaded

Each test launches the capability computation concurrently with a tight
asyncio.sleep(0) loop.  The iteration count of the sleep loop is the proof:
if the event loop were blocked, the counter would stay at 0.  A threshold of
5 iterations during the computation is a deliberately conservative bar that
would only fail if the work ran synchronously on the event loop thread.
"""

import asyncio

import numpy as np
import pytest

from cassini.core.capability import (
    calculate_capability_async,
    compute_capability_confidence_intervals_async,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _normal_data(n: int, mean: float = 10.0, std: float = 1.0, seed: int = 0) -> list[float]:
    """Reproducible normal data."""
    rng = np.random.default_rng(seed)
    return rng.normal(loc=mean, scale=std, size=n).tolist()


# ---------------------------------------------------------------------------
# C16 — Shapiro-Wilk does not block the event loop
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_shapiro_does_not_block_event_loop():
    """Event loop keeps ticking while Shapiro-Wilk runs in worker thread.

    Runs calculate_capability_async with n=5000 (Shapiro-Wilk's max sample)
    concurrently with a counter coroutine that increments on each
    asyncio.sleep(0) yield.  A blocked event loop would prevent the counter
    coroutine from running, yielding 0 iterations.  We assert at least 5,
    which is unachievable if the call is synchronous.
    """
    data = _normal_data(5000, mean=10.0, std=1.0, seed=1)
    usl = 13.0
    lsl = 7.0
    sigma_within = 1.0

    tick_count = 0
    stop_ticking = False

    async def ticker() -> None:
        nonlocal tick_count
        while not stop_ticking:
            await asyncio.sleep(0)
            tick_count += 1

    async def run_capability() -> None:
        nonlocal stop_ticking
        await calculate_capability_async(
            values=data,
            usl=usl,
            lsl=lsl,
            sigma_within=sigma_within,
        )
        stop_ticking = True

    await asyncio.gather(run_capability(), ticker())

    assert tick_count >= 5, (
        f"Expected event loop to yield at least 5 times during Shapiro-Wilk "
        f"computation, but only got {tick_count}. "
        f"This indicates the call blocked the event loop (C16)."
    )


# ---------------------------------------------------------------------------
# H14 — Bootstrap CI matrix does not block the event loop
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_bootstrap_ci_does_not_block():
    """Event loop keeps ticking while bootstrap CI matrix is built in thread.

    Runs compute_capability_confidence_intervals_async with n=2000 and
    n_bootstrap=2000 (the default) concurrently with a ticker coroutine.
    At n=2000 the resample matrix is (2000, 2000) float64 = 32MB, large
    enough to demonstrate the offload is working.
    """
    data = _normal_data(2000, mean=10.0, std=1.0, seed=2)
    usl = 13.0
    lsl = 7.0
    sigma_within = 1.0

    tick_count = 0
    stop_ticking = False

    async def ticker() -> None:
        nonlocal tick_count
        while not stop_ticking:
            await asyncio.sleep(0)
            tick_count += 1

    async def run_bootstrap_ci() -> None:
        nonlocal stop_ticking
        result = await compute_capability_confidence_intervals_async(
            measurements=data,
            usl=usl,
            lsl=lsl,
            sigma_within=sigma_within,
            n_bootstrap=2000,
        )
        stop_ticking = True
        # Sanity check: result should have reasonable CI values
        assert "ppk" in result, "Bootstrap CI must include ppk"
        ppk_lo, ppk_hi = result["ppk"]
        assert ppk_lo < ppk_hi, "CI lower bound must be less than upper bound"

    await asyncio.gather(run_bootstrap_ci(), ticker())

    assert tick_count >= 5, (
        f"Expected event loop to yield at least 5 times during bootstrap CI "
        f"computation, but only got {tick_count}. "
        f"This indicates the call blocked the event loop (H14)."
    )
