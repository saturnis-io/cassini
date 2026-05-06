"""Real-API smoke test for AIAnalysisEngine.

Spins up an in-memory-style SQLite, seeds a drifting characteristic,
configures the Claude provider with an API key from the environment,
calls ``AIAnalysisEngine.analyze`` directly, and asserts the response
shape (populated patterns/risks/recommendations + non-zero tokens_used).

Cost: roughly $0.02-0.05 per invocation against claude-sonnet-4-20250514.
The script auto-aborts after a single call -- there is no retry loop here.

Usage::

    set -a; source /path/to/.env.test; set +a   # provides ANTHROPIC_API_KEY
    PYTHONPATH=src python scripts/smoke_ai_analysis.py

Never log or commit the API key.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add backend/src to sys.path when invoked from the backend dir
_BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND_DIR / "src"))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Import the models package -- this registers every table on Base.metadata
# so create_all sees all foreign-key targets (Plant, Hierarchy, etc.).
import cassini.db.models  # noqa: F401  (side-effect: registers all tables)

from cassini.core.ai_analysis.engine import AIAnalysisEngine
from cassini.db.dialects import encrypt_password, get_encryption_key
from cassini.db.models import (
    AIInsight,
    AIProviderConfig,
    Base,
    Characteristic,
    Hierarchy,
    Measurement,
    Plant,
    Sample,
)


SMOKE_DB_PATH = _BACKEND_DIR / ".smoke_ai.db"
SMOKE_DB_URL = f"sqlite+aiosqlite:///{SMOKE_DB_PATH.as_posix()}"


# ---------------------------------------------------------------------------
# Cost accounting (sonnet-4 pricing as of 2025: $3 / 1M in, $15 / 1M out)
# ---------------------------------------------------------------------------

_SONNET_4_INPUT_PRICE_PER_1M = 3.00
_SONNET_4_OUTPUT_PRICE_PER_1M = 15.00


def _redact_key(key: str) -> str:
    """Return only first 6 + last 4 chars of the API key for safe logging."""
    if not key or len(key) < 12:
        return "<not-set>"
    return f"{key[:6]}...{key[-4:]}"


# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------


async def _seed_drifting_characteristic(session: AsyncSession) -> tuple[int, int]:
    """Seed plant + hierarchy + characteristic + 50 drifting samples.

    Returns ``(plant_id, char_id)``.
    """
    now = datetime.now(timezone.utc)

    plant = Plant(name="Smoke Test Plant", code="SMOKE", is_active=True)
    session.add(plant)
    await session.flush()

    hierarchy = Hierarchy(
        plant_id=plant.id,
        parent_id=None,
        name="Smoke Line 1",
        type="line",
    )
    session.add(hierarchy)
    await session.flush()

    char = Characteristic(
        hierarchy_id=hierarchy.id,
        name="Pin Diameter",
        description="Smoke-test pin diameter (drifting)",
        subgroup_size=1,
        target_value=10.000,
        usl=10.020,
        lsl=9.980,
        chart_type="i_mr",
        data_type="variable",
        decimal_precision=4,
    )
    session.add(char)
    await session.flush()

    # 50 samples, drifting linearly from 10.000 toward 10.025 (past USL)
    # with light noise.  This produces real violations + capability data.
    import random
    random.seed(42)

    for i in range(50):
        drift = 10.000 + (i / 49.0) * 0.025
        noise = random.gauss(0.0, 0.003)
        value = drift + noise
        sample = Sample(
            char_id=char.id,
            timestamp=now - timedelta(hours=49 - i),
            actual_n=1,
        )
        session.add(sample)
        await session.flush()
        session.add(Measurement(sample_id=sample.id, value=value))

    await session.flush()
    return plant.id, char.id


async def _seed_ai_config(
    session: AsyncSession, plant_id: int, api_key: str
) -> None:
    enc_key = get_encryption_key()
    encrypted = encrypt_password(api_key, enc_key)
    config = AIProviderConfig(
        plant_id=plant_id,
        provider_type="claude",
        model_name="claude-sonnet-4-20250514",
        max_tokens=4096,
        is_enabled=True,
        api_key=encrypted,
    )
    session.add(config)
    await session.flush()


# ---------------------------------------------------------------------------
# Smoke runner
# ---------------------------------------------------------------------------


async def _run_smoke() -> int:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set in environment.", file=sys.stderr)
        return 2

    print(f"[smoke] Using API key: {_redact_key(api_key)}")
    print(f"[smoke] DB: {SMOKE_DB_URL}")

    # Fresh DB on every run
    if SMOKE_DB_PATH.exists():
        SMOKE_DB_PATH.unlink()

    engine = create_async_engine(SMOKE_DB_URL, echo=False)
    Sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with Sessionmaker() as session:
            plant_id, char_id = await _seed_drifting_characteristic(session)
            await _seed_ai_config(session, plant_id, api_key)
            await session.commit()
            print(f"[smoke] Seeded plant_id={plant_id} char_id={char_id}")

        # Run the actual analysis
        analyzer = AIAnalysisEngine()
        async with Sessionmaker() as session:
            t0 = time.monotonic()
            result = await analyzer.analyze(session, char_id, plant_id)
            latency_ms = int((time.monotonic() - t0) * 1000)

        # ------------------------------------------------------------------
        # Pull insight back to verify persisted token count
        # ------------------------------------------------------------------
        async with Sessionmaker() as session:
            from sqlalchemy import select

            stmt = (
                select(AIInsight)
                .where(AIInsight.characteristic_id == char_id)
                .order_by(AIInsight.id.desc())
                .limit(1)
            )
            persisted = (await session.execute(stmt)).scalar_one()

        tokens_used = persisted.tokens_used or 0
        # Estimate cost assuming roughly 60% in / 40% out -- we only have
        # the total here.  This is a ballpark, the API charges are exact.
        est_input = int(tokens_used * 0.6)
        est_output = int(tokens_used * 0.4)
        est_cost = (
            est_input * _SONNET_4_INPUT_PRICE_PER_1M / 1_000_000
            + est_output * _SONNET_4_OUTPUT_PRICE_PER_1M / 1_000_000
        )

        summary = result.get("summary", "") or ""
        patterns = result.get("patterns", []) or []
        risks = result.get("risks", []) or []
        recommendations = result.get("recommendations", []) or []

        # ------------------------------------------------------------------
        # Print redacted result summary
        # ------------------------------------------------------------------
        print()
        print("=" * 60)
        print("SMOKE TEST RESULT")
        print("=" * 60)
        print(f"Latency:          {latency_ms} ms")
        print(f"Tokens (total):   {tokens_used}")
        print(f"Est. cost (USD):  ${est_cost:.4f}")
        print(f"Tool calls:       {result.get('tool_calls_made', 0)}")
        print(f"Provider/model:   {result.get('provider_type')} / {result.get('model_name')}")
        print()
        print(f"summary[:200]:    {summary[:200]}")
        print(f"# patterns:       {len(patterns)}")
        print(f"# risks:          {len(risks)}")
        print(f"# recommendations:{len(recommendations)}")
        print()
        print("Sample entries (first of each):")
        if patterns:
            print(f"  pattern[0]:       {patterns[0][:120]}")
        if risks:
            print(f"  risk[0]:          {risks[0][:120]}")
        if recommendations:
            print(f"  recommendation[0]:{recommendations[0][:120]}")
        print()

        # ------------------------------------------------------------------
        # Assertions
        # ------------------------------------------------------------------
        failures: list[str] = []
        if len(patterns) < 1:
            failures.append("patterns is empty")
        if len(risks) < 1:
            failures.append("risks is empty")
        if len(recommendations) < 1:
            failures.append("recommendations is empty")
        if tokens_used <= 0:
            failures.append(f"tokens_used is {tokens_used} (expected > 0)")
        if "```json" in summary:
            failures.append("summary contains ```json fence (raw JSON leak)")
        if '"patterns":' in summary:
            failures.append('summary contains "patterns": (raw JSON leak)')
        if latency_ms > 60_000:
            failures.append(f"latency {latency_ms} ms exceeds 60s")

        if failures:
            print("FAIL:")
            for f in failures:
                print(f"  - {f}")
            return 1

        print("PASS: all assertions held.")
        return 0
    finally:
        await engine.dispose()
        if SMOKE_DB_PATH.exists():
            try:
                SMOKE_DB_PATH.unlink()
                print(f"[smoke] Removed {SMOKE_DB_PATH}")
            except OSError as exc:
                print(f"[smoke] Could not remove DB: {exc}", file=sys.stderr)


def main() -> int:
    return asyncio.run(_run_smoke())


if __name__ == "__main__":
    sys.exit(main())
