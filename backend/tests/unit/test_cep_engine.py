"""Unit tests for the streaming CEP engine.

These tests exercise the engine directly without spinning up FastAPI:

* Conditions advance their per-characteristic streaming state correctly.
* Two-stream patterns match within the sliding window and miss outside.
* Disabled rules retain state but do not fire.
* YAML validation rejects malformed input with structured markers.
* The engine processes samples in arrival order without dropping events.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from cassini.api.schemas.cep import (
    CepAction,
    CepCondition,
    CepConditionKind,
    CepRuleSpec,
    CepSeverity,
)
from cassini.core.cep.conditions import (
    CepConditionState,
    evaluate_condition_against_sample,
    fingerprint_condition,
)
from cassini.core.cep.engine import CepEngine, CepMatchEvent
from cassini.core.cep.yaml_loader import CepYamlError, load_rule_from_yaml
from cassini.core.events import SampleProcessedEvent
from cassini.db.models import Base
from cassini.db.models.cep_rule import CepRule
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.hierarchy import Hierarchy, HierarchyType
from cassini.db.models.plant import Plant


# ---------------------------------------------------------------------------
# In-process test event bus — minimal subset of TypedEventBusAdapter
# ---------------------------------------------------------------------------


class _StubEventBus:
    def __init__(self) -> None:
        self._handlers: dict[type, list[Any]] = {}
        self.published: list[Any] = []

    def subscribe(self, event_type, handler) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    def unsubscribe(self, event_type, handler) -> None:
        if event_type in self._handlers:
            self._handlers[event_type] = [
                h for h in self._handlers[event_type] if h is not handler
            ]

    async def publish(self, event) -> None:
        self.published.append(event)
        for h in list(self._handlers.get(type(event), [])):
            await h(event)


# ---------------------------------------------------------------------------
# Fixtures — fresh in-memory DB + plant/hierarchy/characteristic seeds
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def session_factory():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    yield factory
    await engine.dispose()


@pytest_asyncio.fixture
async def seeded_chars(session_factory):
    """Seed plant + hierarchy + two characteristics so the engine can resolve them."""
    async with session_factory() as session:
        plant = Plant(name="Plant A", code="PA")
        session.add(plant)
        await session.flush()

        line = Hierarchy(
            name="Line 1",
            type=HierarchyType.LINE.value,
            plant_id=plant.id,
        )
        session.add(line)
        await session.flush()

        char_shaft = Characteristic(
            name="Shaft OD",
            hierarchy_id=line.id,
            subgroup_size=1,
            stored_center_line=10.0,
        )
        char_bore = Characteristic(
            name="Bore ID",
            hierarchy_id=line.id,
            subgroup_size=1,
            stored_center_line=20.0,
        )
        session.add_all([char_shaft, char_bore])
        await session.commit()

        return {
            "plant_id": plant.id,
            "line_name": line.name,
            "shaft_id": char_shaft.id,
            "shaft_identifier": f"{line.name} > {char_shaft.name}",
            "bore_id": char_bore.id,
            "bore_identifier": f"{line.name} > {char_bore.name}",
        }


# ---------------------------------------------------------------------------
# 1) Simple pattern fires on a single stream
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_simple_pattern_matches(session_factory, seeded_chars):
    spec = CepRuleSpec(
        name="single-stream",
        window="60s",
        conditions=[
            CepCondition(
                characteristic=seeded_chars["shaft_identifier"],
                rule=CepConditionKind.above_mean_consecutive,
                count=3,
            )
        ],
        action=CepAction(violation="DRIFT_UP", severity=CepSeverity.medium),
    )

    async with session_factory() as session:
        session.add(
            CepRule(
                plant_id=seeded_chars["plant_id"],
                name=spec.name,
                description=None,
                yaml_text="placeholder",
                parsed_json=spec.model_dump_json(),
                enabled=True,
            )
        )
        await session.commit()

    bus = _StubEventBus()
    engine = CepEngine(session_factory=session_factory, event_bus=bus)
    await engine.start()

    base = datetime.now(timezone.utc)
    for i in range(3):
        await bus.publish(
            SampleProcessedEvent(
                sample_id=i + 1,
                characteristic_id=seeded_chars["shaft_id"],
                mean=11.0,  # above stored centre line of 10.0
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
                timestamp=base + timedelta(seconds=i),
            )
        )

    matches = [e for e in bus.published if isinstance(e, CepMatchEvent)]
    assert len(matches) == 1
    assert matches[0].rule_name == "single-stream"
    assert matches[0].plant_id == seeded_chars["plant_id"]
    assert matches[0].severity == "medium"


# ---------------------------------------------------------------------------
# 2) Two-stream pattern fires when both conditions match inside the window
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_two_stream_pattern_matches_within_window(session_factory, seeded_chars):
    spec = CepRuleSpec(
        name="two-stream-inside",
        window="30s",
        conditions=[
            CepCondition(
                characteristic=seeded_chars["shaft_identifier"],
                rule=CepConditionKind.above_mean_consecutive,
                count=2,
            ),
            CepCondition(
                characteristic=seeded_chars["bore_identifier"],
                rule=CepConditionKind.below_mean_consecutive,
                count=2,
            ),
        ],
        action=CepAction(violation="DRIFT_PAIR", severity=CepSeverity.high),
    )

    async with session_factory() as session:
        session.add(
            CepRule(
                plant_id=seeded_chars["plant_id"],
                name=spec.name,
                description=None,
                yaml_text="placeholder",
                parsed_json=spec.model_dump_json(),
                enabled=True,
            )
        )
        await session.commit()

    bus = _StubEventBus()
    engine = CepEngine(session_factory=session_factory, event_bus=bus)
    await engine.start()

    t0 = datetime.now(timezone.utc)
    # Two shaft samples above centre line
    for i in range(2):
        await bus.publish(
            SampleProcessedEvent(
                sample_id=i + 1,
                characteristic_id=seeded_chars["shaft_id"],
                mean=11.0,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
                timestamp=t0 + timedelta(seconds=i),
            )
        )
    # Two bore samples below centre line, well inside the 30s window
    for i in range(2):
        await bus.publish(
            SampleProcessedEvent(
                sample_id=10 + i,
                characteristic_id=seeded_chars["bore_id"],
                mean=19.0,
                range_value=None,
                zone="zone_c_lower",
                in_control=True,
                timestamp=t0 + timedelta(seconds=5 + i),
            )
        )

    matches = [e for e in bus.published if isinstance(e, CepMatchEvent)]
    assert len(matches) == 1
    assert matches[0].severity == "high"


# ---------------------------------------------------------------------------
# 3) Two-stream pattern misses when conditions fall outside the window
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_two_stream_pattern_does_not_match_outside_window(
    session_factory, seeded_chars
):
    spec = CepRuleSpec(
        name="two-stream-outside",
        window="30s",
        conditions=[
            CepCondition(
                characteristic=seeded_chars["shaft_identifier"],
                rule=CepConditionKind.above_mean_consecutive,
                count=2,
            ),
            CepCondition(
                characteristic=seeded_chars["bore_identifier"],
                rule=CepConditionKind.below_mean_consecutive,
                count=2,
            ),
        ],
        action=CepAction(violation="DRIFT_PAIR", severity=CepSeverity.high),
    )

    async with session_factory() as session:
        session.add(
            CepRule(
                plant_id=seeded_chars["plant_id"],
                name=spec.name,
                description=None,
                yaml_text="placeholder",
                parsed_json=spec.model_dump_json(),
                enabled=True,
            )
        )
        await session.commit()

    bus = _StubEventBus()
    engine = CepEngine(session_factory=session_factory, event_bus=bus)
    await engine.start()

    t0 = datetime.now(timezone.utc)
    # Two shaft samples
    for i in range(2):
        await bus.publish(
            SampleProcessedEvent(
                sample_id=i + 1,
                characteristic_id=seeded_chars["shaft_id"],
                mean=11.0,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
                timestamp=t0 + timedelta(seconds=i),
            )
        )
    # Two bore samples — but five minutes later, way past the 30s window
    for i in range(2):
        await bus.publish(
            SampleProcessedEvent(
                sample_id=10 + i,
                characteristic_id=seeded_chars["bore_id"],
                mean=19.0,
                range_value=None,
                zone="zone_c_lower",
                in_control=True,
                timestamp=t0 + timedelta(minutes=5, seconds=i),
            )
        )

    matches = [e for e in bus.published if isinstance(e, CepMatchEvent)]
    assert matches == []


# ---------------------------------------------------------------------------
# 4) Pattern doesn't match when only some conditions are satisfied
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pattern_does_not_match_partial_conditions(
    session_factory, seeded_chars
):
    spec = CepRuleSpec(
        name="partial-conditions",
        window="60s",
        conditions=[
            CepCondition(
                characteristic=seeded_chars["shaft_identifier"],
                rule=CepConditionKind.above_mean_consecutive,
                count=3,
            ),
            CepCondition(
                characteristic=seeded_chars["bore_identifier"],
                rule=CepConditionKind.below_mean_consecutive,
                count=3,
            ),
        ],
        action=CepAction(violation="X", severity=CepSeverity.medium),
    )

    async with session_factory() as session:
        session.add(
            CepRule(
                plant_id=seeded_chars["plant_id"],
                name=spec.name,
                description=None,
                yaml_text="placeholder",
                parsed_json=spec.model_dump_json(),
                enabled=True,
            )
        )
        await session.commit()

    bus = _StubEventBus()
    engine = CepEngine(session_factory=session_factory, event_bus=bus)
    await engine.start()

    t0 = datetime.now(timezone.utc)
    # Three shaft samples above centre line — first condition satisfied.
    for i in range(3):
        await bus.publish(
            SampleProcessedEvent(
                sample_id=i + 1,
                characteristic_id=seeded_chars["shaft_id"],
                mean=11.0,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
                timestamp=t0 + timedelta(seconds=i),
            )
        )
    # No bore samples — second condition never satisfied.

    matches = [e for e in bus.published if isinstance(e, CepMatchEvent)]
    assert matches == []


# ---------------------------------------------------------------------------
# 5) YAML validation rejects malformed input
# ---------------------------------------------------------------------------


def test_yaml_validation_rejects_malformed():
    bad_syntax = "name: foo\n  window: 30s\nconditions: ["
    with pytest.raises(CepYamlError) as exc_info:
        load_rule_from_yaml(bad_syntax)
    err = exc_info.value
    assert err.errors  # has structured marker errors
    assert any("location" in e for e in err.errors)

    missing_action = """
