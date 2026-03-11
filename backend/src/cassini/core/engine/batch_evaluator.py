"""Batch SPC evaluator for processing already-persisted samples.

PURPOSE:
    Runs the SPC pipeline (zone classification + Nelson Rules) on batches of
    samples that were persisted by the batch ingest endpoint.  Called by the
    SPCQueue consumer (``spc_queue.py``).

ARCHITECTURE:
    The BatchEvaluator mirrors ``SPCEngine.process_sample()`` but is optimised
    for batch throughput:
      - Loads the characteristic config ONCE per batch (not per sample)
      - Loads ALL samples in a single query (ORDER BY id for Nelson Rules)
      - Collects violations as dicts and bulk-inserts at the end
      - Returns events in the result — caller publishes AFTER commit

    The caller (SPCQueue consumer) owns the session lifecycle::

        async with session_factory() as session:
            evaluator = BatchEvaluator(session, event_bus, window_manager)
            result = await evaluator.assess(request)
            await session.commit()
        for ev in result.events:
            await event_bus.publish(ev)

STANDARDS:
    Same as ``spc_engine.py`` — AIAG SPC Manual 2nd Ed., Nelson (1984),
    Montgomery (2019).
"""

from __future__ import annotations

import json as _json
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import structlog

from cassini.core.engine.rolling_window import CachedLimits, ZoneBoundaries
from cassini.core.events.events import BatchEvaluationCompleteEvent
from cassini.db.models.sample import Sample
from cassini.db.models.violation import Violation
from cassini.utils.statistics import calculate_zones

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

    from cassini.core.engine.nelson_rules import NelsonRuleLibrary
    from cassini.core.engine.rolling_window import RollingWindowManager
    from cassini.core.events import EventBus
    from cassini.core.engine.spc_queue import SPCEvaluationRequest

logger = structlog.get_logger(__name__)


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class BatchEvaluationResult:
    """Result of a batch SPC evaluation.

    Attributes:
        sample_count: Number of samples successfully assessed.
        violation_count: Number of violations created.
        errors: Number of individual sample errors (sample-level try/except).
        events: Events to publish AFTER caller commits the session.
    """

    sample_count: int = 0
    violation_count: int = 0
    errors: int = 0
    events: list = field(default_factory=list)


# ---------------------------------------------------------------------------
# BatchEvaluator
# ---------------------------------------------------------------------------


