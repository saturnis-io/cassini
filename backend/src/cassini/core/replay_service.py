"""Time-travel replay reconstruction service.

Audit-grade time travel: walks the hash-chained audit log to reconstruct a
resource's state (limits, rules, signatures, samples) as it existed at any
historical moment.  Returns a read-only snapshot — the replayed state is
NEVER persisted as a new artifact (21 CFR Part 11 §11.10(b)).

Currently supports `resource_type="characteristic"`. Extending to plants,
reports, or other audited resources is a matter of adding new
``_reconstruct_*`` helpers and registering them in ``_RECONSTRUCTORS``.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

import structlog
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from cassini.api.schemas.replay import (
    ReplayCharacteristicConfig,
    ReplayRule,
    ReplaySample,
    ReplaySignatureState,
    ReplaySnapshot,
)
from cassini.db.models.audit_log import AuditLog
from cassini.db.models.characteristic import Characteristic, CharacteristicRule
from cassini.db.models.sample import Sample
from cassini.db.models.signature import ElectronicSignature

logger = structlog.get_logger(__name__)


class ReplayNotFoundError(Exception):
    """Raised when there is no reconstructable history for a resource at the
    requested timestamp.

    Distinct from "resource doesn't exist" — used when the resource exists
    but no audit events pre-date the replay timestamp, so we cannot return
    an authoritative snapshot.
    """


def _normalize_utc(dt: datetime) -> datetime:
    """Ensure a datetime is tz-aware UTC.

    SQLite strips tzinfo when round-tripping DateTime columns; we normalize
    so comparisons across reconstructed events are consistent.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