name: only-conditions
window: 30s
conditions:
  - characteristic: A
    rule: above_mean_consecutive
    count: 3
"""
    with pytest.raises(CepYamlError) as exc_info:
        load_rule_from_yaml(missing_action)
    err = exc_info.value
    # action is required — must show up in the error path
    assert any("action" in e["message"].lower() for e in err.errors)

    bad_window = """
name: oops
window: forever
conditions:
  - characteristic: A
    rule: above_mean_consecutive
    count: 3
action:
  violation: X
"""
    with pytest.raises(CepYamlError):
        load_rule_from_yaml(bad_window)


# ---------------------------------------------------------------------------
# 6) Engine processes samples in order (no out-of-order corruption)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_engine_processes_samples_in_order(session_factory, seeded_chars):
    spec = CepRuleSpec(
        name="ordered",
        window="60s",
        conditions=[
            CepCondition(
                characteristic=seeded_chars["shaft_identifier"],
                rule=CepConditionKind.increasing,
                count=3,
            )
        ],
        action=CepAction(violation="UPTREND", severity=CepSeverity.medium),
    )

    async with session_factory() as session:
        session.add(
            CepRule(
                plant_id=seeded_chars["plant_id"],
                name=spec.name,
                description=None,
                yaml_text="placeholder",
                parsed_json=spec.model_dump_json(),
                enabled=True,
            )
        )
        await session.commit()

    bus = _StubEventBus()
    engine = CepEngine(session_factory=session_factory, event_bus=bus)
    await engine.start()

    t0 = datetime.now(timezone.utc)
    # Strictly increasing values — should fire after enough increases
    for i, value in enumerate([10.0, 10.1, 10.2, 10.3, 10.4]):
        await bus.publish(
            SampleProcessedEvent(
                sample_id=i + 1,
                characteristic_id=seeded_chars["shaft_id"],
                mean=value,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
                timestamp=t0 + timedelta(seconds=i),
            )
        )

    matches = [e for e in bus.published if isinstance(e, CepMatchEvent)]
    assert len(matches) >= 1


# ---------------------------------------------------------------------------
# 7) Disabled rule does not fire
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_disabled_rule_does_not_fire(session_factory, seeded_chars):
    spec = CepRuleSpec(
        name="disabled",
        window="60s",
        conditions=[
            CepCondition(
                characteristic=seeded_chars["shaft_identifier"],
                rule=CepConditionKind.above_mean_consecutive,
                count=2,
            )
        ],
        action=CepAction(violation="X", severity=CepSeverity.low),
    )

    async with session_factory() as session:
        session.add(
            CepRule(
                plant_id=seeded_chars["plant_id"],
                name=spec.name,
                description=None,
                yaml_text="placeholder",
                parsed_json=spec.model_dump_json(),
                enabled=False,  # disabled
            )
        )
        await session.commit()

    bus = _StubEventBus()
    engine = CepEngine(session_factory=session_factory, event_bus=bus)
    await engine.start()

    t0 = datetime.now(timezone.utc)
    for i in range(5):
        await bus.publish(
            SampleProcessedEvent(
                sample_id=i + 1,
                characteristic_id=seeded_chars["shaft_id"],
                mean=11.5,
                range_value=None,
                zone="zone_c_upper",
                in_control=True,
                timestamp=t0 + timedelta(seconds=i),
            )
        )

    matches = [e for e in bus.published if isinstance(e, CepMatchEvent)]
    assert matches == []


# ---------------------------------------------------------------------------
# Bonus: condition fingerprint reuse
# ---------------------------------------------------------------------------


def test_fingerprint_condition_stable():
    a = CepCondition(
        characteristic="A",
        rule=CepConditionKind.above_mean_consecutive,
        count=3,
    )
    b = CepCondition(
        characteristic="A",
        rule=CepConditionKind.above_mean_consecutive,
        count=3,
    )
    assert fingerprint_condition(a) == fingerprint_condition(b)
    c = CepCondition(
        characteristic="A",
        rule=CepConditionKind.above_mean_consecutive,
        count=4,
    )
    assert fingerprint_condition(a) != fingerprint_condition(c)


def test_evaluate_condition_resets_on_break():
    cond = CepCondition(
        characteristic="A",
        rule=CepConditionKind.above_mean_consecutive,
        count=3,
    )
    state = CepConditionState.for_condition(cond)
    # Two hits, then a miss, then build back up — counter must reset.
    for value, expected in [
        (11.0, False),
        (12.0, False),
        (9.0, False),  # miss — resets
        (11.0, False),
        (11.5, False),
        (12.0, True),  # third consecutive hit
    ]:
        got = evaluate_condition_against_sample(
            state, value=value, in_control=True, center_line=10.0
        )
        assert got == expected, f"value={value} expected {expected}"
