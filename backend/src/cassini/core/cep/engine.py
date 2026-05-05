"""Streaming CEP engine — multi-stream pattern matching across characteristics.

The engine is a singleton-per-plant subscriber on the typed event bus.
Each :class:`SampleProcessedEvent` advances the streaming state of every
condition in every active rule for that plant. When a rule's full
predicate is satisfied within its sliding window, the engine writes a
:class:`Violation` row, audits the match, and publishes a
:class:`CepMatchEvent` so other subscribers (notifications, websocket
broadcast) can react.

Design notes:

* **Plant scoping** — the engine resolves the plant from the
  characteristic referenced by each event and only evaluates rules in
  the same plant. Cross-plant CEP rules are intentionally NOT supported
  — they would break tenant isolation.
* **Hot reload** — :meth:`reload_rules_for_plant` is called by the API
  router after every CRUD operation. Existing per-condition state
  machines whose ``fingerprint_condition`` is unchanged are reused so
  short windows survive an in-flight edit; everything else gets a fresh
  state machine.
* **Cluster awareness** — when the broker is non-local, only the elected
  leader for the ``cep`` role evaluates rules. Followers still receive
  events but skip evaluation. Match results land in the DB so any node
  can render them.
* **No DB on the hot path** — the engine maintains in-memory caches of
  characteristic id -> plant id and characteristic id -> centre line.
  Caches are populated on first access and invalidated lazily when the
  control-limits-updated event fires.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from cassini.api.schemas.cep import CepRuleSpec, parse_window_seconds
from cassini.core.cep.conditions import (
    CepConditionState,
    evaluate_condition_against_sample,
    fingerprint_condition,
)
from cassini.core.events import (
    ControlLimitsUpdatedEvent,
    Event,
    SampleProcessedEvent,
    ViolationCreatedEvent,
)
from cassini.db.models.characteristic import Characteristic
from cassini.db.models.cep_rule import CepRule
from cassini.db.models.hierarchy import Hierarchy
from cassini.db.models.violation import Severity, Violation


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Match event published on the typed event bus when a rule fires
# ---------------------------------------------------------------------------


@dataclass
class CepMatchEvent(Event):
    """Emitted when a CEP rule's full pattern matches.

    Mirrors the existing event-bus contract — published after the
    violation row has been persisted, so subscribers can join on
    ``violation_id``.
    """

    rule_id: int
    rule_name: str
    plant_id: int
    violation_id: int
    severity: str
    matched_characteristic_ids: list[int]
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Per-rule streaming state
# ---------------------------------------------------------------------------


@dataclass
class CepRuleRuntime:
    """Live state for a single CEP rule.

    Attributes:
        rule_id: Database primary key of the underlying ``CepRule`` row.
        plant_id: Owning plant — never crosses tenants.
        spec: Parsed ``CepRuleSpec`` (the YAML body, validated).
        enabled: DB-level enabled flag — disabled rules retain state but
            never fire so an operator can toggle without losing context.
        condition_states: One state machine per condition, keyed by the
            ``(characteristic_identifier, condition_index)`` pair so two
            conditions on the same characteristic can coexist.
        last_match_per_condition: Map of condition index -> UTC timestamp
            of the most recent match. Used to evaluate the cross-stream
            sliding window.
    """

    rule_id: int
    plant_id: int
    spec: CepRuleSpec
    enabled: bool
    condition_states: dict[tuple[str, int], CepConditionState] = field(default_factory=dict)
    last_match_per_condition: dict[int, datetime] = field(default_factory=dict)

    @property
    def window_seconds(self) -> float:
        return parse_window_seconds(self.spec.window)

    def reset_condition_states_if_changed(self, previous: "CepRuleRuntime | None") -> None:
        """Reuse condition states from the previous runtime where fingerprints match.

        This keeps short sliding windows (~30s) from being silently
        cleared every time an operator edits a rule.
        """
        if previous is None:
            return
        for idx, condition in enumerate(self.spec.conditions):
            fp = fingerprint_condition(condition)
            for prev_idx, prev_condition in enumerate(previous.spec.conditions):
                if fingerprint_condition(prev_condition) != fp:
                    continue
                # Same condition shape — find its state by char identifier
                key = (condition.characteristic, idx)
                prev_key = (prev_condition.characteristic, prev_idx)
                if prev_key in previous.condition_states:
                    state = previous.condition_states[prev_key]
                    # Rebind to the new condition object (count/threshold
                    # are part of the fingerprint so they didn't change).
                    state.condition = condition
                    self.condition_states[key] = state
                if prev_idx in previous.last_match_per_condition:
                    self.last_match_per_condition[idx] = previous.last_match_per_condition[
                        prev_idx
                    ]


# ---------------------------------------------------------------------------
# CepEngine — orchestrates everything
# ---------------------------------------------------------------------------


class CepEngine:
    """Subscribes to the event bus, evaluates CEP rules, fires matches.

    The engine is a singleton per process. ``start()`` registers
    subscriptions and warms the rule cache. ``stop()`` releases them.

    Args:
        session_factory: Async session factory (typically ``db.session``).
        event_bus: TypedEventBusAdapter from app.state.
        leader_election: Optional leader-election handle for cluster
            mode. When provided AND not the leader, evaluation is a
            no-op; followers still mutate streaming state so a takeover
            can resume immediately.
    """

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession] | Any,
        event_bus: Any,
        leader_election: Any = None,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._leader_election = leader_election

        # plant_id -> [CepRuleRuntime]
        self._rules: dict[int, list[CepRuleRuntime]] = {}
        # rule_id -> plant_id (for fast cross-plant tracking on reload)
        self._rule_plant: dict[int, int] = {}
        # characteristic_id -> plant_id (cached)
        self._char_plant_cache: dict[int, int] = {}
        # characteristic_id -> "hierarchy.path > char.name" (cached)
        self._char_identifier_cache: dict[int, str] = {}
        # characteristic_id -> centre line (cached, invalidated on
        # ControlLimitsUpdatedEvent). None means "unknown" — evaluator
        # falls back to running mean.
        self._char_center_cache: dict[int, Optional[float]] = {}

        # One asyncio.Lock per plant so concurrent SampleProcessedEvents
        # for the same plant serialise their state mutations. Different
        # plants evaluate in parallel.
        self._plant_locks: dict[int, asyncio.Lock] = {}

        self._started = False

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self) -> None:
        """Subscribe to the event bus and warm the rule cache.

        Idempotent — calling twice is a no-op.
        """
        if self._started:
            return
        self._event_bus.subscribe(SampleProcessedEvent, self._handle_sample_event)
        self._event_bus.subscribe(
            ControlLimitsUpdatedEvent, self._handle_limits_event
        )
        await self.reload_all_rules()
        self._started = True
        logger.info(
            "cep_engine_started",
            extra={"rule_count": sum(len(rs) for rs in self._rules.values())},
        )

    async def stop(self) -> None:
        """Unsubscribe from the event bus.

        Streaming state is dropped — re-creating the engine will rebuild
        it from the persisted rule rows.
        """
        if not self._started:
            return
        try:
            self._event_bus.unsubscribe(
                SampleProcessedEvent, self._handle_sample_event
            )
            self._event_bus.unsubscribe(
                ControlLimitsUpdatedEvent, self._handle_limits_event
            )
        except Exception:
            # TypedEventBusAdapter may raise if it doesn't expose
            # unsubscribe; best-effort cleanup either way.
            logger.debug("cep_engine_unsubscribe_failed", exc_info=True)
        self._started = False
        logger.info("cep_engine_stopped")

    # ------------------------------------------------------------------
    # Rule cache
    # ------------------------------------------------------------------

    async def reload_all_rules(self) -> None:
        """Refresh every plant's rule cache from the database."""
        async with self._session_factory() as session:
            stmt = select(CepRule)
            result = await session.execute(stmt)
            rules = list(result.scalars().all())
        # Group by plant for the swap below.
        new_state: dict[int, list[CepRuleRuntime]] = {}
        new_rule_plant: dict[int, int] = {}
        for row in rules:
            runtime = self._row_to_runtime(row, previous=self._lookup_existing(row.id))
            if runtime is None:
                continue
            new_state.setdefault(runtime.plant_id, []).append(runtime)
            new_rule_plant[runtime.rule_id] = runtime.plant_id
        self._rules = new_state
        self._rule_plant = new_rule_plant

    async def reload_rules_for_plant(self, plant_id: int) -> None:
        """Reload rules for a single plant (faster than ``reload_all_rules``)."""
        async with self._session_factory() as session:
            stmt = select(CepRule).where(CepRule.plant_id == plant_id)
            result = await session.execute(stmt)
            rows = list(result.scalars().all())
        runtimes: list[CepRuleRuntime] = []
        for row in rows:
            runtime = self._row_to_runtime(row, previous=self._lookup_existing(row.id))
            if runtime is not None:
                runtimes.append(runtime)
                self._rule_plant[row.id] = plant_id
        # Drop rule_plant entries for rules that no longer exist
        active_ids = {r.rule_id for r in runtimes}
        for rid in [rid for rid, pid in self._rule_plant.items() if pid == plant_id]:
            if rid not in active_ids:
                self._rule_plant.pop(rid, None)
        self._rules[plant_id] = runtimes

    def remove_rule(self, rule_id: int) -> None:
        """Drop a single rule from the cache (called on DELETE)."""
        plant_id = self._rule_plant.pop(rule_id, None)
        if plant_id is None:
            return
        runtimes = self._rules.get(plant_id, [])
        self._rules[plant_id] = [r for r in runtimes if r.rule_id != rule_id]

    def _lookup_existing(self, rule_id: int) -> CepRuleRuntime | None:
        plant_id = self._rule_plant.get(rule_id)
        if plant_id is None:
            return None
        for runtime in self._rules.get(plant_id, []):
            if runtime.rule_id == rule_id:
                return runtime
        return None

    def _row_to_runtime(
        self, row: CepRule, previous: CepRuleRuntime | None
    ) -> CepRuleRuntime | None:
        """Build a :class:`CepRuleRuntime` from a DB row, reusing prior state."""
        try:
            # parsed_json is the API-validated cache; trust it but fall
            # back to re-parsing yaml_text on a JSON corruption.
            parsed = json.loads(row.parsed_json)
            spec = CepRuleSpec.model_validate(parsed)
        except Exception:
            from cassini.core.cep.yaml_loader import load_rule_from_yaml

            try:
                spec = load_rule_from_yaml(row.yaml_text)
            except Exception:
                logger.warning(
                    "cep_rule_invalid_skipping",
                    extra={"rule_id": row.id, "plant_id": row.plant_id},
                )
                return None

        runtime = CepRuleRuntime(
            rule_id=row.id,
            plant_id=row.plant_id,
            spec=spec,
            enabled=row.enabled,
        )
        runtime.reset_condition_states_if_changed(previous)
        return runtime

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    async def _handle_limits_event(self, event: ControlLimitsUpdatedEvent) -> None:
        # Lazy invalidation — the next sample event reloads the centre line.
        self._char_center_cache.pop(event.characteristic_id, None)

    async def _handle_sample_event(self, event: SampleProcessedEvent) -> None:
        """Advance every rule's state with this sample and fire matches.

        Cluster mode: only the leader fires matches. Followers still
        mutate state so a leadership takeover doesn't drop in-flight
        windows.
        """
        plant_id = await self._resolve_plant_id(event.characteristic_id)
        if plant_id is None:
            return

        runtimes = self._rules.get(plant_id)
        if not runtimes:
            return

        # Resolve characteristic identifier for matching against rule spec
        identifier = await self._resolve_char_identifier(event.characteristic_id)
        if identifier is None:
            return

        # Centre line for mean-based rules — None means evaluator falls
        # back to running mean.
        center_line = await self._resolve_center_line(event.characteristic_id)

        is_leader = self._leader_election is None or getattr(
            self._leader_election, "is_leader", True
        )

        plant_lock = self._plant_locks.setdefault(plant_id, asyncio.Lock())
        async with plant_lock:
            for runtime in runtimes:
                if not runtime.enabled:
                    continue
                # Early exit: only evaluate if at least one condition
                # references this characteristic.
                relevant_indices = [
                    i
                    for i, c in enumerate(runtime.spec.conditions)
                    if c.characteristic == identifier
                ]
                if not relevant_indices:
                    continue
                for idx in relevant_indices:
                    condition = runtime.spec.conditions[idx]
                    key = (condition.characteristic, idx)
                    state = runtime.condition_states.get(key)
                    if state is None:
                        state = CepConditionState.for_condition(condition)
                        runtime.condition_states[key] = state
                    matched_now = evaluate_condition_against_sample(
                        state,
                        value=event.mean,
                        in_control=event.in_control,
                        center_line=center_line,
                    )
                    if matched_now:
                        runtime.last_match_per_condition[idx] = event.timestamp

                # Cross-stream sliding window check.
                if not is_leader:
                    continue
                if self._all_conditions_within_window(runtime, event.timestamp):
                    try:
                        await self._fire_match(runtime, event)
                    except Exception:
                        logger.exception(
                            "cep_engine_fire_match_failed",
                            extra={"rule_id": runtime.rule_id},
                        )
                    finally:
                        # Reset so the rule must accumulate fresh hits
                        # before it can fire again — prevents flooding.
                        runtime.last_match_per_condition.clear()
                        for state in runtime.condition_states.values():
                            state.consecutive_hits = 0

    @staticmethod
    def _all_conditions_within_window(
        runtime: CepRuleRuntime, now: datetime
    ) -> bool:
        """All conditions matched at least once inside ``window`` seconds of now."""
        if len(runtime.last_match_per_condition) < len(runtime.spec.conditions):
            return False
        cutoff = now.timestamp() - runtime.window_seconds
        for ts in runtime.last_match_per_condition.values():
            ts_seconds = ts.timestamp() if ts.tzinfo else ts.replace(
                tzinfo=timezone.utc
            ).timestamp()
            if ts_seconds < cutoff:
                return False
        return True

    # ------------------------------------------------------------------
    # Match firing
    # ------------------------------------------------------------------

    async def _fire_match(
        self, runtime: CepRuleRuntime, event: SampleProcessedEvent
    ) -> None:
        """Persist a violation row and publish a CepMatchEvent."""
        async with self._session_factory() as session:
            severity = (
                Severity.CRITICAL.value
                if runtime.spec.action.severity.value in ("high", "critical")
                else Severity.WARNING.value
            )
            violation = Violation(
                sample_id=event.sample_id,
                char_id=event.characteristic_id,
                rule_id=0,  # 0 == CEP rule (not a Nelson rule)
                rule_name=f"CEP:{runtime.spec.action.violation}",
                severity=severity,
                requires_acknowledgement=True,
            )
            session.add(violation)
            await session.flush()
            violation_id = violation.id
            await session.commit()

        match_event = CepMatchEvent(
            rule_id=runtime.rule_id,
            rule_name=runtime.spec.name,
            plant_id=runtime.plant_id,
            violation_id=violation_id,
            severity=runtime.spec.action.severity.value,
            matched_characteristic_ids=sorted(
                {
                    char_id
                    for char_id in [
                        await self._resolve_characteristic_id(c.characteristic)
                        for c in runtime.spec.conditions
                    ]
                    if char_id is not None
                }
            ),
        )

        await self._event_bus.publish(match_event)
        # Also publish a typed ViolationCreatedEvent so existing audit /
        # notification subscribers light up the same way as Nelson rule
        # violations.
        await self._event_bus.publish(
            ViolationCreatedEvent(
                violation_id=violation_id,
                sample_id=event.sample_id,
                characteristic_id=event.characteristic_id,
                rule_id=0,
                rule_name=f"CEP:{runtime.spec.action.violation}",
                severity=severity,
            )
        )

        # Audit the match explicitly — middleware doesn't see event-bus
        # firings (only HTTP requests).
        await self._audit_match(runtime, violation_id)

    async def _audit_match(self, runtime: CepRuleRuntime, violation_id: int) -> None:
        """Emit an audit row for the match. Best-effort — never fails the engine."""
        # Lazy import to avoid import cycle with main app state
        try:
            from cassini.core.audit import AuditService

            # Locate the AuditService — mirrors the pattern used by other
            # engine-side audit emitters (e.g. notification dispatcher).
            # We rely on the FastAPI app having stashed it on app.state;
            # tests can pass a stub.
            audit_service: AuditService | None = getattr(
                self, "_audit_service", None
            )
            if audit_service is None:
                return
            await audit_service.log(
                action="match",
                resource_type="cep_rule",
                resource_id=runtime.rule_id,
                username="system",
                detail={
                    "source": "cep_engine",
                    "rule_name": runtime.spec.name,
                    "plant_id": runtime.plant_id,
                    "violation_id": violation_id,
                    "severity": runtime.spec.action.severity.value,
                    "violation_code": runtime.spec.action.violation,
                },
                plant_id=runtime.plant_id,
            )
        except Exception:
            logger.debug("cep_audit_match_failed", exc_info=True)

    def attach_audit_service(self, audit_service: Any) -> None:
        """Inject the audit service after construction (lifecycle ordering)."""
        self._audit_service = audit_service

    # ------------------------------------------------------------------
    # Identifier / plant / centre-line resolution (cached)
    # ------------------------------------------------------------------

    async def _resolve_plant_id(self, characteristic_id: int) -> int | None:
        cached = self._char_plant_cache.get(characteristic_id)
        if cached is not None:
            return cached
        async with self._session_factory() as session:
            stmt = (
                select(Hierarchy.plant_id)
                .join(Characteristic, Characteristic.hierarchy_id == Hierarchy.id)
                .where(Characteristic.id == characteristic_id)
            )
            row = (await session.execute(stmt)).first()
        if row is None or row[0] is None:
            return None
        self._char_plant_cache[characteristic_id] = row[0]
        return row[0]

    async def _resolve_char_identifier(self, characteristic_id: int) -> str | None:
        """Resolve a characteristic to its operator-facing identifier.

        The identifier is "hierarchy.path > char.name" — same display the
        UI uses — so YAML rules round-trip cleanly through edits.
        """
        cached = self._char_identifier_cache.get(characteristic_id)
        if cached is not None:
            return cached
        async with self._session_factory() as session:
            char_stmt = select(Characteristic).where(
                Characteristic.id == characteristic_id
            )
            char = (await session.execute(char_stmt)).scalar_one_or_none()
            if char is None:
                return None
            # Walk the hierarchy chain — bounded loop guards against bad data.
            parts: list[str] = [char.name]
            current_hid: int | None = char.hierarchy_id
            for _ in range(50):
                if current_hid is None:
                    break
                node = (
                    await session.execute(
                        select(Hierarchy).where(Hierarchy.id == current_hid)
                    )
                ).scalar_one_or_none()
                if node is None:
                    break
                parts.insert(0, node.name)
                current_hid = node.parent_id
        identifier = " > ".join(parts)
        self._char_identifier_cache[characteristic_id] = identifier
        return identifier

    async def _resolve_characteristic_id(self, identifier: str) -> int | None:
        """Best-effort reverse lookup from identifier -> characteristic id.

        Used only on match firing to enrich the CepMatchEvent. Returns
        ``None`` when the identifier no longer resolves (rule references
        a deleted characteristic) — match still fires, just without that
        char_id in the event payload.
        """
        # Linear scan of the cache is fine: per-plant rule count is
        # small and matches are rare.
        for char_id, cached_identifier in self._char_identifier_cache.items():
            if cached_identifier == identifier:
                return char_id
        return None

    async def _resolve_center_line(self, characteristic_id: int) -> Optional[float]:
        if characteristic_id in self._char_center_cache:
            return self._char_center_cache[characteristic_id]
        async with self._session_factory() as session:
            stmt = select(
                Characteristic.stored_center_line, Characteristic.target_value
            ).where(Characteristic.id == characteristic_id)
            row = (await session.execute(stmt)).first()
        if row is None:
            return None
        center = row[0] if row[0] is not None else row[1]
        self._char_center_cache[characteristic_id] = center
        return center