async def _walk_audit_log(
    session: AsyncSession,
    resource_type: str,
    resource_id: int,
    at: datetime,
) -> list[AuditLog]:
    """Return the ordered list of audit events for this resource <= ``at``.

    Plant scoping is NOT applied here — that's the endpoint's responsibility
    via ``resolve_plant_id_for_characteristic`` BEFORE calling this service.
    """
    at_utc = _normalize_utc(at)
    stmt = (
        select(AuditLog)
        .where(
            and_(
                AuditLog.resource_type == resource_type,
                AuditLog.resource_id == resource_id,
                AuditLog.timestamp <= at_utc,
            )
        )
        .order_by(AuditLog.sequence_number.asc().nulls_last(), AuditLog.timestamp.asc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def _reconstruct_characteristic(
    session: AsyncSession,
    characteristic_id: int,
    plant_id: int,
    at: datetime,
) -> ReplaySnapshot:
    """Reconstruct a Characteristic's state at ``at``.

    Strategy:
      1. Walk the audit log for events <= ``at`` to count history depth.
      2. Load the current characteristic + rules row (post-deletion would
         have raised ``ReplayNotFoundError`` upstream).
      3. Filter samples to ``timestamp <= at``.
      4. Filter signatures by signature timestamp; mark as valid-at-replay
         IFF signed before ``at`` AND not yet invalidated by ``at``.

    NOTE: This implementation returns the *current* characteristic config
    rather than rebuilding each field from audit detail bodies. That is a
    documented simplification: the audit log's ``detail.body`` captures
    request payloads (sanitized), not the full post-update field state, so
    a faithful per-field rebuild would require either (a) parsing each
    update body and applying it incrementally — fragile across schema
    migrations — or (b) periodic full snapshots stored alongside audit
    rows. For limits + center_line specifically, ``ControlLimitsUpdated``
    events DO contain the value, so we walk those to find the most
    recent value at-or-before ``at`` and overlay it on the current config.
    Other config fields fall back to the live row.
    """
    audit_events = await _walk_audit_log(
        session, "characteristic", characteristic_id, at
    )

    # Load current characteristic. If the row no longer exists (deleted),
    # walking the audit log to find the pre-deletion delete event's
    # detail.body would let us reconstruct it; that's a follow-up.
    char_stmt = select(Characteristic).where(Characteristic.id == characteristic_id)
    char = (await session.execute(char_stmt)).scalar_one_or_none()
    if char is None:
        raise ReplayNotFoundError(
            f"Characteristic {characteristic_id} no longer exists; deleted-resource "
            f"replay not yet implemented"
        )

    # Build the characteristic config snapshot from the live row, then
    # overlay any limits we can recover from ControlLimitsUpdated events.
    config = ReplayCharacteristicConfig(
        id=char.id,
        name=char.name,
        description=char.description,
        chart_type=char.chart_type,
        subgroup_size=char.subgroup_size,
        subgroup_mode=char.subgroup_mode,
        target_value=char.target_value,
        usl=char.usl,
        lsl=char.lsl,
        ucl=char.ucl,
        lcl=char.lcl,
        stored_sigma=char.stored_sigma,
        stored_center_line=char.stored_center_line,
        decimal_precision=char.decimal_precision,
        data_type=char.data_type,
        attribute_chart_type=char.attribute_chart_type,
        use_laney_correction=char.use_laney_correction,
        short_run_mode=char.short_run_mode,
        sigma_method=char.sigma_method,
        limits_frozen=char.limits_frozen,
        limits_frozen_at=char.limits_frozen_at,
    )

    # Find the most recent recalculate event at-or-before `at` so we can
    # restore historical limits even if they've been recalculated since.
    most_recent_recalc: Optional[AuditLog] = None
    for event in reversed(audit_events):
        if event.action == "recalculate" and event.detail:
            most_recent_recalc = event
            break
    if most_recent_recalc is not None:
        det = most_recent_recalc.detail or {}
        # ControlLimitsUpdatedEvent shape, see core/audit.py
        if "ucl" in det:
            config.ucl = det.get("ucl")
        if "lcl" in det:
            config.lcl = det.get("lcl")
        if "center_line" in det:
            config.stored_center_line = det.get("center_line")

    # Rules: load current rules. Per-rule audit history would let us
    # rebuild precise rule state at `at`, but rule events are emitted as
    # characteristic updates with payload bodies; we do not parse those
    # rule deltas here — caller sees current rules with a documented
    # caveat in the design doc.
    rules_stmt = (
        select(CharacteristicRule)
        .where(CharacteristicRule.char_id == characteristic_id)
        .order_by(CharacteristicRule.rule_id.asc())
    )
    rule_rows = (await session.execute(rules_stmt)).scalars().all()
    rules = [
        ReplayRule(
            rule_id=r.rule_id,
            is_enabled=r.is_enabled,
            require_acknowledgement=r.require_acknowledgement,
            parameters=r.parameters,
        )
        for r in rule_rows
    ]

    # Samples: filter strictly to timestamp <= `at`.
    at_utc = _normalize_utc(at)
    sample_stmt = (
        select(Sample)
        .where(
            and_(
                Sample.char_id == characteristic_id,
                Sample.timestamp <= at_utc,
            )
        )
        .order_by(Sample.timestamp.asc(), Sample.id.asc())
    )
    sample_rows = (await session.execute(sample_stmt)).scalars().all()
    samples = [
        ReplaySample(
            id=s.id,
            timestamp=_normalize_utc(s.timestamp),
            batch_number=s.batch_number,
            operator_id=s.operator_id,
            is_excluded=s.is_excluded,
            actual_n=s.actual_n,
        )
        for s in sample_rows
    ]

    # Signatures: load all signatures whose `resource_type='characteristic'`
    # and `resource_id=characteristic_id`. We include those signed AT or
    # BEFORE the replay timestamp; a signature that didn't yet exist is
    # excluded entirely. `is_valid_at_replay` flips False if the signature
    # was already invalidated by `at`.
    sig_stmt = (
        select(ElectronicSignature)
        .where(
            and_(
                ElectronicSignature.resource_type == "characteristic",
                ElectronicSignature.resource_id == characteristic_id,
                ElectronicSignature.timestamp <= at_utc,
            )
        )
        .order_by(ElectronicSignature.timestamp.asc())
    )
    sig_rows = (await session.execute(sig_stmt)).scalars().all()
    signatures: list[ReplaySignatureState] = []
    for sig in sig_rows:
        invalidated_at = _normalize_utc(sig.invalidated_at) if sig.invalidated_at else None
        # Validity is derived strictly from the replay timestamp, NOT the
        # current `is_valid` flag: a signature can be valid in the snapshot
        # even if it has since been invalidated.  The query above already
        # filtered to `timestamp <= at_utc`, so existence is implied.
        # Validity flips False only if invalidation also happened by `at_utc`.
        if invalidated_at is not None and invalidated_at <= at_utc:
            valid_at_replay = False
        else:
            valid_at_replay = True
        signatures.append(
            ReplaySignatureState(
                id=sig.id,
                timestamp=_normalize_utc(sig.timestamp),
                username=sig.username,
                full_name=sig.full_name,
                meaning_code=sig.meaning_code,
                meaning_display=sig.meaning_display,
                resource_hash=sig.resource_hash,
                is_valid_at_replay=valid_at_replay,
                invalidated_at=invalidated_at,
                invalidated_reason=sig.invalidated_reason,
            )
        )

    earliest = (
        _normalize_utc(audit_events[0].timestamp) if audit_events else None
    )

    return ReplaySnapshot(
        resource_type="characteristic",
        resource_id=characteristic_id,
        requested_at=at_utc,
        generated_at=datetime.now(timezone.utc),
        plant_id=plant_id,
        characteristic=config,
        rules=rules,
        samples=samples,
        signatures=signatures,
        audit_event_count=len(audit_events),
        earliest_known_state_at=earliest,
    )


# Registry of supported resource types -> reconstruction function.
# Each entry signature: ``async def fn(session, resource_id, plant_id, at)``.
_RECONSTRUCTORS = {
    "characteristic": _reconstruct_characteristic,
}


async def reconstruct_snapshot(
    session: AsyncSession,
    resource_type: str,
    resource_id: int,
    plant_id: int,
    at: datetime,
) -> ReplaySnapshot:
    """Reconstruct a resource's state at the given historical timestamp.

    Args:
        session: Async DB session.
        resource_type: Currently must be ``"characteristic"``.
        resource_id: ID of the resource to replay.
        plant_id: Caller-resolved plant scope (must already be checked).
        at: The historical UTC timestamp to replay to.

    Raises:
        ValueError: Unsupported resource type.
        ReplayNotFoundError: No reconstructable history.
    """
    fn = _RECONSTRUCTORS.get(resource_type)
    if fn is None:
        raise ValueError(
            f"Replay not supported for resource_type={resource_type!r}"
        )
    return await fn(session, resource_id, plant_id, at)
