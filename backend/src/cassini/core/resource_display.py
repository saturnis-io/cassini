"""Shared resource display name resolution.

Converts (resource_type, resource_id) pairs into human-readable strings
for audit logs, signature history, and report sections.
"""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)

# Resource types that resolve against a characteristic
_CHAR_BASED_TYPES = {
    "characteristic",
    "limit_change",
    "config_change",
    "sample_approval",
    "violation_disposition",
}

_CHAR_PREFIXES: dict[str, str] = {
    "limit_change": "Limit Change",
    "config_change": "Config Change",
    "sample_approval": "Sample",
    "violation_disposition": "Violation",
}


async def _build_char_path(session: AsyncSession, char_id: int) -> str | None:
    """Build hierarchy path + characteristic name like 'Line 2 > Cell 3 > Bore Diameter'."""
    from cassini.db.models.characteristic import Characteristic
    from cassini.db.models.hierarchy import Hierarchy

    row = (
        await session.execute(
            select(Characteristic.name, Characteristic.hierarchy_id).where(
                Characteristic.id == char_id
            )
        )
    ).first()
    if not row:
        return None

    path_parts: list[str] = []
    current_id: int | None = row.hierarchy_id

    while current_id is not None:
        node = (
            await session.execute(
                select(Hierarchy.name, Hierarchy.parent_id).where(
                    Hierarchy.id == current_id
                )
            )
        ).first()
        if node is None:
            break
        path_parts.insert(0, node.name)
        current_id = node.parent_id

    path_parts.append(row.name)
    return " > ".join(path_parts)


async def resolve_resource_display(
    session: AsyncSession, resource_type: str, resource_id: int
) -> str:
    """Resolve a resource (type, id) pair to a human-readable display string.

    Returns a formatted string for known resource types, or a fallback
    ``"resource_type #id"`` string for unknown types or lookup failures.
    """
    try:
        if resource_type == "fai_report":
            from cassini.db.models.fai import FAIReport

            row = (
                await session.execute(
                    select(FAIReport.part_number, FAIReport.part_name).where(
                        FAIReport.id == resource_id
                    )
                )
            ).first()
            if row:
                name = f" \u2014 {row.part_name}" if row.part_name else ""
                return f"FAI: {row.part_number}{name}"
        elif resource_type == "msa_study":
            from cassini.db.models.msa import MSAStudy

            row = (
                await session.execute(
                    select(MSAStudy.name, MSAStudy.study_type).where(
                        MSAStudy.id == resource_id
                    )
                )
            ).first()
            if row:
                return f"MSA: {row.name} ({row.study_type})"
        elif resource_type == "doe_study":
            from cassini.db.models.doe import DOEStudy

            row = (
                await session.execute(
                    select(DOEStudy.name, DOEStudy.design_type).where(
                        DOEStudy.id == resource_id
                    )
                )
            ).first()
            if row:
                return f"DOE: {row.name} ({row.design_type})"
        elif resource_type == "retention_purge":
            from cassini.db.models.plant import Plant

            row = (
                await session.execute(
                    select(Plant.name).where(Plant.id == resource_id)
                )
            ).first()
            plant_label = row.name if row else f"#{resource_id}"
            return f"Data Purge \u2014 {plant_label}"
        elif resource_type == "plant":
            from cassini.db.models.plant import Plant

            row = (
                await session.execute(
                    select(Plant.name).where(Plant.id == resource_id)
                )
            ).first()
            if row:
                return f"Plant: {row.name}"
        elif resource_type == "user":
            from cassini.db.models.user import User

            row = (
                await session.execute(
                    select(User.username, User.full_name).where(
                        User.id == resource_id
                    )
                )
            ).first()
            if row:
                display = row.full_name or row.username
                return f"User: {display}"
        elif resource_type == "hierarchy":
            from cassini.db.models.hierarchy import Hierarchy

            # Build full path from this node to root
            path_parts: list[str] = []
            current_id: int | None = resource_id
            while current_id is not None:
                node = (
                    await session.execute(
                        select(Hierarchy.name, Hierarchy.parent_id).where(
                            Hierarchy.id == current_id
                        )
                    )
                ).first()
                if node is None:
                    break
                path_parts.insert(0, node.name)
                current_id = node.parent_id
            if path_parts:
                return " > ".join(path_parts)
        elif resource_type == "sample":
            from cassini.db.models.sample import Sample

            row = (
                await session.execute(
                    select(Sample.char_id).where(Sample.id == resource_id)
                )
            ).first()
            if row and row.char_id:
                char_path = await _build_char_path(session, row.char_id)
                if char_path:
                    return f"Sample on {char_path}"
        elif resource_type == "violation":
            from cassini.db.models.violation import Violation

            row = (
                await session.execute(
                    select(Violation.char_id, Violation.rule_name).where(
                        Violation.id == resource_id
                    )
                )
            ).first()
            if row and row.char_id:
                char_path = await _build_char_path(session, row.char_id)
                if char_path:
                    rule_label = f" ({row.rule_name})" if row.rule_name else ""
                    return f"Violation{rule_label} on {char_path}"
        elif resource_type in _CHAR_BASED_TYPES:
            char_path = await _build_char_path(session, resource_id)
            if char_path:
                prefix = _CHAR_PREFIXES.get(resource_type)
                if prefix:
                    return f"{prefix}: {char_path}"
                return char_path
    except Exception:
        logger.warning(
            "Failed to resolve resource display",
            resource_type=resource_type,
            resource_id=resource_id,
        )
    return f"{resource_type} #{resource_id}"