class BatchEvaluator:
    """Runs SPC rules on already-persisted samples in batch.

    Instantiated per-request by the SPCQueue consumer.  The session is
    owned by the caller — this class adds ORM objects to it but never
    commits.

    Args:
        session: SQLAlchemy async session (owned by caller).
        event_bus: EventBus for building deferred events.
        window_manager: Shared RollingWindowManager singleton.
    """

    def __init__(
        self,
        session: "AsyncSession",
        event_bus: "EventBus",
        window_manager: "RollingWindowManager",
    ) -> None:
        self._session = session
        self._event_bus = event_bus
        self._window_manager = window_manager

    # -- Public API ---------------------------------------------------------

    async def assess(self, request: "SPCEvaluationRequest") -> BatchEvaluationResult:
        """Main entry point.  Process all samples through SPC pipeline.

        Returns result with events to publish AFTER caller commits.
        """
        result = BatchEvaluationResult()

        # Fast path: nothing to do
        if not request.sample_ids:
            return result

        # 1. Load characteristic once
        char_data = await self._load_characteristic(request.characteristic_id)
        if char_data is None:
            logger.warning(
                "batch_eval_char_not_found",
                characteristic_id=request.characteristic_id,
            )
            return result

        # 2. Load all samples ORDER BY id
        samples = await self._load_samples(request.sample_ids)
        if not samples:
            return result

        # 3. Resolve material limits if material_id provided
        ucl = char_data["ucl"]
        lcl = char_data["lcl"]
        stored_sigma = char_data["stored_sigma"]
        stored_center_line = char_data["stored_center_line"]
        target_value = char_data["target_value"]
        usl = char_data["usl"]
        lsl = char_data["lsl"]

        if request.material_id:
            from cassini.core.material_resolver import MaterialResolver

            resolver = MaterialResolver(self._session)
            char_defaults = {
                "ucl": ucl,
                "lcl": lcl,
                "stored_sigma": stored_sigma,
                "stored_center_line": stored_center_line,
                "target_value": target_value,
                "usl": usl,
                "lsl": lsl,
            }
            resolved = await resolver.resolve_flat(
                request.characteristic_id, request.material_id, char_defaults
            )
            if resolved["ucl"] is not None:
                ucl = resolved["ucl"]
            if resolved["lcl"] is not None:
                lcl = resolved["lcl"]
            if resolved["stored_sigma"] is not None:
                stored_sigma = resolved["stored_sigma"]
            if resolved["stored_center_line"] is not None:
                stored_center_line = resolved["stored_center_line"]
            if resolved["target_value"] is not None:
                target_value = resolved["target_value"]
            if resolved["usl"] is not None:
                usl = resolved["usl"]
            if resolved["lsl"] is not None:
                lsl = resolved["lsl"]

        # 4. Get zone boundaries (cached via window_manager)
        boundaries = await self._get_zone_boundaries(
            char_id=request.characteristic_id,
            ucl=ucl,
            lcl=lcl,
            material_id=request.material_id,
        )

        # 5. Build fresh NelsonRuleLibrary for this batch
        from cassini.core.engine.nelson_rules import NelsonRuleLibrary

        rule_library = NelsonRuleLibrary()
        rule_configs = char_data["rule_configs"]
        rule_library.create_from_config(rule_configs)

        enabled_rules = char_data["enabled_rules"]
        rule_require_ack = char_data["rule_require_ack"]

        # 6. Process each sample — per-sample try/except
        all_violation_dicts: list[dict[str, Any]] = []
        processed_sample_ids: list[int] = []

        for sample in samples:
            try:
                violations = await self._assess_sample(
                    sample=sample,
                    char_data=char_data,
                    boundaries=boundaries,
                    rule_library=rule_library,
                    enabled_rules=enabled_rules,
                    rule_require_ack=rule_require_ack,
                    material_id=request.material_id,
                )
                all_violation_dicts.extend(violations)
                processed_sample_ids.append(sample.id)
                result.sample_count += 1
            except Exception:
                result.errors += 1
                logger.exception(
                    "batch_eval_sample_error",
                    sample_id=sample.id,
                    characteristic_id=request.characteristic_id,
                )

        # 7. Bulk-insert violations (add to session, flush)
        if all_violation_dicts:
            for vd in all_violation_dicts:
                violation = Violation(
                    sample_id=vd["sample_id"],
                    char_id=vd["char_id"],
                    rule_id=vd["rule_id"],
                    rule_name=vd["rule_name"],
                    severity=vd["severity"],
                    acknowledged=False,
                    requires_acknowledgement=vd["requires_acknowledgement"],
                )
                self._session.add(violation)
            await self._session.flush()
            result.violation_count = len(all_violation_dicts)

        # 8. Mark processed samples complete
        if processed_sample_ids:
            await self._mark_complete(processed_sample_ids)

        # 9. Increment limit cache counters (once per processed sample)
        for _ in processed_sample_ids:
            self._window_manager.increment_limit_counter(
                request.characteristic_id, request.material_id,
            )

        # 10. Build event for result (caller publishes AFTER commit)
        if result.sample_count > 0:
            result.events.append(
                BatchEvaluationCompleteEvent(
                    characteristic_id=request.characteristic_id,
                    sample_count=result.sample_count,
                    violation_count=result.violation_count,
                    sample_ids=processed_sample_ids,
                )
            )

        logger.info(
            "batch_evaluation_complete",
            characteristic_id=request.characteristic_id,
            sample_count=result.sample_count,
            violation_count=result.violation_count,
            errors=result.errors,
        )

        return result

    # -- Internal methods ---------------------------------------------------

    async def _load_characteristic(self, char_id: int) -> dict | None:
        """Load characteristic with rules, extract ALL values eagerly.

        Returns a plain dict to avoid SQLAlchemy lazy-loading issues in
        async context.  Returns None if the characteristic does not exist.
        """
        from cassini.db.repositories.characteristic import CharacteristicRepository

        repo = CharacteristicRepository(self._session)
        char = await repo.get_with_rules(char_id)
        if char is None:
            return None

        # Extract enabled rules set
        enabled_rules = {rule.rule_id for rule in char.rules if rule.is_enabled}

        # Extract require_acknowledgement per rule
        rule_require_ack = {
            rule.rule_id: rule.require_acknowledgement for rule in char.rules
        }

        # Build rule configs with custom parameters
        rule_configs: list[dict] = []
        for rule in char.rules:
            params = None
            if rule.parameters:
                try:
                    params = _json.loads(rule.parameters)
                except (ValueError, TypeError):
                    params = None
            rule_configs.append(
                {
                    "rule_id": rule.rule_id,
                    "is_enabled": rule.is_enabled,
                    "parameters": params,
                }
            )

        return {
            "subgroup_mode": char.subgroup_mode,
            "subgroup_size": char.subgroup_size,
            "ucl": char.ucl,
            "lcl": char.lcl,
            "stored_sigma": char.stored_sigma,
            "stored_center_line": char.stored_center_line,
            "enabled_rules": enabled_rules,
            "rule_require_ack": rule_require_ack,
            "rule_configs": rule_configs,
            "short_run_mode": getattr(char, "short_run_mode", None),
            "target_value": getattr(char, "target_value", None),
            "usl": getattr(char, "usl", None),
            "lsl": getattr(char, "lsl", None),
            "min_measurements": char.min_measurements,
            "warn_below_count": char.warn_below_count,
        }

    async def _load_samples(self, sample_ids: list[int]) -> list[Sample]:
        """Load samples by IDs with measurements, ORDER BY id.

        Only returns samples with ``spc_status = 'pending_spc'``.
        """
        if not sample_ids:
            return []

        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        stmt = (
            select(Sample)
            .where(Sample.id.in_(sample_ids), Sample.spc_status == "pending_spc")
            .options(selectinload(Sample.measurements))
            .order_by(Sample.id)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def _assess_sample(
        self,
        sample: Sample,
        char_data: dict,
        boundaries: ZoneBoundaries,
        rule_library: "NelsonRuleLibrary",
        enabled_rules: set[int],
        rule_require_ack: dict[int, bool],
        material_id: int | None,
    ) -> list[dict[str, Any]]:
        """Run SPC on one sample.  Returns list of violation dicts to bulk-insert.

        Does NOT create ORM Violation objects — returns plain dicts so the
        caller can bulk-insert after the loop.
        """
        # Extract measurements from sample
        values = [m.value for m in sample.measurements]
        if not values:
            return []

        # Compute mean and range
        mean = sum(values) / len(values)
        range_value = (max(values) - min(values)) if len(values) > 1 else None

        # Add to rolling window
        window_sample = await self._window_manager.add_sample(
            char_id=sample.char_id,
            sample=sample,
            boundaries=boundaries,
            measurement_values=values,
            subgroup_mode=char_data["subgroup_mode"],
            actual_n=len(values),
            material_id=material_id,
        )

        # Get window for rule checking
        window = await self._window_manager.get_window(
            sample.char_id, material_id=material_id,
        )

        # Check Nelson Rules
        rule_results = rule_library.check_all(window, enabled_rules)

        # Build violation dicts
        violation_dicts: list[dict[str, Any]] = []
        for rr in rule_results:
            if not rr.triggered:
                continue
            requires_ack = rule_require_ack.get(rr.rule_id, True)
            violation_dicts.append(
                {
                    "sample_id": sample.id,
                    "char_id": sample.char_id,
                    "rule_id": rr.rule_id,
                    "rule_name": rr.rule_name,
                    "severity": rr.severity.value,
                    "requires_acknowledgement": requires_ack,
                }
            )

        return violation_dicts

    async def _get_zone_boundaries(
        self,
        char_id: int,
        ucl: float | None,
        lcl: float | None,
        material_id: int | None = None,
    ) -> ZoneBoundaries:
        """Get zone boundaries — mirrors SPCEngine._get_zone_boundaries_with_values.

        Resolution order:
        1. Explicit UCL/LCL on the characteristic (stored/Phase II limits)
        2. Cached limits from window_manager.get_cached_limits()
        3. Recompute via SPCEngine.recalculate_limits() and cache result
        """
        # Path 1: Explicit stored limits on the characteristic
        if ucl is not None and lcl is not None:
            center_line = (ucl + lcl) / 2
            sigma = (ucl - lcl) / 6
            zones = calculate_zones(center_line, sigma)
            return ZoneBoundaries(
                center_line=zones.center_line,
                plus_1_sigma=zones.plus_1_sigma,
                plus_2_sigma=zones.plus_2_sigma,
                plus_3_sigma=zones.plus_3_sigma,
                minus_1_sigma=zones.minus_1_sigma,
                minus_2_sigma=zones.minus_2_sigma,
                minus_3_sigma=zones.minus_3_sigma,
                sigma=sigma,
            )

        # Path 2: Check in-memory limit cache
        cached = self._window_manager.get_cached_limits(char_id, material_id)
        if cached is not None:
            zones = calculate_zones(cached.center_line, cached.sigma)
            return ZoneBoundaries(
                center_line=zones.center_line,
                plus_1_sigma=zones.plus_1_sigma,
                plus_2_sigma=zones.plus_2_sigma,
                plus_3_sigma=zones.plus_3_sigma,
                minus_1_sigma=zones.minus_1_sigma,
                minus_2_sigma=zones.minus_2_sigma,
                minus_3_sigma=zones.minus_3_sigma,
                sigma=cached.sigma,
            )

        # Path 3: Recompute from historical data and cache result
        from cassini.db.repositories import (
            CharacteristicRepository,
            SampleRepository,
            ViolationRepository,
        )
        from cassini.core.engine.nelson_rules import NelsonRuleLibrary
        from cassini.core.engine.spc_engine import SPCEngine

        char_repo = CharacteristicRepository(self._session)
        sample_repo = SampleRepository(self._session)
        violation_repo = ViolationRepository(self._session)
        temp_engine = SPCEngine(
            sample_repo=sample_repo,
            char_repo=char_repo,
            violation_repo=violation_repo,
            window_manager=self._window_manager,
            rule_library=NelsonRuleLibrary(),
            event_bus=self._event_bus,
        )

        center_line, computed_ucl, computed_lcl = await temp_engine.recalculate_limits(
            char_id, exclude_ooc=False
        )
        sigma = (computed_ucl - computed_lcl) / 6

        # Cache the computed limits
        self._window_manager.put_cached_limits(
            char_id=char_id,
            material_id=material_id,
            limits=CachedLimits(
                center_line=center_line,
                ucl=computed_ucl,
                lcl=computed_lcl,
                sigma=sigma,
                samples_since_compute=0,
                computed_at=time.monotonic(),
            ),
        )

        zones = calculate_zones(center_line, sigma)
        return ZoneBoundaries(
            center_line=zones.center_line,
            plus_1_sigma=zones.plus_1_sigma,
            plus_2_sigma=zones.plus_2_sigma,
            plus_3_sigma=zones.plus_3_sigma,
            minus_1_sigma=zones.minus_1_sigma,
            minus_2_sigma=zones.minus_2_sigma,
            minus_3_sigma=zones.minus_3_sigma,
            sigma=sigma,
        )

    async def _mark_complete(self, sample_ids: list[int]) -> None:
        """UPDATE sample SET spc_status='complete' WHERE id IN (...)"""
        if not sample_ids:
            return

        from sqlalchemy import update

        stmt = (
            update(Sample)
            .where(Sample.id.in_(sample_ids), Sample.spc_status == "pending_spc")
            .values(spc_status="complete")
        )
        await self._session.execute(stmt)
